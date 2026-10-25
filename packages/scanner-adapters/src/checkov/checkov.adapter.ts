import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ScannerAdapter,
  ScannerAdapterOptions,
  ScannerRunResult,
  ProcessRunner,
  RedactionEngine,
  FingerprintGenerator,
} from '@shipshield/scan-core';
import { NormalizedFinding, Severity } from '@shipshield/contracts';

interface CheckovFailedCheckRaw {
  check_id: string;
  check_name: string;
  check_result?: {
    result: string;
  };
  file_path: string;
  file_line_range?: [number, number];
  resource: string;
  guideline?: string;
  severity?: string;
  description?: string;
}

interface CheckovReportRaw {
  results?: {
    failed_checks?: CheckovFailedCheckRaw[];
  };
}

export class CheckovAdapter implements ScannerAdapter {
  public readonly id = 'iac' as const;
  public readonly name = 'Checkov Terraform / IaC Scanner';
  public readonly binaryName = 'checkov';

  public async isApplicable(_workspacePath: string): Promise<boolean> {
    return true;
  }

  public async checkAvailability(): Promise<{ available: boolean; version?: string; error?: string }> {
    const res = await ProcessRunner.run({
      executable: this.binaryName,
      args: ['--version'],
      cwd: process.cwd(),
      timeoutMs: 5000,
    });

    if (res.exitCode === 0) {
      return { available: true, version: res.stdout.trim() };
    }
    return { available: false, error: res.stderr || 'Checkov binary not found' };
  }

  private mapSeverity(ruleId: string, raw?: string): Severity {
    if (raw) {
      const upper = raw.toUpperCase();
      if (upper === 'CRITICAL') return 'critical';
      if (upper === 'HIGH') return 'high';
      if (upper === 'MEDIUM') return 'medium';
      if (upper === 'LOW') return 'low';
      if (upper === 'INFO') return 'info';
    }

    // Default heuristics based on check_id and security impact
    if (
      ruleId.includes('PUBLIC') ||
      ruleId.includes('ENCRYPT') ||
      ruleId.includes('AUTH') ||
      ruleId === 'CKV_AWS_20' ||
      ruleId === 'CKV_AWS_53'
    ) {
      return 'high';
    }
    return 'medium';
  }

  public async scan(options: ScannerAdapterOptions): Promise<ScannerRunResult> {
    const startTime = Date.now();
    const availability = await this.checkAvailability();
    if (!availability.available) {
      return {
        id: this.id,
        status: 'skipped',
        engine: this.binaryName,
        durationMs: Date.now() - startTime,
        findingCount: 0,
        findings: [],
        errorMessage: availability.error || 'Binary not found',
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-checkov-'));

    try {
      const args = [
        '--directory',
        options.workspacePath,
        '--framework',
        'terraform',
        '--output',
        'json',
        '--output-file-path',
        tmpDir,
        '--quiet',
        '--compact',
      ];

      const res = await ProcessRunner.run({
        executable: this.binaryName,
        args,
        cwd: options.workspacePath,
        timeoutMs: options.timeoutSeconds * 1000,
      });

      if (res.timedOut) {
        return {
          id: this.id,
          status: 'timed_out',
          engine: this.binaryName,
          engineVersion: availability.version,
          durationMs: Date.now() - startTime,
          findingCount: 0,
          findings: [],
          errorMessage: 'Checkov scan timed out',
        };
      }

      // Checkov returns exit code 0 if 0 failed checks, 1 if failed checks exist, > 1 on fatal error
      if (res.exitCode !== 0 && res.exitCode !== 1) {
        return {
          id: this.id,
          status: 'failed',
          engine: this.binaryName,
          engineVersion: availability.version,
          durationMs: Date.now() - startTime,
          findingCount: 0,
          findings: [],
          errorMessage: res.stderr || `Checkov exited with code ${res.exitCode}`,
        };
      }

      // Locate results_json.json produced by Checkov in tmpDir or parse stdout
      let rawJson: string | null = null;
      const expectedReportFile = path.join(tmpDir, 'results_json.json');
      if (fs.existsSync(expectedReportFile)) {
        rawJson = fs.readFileSync(expectedReportFile, 'utf8');
      } else if (res.stdout && res.stdout.trim().startsWith('{')) {
        rawJson = res.stdout.trim();
      }

      if (!rawJson) {
        if (res.exitCode === 0) {
          return {
            id: this.id,
            status: 'completed',
            engine: this.binaryName,
            engineVersion: availability.version,
            durationMs: Date.now() - startTime,
            findingCount: 0,
            findings: [],
            errorMessage: null,
          };
        }
        return {
          id: this.id,
          status: 'failed',
          engine: this.binaryName,
          engineVersion: availability.version,
          durationMs: Date.now() - startTime,
          findingCount: 0,
          findings: [],
          errorMessage: 'Expected Checkov output file or JSON was not found',
        };
      }

      let parsed: CheckovReportRaw | CheckovReportRaw[];
      try {
        parsed = JSON.parse(rawJson);
      } catch (err: unknown) {
        const error = err as Error;
        return {
          id: this.id,
          status: 'failed',
          engine: this.binaryName,
          engineVersion: availability.version,
          durationMs: Date.now() - startTime,
          findingCount: 0,
          findings: [],
          errorMessage: `Malformed JSON from Checkov: ${error.message}`,
        };
      }

      const reports = Array.isArray(parsed) ? parsed : [parsed];
      const findings: NormalizedFinding[] = [];

      for (const report of reports) {
        for (const check of report.results?.failed_checks || []) {
          const relPath = path.relative(
            options.workspacePath,
            path.resolve(options.workspacePath, check.file_path.replace(/^\//, ''))
          );

          const isS3PublicAccess =
            check.check_id === 'CKV_AWS_20' ||
            check.check_id === 'CKV_AWS_53' ||
            check.check_id.includes('CKV_AWS_PUBLIC');

          const fingerprint = FingerprintGenerator.generateFingerprint({
            category: 'iac',
            ruleId: check.check_id,
            relativePath: relPath,
            resourceAddress: check.resource,
          });

          const id = FingerprintGenerator.generatePublicId('iac', fingerprint);
          const severity = this.mapSeverity(check.check_id, check.severity);
          const startLine = check.file_line_range ? check.file_line_range[0] : undefined;
          const endLine = check.file_line_range ? check.file_line_range[1] : undefined;

          findings.push({
            id,
            fingerprint,
            type: 'iac-misconfiguration',
            category: 'iac',
            scanner: 'checkov',
            rule_id: check.check_id,
            title: check.check_name || `IaC Check Failed: ${check.check_id}`,
            description: RedactionEngine.redact(check.description || check.check_name),
            severity,
            severity_original: check.severity || 'HIGH',
            confidence: 'high',
            location: {
              path: relPath.split(path.sep).join('/'),
              resource_address: check.resource,
              start_line: startLine,
              end_line: endLine,
            },
            evidence: {
              redacted: true,
              summary: `Failed check ${check.check_id} on resource ${check.resource}`,
            },
            remediation: {
              summary: check.guideline || 'Remediate Terraform configuration to adhere to security baseline.',
              fix_available: isS3PublicAccess,
              fix_strategy: isS3PublicAccess ? 'terraform-s3-public-access' : null,
            },
            status: 'new',
            references: check.guideline ? [check.guideline] : [],
          });
        }
      }

      return {
        id: this.id,
        status: 'completed',
        engine: this.binaryName,
        engineVersion: availability.version,
        durationMs: Date.now() - startTime,
        findingCount: findings.length,
        findings,
        errorMessage: null,
      };
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore temp cleanup errors
      }
    }
  }
}
