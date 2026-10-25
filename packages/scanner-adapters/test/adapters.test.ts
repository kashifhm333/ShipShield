import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GitleaksAdapter } from '../src/gitleaks/gitleaks.adapter.js';
import { TrivyDependenciesAdapter } from '../src/trivy/trivy-dependencies.adapter.js';
import { TrivyContainersAdapter } from '../src/trivy/trivy-containers.adapter.js';
import { CheckovAdapter } from '../src/checkov/checkov.adapter.js';
import { ProcessRunner } from '@shipshield/scan-core';
import { NormalizedFindingSchema } from '@shipshield/contracts';

describe('Scanner Adapters Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Missing Binaries Graceful Degradation', () => {
    it('Gitleaks adapter returns skipped when binary is absent', async () => {
      const adapter = new GitleaksAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: false,
        error: 'Binary not found',
      });

      const res = await adapter.scan({
        workspacePath: '/tmp/test',
        timeoutSeconds: 30,
      });

      expect(res.status).toBe('skipped');
      expect(res.findingCount).toBe(0);
      expect(res.errorMessage).toContain('Binary not found');
    });

    it('Trivy dependencies adapter returns skipped when binary is absent', async () => {
      const adapter = new TrivyDependenciesAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: false,
        error: 'Trivy binary not found',
      });

      const res = await adapter.scan({
        workspacePath: '/tmp/test',
        timeoutSeconds: 30,
      });

      expect(res.status).toBe('skipped');
      expect(res.findingCount).toBe(0);
    });

    it('Trivy containers adapter returns skipped when binary is absent', async () => {
      const adapter = new TrivyContainersAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: false,
        error: 'Trivy binary not found',
      });

      const res = await adapter.scan({
        workspacePath: '/tmp/test',
        timeoutSeconds: 30,
      });

      expect(res.status).toBe('skipped');
      expect(res.findingCount).toBe(0);
    });

    it('Checkov adapter returns skipped when binary is absent', async () => {
      const adapter = new CheckovAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: false,
        error: 'Checkov binary not found',
      });

      const res = await adapter.scan({
        workspacePath: '/tmp/test',
        timeoutSeconds: 30,
      });

      expect(res.status).toBe('skipped');
      expect(res.findingCount).toBe(0);
    });
  });

  describe('Gitleaks Adapter Tests', () => {
    it('parses mock Gitleaks findings and redacts secrets', async () => {
      const adapter = new GitleaksAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: true,
        version: '8.18.2',
      });

      const rawGitleaks = [
        {
          Description: 'Identified AWS Access Key',
          StartLine: 12,
          EndLine: 12,
          StartColumn: 1,
          EndColumn: 30,
          Match: 'const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";',
          Secret: 'AKIAIOSFODNN7EXAMPLE',
          File: 'config.js',
          SymlinkFile: '',
          Commit: 'abc',
          Entropy: 3.5,
          Author: 'Dev',
          Email: 'dev@test.com',
          Date: '2026-10-24',
          Message: 'Commit',
          Tags: ['key'],
          RuleID: 'aws-access-key-id',
          Fingerprint: 'dummy',
        },
      ];

      vi.spyOn(ProcessRunner, 'run').mockImplementation(async (opts) => {
        const reportIdx = opts.args.indexOf('--report-path');
        if (reportIdx !== -1 && opts.args[reportIdx + 1]) {
          fs.writeFileSync(opts.args[reportIdx + 1]!, JSON.stringify(rawGitleaks));
        }
        return {
          exitCode: 1,
          signal: null,
          stdout: '',
          stderr: '',
          durationMs: 100,
          timedOut: false,
          bufferOverflowed: false,
        };
      });

      const res = await adapter.scan({
        workspacePath: '/workspace',
        timeoutSeconds: 10,
      });

      expect(res.status).toBe('completed');
      expect(res.findingCount).toBe(1);
      const finding = res.findings[0]!;
      expect(finding.category).toBe('secrets');
      expect(finding.evidence.redacted).toBe(true);
      expect(finding.evidence.summary).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(finding.evidence.summary).toContain('****');
      expect(() => NormalizedFindingSchema.parse(finding)).not.toThrow();
    });

    it('returns failed status when JSON is corrupted', async () => {
      const adapter = new GitleaksAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: true,
        version: '8.18.2',
      });

      vi.spyOn(ProcessRunner, 'run').mockImplementation(async (opts) => {
        const reportIdx = opts.args.indexOf('--report-path');
        if (reportIdx !== -1 && opts.args[reportIdx + 1]) {
          fs.writeFileSync(opts.args[reportIdx + 1]!, '{ corrupt json');
        }
        return {
          exitCode: 1,
          signal: null,
          stdout: '',
          stderr: '',
          durationMs: 100,
          timedOut: false,
          bufferOverflowed: false,
        };
      });

      const res = await adapter.scan({
        workspacePath: '/workspace',
        timeoutSeconds: 10,
      });

      expect(res.status).toBe('failed');
      expect(res.errorMessage).toContain('Malformed JSON');
    });

    it('returns timed_out status when process times out', async () => {
      const adapter = new GitleaksAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: true,
        version: '8.18.2',
      });

      vi.spyOn(ProcessRunner, 'run').mockResolvedValue({
        exitCode: null,
        signal: 'SIGTERM',
        stdout: '',
        stderr: 'timed out',
        durationMs: 5000,
        timedOut: true,
        bufferOverflowed: false,
      });

      const res = await adapter.scan({
        workspacePath: '/workspace',
        timeoutSeconds: 5,
      });

      expect(res.status).toBe('timed_out');
    });
  });

  describe('Trivy Dependencies Adapter Tests', () => {
    it('parses mock Trivy dependency vulnerabilities successfully', async () => {
      const adapter = new TrivyDependenciesAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: true,
        version: '0.50.0',
      });

      const rawTrivyReport = {
        Results: [
          {
            Target: 'package-lock.json',
            Class: 'lang-pkgs',
            Type: 'npm',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2023-12345',
                PkgName: 'axios',
                InstalledVersion: '0.21.1',
                FixedVersion: '0.21.2',
                Severity: 'HIGH',
                Title: 'SSRF Vulnerability in axios',
                Description: 'Axios vulnerable to SSRF',
                PrimaryURL: 'https://nvd.nist.gov/vuln/detail/CVE-2023-12345',
              },
            ],
          },
        ],
      };

      vi.spyOn(ProcessRunner, 'run').mockImplementation(async (opts) => {
        const outIdx = opts.args.indexOf('--output');
        if (outIdx !== -1 && opts.args[outIdx + 1]) {
          fs.writeFileSync(opts.args[outIdx + 1]!, JSON.stringify(rawTrivyReport));
        }
        return {
          exitCode: 1,
          signal: null,
          stdout: '',
          stderr: '',
          durationMs: 150,
          timedOut: false,
          bufferOverflowed: false,
        };
      });

      const res = await adapter.scan({
        workspacePath: '/workspace',
        timeoutSeconds: 10,
        offline: true,
      });

      expect(res.status).toBe('completed');
      expect(res.findingCount).toBe(1);
      const finding = res.findings[0]!;
      expect(finding.category).toBe('dependencies');
      expect(finding.rule_id).toBe('CVE-2023-12345');
      expect(finding.severity).toBe('high');
      expect(finding.remediation.fix_available).toBe(true);
      expect(() => NormalizedFindingSchema.parse(finding)).not.toThrow();
    });

    it('handles process error or timeout cleanly', async () => {
      const adapter = new TrivyDependenciesAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: true,
        version: '0.50.0',
      });

      vi.spyOn(ProcessRunner, 'run').mockResolvedValue({
        exitCode: 2,
        signal: null,
        stdout: '',
        stderr: 'Fatal error loading DB',
        durationMs: 50,
        timedOut: false,
        bufferOverflowed: false,
      });

      const res = await adapter.scan({
        workspacePath: '/workspace',
        timeoutSeconds: 10,
      });

      expect(res.status).toBe('failed');
      expect(res.errorMessage).toContain('Fatal error loading DB');
    });
  });

  describe('Trivy Containers Adapter Tests', () => {
    it('parses Dockerfile misconfiguration findings and assigns fix strategy', async () => {
      const adapter = new TrivyContainersAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: true,
        version: '0.50.0',
      });

      const rawContainerReport = {
        Results: [
          {
            Target: 'Dockerfile',
            Class: 'config',
            Type: 'dockerfile',
            Misconfigurations: [
              {
                ID: 'DS002',
                Title: 'Image user should not be "root"',
                Description: 'Running containers as "root" creates security risks.',
                Message: 'Specify at least 1 USER command',
                Severity: 'HIGH',
                PrimaryURL: 'https://avd.aquasec.com/misconfig/ds002',
                CauseMetadata: {
                  StartLine: 1,
                  EndLine: 1,
                  Code: {
                    Lines: [{ Number: 1, Content: 'FROM node:20', IsCause: true }],
                  },
                },
              },
            ],
          },
        ],
      };

      vi.spyOn(ProcessRunner, 'run').mockImplementation(async (opts) => {
        const outIdx = opts.args.indexOf('--output');
        if (outIdx !== -1 && opts.args[outIdx + 1]) {
          fs.writeFileSync(opts.args[outIdx + 1]!, JSON.stringify(rawContainerReport));
        }
        return {
          exitCode: 1,
          signal: null,
          stdout: '',
          stderr: '',
          durationMs: 120,
          timedOut: false,
          bufferOverflowed: false,
        };
      });

      const res = await adapter.scan({
        workspacePath: '/workspace',
        timeoutSeconds: 10,
      });

      expect(res.status).toBe('completed');
      expect(res.findingCount).toBe(1);
      const finding = res.findings[0]!;
      expect(finding.category).toBe('containers');
      expect(finding.rule_id).toBe('DS002');
      expect(finding.remediation.fix_available).toBe(true);
      expect(finding.remediation.fix_strategy).toBe('dockerfile-non-root');
      expect(() => NormalizedFindingSchema.parse(finding)).not.toThrow();
    });
  });

  describe('Checkov Adapter Tests', () => {
    it('parses Checkov Terraform findings and assigns s3 fix strategy', async () => {
      const adapter = new CheckovAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: true,
        version: '3.2.0',
      });

      const rawCheckovReport = {
        results: {
          failed_checks: [
            {
              check_id: 'CKV_AWS_20',
              check_name: 'Ensure S3 bucket has an ACL policy allowing only PUT and GET',
              file_path: '/main.tf',
              file_line_range: [1, 10],
              resource: 'aws_s3_bucket.public_bucket',
              guideline: 'https://docs.bridgecrew.io/docs/s3_1-acl-read-permissions-ceo',
              severity: 'HIGH',
              description: 'Bucket has public ACL',
            },
          ],
        },
      };

      vi.spyOn(ProcessRunner, 'run').mockImplementation(async (opts) => {
        const outIdx = opts.args.indexOf('--output-file-path');
        if (outIdx !== -1 && opts.args[outIdx + 1]) {
          const reportDir = opts.args[outIdx + 1]!;
          fs.writeFileSync(
            path.join(reportDir, 'results_json.json'),
            JSON.stringify(rawCheckovReport)
          );
        }
        return {
          exitCode: 1,
          signal: null,
          stdout: '',
          stderr: '',
          durationMs: 200,
          timedOut: false,
          bufferOverflowed: false,
        };
      });

      const res = await adapter.scan({
        workspacePath: '/workspace',
        timeoutSeconds: 10,
      });

      expect(res.status).toBe('completed');
      expect(res.findingCount).toBe(1);
      const finding = res.findings[0]!;
      expect(finding.category).toBe('iac');
      expect(finding.rule_id).toBe('CKV_AWS_20');
      expect(finding.severity).toBe('high');
      expect(finding.remediation.fix_strategy).toBe('terraform-s3-public-access');
      expect(() => NormalizedFindingSchema.parse(finding)).not.toThrow();
    });

    it('maps all Checkov severity options and heuristic fallback rules', async () => {
      const adapter = new CheckovAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({ available: true, version: '3.2.0' });

      const cases = [
        { check_id: 'CKV_1', raw: 'CRITICAL', expected: 'critical' },
        { check_id: 'CKV_2', raw: 'MEDIUM', expected: 'medium' },
        { check_id: 'CKV_3', raw: 'LOW', expected: 'low' },
        { check_id: 'CKV_4', raw: 'INFO', expected: 'info' },
        { check_id: 'CKV_AWS_ENCRYPT_1', raw: undefined, expected: 'high' },
        { check_id: 'CKV_AWS_AUTH_1', raw: undefined, expected: 'high' },
        { check_id: 'CKV_AWS_53', raw: undefined, expected: 'high' },
        { check_id: 'CKV_CUSTOM_RULE', raw: undefined, expected: 'medium' },
      ];

      for (const c of cases) {
        vi.spyOn(ProcessRunner, 'run').mockImplementationOnce(async (opts) => {
          const outIdx = opts.args.indexOf('--output-file-path');
          if (outIdx !== -1 && opts.args[outIdx + 1]) {
            fs.writeFileSync(
              path.join(opts.args[outIdx + 1]!, 'results_json.json'),
              JSON.stringify({
                results: {
                  failed_checks: [
                    {
                      check_id: c.check_id,
                      check_name: 'Check',
                      file_path: '/main.tf',
                      resource: 'res',
                      severity: c.raw,
                    },
                  ],
                },
              })
            );
          }
          return { exitCode: 1, signal: null, stdout: '', stderr: '', durationMs: 10, timedOut: false, bufferOverflowed: false };
        });

        const res = await adapter.scan({ workspacePath: '/workspace', timeoutSeconds: 5 });
        expect(res.status).toBe('completed');
        expect(res.findings[0]?.severity).toBe(c.expected);
      }
    });

    it('handles Checkov missing report, corrupt JSON, and exitCode failure', async () => {
      const adapter = new CheckovAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: true,
        version: '3.2.0',
      });

      // 1. Exit code > 1
      vi.spyOn(ProcessRunner, 'run').mockResolvedValueOnce({
        exitCode: 2,
        signal: null,
        stdout: '',
        stderr: 'Syntax error in Terraform code',
        durationMs: 50,
        timedOut: false,
        bufferOverflowed: false,
      });

      const resErr = await adapter.scan({
        workspacePath: '/workspace',
        timeoutSeconds: 10,
      });
      expect(resErr.status).toBe('failed');
      expect(resErr.errorMessage).toContain('Syntax error');

      // 2. Report file not found when exitCode === 1
      vi.spyOn(ProcessRunner, 'run').mockResolvedValueOnce({
        exitCode: 1,
        signal: null,
        stdout: '',
        stderr: '',
        durationMs: 50,
        timedOut: false,
        bufferOverflowed: false,
      });

      const resMissing = await adapter.scan({
        workspacePath: '/workspace',
        timeoutSeconds: 10,
      });
      expect(resMissing.status).toBe('failed');
      expect(resMissing.errorMessage).toContain('Expected Checkov output file or JSON was not found');

      // 3. Corrupt JSON
      vi.spyOn(ProcessRunner, 'run').mockImplementationOnce(async (opts) => {
        const outIdx = opts.args.indexOf('--output-file-path');
        if (outIdx !== -1 && opts.args[outIdx + 1]) {
          fs.writeFileSync(path.join(opts.args[outIdx + 1]!, 'results_json.json'), '{ corrupt json');
        }
        return {
          exitCode: 0,
          signal: null,
          stdout: '',
          stderr: '',
          durationMs: 50,
          timedOut: false,
          bufferOverflowed: false,
        };
      });

      const resCorrupt = await adapter.scan({
        workspacePath: '/workspace',
        timeoutSeconds: 10,
      });
      expect(resCorrupt.status).toBe('failed');
      expect(resCorrupt.errorMessage).toContain('Malformed JSON');
    });
  });

  describe('Trivy Containers Adapter Edge Cases', () => {
    it('handles missing report and corrupt JSON', async () => {
      const adapter = new TrivyContainersAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({
        available: true,
        version: '0.50.0',
      });

      // Missing report
      vi.spyOn(ProcessRunner, 'run').mockResolvedValueOnce({
        exitCode: 0,
        signal: null,
        stdout: '',
        stderr: '',
        durationMs: 50,
        timedOut: false,
        bufferOverflowed: false,
      });

      const resMissing = await adapter.scan({
        workspacePath: '/workspace',
        timeoutSeconds: 10,
      });
      expect(resMissing.status).toBe('failed');
      expect(resMissing.errorMessage).toContain('Expected Trivy report file was not produced');

      // Corrupt JSON
      vi.spyOn(ProcessRunner, 'run').mockImplementationOnce(async (opts) => {
        const outIdx = opts.args.indexOf('--output');
        if (outIdx !== -1 && opts.args[outIdx + 1]) {
          fs.writeFileSync(opts.args[outIdx + 1]!, '{ corrupt json');
        }
        return {
          exitCode: 0,
          signal: null,
          stdout: '',
          stderr: '',
          durationMs: 50,
          timedOut: false,
          bufferOverflowed: false,
        };
      });

      const resCorrupt = await adapter.scan({
        workspacePath: '/workspace',
        timeoutSeconds: 10,
      });
      expect(resCorrupt.status).toBe('failed');
      expect(resCorrupt.errorMessage).toContain('Malformed JSON');
    });

    it('maps container misconfiguration severity levels correctly', async () => {
      const adapter = new TrivyContainersAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({ available: true, version: '0.50.0' });

      const severities = ['CRITICAL', 'MEDIUM', 'LOW', 'UNKNOWN'];
      for (const sev of severities) {
        vi.spyOn(ProcessRunner, 'run').mockImplementationOnce(async (opts) => {
          const outIdx = opts.args.indexOf('--output');
          if (outIdx !== -1 && opts.args[outIdx + 1]) {
            fs.writeFileSync(
              opts.args[outIdx + 1]!,
              JSON.stringify({
                Results: [
                  {
                    Target: 'Dockerfile',
                    Misconfigurations: [
                      { ID: 'DS001', Title: 'Title', Description: 'Desc', Message: 'Msg', Severity: sev },
                    ],
                  },
                ],
              })
            );
          }
          return { exitCode: 1, signal: null, stdout: '', stderr: '', durationMs: 10, timedOut: false, bufferOverflowed: false };
        });

        const res = await adapter.scan({ workspacePath: '/workspace', timeoutSeconds: 5 });
        expect(res.status).toBe('completed');
        expect(res.findings.length).toBe(1);
      }
    });
  });

  describe('Trivy Dependencies Severity Variations', () => {
    it('maps all dependency vulnerability severity levels correctly', async () => {
      const adapter = new TrivyDependenciesAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({ available: true, version: '0.50.0' });

      const severities = ['CRITICAL', 'MEDIUM', 'LOW', 'UNKNOWN'];
      for (const sev of severities) {
        vi.spyOn(ProcessRunner, 'run').mockImplementationOnce(async (opts) => {
          const outIdx = opts.args.indexOf('--output');
          if (outIdx !== -1 && opts.args[outIdx + 1]) {
            fs.writeFileSync(
              opts.args[outIdx + 1]!,
              JSON.stringify({
                Results: [
                  {
                    Target: 'package-lock.json',
                    Vulnerabilities: [
                      { VulnerabilityID: 'CVE-TEST', PkgName: 'pkg', InstalledVersion: '1.0', Severity: sev },
                    ],
                  },
                ],
              })
            );
          }
          return { exitCode: 1, signal: null, stdout: '', stderr: '', durationMs: 10, timedOut: false, bufferOverflowed: false };
        });

        const res = await adapter.scan({ workspacePath: '/workspace', timeoutSeconds: 5 });
        expect(res.status).toBe('completed');
        expect(res.findings.length).toBe(1);
      }
    });
  });

  describe('Gitleaks Clean Scan', () => {
    it('returns completed with 0 findings when exitCode === 0', async () => {
      const adapter = new GitleaksAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({ available: true, version: '8.18.2' });

      vi.spyOn(ProcessRunner, 'run').mockResolvedValueOnce({
        exitCode: 0,
        signal: null,
        stdout: '',
        stderr: '',
        durationMs: 20,
        timedOut: false,
        bufferOverflowed: false,
      });

      const res = await adapter.scan({ workspacePath: '/workspace', timeoutSeconds: 5 });
      expect(res.status).toBe('completed');
      expect(res.findingCount).toBe(0);
    });

    it('returns failed when Gitleaks exits with fatal code 2 or missing report file', async () => {
      const adapter = new GitleaksAdapter();
      vi.spyOn(adapter, 'checkAvailability').mockResolvedValue({ available: true, version: '8.18.2' });

      // Fatal exitCode 2
      vi.spyOn(ProcessRunner, 'run').mockResolvedValueOnce({
        exitCode: 2,
        signal: null,
        stdout: '',
        stderr: 'fatal gitleaks error',
        durationMs: 20,
        timedOut: false,
        bufferOverflowed: false,
      });

      const resFail = await adapter.scan({ workspacePath: '/workspace', timeoutSeconds: 5 });
      expect(resFail.status).toBe('failed');
      expect(resFail.errorMessage).toContain('fatal gitleaks error');

      // ExitCode 1 but no report file
      vi.spyOn(ProcessRunner, 'run').mockResolvedValueOnce({
        exitCode: 1,
        signal: null,
        stdout: '',
        stderr: '',
        durationMs: 20,
        timedOut: false,
        bufferOverflowed: false,
      });

      const resNoFile = await adapter.scan({ workspacePath: '/workspace', timeoutSeconds: 5 });
      expect(resNoFile.status).toBe('failed');
      expect(resNoFile.errorMessage).toContain('Expected Gitleaks report file was not produced');
    });

    it('returns failed when Trivy or Checkov exits with fatal code 2', async () => {
      const trivyCont = new TrivyContainersAdapter();
      vi.spyOn(trivyCont, 'checkAvailability').mockResolvedValue({ available: true, version: '0.50.0' });
      vi.spyOn(ProcessRunner, 'run').mockResolvedValueOnce({
        exitCode: 2,
        signal: null,
        stdout: '',
        stderr: 'trivy container crash',
        durationMs: 20,
        timedOut: false,
        bufferOverflowed: false,
      });
      const resTrivy = await trivyCont.scan({ workspacePath: '/workspace', timeoutSeconds: 5 });
      expect(resTrivy.status).toBe('failed');

      const checkov = new CheckovAdapter();
      vi.spyOn(checkov, 'checkAvailability').mockResolvedValue({ available: true, version: '3.2.0' });
      vi.spyOn(ProcessRunner, 'run').mockResolvedValueOnce({
        exitCode: 2,
        signal: null,
        stdout: '',
        stderr: 'checkov crash',
        durationMs: 20,
        timedOut: false,
        bufferOverflowed: false,
      });
      const resCheckov = await checkov.scan({ workspacePath: '/workspace', timeoutSeconds: 5 });
      expect(resCheckov.status).toBe('failed');
    });

    it('returns failed when Trivy or Checkov outputs malformed JSON or misses output file', async () => {
      // 1. Trivy Dependencies missing output file
      const trivyDep = new TrivyDependenciesAdapter();
      vi.spyOn(trivyDep, 'checkAvailability').mockResolvedValue({ available: true, version: '0.50.0' });
      vi.spyOn(ProcessRunner, 'run').mockResolvedValueOnce({
        exitCode: 0,
        signal: null,
        stdout: '',
        stderr: '',
        durationMs: 10,
        timedOut: false,
        bufferOverflowed: false,
      });
      const resDepNoFile = await trivyDep.scan({ workspacePath: '/workspace', timeoutSeconds: 5 });
      expect(resDepNoFile.status).toBe('failed');
      expect(resDepNoFile.errorMessage).toContain('Expected Trivy report file was not produced');

      // 2. Trivy Dependencies malformed JSON
      vi.spyOn(ProcessRunner, 'run').mockImplementationOnce(async (opts) => {
        const outIdx = opts.args.indexOf('--output');
        if (outIdx !== -1 && opts.args[outIdx + 1]) {
          fs.writeFileSync(opts.args[outIdx + 1]!, '{ malformed json');
        }
        return { exitCode: 0, signal: null, stdout: '', stderr: '', durationMs: 10, timedOut: false, bufferOverflowed: false };
      });
      const resDepBadJson = await trivyDep.scan({ workspacePath: '/workspace', timeoutSeconds: 5 });
      expect(resDepBadJson.status).toBe('failed');
      expect(resDepBadJson.errorMessage).toContain('Malformed JSON from Trivy');

      // 3. Checkov malformed JSON
      const checkov = new CheckovAdapter();
      vi.spyOn(checkov, 'checkAvailability').mockResolvedValue({ available: true, version: '3.2.0' });
      vi.spyOn(ProcessRunner, 'run').mockImplementationOnce(async (opts) => {
        const outIdx = opts.args.indexOf('--output-file-path');
        if (outIdx !== -1 && opts.args[outIdx + 1]) {
          fs.writeFileSync(path.join(opts.args[outIdx + 1]!, 'results_json.json'), '{ malformed json');
        }
        return { exitCode: 0, signal: null, stdout: '', stderr: '', durationMs: 10, timedOut: false, bufferOverflowed: false };
      });
      const resCheckovBadJson = await checkov.scan({ workspacePath: '/workspace', timeoutSeconds: 5 });
      expect(resCheckovBadJson.status).toBe('failed');
      expect(resCheckovBadJson.errorMessage).toContain('Malformed JSON from Checkov');
    });
  });
});
