import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createProgram } from '../src/index.js';
import { EXIT_CODES, ScanReport } from '@shipshield/contracts';
import { ScanOrchestrator, IntelligenceManager } from '@shipshield/scan-core';

describe('ShipShield CLI Offline & Intelligence E2E Suite', () => {
  let exitSpy: MockInstance;
  let tempDir: string;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as unknown as () => never);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-offline-cli-'));
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('doctor command runs system diagnostics and exits cleanly', async () => {
    const program = createProgram();

    await program.parseAsync([
      'node',
      'shipshield',
      '--project-dir',
      tempDir,
      'doctor',
    ]);

    expect([EXIT_CODES.PASSED, EXIT_CODES.INCOMPLETE]).toContain(exitSpy.mock.calls[0]?.[0]);
  });

  it('doctor --json outputs valid JSON matching IntelligenceReadinessReport', async () => {
    const program = createProgram();

    let output = '';
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output += chunk.toString();
      return true;
    };

    try {
      await program.parseAsync([
        'node',
        'shipshield',
        '--project-dir',
        tempDir,
        'doctor',
        '--json',
      ]);

      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PASSED);
      const parsed = JSON.parse(output);
      expect(parsed.schema_version).toBe('1.0');
      expect(parsed.tool.name).toBe('shipshield');
      expect(parsed.offline_ready).toBeDefined();
      expect(parsed.scanners).toBeDefined();
      expect(parsed.summary).toBeDefined();
      expect(parsed.environment).toBeDefined();
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('update-db --check-only displays database status without downloading', async () => {
    const program = createProgram();

    await program.parseAsync([
      'node',
      'shipshield',
      '--project-dir',
      tempDir,
      'update-db',
      '--check-only',
    ]);

    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PASSED);
  });

  it('update-db --check-only --json outputs json status', async () => {
    const program = createProgram();

    let output = '';
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output += chunk.toString();
      return true;
    };

    try {
      await program.parseAsync([
        'node',
        'shipshield',
        '--project-dir',
        tempDir,
        'update-db',
        '--check-only',
        '--json',
      ]);

      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PASSED);
      const parsed = JSON.parse(output);
      expect(parsed.scannerId).toBe('dependencies');
      expect(parsed.freshness).toBeDefined();
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('update-db --scanner secrets rejects invalid scanner with USAGE_ERROR', async () => {
    const program = createProgram();

    await program.parseAsync([
      'node',
      'shipshield',
      '--project-dir',
      tempDir,
      'update-db',
      '--scanner',
      'secrets',
    ]);

    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.USAGE_ERROR);
  });

  it('update-db --json executes update and returns JSON report', async () => {
    const program = createProgram();

    vi.spyOn(IntelligenceManager, 'updateDatabase').mockResolvedValue({
      scannerId: 'dependencies',
      success: true,
      stagedPath: '/tmp/stage',
      activePath: '/tmp/db',
      backupPath: '/tmp/backup',
      previousVersion: '1',
      newVersion: '2',
      updatedAt: new Date().toISOString(),
      durationMs: 1200,
      errorMessage: null,
    });

    let output = '';
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output += chunk.toString();
      return true;
    };

    try {
      await program.parseAsync([
        'node',
        'shipshield',
        '--project-dir',
        tempDir,
        'update-db',
        '--json',
        '--force',
      ]);

      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PASSED);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.newVersion).toBe('2');
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('scan command maps missing required scanner to exit code 7', async () => {
    const program = createProgram();

    const mockReport: ScanReport = {
      schema_version: '1.0',
      tool: { name: 'shipshield', version: '1.0.0' },
      scan: {
        id: 'scan_offline_test_01',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        scope: { kind: 'full', root: tempDir },
        execution_status: 'completed',
        policy_outcome: 'incomplete',
      },
      project: { name: 'test' },
      scanners: [
        {
          id: 'secrets',
          engine: 'gitleaks',
          status: 'completed',
          duration_ms: 50,
          findings_count: 0,
          error_message: null,
          completeness: 'complete',
          offline: true,
        },
        {
          id: 'dependencies',
          engine: 'trivy',
          status: 'unavailable',
          duration_ms: 10,
          findings_count: 0,
          error_message: 'Binary not found',
          completeness: 'indeterminate',
          offline: true,
        },
      ],
      summary: {
        findings_total: 0,
        by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        policy_violations: 0,
      },
      findings: [],
      policy: { passed: false, rules_evaluated: 0, violations: [] },
      warnings: ['Required scanner dependencies did not complete'],
      errors: [],
      mode: 'offline',
      completeness: 'indeterminate',
    };

    vi.spyOn(ScanOrchestrator, 'run').mockResolvedValue({
      report: mockReport,
      jsonReportPath: path.join(tempDir, 'report.json'),
      markdownReportPath: path.join(tempDir, 'report.md'),
    });

    await program.parseAsync([
      'node',
      'shipshield',
      '--project-dir',
      tempDir,
      'scan',
      '.',
      '--offline',
      '--require',
      'dependencies',
    ]);

    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.REQUIRED_SCANNER_UNAVAILABLE);
  });

  it('scan --offline runs orchestrator with offline flag, writes output file, and outputs JSON', async () => {
    const program = createProgram();
    const outputFile = path.join(tempDir, 'custom-output.json');

    const mockReport: ScanReport = {
      schema_version: '1.0',
      tool: { name: 'shipshield', version: '1.0.0' },
      scan: {
        id: 'scan_offline_test_02',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        scope: { kind: 'full', root: tempDir },
        execution_status: 'completed',
        policy_outcome: 'passed',
      },
      project: { name: 'test' },
      scanners: [
        {
          id: 'secrets',
          engine: 'gitleaks',
          status: 'completed',
          duration_ms: 50,
          findings_count: 0,
          error_message: null,
          completeness: 'complete',
          offline: true,
        },
      ],
      summary: {
        findings_total: 0,
        by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        policy_violations: 0,
      },
      findings: [],
      policy: { passed: true, rules_evaluated: 0, violations: [] },
      warnings: [],
      errors: [],
      mode: 'offline',
      completeness: 'complete',
    };

    const orchestratorSpy = vi.spyOn(ScanOrchestrator, 'run').mockResolvedValue({
      report: mockReport,
      jsonReportPath: path.join(tempDir, 'report.json'),
      markdownReportPath: path.join(tempDir, 'report.md'),
    });

    let output = '';
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output += chunk.toString();
      return true;
    };

    try {
      await program.parseAsync([
        'node',
        'shipshield',
        '--project-dir',
        tempDir,
        'scan',
        '.',
        '--offline',
        '--format',
        'json',
        '--output',
        outputFile,
        '--show-db-status',
        '--max-db-age',
        '14',
      ]);

      expect(orchestratorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          offline: true,
          maxDbAgeDays: 14,
        })
      );
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PASSED);
      const parsed = JSON.parse(output);
      expect(parsed.mode).toBe('offline');
      expect(parsed.completeness).toBe('complete');
      expect(fs.existsSync(outputFile)).toBe(true);
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
