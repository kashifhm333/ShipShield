import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ReportReader, JsonReportWriter } from '../src/index.js';
import { ScanReport } from '@shipshield/contracts';

describe('ReportReader Edge Cases Suite', () => {
  it('reads report matching specific scan ID pattern', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-reader-'));
    try {
      const mockReport: ScanReport = {
        schema_version: '1.0',
        tool: { name: 'shipshield', version: '1.0.0' },
        scan: {
          id: 'scan_0123456789target99',
          started_at: '2026-10-24T12:00:00.000Z',
          completed_at: '2026-10-24T12:00:05.000Z',
          scope: { kind: 'full', root: tempDir },
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
      };

      const res = JsonReportWriter.write(tempDir, '.shipshield/reports', mockReport);
      const readRes = ReportReader.read(tempDir, '.shipshield/reports', 'target99');
      expect(readRes.report.scan.id).toBe(mockReport.scan.id);

      // Read by direct .json file path
      const readDirect = ReportReader.read(tempDir, '.shipshield/reports', res.reportPath);
      expect(readDirect.report.scan.id).toBe(mockReport.scan.id);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('throws error when JSON is invalid in report file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-reader-corrupt-'));
    const reportsDir = path.join(tempDir, '.shipshield', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'latest.json'), '{ invalid json');

    try {
      expect(() => {
        ReportReader.read(tempDir, '.shipshield/reports', 'latest');
      }).toThrow(/contains invalid JSON/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('throws error when scan ID has no matching report file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-reader-missing-'));
    const reportsDir = path.join(tempDir, '.shipshield', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });

    try {
      expect(() => {
        ReportReader.read(tempDir, '.shipshield/reports', 'nonexistent_scan_id');
      }).toThrow(/No scan report found matching ID/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('generates Markdown report with policy violations and findings', async () => {
    const { MarkdownReportWriter } = await import('../src/index.js');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-md-writer-'));
    try {
      const mockReport: ScanReport = {
        schema_version: '1.0',
        tool: { name: 'shipshield', version: '1.0.0' },
        scan: {
          id: 'scan_0123456789mdreport01',
          started_at: '2026-10-24T12:00:00.000Z',
          completed_at: '2026-10-24T12:00:05.000Z',
          scope: { kind: 'full', root: tempDir },
          execution_status: 'completed',
          policy_outcome: 'policy_failed',
        },
        project: { name: 'test' },
        scanners: [
          {
            id: 'secrets',
            status: 'completed',
            engine: 'gitleaks',
            engine_version: '8.18.2',
            duration_ms: 120,
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
            id: 'SS-SEC-123456',
            fingerprint: 'sha256:' + 'b'.repeat(64),
            type: 'hardcoded-secret',
            category: 'secrets',
            scanner: 'gitleaks',
            rule_id: 'rule-key',
            title: 'Hardcoded Key',
            description: 'Key found',
            severity: 'high',
            severity_original: 'HIGH',
            confidence: 'high',
            location: { path: 'src/config.ts', start_line: 12 },
            evidence: { redacted: true, summary: 'KEY=****' },
            remediation: { summary: 'Rotate', fix_available: true, fix_strategy: 'manual' },
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
              finding_id: 'SS-SEC-123456',
              finding_fingerprint: 'sha256:' + 'b'.repeat(64),
              message: 'High severity secret detected',
            },
          ],
        },
        warnings: [],
        errors: [],
      };

      const res = MarkdownReportWriter.write(tempDir, '.shipshield/reports', mockReport);
      expect(fs.existsSync(res.reportPath)).toBe(true);
      const content = fs.readFileSync(res.reportPath, 'utf8');
      expect(content).toContain('POLICY FAILED');
      expect(content).toContain('Policy Violations');
      expect(content).toContain('SS-SEC-123456');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

