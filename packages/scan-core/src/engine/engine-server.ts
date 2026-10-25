import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  EngineRequest,
  EngineResponse,
  EngineStatus,
  EnginePlanParams,
  SubmitScanParams,
  ListScansParams,
  outcomeToExitCode,
} from '@shipshield/contracts';
import { AdapterRegistry } from '../adapters/adapter-registry.js';
import { ConfigLoader } from '../config/config-loader.js';
import { ScanOrchestrator } from '../orchestrator/scan-orchestrator.js';
import { JobStore } from '../jobs/job-store.js';
import { getEnginePaths } from './engine-paths.js';

export interface EngineServerOptions {
  socketPath?: string;
  dbPath?: string;
  adapters: AdapterRegistry;
  mode?: 'native' | 'docker';
  version?: string;
  jobStore?: JobStore;
}

export class EngineServer {
  private readonly socketPath: string;
  private readonly adapters: AdapterRegistry;
  private readonly mode: 'native' | 'docker';
  private readonly version: string;
  private readonly startTime = Date.now();
  private readonly jobStore: JobStore;
  private server: net.Server | null = null;
  private paths = getEnginePaths();

  constructor(options: EngineServerOptions) {
    this.socketPath = options.socketPath || this.paths.socketPath;
    this.adapters = options.adapters;
    this.mode = options.mode || 'native';
    this.version = options.version || '1.0.0';
    this.jobStore = options.jobStore || new JobStore(options.dbPath || this.paths.dbPath);
  }

  public async start(): Promise<void> {
    // Run recovery on startup
    const recovered = this.jobStore.recoverInterruptedJobs();
    if (recovered > 0) {
      try {
        fs.appendFileSync(
          this.paths.logPath,
          `[${new Date().toISOString()}] Recovered ${recovered} interrupted job(s) from previous run.\n`
        );
      } catch {
        // Ignored
      }
    }

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
                dbPath: this.paths.dbPath,
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
          dbPath: this.paths.dbPath,
          version: this.version,
          scanners: scannerStatuses,
        };

        return {
          id: req.id,
          success: true,
          data: status,
        };
      }

      case 'submit_scan':
      case 'plan': {
        const params = req.params as SubmitScanParams;
        if (!params || !params.projectRoot) {
          return {
            id: req.id,
            success: false,
            error: 'Missing projectRoot in plan parameters',
          };
        }

        const scanId = `scan_${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`;
        const job = this.jobStore.createJob({
          id: scanId,
          projectRoot: params.projectRoot,
          projectName: path.basename(params.projectRoot),
          scanners: params.scanners,
          failOn: params.failOn,
        });

        // If detach mode was requested, start in background and return immediately
        if (params.detach) {
          this.executeScanAsync(scanId, params).catch(() => {});
          return {
            id: req.id,
            success: true,
            data: {
              scanId,
              status: 'accepted',
              detached: true,
              message: `Scan job ${scanId} submitted to background engine.`,
            },
          };
        }

        // Synchronous scan execution
        return this.executeScanJob(req.id, scanId, params);
      }

      case 'get_scan': {
        const scanId = req.params?.scanId;
        if (!scanId) {
          return { id: req.id, success: false, error: 'Missing scanId parameter' };
        }
        const job = this.jobStore.getJob(scanId);
        if (!job) {
          return { id: req.id, success: false, error: `Scan ${scanId} not found` };
        }
        return { id: req.id, success: true, data: job };
      }

      case 'list_scans': {
        const filters = req.params as ListScansParams;
        const jobs = this.jobStore.listJobs(filters);
        return { id: req.id, success: true, data: jobs };
      }

      case 'get_results': {
        const scanId = req.params?.scanId;
        let job = scanId ? this.jobStore.getJob(scanId) : this.jobStore.getLatestJob(req.params?.projectRoot);
        if (!job) {
          return { id: req.id, success: false, error: 'No scan results found' };
        }
        if (job.reportPath && fs.existsSync(job.reportPath)) {
          try {
            const report = JSON.parse(fs.readFileSync(job.reportPath, 'utf8'));
            return { id: req.id, success: true, data: { job, report } };
          } catch {
            // Fall through
          }
        }
        return { id: req.id, success: true, data: { job } };
      }

      case 'cancel_scan': {
        const scanId = req.params?.scanId;
        if (!scanId) {
          return { id: req.id, success: false, error: 'Missing scanId parameter' };
        }
        const cancelResult = this.jobStore.cancelJob(scanId);
        return { id: req.id, success: true, data: cancelResult };
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

  private async executeScanAsync(scanId: string, params: SubmitScanParams): Promise<void> {
    try {
      await this.executeScanJob('bg', scanId, params);
    } catch {
      // Best-effort
    }
  }

  private async executeScanJob(
    requestId: string,
    scanId: string,
    params: SubmitScanParams
  ): Promise<EngineResponse> {
    this.jobStore.updateJob(scanId, { status: 'running' });

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
      const isPolicyFail = result.report.scan.policy_outcome === 'policy_failed';
      const isIncomplete = result.report.scan.policy_outcome === 'incomplete';
      const finalStatus = isPolicyFail ? 'policy_failed' : isIncomplete ? 'incomplete' : 'completed';

      this.jobStore.updateJob(scanId, {
        status: finalStatus,
        completedAt: new Date().toISOString(),
        exitCode,
        policyOutcome: result.report.scan.policy_outcome,
        reportPath: result.jsonReportPath,
        markdownReportPath: result.markdownReportPath,
        findingsCount: result.policyResult.summary.findings_total,
        criticalCount: result.policyResult.summary.by_severity.critical || 0,
        highCount: result.policyResult.summary.by_severity.high || 0,
      });

      return {
        id: requestId,
        success: true,
        exitCode,
        data: {
          scanId,
          status: finalStatus,
          report: result.report,
          policyResult: result.policyResult,
          jsonReportPath: result.jsonReportPath,
          markdownReportPath: result.markdownReportPath,
          exitCode,
        },
      };
    } catch (err: any) {
      this.jobStore.updateJob(scanId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        failureReason: err?.message || String(err),
        exitCode: 10,
      });

      return {
        id: requestId,
        success: false,
        exitCode: 10,
        error: `Plan execution failed: ${err?.message || err}`,
      };
    }
  }

  public async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve());
      });
      this.server = null;
    }

    this.jobStore.close();

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
