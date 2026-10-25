import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createProgram } from '../src/index.js';
import { EXIT_CODES, ScanReport } from '@shipshield/contracts';
import { TerminalPresenter } from '../src/presenter/terminal-presenter.js';
import { JsonReportWriter } from '@shipshield/scan-core';

describe('ShipShield CLI E2E Suite', () => {
  let exitSpy: MockInstance;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as unknown as () => never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('displays version and help without creating files', async () => {
    const program = createProgram();
    program.exitOverride();

    let output = '';
    const originalWrite = process.stdout.write;
    process.stdout.write = (str: string | Uint8Array): boolean => {
      output += str.toString();
      return true;
    };

    try {
      expect(() => program.parse(['node', 'shipshield', '--version'])).toThrow();
      expect(output).toContain('1.0.0');

      output = '';
      expect(() => program.parse(['node', 'shipshield', '--help'])).toThrow();
      expect(output).toContain('Usage: shipshield');
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('init command creates .shipshield.yaml and .shipshield/reports', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-cli-init-'));
    try {
      const program = createProgram();

      await program.parseAsync([
        'node',
        'shipshield',
        '--project-dir',
        tempDir,
        'init',
        '--yes',
      ]);

      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PASSED);
      expect(fs.existsSync(path.join(tempDir, '.shipshield.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, '.shipshield', 'reports'))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('plan --list-scanners lists all available scanners', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node',
      'shipshield',
      'plan',
      '--list-scanners',
    ]);
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PASSED);
  }, 15000);

  it('plan command with --format json outputs strictly valid JSON on stdout', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-cli-plan-'));
    let stdoutData = '';
    const originalStdoutWrite = process.stdout.write;
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      stdoutData += chunk.toString();
      return true;
    };

    try {
      fs.writeFileSync(path.join(tempDir, 'index.js'), 'console.log("hello");\n');
      const program = createProgram();

      await program.parseAsync([
        'node',
        'shipshield',
        '--project-dir',
        tempDir,
        '--format',
        'json',
        'plan',
        '--no-report',
      ]);

      expect(stdoutData.trim().length).toBeGreaterThan(0);
      const parsed = JSON.parse(stdoutData.trim());
      expect(parsed.schema_version).toBe('1.0');
      expect(parsed.tool.name).toBe('shipshield');
      expect(exitSpy).toHaveBeenCalled();
    } finally {
      process.stdout.write = originalStdoutWrite;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('plan command with text format renders report table', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-cli-plan-text-'));
    try {
      fs.writeFileSync(path.join(tempDir, 'index.js'), 'console.log("clean");\n');
      const program = createProgram();

      await program.parseAsync([
        'node',
        'shipshield',
        '--project-dir',
        tempDir,
        '--no-color',
        'plan',
      ]);

      expect(exitSpy).toHaveBeenCalled();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('show command handles missing reports with REPORT_ERROR exit code 5', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-cli-show-empty-'));
    try {
      const program = createProgram();
      await program.parseAsync([
        'node',
        'shipshield',
        '--project-dir',
        tempDir,
        'show',
      ]);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.REPORT_ERROR);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('show command displays existing report', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-cli-show-'));
    try {
      const mockReport: ScanReport = {
        schema_version: '1.0',
        tool: { name: 'shipshield', version: '1.0.0' },
        scan: {
          id: 'scan_0123456789abcdef12',
          started_at: '2026-10-24T12:00:00.000Z',
          completed_at: '2026-10-24T12:00:05.000Z',
          scope: { kind: 'full', root: tempDir },
          execution_status: 'completed',
          policy_outcome: 'passed',
        },
        project: { name: 'test' },
        scanners: [
          {
            id: 'secrets',
            status: 'completed',
            engine: 'gitleaks',
            duration_ms: 5,
            finding_count: 0,
            error_message: null,
          },
        ],
        summary: {
          findings_total: 0,
          by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          policy_violations: 0,
        },
        findings: [],
        policy: { passed: true, rules_evaluated: 1, violations: [] },
        warnings: [],
        errors: [],
      };

      JsonReportWriter.write(tempDir, '.shipshield/reports', mockReport);

      const program = createProgram();
      await program.parseAsync([
        'node',
        'shipshield',
        '--project-dir',
        tempDir,
        '--no-color',
        'show',
        '--latest',
      ]);

      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PASSED);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fix command enforces mutual exclusion between --dry-run and --apply', async () => {
    const program = createProgram();

    await program.parseAsync([
      'node',
      'shipshield',
      'fix',
      '--dry-run',
      '--apply',
    ]);

    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.USAGE_ERROR);
  });

  it('fix command plans and previews fixes on finding', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-cli-fix-'));
    try {
      const dockerfilePath = path.join(tempDir, 'Dockerfile');
      fs.writeFileSync(dockerfilePath, 'FROM alpine\nCMD ["sh"]\n');

      const findingFingerprint = 'sha256:' + 'e'.repeat(64);
      const mockReport: ScanReport = {
        schema_version: '1.0',
        tool: { name: 'shipshield', version: '1.0.0' },
        scan: {
          id: 'scan_0123456789abcdef34',
          started_at: '2026-10-24T12:00:00.000Z',
          completed_at: '2026-10-24T12:00:05.000Z',
          scope: { kind: 'full', root: tempDir },
          execution_status: 'completed',
          policy_outcome: 'policy_failed',
        },
        project: { name: 'test' },
        scanners: [
          {
            id: 'containers',
            status: 'completed',
            engine: 'trivy',
            duration_ms: 10,
            finding_count: 1,
            error_message: null,
          },
        ],
        summary: {
          findings_total: 1,
          by_severity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
          policy_violations: 1,
        },
        findings: [
          {
            id: 'SS-CON-123456',
            fingerprint: findingFingerprint,
            type: 'container-misconfiguration',
            category: 'containers',
            scanner: 'trivy',
            rule_id: 'DS002',
            title: 'Root user',
            description: 'Runs as root',
            severity: 'high',
            severity_original: 'HIGH',
            confidence: 'high',
            location: { path: 'Dockerfile' },
            evidence: { redacted: true, summary: 'No USER instruction' },
            remediation: {
              summary: 'Add USER',
              fix_available: true,
              fix_strategy: 'dockerfile-non-root',
            },
            status: 'new',
            references: [],
          },
        ],
        policy: {
          passed: false,
          rules_evaluated: 1,
          violations: [
            {
              rule_id: 'fail_on_high',
              finding_id: 'SS-CON-123456',
              finding_fingerprint: findingFingerprint,
              message: 'High severity finding detected',
            },
          ],
        },
        warnings: [],
        errors: [],
      };

      JsonReportWriter.write(tempDir, '.shipshield/reports', mockReport);

      const program = createProgram();
      await program.parseAsync([
        'node',
        'shipshield',
        '--project-dir',
        tempDir,
        '--no-color',
        'fix',
        '--all',
        '--dry-run',
      ]);

      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PASSED);
      // File should NOT be changed in dry-run
      expect(fs.readFileSync(dockerfilePath, 'utf8')).not.toContain('USER 10001:10001');

      // Now apply fix
      const programApply = createProgram();
      await programApply.parseAsync([
        'node',
        'shipshield',
        '--project-dir',
        tempDir,
        '--no-color',
        'fix',
        '--all',
        '--apply',
        '--yes',
      ]);

      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PASSED);
      expect(fs.readFileSync(dockerfilePath, 'utf8')).toContain('USER 10001:10001');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fix command exits cleanly when no fix proposals are available', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-cli-nofix-'));
    try {
      const mockReport: ScanReport = {
        schema_version: '1.0',
        tool: { name: 'shipshield', version: '1.0.0' },
        scan: {
          id: 'scan_0123456789nofix01',
          started_at: '2026-10-24T12:00:00.000Z',
          completed_at: '2026-10-24T12:00:05.000Z',
          scope: { kind: 'full', root: tempDir },
          execution_status: 'completed',
          policy_outcome: 'passed',
        },
        project: { name: 'test' },
        scanners: [],
        summary: { findings_total: 0, by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, policy_violations: 0 },
        findings: [],
        policy: { passed: true, rules_evaluated: 1, violations: [] },
        warnings: [],
        errors: [],
      };

      JsonReportWriter.write(tempDir, '.shipshield/reports', mockReport);

      const program = createProgram();
      await program.parseAsync(['node', 'shipshield', '--project-dir', tempDir, 'fix', '--all']);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PASSED);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('verify command compares with baseline report', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-cli-verif-'));
    try {
      fs.writeFileSync(path.join(tempDir, 'index.js'), 'console.log("hello");\n');

      const mockReport: ScanReport = {
        schema_version: '1.0',
        tool: { name: 'shipshield', version: '1.0.0' },
        scan: {
          id: 'scan_0123456789abcdef56',
          started_at: '2026-10-24T12:00:00.000Z',
          completed_at: '2026-10-24T12:00:05.000Z',
          scope: { kind: 'full', root: tempDir },
          execution_status: 'completed',
          policy_outcome: 'passed',
        },
        project: { name: 'test' },
        scanners: [
          {
            id: 'secrets',
            status: 'completed',
            engine: 'gitleaks',
            duration_ms: 10,
            finding_count: 0,
            error_message: null,
          },
        ],
        summary: {
          findings_total: 0,
          by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          policy_violations: 0,
        },
        findings: [],
        policy: { passed: true, rules_evaluated: 1, violations: [] },
        warnings: [],
        errors: [],
      };

      JsonReportWriter.write(tempDir, '.shipshield/reports', mockReport);

      const program = createProgram();
      await program.parseAsync([
        'node',
        'shipshield',
        '--project-dir',
        tempDir,
        '--no-color',
        'verify',
        '--before',
        'latest',
      ]);

      expect(exitSpy).toHaveBeenCalled();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('verify command handles passed and failed outcomes cleanly', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-cli-verif-outcomes-'));
    try {
      const mockReport: ScanReport = {
        schema_version: '1.0',
        tool: { name: 'shipshield', version: '1.0.0' },
        scan: {
          id: 'scan_0123456789abcdef99',
          started_at: '2026-10-24T12:00:00.000Z',
          completed_at: '2026-10-24T12:00:05.000Z',
          scope: { kind: 'full', root: tempDir },
          execution_status: 'completed',
          policy_outcome: 'passed',
        },
        project: { name: 'test' },
        scanners: [],
        summary: { findings_total: 0, by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, policy_violations: 0 },
        findings: [],
        policy: { passed: true, rules_evaluated: 1, violations: [] },
        warnings: [],
        errors: [],
      };

      JsonReportWriter.write(tempDir, '.shipshield/reports', mockReport);

      const { VerificationEngine } = await import('@shipshield/scan-core');
      vi.spyOn(VerificationEngine, 'verify').mockResolvedValueOnce({
        baselineReport: mockReport,
        verifiedReport: mockReport,
        resolvedFindings: ['f1'],
        remainingFindings: [],
        unverifiedFindings: [],
        verificationOutcome: 'passed',
        exitCode: 0,
      });

      const p1 = createProgram();
      await p1.parseAsync(['node', 'shipshield', '--project-dir', tempDir, 'verify']);
      expect(exitSpy).toHaveBeenCalledWith(0);

      vi.spyOn(VerificationEngine, 'verify').mockResolvedValueOnce({
        baselineReport: mockReport,
        verifiedReport: mockReport,
        resolvedFindings: [],
        remainingFindings: ['f1'],
        unverifiedFindings: ['f2'],
        verificationOutcome: 'policy_failed',
        exitCode: 1,
      });

      const p2 = createProgram();
      await p2.parseAsync(['node', 'shipshield', '--project-dir', tempDir, 'verify']);
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('TerminalPresenter formatting', () => {
    it('formats badges, diffs, tables, and colors correctly', () => {
      const pColor = new TerminalPresenter(false);
      const pNoColor = new TerminalPresenter(true);

      expect(pColor.severityBadge('critical')).toContain('CRITICAL');
      expect(pNoColor.severityBadge('critical')).toBe('[CRITICAL]');

      expect(pColor.green('ok')).toBeDefined();
      expect(pNoColor.green('ok')).toBe('ok');

      pColor.printBanner();
      pColor.renderReport({
        schema_version: '1.0',
        tool: { name: 'shipshield', version: '1.0.0' },
        scan: {
          id: 'scan_0123456789abcdef78',
          started_at: '2026-10-24T12:00:00.000Z',
          completed_at: '2026-10-24T12:00:05.000Z',
          scope: { kind: 'full', root: '.' },
          execution_status: 'completed',
          policy_outcome: 'passed',
        },
        project: { name: 'test' },
        scanners: [],
        summary: {
          findings_total: 0,
          by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          policy_violations: 0,
        },
        findings: [],
        policy: { passed: true, rules_evaluated: 1, violations: [] },
        warnings: [],
        errors: [],
      });
      pColor.renderProposals([], false);
    });
  });

  describe('CLI Command Flag Variations & Filtering', () => {
    it('show command filters findings by severity, scanner, and limit', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-cli-show-filt-'));
      try {
        const mockReport: ScanReport = {
          schema_version: '1.0',
          tool: { name: 'shipshield', version: '1.0.0' },
          scan: {
            id: 'scan_0123456789showfilt01',
            started_at: '2026-10-24T12:00:00.000Z',
            completed_at: '2026-10-24T12:00:05.000Z',
            scope: { kind: 'full', root: tempDir },
            execution_status: 'completed',
            policy_outcome: 'passed',
          },
          project: { name: 'test' },
          scanners: [],
          summary: {
            findings_total: 2,
            by_severity: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
            policy_violations: 0,
          },
          findings: [
            {
              id: 'SS-SEC-111111',
              fingerprint: 'sha256:' + '1'.repeat(64),
              type: 'hardcoded-secret',
              category: 'secrets',
              scanner: 'gitleaks',
              rule_id: 'rule-key',
              title: 'Key found',
              description: 'Desc',
              severity: 'high',
              severity_original: 'HIGH',
              confidence: 'high',
              location: { path: 'key.js' },
              evidence: { redacted: true, summary: '****' },
              remediation: { summary: 'Rotate', fix_available: false, fix_strategy: null },
              status: 'new',
              references: [],
            },
            {
              id: 'SS-CON-222222',
              fingerprint: 'sha256:' + '2'.repeat(64),
              type: 'container-misconfig',
              category: 'containers',
              scanner: 'trivy',
              rule_id: 'rule-root',
              title: 'Root user',
              description: 'Desc',
              severity: 'medium',
              severity_original: 'MEDIUM',
              confidence: 'high',
              location: { path: 'Dockerfile' },
              evidence: { redacted: true, summary: 'No USER' },
              remediation: { summary: 'Add USER', fix_available: true, fix_strategy: 'dockerfile-non-root' },
              status: 'new',
              references: [],
            },
          ],
          policy: { passed: true, rules_evaluated: 1, violations: [] },
          warnings: [],
          errors: [],
        };

        JsonReportWriter.write(tempDir, '.shipshield/reports', mockReport);

        const program = createProgram();
        await program.parseAsync([
          'node',
          'shipshield',
          '--project-dir',
          tempDir,
          '--no-color',
          'show',
          '--severity',
          'high',
          '--scanner',
          'secrets',
          '--limit',
          '1',
        ]);

        expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PASSED);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('init command aborts if config already exists without overwrite flag', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-cli-init-exists-'));
      try {
        fs.writeFileSync(path.join(tempDir, '.shipshield.yaml'), 'schema_version: 1\n');

        const program = createProgram();
        await program.parseAsync([
          'node',
          'shipshield',
          '--project-dir',
          tempDir,
          'init',
        ]);

        expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.CONFIGURATION_ERROR);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('plan command rejects unknown scanner name with USAGE_ERROR (exit code 2)', async () => {
      const program = createProgram();
      await program.parseAsync([
        'node',
        'shipshield',
        'plan',
        '--scanner',
        'non_existent_scanner',
      ]);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.USAGE_ERROR);
    });

    it('show command rejects unknown scanner and severity with USAGE_ERROR (exit code 2)', async () => {
      const program1 = createProgram();
      await program1.parseAsync([
        'node',
        'shipshield',
        'show',
        '--scanner',
        'unknown_scanner',
      ]);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.USAGE_ERROR);

      exitSpy.mockClear();
      const program2 = createProgram();
      await program2.parseAsync([
        'node',
        'shipshield',
        'show',
        '--severity',
        'super_critical',
      ]);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.USAGE_ERROR);
    });

    it('fix command requires either explicit finding IDs or --all with USAGE_ERROR (exit code 2)', async () => {
      const program = createProgram();
      await program.parseAsync([
        'node',
        'shipshield',
        'fix',
      ]);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.USAGE_ERROR);
    });

    it('fix command rejects both finding IDs and --all simultaneously with USAGE_ERROR (exit code 2)', async () => {
      const program = createProgram();
      await program.parseAsync([
        'node',
        'shipshield',
        'fix',
        'SS-CON-123456',
        '--all',
      ]);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.USAGE_ERROR);
    });

    it('fix command rejects --apply without --yes in non-interactive mode with USAGE_ERROR (exit code 2)', async () => {
      const program = createProgram();
      await program.parseAsync([
        'node',
        'shipshield',
        '--non-interactive',
        'fix',
        '--all',
        '--apply',
      ]);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.USAGE_ERROR);
    });
  });
});

