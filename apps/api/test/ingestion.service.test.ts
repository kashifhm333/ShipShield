import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionService } from '../src/services/ingestion.service.js';
import { ScanModel } from '../src/db/models/scan.model.js';
import { FindingModel } from '../src/db/models/finding.model.js';
import { ScanFindingModel } from '../src/db/models/scan-finding.model.js';
import { ScanReport } from '@shipshield/contracts';

describe('IngestionService Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes evidence with redaction engine and updates scan document', async () => {
    const mockScanDoc: any = {
      _id: '6650a1b2c3d4e5f6a7b8c911',
      organization_id: '6650a1b2c3d4e5f6a7b8c901',
      scan_id: 'scan_0123456789ingest01',
      execution_status: 'running',
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(ScanModel, 'findOne').mockResolvedValue(mockScanDoc);

    const mockFindingDoc: any = {
      _id: '6650a1b2c3d4e5f6a7b8c999',
    };
    vi.spyOn(FindingModel, 'findOneAndUpdate').mockResolvedValue(mockFindingDoc);
    vi.spyOn(ScanFindingModel, 'findOneAndUpdate').mockResolvedValue({} as any);

    const mockReport: ScanReport = {
      schema_version: '1.0',
      tool: { name: 'shipshield', version: '1.0.0' },
      scan: {
        id: 'scan_0123456789ingest01',
        started_at: '2026-10-24T12:00:00.000Z',
        completed_at: '2026-10-24T12:00:10.000Z',
        scope: { kind: 'full', root: '.' },
        execution_status: 'completed',
        policy_outcome: 'passed',
      },
      project: { name: 'test' },
      scanners: [
        {
          id: 'secrets',
          status: 'completed',
          engine: 'gitleaks',
          duration_ms: 100,
          finding_count: 1,
          error_message: null,
        },
      ],
      summary: {
        findings_total: 1,
        by_severity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
        policy_violations: 0,
      },
      findings: [
        {
          id: 'SS-SEC-123456',
          fingerprint: 'sha256:' + 'a'.repeat(64),
          type: 'hardcoded-secret',
          category: 'secrets',
          scanner: 'gitleaks',
          rule_id: 'aws-key',
          title: 'AWS Secret Key',
          description: 'Key found',
          severity: 'high',
          severity_original: 'HIGH',
          confidence: 'high',
          location: { path: 'config.js', start_line: 5 },
          evidence: {
            redacted: true,
            summary: 'Raw secret AKIAIOSFODNN7EXAMPLE in config',
            line_snippet: 'const AWS = "AKIAIOSFODNN7EXAMPLE";',
          },
          remediation: { summary: 'Rotate key', fix_available: false, fix_strategy: null },
          status: 'new',
          references: [],
        },
      ],
      policy: { passed: true, rules_evaluated: 1, violations: [] },
      warnings: [],
      errors: [],
    };

    const res = await IngestionService.ingestScanResults({
      organizationId: '6650a1b2c3d4e5f6a7b8c901',
      repositoryId: '6650a1b2c3d4e5f6a7b8c902',
      scanId: 'scan_0123456789ingest01',
      report: mockReport,
    });

    expect(res).not.toBeNull();
    expect(mockScanDoc.execution_status).toBe('completed');
    expect(mockScanDoc.save).toHaveBeenCalled();

    // Verify FindingModel.findOneAndUpdate was called with sanitized evidence
    expect(FindingModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          evidence: expect.objectContaining({
            summary: expect.not.stringContaining('AKIAIOSFODNN7EXAMPLE'),
            line_snippet: expect.not.stringContaining('AKIAIOSFODNN7EXAMPLE'),
          }),
        }),
      }),
      expect.anything()
    );
  });

  it('throws error if scan document is not found', async () => {
    vi.spyOn(ScanModel, 'findOne').mockResolvedValue(null);

    await expect(
      IngestionService.ingestScanResults({
        organizationId: '6650a1b2c3d4e5f6a7b8c901',
        repositoryId: '6650a1b2c3d4e5f6a7b8c902',
        scanId: 'scan_non_existent',
        report: {} as any,
      })
    ).rejects.toThrow('Scan not found');
  });
});
