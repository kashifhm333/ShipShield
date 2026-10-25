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

interface TrivyMisconfigRaw {
  ID: string;
  Title: string;
  Description: string;
  Message: string;
  Severity: string;
  PrimaryURL?: string;
  References?: string[];
  Resolution?: string;
  CauseMetadata?: {
    Resource?: string;
    Provider?: string;
    Service?: string;
    StartLine?: number;
    EndLine?: number;
    Code?: {
      Lines?: Array<{ Number: number; Content: string; IsCause: boolean }>;
    };
  };
}

interface TrivyContainerResultRaw {
  Target: string;
  Class: string;
  Type: string;
  Misconfigurations?: TrivyMisconfigRaw[];
}

interface TrivyContainerReportRaw {
  Results?: TrivyContainerResultRaw[];
}

export class TrivyContainersAdapter implements ScannerAdapter {
  public readonly id = 'containers' as const;
  public readonly name = 'Trivy Container and Dockerfile Scanner';
  public readonly binaryName = 'trivy';

  public async isApplicable(_workspacePath: string): Promise<boolean> {
    return true;
  }

  public async checkAvailability(): Promise<{ available: boolean; version?: string | undefined; error?: string | undefined }> {
    const res = await ProcessRunner.run({
      executable: this.binaryName,
      args: ['--version'],
      cwd: process.cwd(),
      timeoutMs: 5000,
    });

    if (res.exitCode === 0) {
      const ver = res.stdout.trim().split('\n')[0];
      return { available: true, version: ver || 'unknown' };
    }
    return { available: false, error: res.stderr || 'Trivy binary not found' };
  }

  private mapSeverity(raw: string): Severity {
    switch (raw.toUpperCase()) {
      case 'CRITICAL':
        return 'critical';
      case 'HIGH':
        return 'high';
      case 'MEDIUM':
        return 'medium';
      case 'LOW':
        return 'low';
      default:
        return 'info';
    }
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

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-trivy-con-'));
    const tmpReportFile = path.join(tmpDir, 'trivy-containers-report.json');

    try {
      const args = [
        'config',
        '--format',
        'json',
        '--output',
        tmpReportFile,
        '--quiet',
        '--exit-code',
        '1',
        options.workspacePath,
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
          errorMessage: 'Trivy container scan timed out',
        };
      }

      if (res.exitCode !== 0 && res.exitCode !== 1) {
        return {
          id: this.id,
          status: 'failed',
          engine: this.binaryName,
          engineVersion: availability.version,
          durationMs: Date.now() - startTime,
          findingCount: 0,
          findings: [],
          errorMessage: res.stderr || `Trivy exited with code ${res.exitCode}`,
        };
      }

      if (!fs.existsSync(tmpReportFile)) {
        return {
          id: this.id,
          status: 'failed',
          engine: this.binaryName,
          engineVersion: availability.version,
          durationMs: Date.now() - startTime,
          findingCount: 0,
          findings: [],
          errorMessage: 'Expected Trivy report file was not produced',
        };
      }

      const rawContent = fs.readFileSync(tmpReportFile, 'utf8');
      let parsed: TrivyContainerReportRaw;
      try {
        parsed = JSON.parse(rawContent);
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
          errorMessage: `Malformed JSON from Trivy: ${error.message}`,
        };
      }

      const findings: NormalizedFinding[] = [];

      for (const resTarget of parsed.Results || []) {
        const relPath = path.relative(options.workspacePath, path.resolve(options.workspacePath, resTarget.Target));

        for (const misconf of resTarget.Misconfigurations || []) {
          const isNonRootFixable = misconf.ID === 'DS002' || misconf.ID === 'AVD-DS-0002';
          const instruction = misconf.Title || misconf.ID;

          const fingerprint = FingerprintGenerator.generateFingerprint({
            category: 'containers',
            ruleId: misconf.ID,
            relativePath: relPath,
            normalizedInstruction: instruction,
          });

          const id = FingerprintGenerator.generatePublicId('containers', fingerprint);
          const severity = this.mapSeverity(misconf.Severity);
          const startLine = misconf.CauseMetadata?.StartLine;
          const endLine = misconf.CauseMetadata?.EndLine;

          findings.push({
            id,
            fingerprint,
            type: 'container-misconfiguration',
            category: 'containers',
            scanner: 'trivy',
            rule_id: misconf.ID,
            title: misconf.Title || `Container misconfiguration: ${misconf.ID}`,
            description: RedactionEngine.redact(misconf.Description || misconf.Message),
            severity,
            severity_original: misconf.Severity,
            confidence: 'high',
            location: {
              path: relPath.split(path.sep).join('/'),
              start_line: startLine,
              end_line: endLine,
            },
            evidence: {
              redacted: true,
              summary: RedactionEngine.redact(misconf.Message || misconf.Title),
            },
            remediation: {
              summary: misconf.Resolution || 'Specify a non-root USER in the Dockerfile.',
              fix_available: isNonRootFixable,
              fix_strategy: isNonRootFixable ? 'dockerfile-non-root' : null,
            },
            status: 'new',
            references: misconf.References || (misconf.PrimaryURL ? [misconf.PrimaryURL] : []),
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
