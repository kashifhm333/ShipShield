import { describe, it, expect } from 'vitest';
import {
  ProjectConfigSchema,
  NormalizedFindingSchema,
  FindingEvidenceSchema,
  ScanReportSchema,
  outcomeToExitCode,
  EXIT_CODES,
  CanonicalOutcome,
  SEVERITY_WEIGHT,
} from '../src/index.js';

describe('Contracts & Schemas Suite', () => {
  describe('Exit Codes & Canonical Outcomes', () => {
    it('maps all 8 canonical outcomes to their exact defined exit codes', () => {
      const outcomes: [CanonicalOutcome, number][] = [
        ['passed', EXIT_CODES.PASSED],
        ['policy_failed', EXIT_CODES.POLICY_FAILED],
        ['usage_error', EXIT_CODES.USAGE_ERROR],
        ['configuration_error', EXIT_CODES.CONFIGURATION_ERROR],
        ['incomplete', EXIT_CODES.INCOMPLETE],
        ['report_error', EXIT_CODES.REPORT_ERROR],
        ['fix_error', EXIT_CODES.FIX_ERROR],
        ['internal_error', EXIT_CODES.INTERNAL_ERROR],
      ];

      expect(EXIT_CODES.PASSED).toBe(0);
      expect(EXIT_CODES.POLICY_FAILED).toBe(1);
      expect(EXIT_CODES.USAGE_ERROR).toBe(2);
      expect(EXIT_CODES.CONFIGURATION_ERROR).toBe(3);
      expect(EXIT_CODES.INCOMPLETE).toBe(4);
      expect(EXIT_CODES.REPORT_ERROR).toBe(5);
      expect(EXIT_CODES.FIX_ERROR).toBe(6);
      expect(EXIT_CODES.INTERNAL_ERROR).toBe(10);

      for (const [outcome, code] of outcomes) {
        expect(outcomeToExitCode(outcome)).toBe(code);
      }
    });

    it('orders severity weights correctly', () => {
      expect(SEVERITY_WEIGHT.critical).toBeGreaterThan(SEVERITY_WEIGHT.high);
      expect(SEVERITY_WEIGHT.high).toBeGreaterThan(SEVERITY_WEIGHT.medium);
      expect(SEVERITY_WEIGHT.medium).toBeGreaterThan(SEVERITY_WEIGHT.low);
      expect(SEVERITY_WEIGHT.low).toBeGreaterThan(SEVERITY_WEIGHT.info);
    });
  });

  describe('ProjectConfigSchema', () => {
    it('parses valid minimal and full config with defaults', () => {
      const minimal = {
        schema_version: 1,
      };
      const parsed = ProjectConfigSchema.parse(minimal);
      expect(parsed.schema_version).toBe(1);
      expect(parsed.project.name).toBe('auto');
      expect(parsed.reports.directory).toBe('.shipshield/reports');
      expect(parsed.scan.secrets.enabled).toBe(true);
      expect(parsed.policy.fail_on).toEqual(['critical', 'high']);
      expect(parsed.policy.fail_on_incomplete).toBe(true);
      expect(parsed.execution.network).toBe('allow');
    });

    it('rejects unknown keys due to strict validation', () => {
      const invalid = {
        schema_version: 1,
        unknown_field: 'illegal',
      };
      expect(() => ProjectConfigSchema.parse(invalid)).toThrow();
    });

    it('rejects invalid timeout values', () => {
      const invalid = {
        schema_version: 1,
        execution: {
          timeout_seconds: 2, // min is 5
        },
      };
      expect(() => ProjectConfigSchema.parse(invalid)).toThrow();
    });
  });

  describe('Finding Evidence & Normalized Finding Schemas', () => {
    it('rejects finding evidence if redacted is false', () => {
      expect(() =>
        FindingEvidenceSchema.parse({
          redacted: false as unknown as true,
          summary: 'Found secret',
        })
      ).toThrow();
    });

    it('validates a well-formed normalized finding', () => {
      const validFinding = {
        id: 'SS-SEC-A1B2C3D4',
        fingerprint: 'sha256:' + 'a'.repeat(64),
        type: 'hardcoded-secret',
        category: 'secrets',
        scanner: 'gitleaks',
        rule_id: 'aws-access-token',
        title: 'AWS Access Key Detected',
        description: 'Hardcoded AWS secret identified in code',
        severity: 'critical',
        severity_original: 'critical',
        confidence: 'high',
        location: {
          path: 'src/config.ts',
          start_line: 14,
          end_line: 14,
        },
        evidence: {
          redacted: true,
          summary: 'AKIA****',
          line_snippet: 'const key = "AKIA****";',
        },
        remediation: {
          summary: 'Rotate secret immediately and use environment variables.',
          fix_available: false,
          fix_strategy: null,
        },
        status: 'new',
        references: ['https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html'],
      };

      const parsed = NormalizedFindingSchema.parse(validFinding);
      expect(parsed.id).toBe('SS-SEC-A1B2C3D4');
      expect(parsed.category).toBe('secrets');
      expect(parsed.evidence.redacted).toBe(true);
    });

    it('rejects invalid finding ID format', () => {
      const invalidFinding = {
        id: 'INVALID-ID',
        fingerprint: 'sha256:' + 'a'.repeat(64),
        type: 'test',
        category: 'secrets',
        scanner: 'gitleaks',
        rule_id: 'rule1',
        title: 'Title',
        description: 'Desc',
        severity: 'critical',
        severity_original: 'CRITICAL',
        location: { path: 'file.txt' },
        evidence: { redacted: true, summary: 'test' },
        remediation: { summary: 'fix', fix_available: false },
      };

      expect(() => NormalizedFindingSchema.parse(invalidFinding)).toThrow();
    });

    it('rejects invalid fingerprint format', () => {
      const invalidFinding = {
        id: 'SS-SEC-1234',
        fingerprint: 'not-a-sha256',
        type: 'test',
        category: 'secrets',
        scanner: 'gitleaks',
        rule_id: 'rule1',
        title: 'Title',
        description: 'Desc',
        severity: 'critical',
        severity_original: 'CRITICAL',
        location: { path: 'file.txt' },
        evidence: { redacted: true, summary: 'test' },
        remediation: { summary: 'fix', fix_available: false },
      };

      expect(() => NormalizedFindingSchema.parse(invalidFinding)).toThrow();
    });
  });

  describe('ScanReportSchema', () => {
    it('validates a complete, compliant scan report', () => {
      const report = {
        schema_version: '1.0',
        tool: { name: 'shipshield', version: '1.0.0' },
        scan: {
          id: 'scan_01JC8XYZ9ABCDEF1234567890',
          started_at: '2026-10-24T12:00:00.000Z',
          completed_at: '2026-10-24T12:00:15.000Z',
          scope: {
            kind: 'full',
            root: '/workspace',
          },
          execution_status: 'completed',
          policy_outcome: 'passed',
        },
        project: {
          name: 'shipshield',
          vcs: {
            type: 'git',
            commit: 'abc123456',
            branch: 'main',
            dirty: false,
          },
        },
        scanners: [
          {
            id: 'secrets',
            status: 'completed',
            engine: 'gitleaks',
            engine_version: '8.18.2',
            duration_ms: 1200,
            finding_count: 0,
            error_message: null,
          },
        ],
        summary: {
          findings_total: 0,
          by_severity: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
          },
          policy_violations: 0,
        },
        findings: [],
        policy: {
          passed: true,
          rules_evaluated: 2,
          violations: [],
        },
        warnings: [],
        errors: [],
      };

      const parsed = ScanReportSchema.parse(report);
      expect(parsed.schema_version).toBe('1.0');
      expect(parsed.policy.passed).toBe(true);
    });
  });
});
