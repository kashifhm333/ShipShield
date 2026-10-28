import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ScanOrchestrator,
  AdapterRegistry,
  ScannerAdapter,
  VerificationEngine,
  TerraformS3PublicAccessHandler,
  ScannerRunResult,
} from '../src/index.js';
import {
  ProjectConfig,
  ProjectConfigSchema,
  NormalizedFinding,
  ScanReport,
} from '@shipshield/contracts';

describe('ScanOrchestrator, Registry & Verification Suite', () => {
  const defaultConfig: ProjectConfig = ProjectConfigSchema.parse({ schema_version: 1 });

  describe('AdapterRegistry', () => {
    it('registers, retrieves, and checks adapters', () => {
      const registry = new AdapterRegistry();
      const mockAdapter: ScannerAdapter = {
        id: 'secrets',
        name: 'Mock Secrets',
        binaryName: 'mock-gitleaks',
        isApplicable: async () => true,
        checkAvailability: async () => ({ available: true }),
        scan: async () => ({
          id: 'secrets',
          status: 'completed',
          engine: 'mock-gitleaks',
          durationMs: 10,
          findingCount: 0,
          findings: [],
          errorMessage: null,
        }),
      };

      expect(registry.has('secrets')).toBe(false);
      registry.register(mockAdapter);
      expect(registry.has('secrets')).toBe(true);
      expect(registry.get('secrets')?.name).toBe('Mock Secrets');
      expect(registry.getAll().length).toBe(1);
    });
  });

  describe('TerraformS3PublicAccessHandler', () => {
    it('generates unified diff adding aws_s3_bucket_public_access_block', async () => {
      const handler = new TerraformS3PublicAccessHandler();
      const finding: NormalizedFinding = {
        id: 'SS-IAC-123456',
        fingerprint: 'sha256:' + 'f'.repeat(64),
        type: 'iac-misconfiguration',
        category: 'iac',
        scanner: 'checkov',
        rule_id: 'CKV_AWS_20',
        title: 'S3 public ACL',
        description: 'Bucket has public read access',
        severity: 'high',
        severity_original: 'HIGH',
        confidence: 'high',
        location: {
          path: 'main.tf',
          resource_address: 'aws_s3_bucket.public_bucket',
        },
        evidence: { redacted: true, summary: 'Bucket is public' },
        remediation: {
          summary: 'Block public access',
          fix_available: true,
          fix_strategy: 'terraform-s3-public-access',
        },
        status: 'new',
        references: [],
      };

      const initialTf = 'resource "aws_s3_bucket" "public_bucket" {\n  bucket = "my-bucket"\n}\n';
      const proposal = await handler.planFix(finding, initialTf, 'mockhash');

      expect(proposal).not.toBeNull();
      expect(proposal!.patchedContent).toContain('resource "aws_s3_bucket_public_access_block" "public_bucket_public_access_block"');
      expect(proposal!.patchedContent).toContain('block_public_acls       = true');
      expect(proposal!.unifiedDiff).toContain('+resource "aws_s3_bucket_public_access_block"');
    });
  });

  describe('ScanOrchestrator Execution', () => {
    it('runs enabled and applicable scanners and writes reports', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-orch-'));
      try {
        fs.writeFileSync(path.join(root, 'index.js'), 'console.log("clean");\n');
        fs.writeFileSync(path.join(root, 'Dockerfile'), 'FROM node:20-alpine\nUSER node\n');

        const registry = new AdapterRegistry();

        const mockSecretsAdapter: ScannerAdapter = {
          id: 'secrets',
          name: 'Secrets Scanner',
          binaryName: 'gitleaks',
          isApplicable: async () => true,
          checkAvailability: async () => ({ available: true }),
          scan: async () => ({
            id: 'secrets',
            status: 'completed',
            engine: 'gitleaks',
            durationMs: 25,
            findingCount: 0,
            findings: [],
            errorMessage: null,
          }),
        };

        const mockContainersAdapter: ScannerAdapter = {
          id: 'containers',
          name: 'Container Scanner',
          binaryName: 'trivy',
          isApplicable: async () => true,
          checkAvailability: async () => ({ available: true }),
          scan: async () => ({
            id: 'containers',
            status: 'completed',
            engine: 'trivy',
            durationMs: 40,
            findingCount: 0,
            findings: [],
            errorMessage: null,
          }),
        };

        registry.register(mockSecretsAdapter);
        registry.register(mockContainersAdapter);

        const result = await ScanOrchestrator.run({
          projectRoot: root,
          config: defaultConfig,
          adapters: registry,
          writeReports: true,
        });

        expect(result.report.scan.policy_outcome).toBe('passed');
        expect(result.report.scanners.length).toBe(2);
        expect(result.jsonReportPath).toBeDefined();
        expect(result.markdownReportPath).toBeDefined();
        expect(fs.existsSync(result.jsonReportPath!)).toBe(true);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('marks scanner as not_applicable if files for that category are missing', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-orch-na-'));
      try {
        fs.writeFileSync(path.join(root, 'index.js'), 'console.log("clean");\n');
        // No Dockerfile, No Terraform, No package.json

        const registry = new AdapterRegistry();
        const mockContainersAdapter: ScannerAdapter = {
          id: 'containers',
          name: 'Container Scanner',
          binaryName: 'trivy',
          isApplicable: async () => true,
          checkAvailability: async () => ({ available: true }),
          scan: async () => ({
            id: 'containers',
            status: 'completed',
            engine: 'trivy',
            durationMs: 40,
            findingCount: 0,
            findings: [],
            errorMessage: null,
          }),
        };

        registry.register(mockContainersAdapter);

        const result = await ScanOrchestrator.run({
          projectRoot: root,
          config: defaultConfig,
          adapters: registry,
          writeReports: false,
        });

        expect(result.report.scanners[0]?.status).toBe('not_applicable');
        expect(result.report.scanners[0]?.duration_ms).toBe(0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('deduplicates findings by fingerprint and sorts by severity, path, and line', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-orch-dedup-'));
      try {
        fs.writeFileSync(path.join(root, 'index.js'), 'console.log("clean");\n');

        const f1: NormalizedFinding = {
          id: 'SS-1',
          fingerprint: 'sha256:' + 'a'.repeat(64),
          type: 'secret',
          category: 'secrets',
          scanner: 'gitleaks',
          rule_id: 'r1',
          title: 'T1',
          description: 'D1',
          severity: 'critical',
          severity_original: 'CRITICAL',
          confidence: 'high',
          location: { path: 'a.js', start_line: 10 },
          evidence: { redacted: true, summary: 's1' },
          remediation: { summary: 'r1', fix_available: false, fix_strategy: null },
          status: 'new',
          references: [],
        };

        const f2Duplicate: NormalizedFinding = {
          ...f1,
          id: 'SS-1-dup',
        };

        const f3High: NormalizedFinding = {
          ...f1,
          id: 'SS-3',
          fingerprint: 'sha256:' + 'b'.repeat(64),
          severity: 'high',
          location: { path: 'b.js', start_line: 5 },
        };

        const registry = new AdapterRegistry();
        registry.register({
          id: 'secrets',
          name: 'Secrets',
          binaryName: 'gitleaks',
          isApplicable: async () => true,
          checkAvailability: async () => ({ available: true }),
          scan: async () => ({
            id: 'secrets',
            status: 'completed',
            engine: 'gitleaks',
            durationMs: 10,
            findingCount: 3,
            findings: [f3High, f1, f2Duplicate],
            errorMessage: null,
          }),
        });

        const res = await ScanOrchestrator.run({
          projectRoot: root,
          config: defaultConfig,
          adapters: registry,
          writeReports: false,
        });

        // Deduplication asserted: 3 raw findings -> 2 deduplicated findings
        expect(res.report.findings.length).toBe(2);
        // Sorting asserted: Critical before High
        expect(res.report.findings[0]?.severity).toBe('critical');
        expect(res.report.findings[1]?.severity).toBe('high');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe('VerificationEngine', () => {
    it('verifies that resolved findings transition correctly when re-scan completes cleanly', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-verif-'));
      try {
        fs.writeFileSync(path.join(root, 'index.js'), 'console.log("clean");\n');

        const resolvedFinding: NormalizedFinding = {
          id: 'SS-SEC-123456',
          fingerprint: 'sha256:' + '1'.repeat(64),
          type: 'hardcoded-secret',
          category: 'secrets',
          scanner: 'gitleaks',
          rule_id: 'secret-rule',
          title: 'Secret',
          description: 'Secret',
          severity: 'high',
          severity_original: 'HIGH',
          confidence: 'high',
          location: { path: 'index.js' },
          evidence: { redacted: true, summary: '****' },
          remediation: { summary: 'Fix', fix_available: false, fix_strategy: null },
          status: 'new',
          references: [],
        };

        const baselineReport: ScanReport = {
          schema_version: '1.0',
          tool: { name: 'shipshield', version: '1.0.0' },
          scan: {
            id: 'scan_base',
            started_at: '2026-10-24T12:00:00.000Z',
            completed_at: '2026-10-24T12:00:05.000Z',
            scope: { kind: 'full', root },
            execution_status: 'completed',
            policy_outcome: 'policy_failed',
          },
          project: { name: 'test' },
          scanners: [
            {
              id: 'secrets',
              status: 'completed',
              engine: 'gitleaks',
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
          findings: [resolvedFinding],
          policy: {
            passed: false,
            rules_evaluated: 1,
            violations: [
              {
                rule_id: 'fail_on_high',
                finding_id: resolvedFinding.id,
                finding_fingerprint: resolvedFinding.fingerprint,
                message: 'high findings present',
              },
            ],
          },
          warnings: [],
          errors: [],
        };

        // Re-scan with 0 findings (finding is resolved!)
        const registry = new AdapterRegistry();
        registry.register({
          id: 'secrets',
          name: 'Secrets Scanner',
          binaryName: 'gitleaks',
          isApplicable: async () => true,
          checkAvailability: async () => ({ available: true }),
          scan: async () => ({
            id: 'secrets',
            status: 'completed',
            engine: 'gitleaks',
            durationMs: 15,
            findingCount: 0,
            findings: [],
            errorMessage: null,
          }),
        });

        const verifRes = await VerificationEngine.verify(baselineReport, {
          projectRoot: root,
          config: defaultConfig,
          adapters: registry,
          writeReports: false,
        });

        expect(verifRes.resolvedFindings).toContain(resolvedFinding.fingerprint);
        expect(verifRes.remainingFindings.length).toBe(0);
        expect(verifRes.unverifiedFindings.length).toBe(0);
        expect(verifRes.verificationOutcome).toBe('passed');
        expect(verifRes.exitCode).toBe(0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('returns incomplete (exit code 4) if re-scan scanner fails (Verification Over Assertion)', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-verif-fail-'));
      try {
        fs.writeFileSync(path.join(root, 'index.js'), 'console.log("clean");\n');

        const finding: NormalizedFinding = {
          id: 'SS-SEC-123456',
          fingerprint: 'sha256:' + '2'.repeat(64),
          type: 'hardcoded-secret',
          category: 'secrets',
          scanner: 'gitleaks',
          rule_id: 'secret-rule',
          title: 'Secret',
          description: 'Secret',
          severity: 'high',
          severity_original: 'HIGH',
          confidence: 'high',
          location: { path: 'index.js' },
          evidence: { redacted: true, summary: '****' },
          remediation: { summary: 'Fix', fix_available: false, fix_strategy: null },
          status: 'new',
          references: [],
        };

        const baselineReport: ScanReport = {
          schema_version: '1.0',
          tool: { name: 'shipshield', version: '1.0.0' },
          scan: {
            id: 'scan_base',
            started_at: '2026-10-24T12:00:00.000Z',
            completed_at: '2026-10-24T12:00:05.000Z',
            scope: { kind: 'full', root },
            execution_status: 'completed',
            policy_outcome: 'policy_failed',
          },
          project: { name: 'test' },
          scanners: [
            {
              id: 'secrets',
              status: 'completed',
              engine: 'gitleaks',
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
          findings: [finding],
          policy: {
            passed: false,
            rules_evaluated: 1,
            violations: [
              {
                rule_id: 'fail_on_high',
                finding_id: finding.id,
                finding_fingerprint: finding.fingerprint,
                message: 'high findings present',
              },
            ],
          },
          warnings: [],
          errors: [],
        };

        // Re-scan where secrets scanner crashes
        const registry = new AdapterRegistry();
        registry.register({
          id: 'secrets',
          name: 'Secrets Scanner',
          binaryName: 'gitleaks',
          isApplicable: async () => true,
          checkAvailability: async () => ({ available: true }),
          scan: async () => ({
            id: 'secrets',
            status: 'failed',
            engine: 'gitleaks',
            durationMs: 15,
            findingCount: 0,
            findings: [],
            errorMessage: 'Process failed',
          }),
        });

        const verifRes = await VerificationEngine.verify(baselineReport, {
          projectRoot: root,
          config: defaultConfig,
          adapters: registry,
          writeReports: false,
        });

        expect(verifRes.unverifiedFindings).toContain(finding.fingerprint);
        expect(verifRes.verificationOutcome).toBe('incomplete');
        expect(verifRes.exitCode).toBe(4);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('filters out disabled scanners from config and sorts findings deterministically by line number', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-orch-filter-'));
      try {
        fs.writeFileSync(path.join(root, 'index.js'), 'console.log("hello");\n');
        fs.writeFileSync(path.join(root, 'package.json'), '{"name": "test"}\n');

        const disabledConfig: ProjectConfig = ProjectConfigSchema.parse({
          schema_version: 1,
          scan: {
            secrets: { enabled: false },
          },
          execution: {
            network: 'deny',
          },
        });

        const registry = new AdapterRegistry();
        registry.register({
          id: 'secrets',
          name: 'Secrets',
          binaryName: 'gitleaks',
          isApplicable: async () => true,
          checkAvailability: async () => ({ available: true }),
          scan: async () => {
            throw new Error('Should not be called when disabled in config');
          },
        });

        registry.register({
          id: 'dependencies',
          name: 'Dependencies',
          binaryName: 'trivy',
          isApplicable: async () => true,
          checkAvailability: async () => ({ available: true }),
          scan: async () => ({
            id: 'dependencies',
            status: 'completed',
            engine: 'trivy',
            durationMs: 10,
            findingCount: 2,
            findings: [
              {
                id: 'SS-DEP-2',
                fingerprint: 'sha256:' + '2'.repeat(64),
                type: 'dependency-vulnerability',
                category: 'dependencies',
                scanner: 'trivy',
                rule_id: 'CVE-2',
                title: 'Vuln 2',
                description: 'desc',
                severity: 'high',
                severity_original: 'HIGH',
                confidence: 'high',
                location: { path: 'package.json', start_line: 20 },
                evidence: { redacted: true, summary: 'test' },
                remediation: { summary: 'fix', fix_available: false, fix_strategy: null },
                status: 'new',
                references: [],
              },
              {
                id: 'SS-DEP-1',
                fingerprint: 'sha256:' + '1'.repeat(64),
                type: 'dependency-vulnerability',
                category: 'dependencies',
                scanner: 'trivy',
                rule_id: 'CVE-1',
                title: 'Vuln 1',
                description: 'desc',
                severity: 'high',
                severity_original: 'HIGH',
                confidence: 'high',
                location: { path: 'package.json', start_line: 10 },
                evidence: { redacted: true, summary: 'test' },
                remediation: { summary: 'fix', fix_available: false, fix_strategy: null },
                status: 'new',
                references: [],
              },
            ],
            errorMessage: null,
          }),
        });

        const { report } = await ScanOrchestrator.run({
          projectRoot: root,
          config: disabledConfig,
          adapters: registry,
          writeReports: false,
        });

        // Secrets was filtered out
        expect(report.scanners.some((s) => s.id === 'secrets')).toBe(false);
        // Findings sorted by start_line ascending: 10 then 20
        expect(report.findings[0]?.location.start_line).toBe(10);
        expect(report.findings[1]?.location.start_line).toBe(20);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
