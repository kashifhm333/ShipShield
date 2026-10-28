import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve(__dirname, '../dist/index.js');

describe('ShipShield CLI Extended Commands E2E Suite', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-cli-ext-'));
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0' }, null, 2));
    fs.writeFileSync(path.join(tmpDir, 'index.js'), 'console.log("hello world");\n');
    fs.writeFileSync(
      path.join(tmpDir, '.shipshield.yaml'),
      'schema_version: 1\nproject:\n  name: test-app\npolicy:\n  fail_on:\n    - critical\n    - high\n'
    );
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('check command', () => {
    it('executes environment and scanner checks (online mode)', async () => {
      const { stdout } = await execFileAsync('node', [CLI_PATH, 'check', '--project-dir', tmpDir]);
      expect(stdout).toContain('ShipShield Health & Readiness Check');
      expect(stdout).toContain('Scanners & Intelligence Engines:');
      expect(stdout).toContain('Native Policy Engine:');
    });

    it('executes check in offline mode and outputs JSON', async () => {
      const { stdout } = await execFileAsync('node', [CLI_PATH, 'check', '--mode', 'offline', '--json', '--project-dir', tmpDir]);
      const data = JSON.parse(stdout);
      expect(data).toHaveProperty('tool', 'shipshield');
      expect(data).toHaveProperty('mode', 'offline');
      expect(data).toHaveProperty('scanners');
      expect(data).toHaveProperty('offline_ready');
    });
  });

  describe('policy command', () => {
    it('lists all native policies (policy list)', async () => {
      const { stdout } = await execFileAsync('node', [CLI_PATH, 'policy', 'list']);
      expect(stdout).toContain('ShipShield Native Security Policies');
      expect(stdout).toContain('SS-SECRET-001');
      expect(stdout).toContain('SS-DOCKER-001');
      expect(stdout).toContain('SS-IAC-001');
    });

    it('lists policies formatted as JSON (policy list --format json)', async () => {
      const { stdout } = await execFileAsync('node', [CLI_PATH, 'policy', 'list', '--format', 'json']);
      const list = JSON.parse(stdout);
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((p: any) => p.id === 'SS-SECRET-001')).toBe(true);
    });

    it('shows details for a specific policy (policy show <id>)', async () => {
      const { stdout } = await execFileAsync('node', [CLI_PATH, 'policy', 'show', 'SS-SECRET-001']);
      expect(stdout).toContain('Policy Specification: SS-SECRET-001');
      expect(stdout).toContain('Category:    secrets');
      expect(stdout).toContain('Severity:    CRITICAL');
    });

    it('validates native policies when no file is provided (policy validate)', async () => {
      const { stdout } = await execFileAsync('node', [CLI_PATH, 'policy', 'validate']);
      expect(stdout).toContain('registered native security policies are valid');
    });
  });

  describe('db command', () => {
    it('reports database status (db status)', async () => {
      const { stdout } = await execFileAsync('node', [CLI_PATH, 'db', 'status', '--project-dir', tmpDir]);
      expect(stdout).toContain('ShipShield Database Status for "dependencies":');
      expect(stdout).toContain('Freshness Status:');
    });

    it('outputs database status as JSON (db status --json)', async () => {
      const { stdout } = await execFileAsync('node', [CLI_PATH, 'db', 'status', '--json', '--project-dir', tmpDir]);
      const report = JSON.parse(stdout);
      expect(report).toHaveProperty('scannerId', 'dependencies');
      expect(report).toHaveProperty('freshness');
    });

    it('verifies local database integrity (db verify)', async () => {
      const { stdout } = await execFileAsync('node', [CLI_PATH, 'db', 'verify', '--project-dir', tmpDir]);
      expect(stdout).toContain('Verifying Intelligence Database Integrity');
    });
  });

  describe('config command', () => {
    it('validates default project configuration (config validate)', async () => {
      const { stdout } = await execFileAsync('node', [CLI_PATH, 'config', 'validate', '--project-dir', tmpDir]);
      expect(stdout).toContain('Configuration is valid');
    });
  });

  describe('scan & report commands with SARIF format', () => {
    it('scans project in offline mode and outputs SARIF 2.1.0 format', async () => {
      const { stdout } = await execFileAsync('node', [
        CLI_PATH,
        'scan',
        tmpDir,
        '--mode',
        'offline',
        '--format',
        'sarif',
      ]);
      const sarif = JSON.parse(stdout);
      expect(sarif).toHaveProperty('version', '2.1.0');
      expect(sarif).toHaveProperty('$schema');
      expect(sarif.runs).toHaveLength(1);
      expect(sarif.runs[0].tool.driver.name).toBe('ShipShield');
    });
  });
});
