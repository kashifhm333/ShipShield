import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  EngineServer,
  EngineClient,
  AdapterRegistry,
  ScannerAdapter,
  ScannerAdapterOptions,
  ScannerRunResult,
} from '../src/index.js';

class MockScannerAdapter implements ScannerAdapter {
  public readonly id = 'secrets' as const;
  public readonly name = 'Mock Secrets Scanner';
  public readonly binaryName = 'mock-secrets';

  public async isApplicable(): Promise<boolean> {
    return true;
  }

  public async checkAvailability(): Promise<{ available: boolean; version?: string }> {
    return { available: true, version: '1.0.0' };
  }

  public async scan(options: ScannerAdapterOptions): Promise<ScannerRunResult> {
    return {
      id: this.id,
      status: 'completed',
      engine: this.binaryName,
      engineVersion: '1.0.0',
      durationMs: 15,
      findingCount: 0,
      findings: [],
    };
  }
}

describe('Engine IPC Server & Client Suite', () => {
  let tempDir: string;
  let socketPath: string;
  let server: EngineServer;
  let client: EngineClient;
  let adapters: AdapterRegistry;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-engine-test-'));
    socketPath = path.join(tempDir, 'engine.sock');
    adapters = new AdapterRegistry();
    adapters.register(new MockScannerAdapter());

    server = new EngineServer({
      socketPath,
      adapters,
      mode: 'native',
      version: '1.0.0-test',
    });

    client = new EngineClient(socketPath);
  });

  afterEach(async () => {
    try {
      await server.stop();
    } catch {
      // Ignored
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('detects engine offline when server is not running', async () => {
    const isRunning = await client.isEngineRunning(150);
    expect(isRunning).toBe(false);
  });

  it('starts engine server and answers ping', async () => {
    await server.start();
    const isRunning = await client.isEngineRunning(500);
    expect(isRunning).toBe(true);

    const pingRes = await client.ping();
    expect(pingRes).toBe(true);
  });

  it('returns engine status including registered scanner availability', async () => {
    await server.start();
    const status = await client.getStatus();

    expect(status.running).toBe(true);
    expect(status.mode).toBe('native');
    expect(status.version).toBe('1.0.0-test');
    expect(status.scanners).toHaveLength(1);
    expect(status.scanners[0]!.id).toBe('secrets');
    expect(status.scanners[0]!.available).toBe(true);
    expect(status.scanners[0]!.version).toBe('1.0.0');
  });

  it('executes plan requests through the engine server', async () => {
    await server.start();

    // Create a mock project workspace
    const projectRoot = path.join(tempDir, 'project');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, '.shipshield.yaml'),
      `
schema_version: 1
project:
  name: "test-engine-project"
  root: "."
reports:
  directory: ".shipshield/reports"
  formats: ["json"]
scan:
  secrets:
    enabled: true
policy:
  fail_on: ["critical"]
execution:
  timeout_seconds: 30
`,
      'utf8'
    );

    const planResult = await client.runPlan({
      projectRoot,
      scanners: ['secrets'],
      writeReports: false,
    });

    expect(planResult).toBeDefined();
    expect(planResult.report).toBeDefined();
    expect(planResult.report.scan.policy_outcome).toBe('passed');
    expect(planResult.exitCode).toBe(0);
  });

  it('gracefully stops engine server and cleans up socket', async () => {
    await server.start();
    expect(fs.existsSync(socketPath)).toBe(true);

    await server.stop();
    const isRunning = await client.isEngineRunning(150);
    expect(isRunning).toBe(false);
    expect(fs.existsSync(socketPath)).toBe(false);
  });
});
