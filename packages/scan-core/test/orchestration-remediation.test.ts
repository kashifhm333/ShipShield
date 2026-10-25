import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  PolicyEngine,
  JsonReportWriter,
  MarkdownReportWriter,
  ReportReader,
  FixRegistry,
  DockerfileNonRootHandler,
  RemediationEngine,
  FixExecutionError,
} from '../src/index.js';
import {
  NormalizedFinding,
  ProjectConfig,
  ProjectConfigSchema,
  ScanReport,
} from '@shipshield/contracts';
import { ScannerRunResult } from '../src/adapters/adapter.interface.js';

describe('Scan Core Orchestration, Policy & Remediation Suite', () => {
  const defaultConfig: ProjectConfig = ProjectConfigSchema.parse({ schema_version: 1 });

  describe('PolicyEngine', () => {
    it('returns "incomplete" when an enabled scanner fails, even with 0 findings', () => {
      const scannerRuns: ScannerRunResult[] = [
        {
          id: 'secrets',
          status: 'failed',
          engine: 'gitleaks',
          durationMs: 100,
          findingCount: 0,
          findings: [],
          errorMessage: 'Gitleaks process crashed',
        },
      ];

      const res = PolicyEngine.evaluate([], scannerRuns, defaultConfig);
      expect(res.passed).toBe(false);
      expect(res.policyOutcome).toBe('incomplete');
    });

    it('returns "policy_failed" when high finding is present and fail_on contains high', () => {
      const scannerRuns: ScannerRunResult[] = [
        {
          id: 'secrets',
          status: 'completed',
          engine: 'gitleaks',
          durationMs: 100,
          findingCount: 1,
          findings: [],
          errorMessage: null,
        },
      ];

      const finding: NormalizedFinding = {
        id: 'SS-SEC-123456',
        fingerprint: 'sha256:' + 'a'.repeat(64),
        type: 'hardcoded-secret',
        category: 'secrets',
        scanner: 'gitleaks',
        rule_id: 'secret-rule',
        title: 'Secret Detected',
        description: 'Exposed key',
        severity: 'high',
        severity_original: 'HIGH',
        confidence: 'high',
        location: { path: 'test.js' },
        evidence: { redacted: true, summary: '****' },
        remediation: { summary: 'Rotate', fix_available: false, fix_strategy: null },
        status: 'new',
        references: [],
      };

      const res = PolicyEngine.evaluate([finding], scannerRuns, defaultConfig);
      expect(res.passed).toBe(false);
      expect(res.policyOutcome).toBe('policy_failed');
      expect(res.violations.length).toBe(1);
    });

    it('honors active suppressions but ignores expired suppressions', () => {
      const scannerRuns: ScannerRunResult[] = [
        {
          id: 'secrets',
          status: 'completed',
          engine: 'gitleaks',
          durationMs: 100,
          findingCount: 1,
          findings: [],
          errorMessage: null,
        },
      ];

      const finding: NormalizedFinding = {
        id: 'SS-SEC-123456',
        fingerprint: 'sha256:' + 'b'.repeat(64),
        type: 'hardcoded-secret',
        category: 'secrets',
        scanner: 'gitleaks',
        rule_id: 'secret-rule',
        title: 'Secret Detected',
        description: 'Exposed key',
        severity: 'critical',
        severity_original: 'CRITICAL',
        confidence: 'high',
        location: { path: 'test.js' },
        evidence: { redacted: true, summary: '****' },
        remediation: { summary: 'Rotate', fix_available: false, fix_strategy: null },
        status: 'new',
        references: [],
      };

      // 1. Expired suppression: should NOT suppress
      const expiredDate = new Date(Date.now() - 100000).toISOString();
      const resExpired = PolicyEngine.evaluate([finding], scannerRuns, defaultConfig, [
        { fingerprint: finding.fingerprint, expires_at: expiredDate },
      ]);
      expect(resExpired.passed).toBe(false);
      expect(resExpired.policyOutcome).toBe('policy_failed');

      // 2. Active suppression: should suppress
      const futureDate = new Date(Date.now() + 100000).toISOString();
      const resActive = PolicyEngine.evaluate([finding], scannerRuns, defaultConfig, [
        { fingerprint: finding.fingerprint, expires_at: futureDate },
      ]);
      expect(resActive.passed).toBe(true);
      expect(resActive.policyOutcome).toBe('passed');
      expect(resActive.findings[0]?.status).toBe('suppressed');
    });
  });

  describe('Report Writers & Reader', () => {
    it('writes and reads JSON and Markdown reports atomically', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-rep-root-'));
      try {
        const report: ScanReport = {
          schema_version: '1.0',
          tool: { name: 'shipshield', version: '1.0.0' },
          scan: {
            id: 'scan_01JC8XYZ9ABCDEF1234567890',
            started_at: '2026-10-24T12:00:00.000Z',
            completed_at: '2026-10-24T12:00:10.000Z',
            scope: { kind: 'full', root: '.' },
            execution_status: 'completed',
            policy_outcome: 'passed',
          },
          project: { name: 'test-project' },
          scanners: [
            {
              id: 'secrets',
              status: 'completed',
              engine: 'gitleaks',
              duration_ms: 100,
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

        const jsonRes = JsonReportWriter.write(root, '.shipshield/reports', report);
        expect(fs.existsSync(jsonRes.reportPath)).toBe(true);
        expect(fs.existsSync(jsonRes.latestPath)).toBe(true);

        const mdRes = MarkdownReportWriter.write(root, '.shipshield/reports', report);
        expect(fs.existsSync(mdRes.reportPath)).toBe(true);
        expect(fs.existsSync(mdRes.latestPath)).toBe(true);

        // Read report back
        const readResult = ReportReader.read(root, '.shipshield/reports', 'latest');
        expect(readResult.report.scan.id).toBe(report.scan.id);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe('FixRegistry Invariants', () => {
    it('throws error when attempting to register a fix handler for secrets category', () => {
      const registry = new FixRegistry();
      const secretHandler: any = {
        strategyId: 'secret-leak-fix',
        category: 'secrets',
        supportedRuleIds: ['aws-key'],
        planFix: async () => null,
      };

      expect(() => {
        registry.register(secretHandler);
      }).toThrow(/Automated file modification for secrets is strictly prohibited/);
    });

    it('returns undefined for secrets or findings without fix strategy', () => {
      const registry = new FixRegistry();
      const findingSecret: any = {
        category: 'secrets',
        rule_id: 'rule-key',
        remediation: { fix_strategy: null },
      };
      expect(registry.getForFinding(findingSecret)).toBeUndefined();
    });
  });

  describe('RemediationEngine Safety & Concurrency Guards', () => {
    it('leaves filesystem 100% byte-identical when dryRun is true (no --apply)', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-fix-root-'));
      try {
        const dockerfilePath = path.join(root, 'Dockerfile');
        const initialContent = 'FROM node:20-alpine\nWORKDIR /app\nCMD ["node", "server.js"]\n';
        fs.writeFileSync(dockerfilePath, initialContent);

        const registry = new FixRegistry();
        registry.register(new DockerfileNonRootHandler());

        const finding: NormalizedFinding = {
          id: 'SS-CON-123456',
          fingerprint: 'sha256:' + 'c'.repeat(64),
          type: 'container-misconfiguration',
          category: 'containers',
          scanner: 'trivy',
          rule_id: 'DS002',
          title: 'Root user in Dockerfile',
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
        };

        const proposals = await RemediationEngine.planFixes({
          projectRoot: root,
          findings: [finding],
          registry,
        });

        expect(proposals.length).toBe(1);
        expect(proposals[0]?.unifiedDiff).toContain('+USER 10001:10001');

        // Apply without apply: true (dry-run)
        const applyRes = await RemediationEngine.applyFixes({
          projectRoot: root,
          proposals,
          dryRun: true,
          apply: false,
        });

        expect(applyRes.appliedCount).toBe(0);
        const contentAfter = fs.readFileSync(dockerfilePath, 'utf8');
        expect(contentAfter).toBe(initialContent); // Byte identical
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('aborts with Exit Code 6 (FixExecutionError) if file is modified between plan and apply', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-fix-root-'));
      try {
        const dockerfilePath = path.join(root, 'Dockerfile');
        const initialContent = 'FROM node:20-alpine\nCMD ["node", "server.js"]\n';
        fs.writeFileSync(dockerfilePath, initialContent);

        const registry = new FixRegistry();
        registry.register(new DockerfileNonRootHandler());

        const finding: NormalizedFinding = {
          id: 'SS-CON-123456',
          fingerprint: 'sha256:' + 'd'.repeat(64),
          type: 'container-misconfiguration',
          category: 'containers',
          scanner: 'trivy',
          rule_id: 'DS002',
          title: 'Root user',
          description: 'desc',
          severity: 'high',
          severity_original: 'HIGH',
          confidence: 'high',
          location: { path: 'Dockerfile' },
          evidence: { redacted: true, summary: 'test' },
          remediation: {
            summary: 'Add USER',
            fix_available: true,
            fix_strategy: 'dockerfile-non-root',
          },
          status: 'new',
          references: [],
        };

        const proposals = await RemediationEngine.planFixes({
          projectRoot: root,
          findings: [finding],
          registry,
        });

        // Modify file on disk to simulate concurrent edit
        fs.writeFileSync(dockerfilePath, 'FROM node:20-alpine\n# Edited!\nCMD ["node", "server.js"]\n');

        // Attempt to apply with apply: true
        await expect(
          RemediationEngine.applyFixes({
            projectRoot: root,
            proposals,
            apply: true,
          })
        ).rejects.toThrow(FixExecutionError);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('atomically patches file when apply is true and hashes match', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-fix-root-'));
      try {
        const dockerfilePath = path.join(root, 'Dockerfile');
        const initialContent = 'FROM node:20-alpine\nCMD ["node", "server.js"]\n';
        fs.writeFileSync(dockerfilePath, initialContent);

        const registry = new FixRegistry();
        registry.register(new DockerfileNonRootHandler());

        const finding: NormalizedFinding = {
          id: 'SS-CON-123456',
          fingerprint: 'sha256:' + 'e'.repeat(64),
          type: 'container-misconfiguration',
          category: 'containers',
          scanner: 'trivy',
          rule_id: 'DS002',
          title: 'Root user',
          description: 'desc',
          severity: 'high',
          severity_original: 'HIGH',
          confidence: 'high',
          location: { path: 'Dockerfile' },
          evidence: { redacted: true, summary: 'test' },
          remediation: {
            summary: 'Add USER',
            fix_available: true,
            fix_strategy: 'dockerfile-non-root',
          },
          status: 'new',
          references: [],
        };

        const proposals = await RemediationEngine.planFixes({
          projectRoot: root,
          findings: [finding],
          registry,
        });

        const res = await RemediationEngine.applyFixes({
          projectRoot: root,
          proposals,
          apply: true,
        });

        expect(res.appliedCount).toBe(1);
        const patchedContent = fs.readFileSync(dockerfilePath, 'utf8');
        expect(patchedContent).toContain('USER 10001:10001');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('handles TerraformS3PublicAccessHandler with and without explicit resource_address', async () => {
      const { TerraformS3PublicAccessHandler } = await import('../src/remediation/handlers/terraform-s3-public-access.handler.js');
      const handler = new TerraformS3PublicAccessHandler();
      expect(handler.category).toBe('iac');
      expect(handler.supportedRuleIds).toContain('CKV_AWS_20');

      // 1. With explicit resource_address
      const findingWithAddr: NormalizedFinding = {
        id: 'SS-IAC-001',
        fingerprint: 'sha256:' + 'f'.repeat(64),
        type: 'iac-misconfiguration',
        category: 'iac',
        scanner: 'checkov',
        rule_id: 'CKV_AWS_20',
        title: 'S3 Bucket Public Access Block',
        description: 'desc',
        severity: 'high',
        severity_original: 'HIGH',
        confidence: 'high',
        location: { path: 'main.tf', resource_address: 'aws_s3_bucket.my_data' },
        evidence: { redacted: true, summary: 'test' },
        remediation: { summary: 'Add block', fix_available: true, fix_strategy: 'terraform-s3-public-access' },
        status: 'new',
        references: [],
      };

      const tfContent = 'resource "aws_s3_bucket" "my_data" {}\n';
      const proposalWithAddr = await handler.planFix(findingWithAddr, tfContent, 'sha256-dummy');
      expect(proposalWithAddr).not.toBeNull();
      expect(proposalWithAddr?.patchedContent).toContain('aws_s3_bucket_public_access_block" "my_data_public_access_block"');
      expect(proposalWithAddr?.patchedContent).toContain('aws_s3_bucket.my_data.id');

      // 2. Without resource_address
      const findingWithoutAddr: NormalizedFinding = {
        ...findingWithAddr,
        location: { path: 'main.tf' },
      };
      const proposalWithoutAddr = await handler.planFix(findingWithoutAddr, tfContent, 'sha256-dummy');
      expect(proposalWithoutAddr).not.toBeNull();
      expect(proposalWithoutAddr?.patchedContent).toContain('aws_s3_bucket_public_access_block" "this_public_access_block"');
      expect(proposalWithoutAddr?.patchedContent).toContain('aws_s3_bucket.this.id');
    });
  });
});
