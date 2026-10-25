import net from 'node:net';
import fs from 'node:fs';
import {
  EngineRequest,
  EngineResponse,
  EngineStatus,
  EnginePlanParams,
  outcomeToExitCode,
} from '@shipshield/contracts';
import { AdapterRegistry } from '../adapters/adapter-registry.js';
import { ConfigLoader } from '../config/config-loader.js';
import { ScanOrchestrator } from '../orchestrator/scan-orchestrator.js';
import { getEnginePaths } from './engine-paths.js';

export interface EngineServerOptions {
  socketPath?: string;
  adapters: AdapterRegistry;
  mode?: 'native' | 'docker';
  version?: string;
}

export class EngineServer {
  private readonly socketPath: string;
  private readonly adapters: AdapterRegistry;
  private readonly mode: 'native' | 'docker';
  private readonly version: string;
  private readonly startTime = Date.now();
  private server: net.Server | null = null;
  private paths = getEnginePaths();

  constructor(options: EngineServerOptions) {
    this.socketPath = options.socketPath || this.paths.socketPath;
    this.adapters = options.adapters;
    this.mode = options.mode || 'native';
    this.version = options.version || '1.0.0';
  }

  public async start(): Promise<void> {
    // Remove stale socket if it exists (Unix only)
    if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch {
        // Ignored
      }
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let buffer = '';

        socket.on('data', async (chunk) => {
          buffer += chunk.toString();
          const newlineIdx = buffer.indexOf('\n');
          if (newlineIdx !== -1) {
            const raw = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);

            try {
              const request = JSON.parse(raw) as EngineRequest;
              const response = await this.handleRequest(request);
              socket.write(JSON.stringify(response) + '\n');
            } catch (err: any) {
              const errResp: EngineResponse = {
                id: 'unknown',
                success: false,
                error: `Engine server processing error: ${err?.message || err}`,
              };
              socket.write(JSON.stringify(errResp) + '\n');
            }
          }
        });
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        // Set permissions on socket file
        if (process.platform !== 'win32') {
          try {
            fs.chmodSync(this.socketPath, 0o600);
          } catch {
            // Ignored
          }
        }

        // Write PID and metadata
        try {
          fs.writeFileSync(this.paths.pidPath, process.pid.toString(), 'utf8');
          fs.writeFileSync(
            this.paths.metadataPath,
            JSON.stringify(
              {
                pid: process.pid,
                mode: this.mode,
                version: this.version,
                startedAt: new Date().toISOString(),
                socketPath: this.socketPath,
              },
              null,
              2
            ),
            'utf8'
          );
        } catch {
          // Ignored
        }

        resolve();
      });
    });
  }

  private async handleRequest(req: EngineRequest): Promise<EngineResponse> {
    switch (req.type) {
      case 'ping': {
        return {
          id: req.id,
          success: true,
          data: {
            status: 'pong',
            uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
          },
        };
      }

      case 'status': {
        const scannerStatuses = await Promise.all(
          this.adapters.getAll().map(async (adapter) => {
            const check = await adapter.checkAvailability();
            return {
              id: adapter.id,
              name: adapter.name,
              available: check.available,
              version: check.version,
              error: check.error,
            };
          })
        );

        const status: EngineStatus = {
          running: true,
          pid: process.pid,
          mode: this.mode,
          uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
          socketPath: this.socketPath,
          version: this.version,
          scanners: scannerStatuses,
        };

        return {
          id: req.id,
          success: true,
          data: status,
        };
      }

      case 'plan': {
        const params = req.params as EnginePlanParams;
        if (!params || !params.projectRoot) {
          return {
            id: req.id,
            success: false,
            error: 'Missing projectRoot in plan parameters',
          };
        }

        try {
          const config = ConfigLoader.load(params.projectRoot);

          if (params.failOn && params.failOn.length > 0) {
            config.policy.fail_on = params.failOn;
          }
          if (params.timeoutSeconds) {
            config.execution.timeout_seconds = params.timeoutSeconds;
          }
          if (params.jobs) {
            config.execution.max_parallel_scanners = params.jobs;
          }

          const result = await ScanOrchestrator.run({
            projectRoot: params.projectRoot,
            config,
            adapters: this.adapters,
            selectedScanners: params.scanners,
            offline: params.offline,
            writeReports: params.writeReports !== false,
          });
          const exitCode = outcomeToExitCode(result.report.scan.policy_outcome);

          return {
            id: req.id,
            success: true,
            exitCode,
            data: {
              report: result.report,
              policyResult: result.policyResult,
              jsonReportPath: result.jsonReportPath,
              markdownReportPath: result.markdownReportPath,
              exitCode,
            },
          };
        } catch (err: any) {
          return {
            id: req.id,
            success: false,
            error: `Plan execution failed: ${err?.message || err}`,
          };
        }
      }

      case 'stop': {
        setTimeout(() => {
          this.stop().catch(() => {});
          process.exit(0);
        }, 100);

        return {
          id: req.id,
          success: true,
          data: { stopped: true },
        };
      }

      default: {
        return {
          id: req.id,
          success: false,
          error: `Unknown engine request type: ${req.type}`,
        };
      }
    }
  }

  public async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve());
      });
      this.server = null;
    }

    if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch {
        // Ignored
      }
    }

    if (fs.existsSync(this.paths.pidPath)) {
      try {
        fs.unlinkSync(this.paths.pidPath);
      } catch {
        // Ignored
      }
    }

    if (fs.existsSync(this.paths.metadataPath)) {
      try {
        fs.unlinkSync(this.paths.metadataPath);
      } catch {
        // Ignored
      }
    }
  }
}
