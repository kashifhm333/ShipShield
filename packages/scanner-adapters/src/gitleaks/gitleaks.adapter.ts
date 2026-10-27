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
import { NormalizedFinding } from '@shipshield/contracts';

interface GitleaksFindingRaw {
  Description: string;
  StartLine: number;
  EndLine: number;
  StartColumn: number;
  EndColumn: number;
  Match: string;
  Secret: string;
  File: string;
  SymlinkFile: string;
  Commit: string;
  Entropy: number;
  Author: string;
  Email: string;
  Date: string;
  Message: string;
  Tags: string[];
  RuleID: string;
  Fingerprint: string;
}

export class GitleaksAdapter implements ScannerAdapter {
  public readonly id = 'secrets' as const;
  public readonly name = 'Gitleaks Secrets Scanner';
  public readonly binaryName = 'gitleaks';

  public async isApplicable(_workspacePath: string): Promise<boolean> {
    return true; // Secrets scan is applicable to any codebase
  }

  public async checkAvailability(): Promise<{ available: boolean; version?: string; error?: string }> {
    const res = await ProcessRunner.run({
      executable: this.binaryName,
      args: ['version'],
      cwd: process.cwd(),
      timeoutMs: 5000,
    });

    if (res.exitCode === 0) {
      return { available: true, version: res.stdout.trim() };
    }
    return { available: false, error: res.stderr || 'Binary not found or execution failed' };
  }

  private mapSecretSeverityAndConfidence(ruleId: string, entropy: number, tags: string[] = []): {
    severity: 'critical' | 'high' | 'medium' | 'low';
    confidence: 'high' | 'medium' | 'low';
  } {
    const r = ruleId.toLowerCase();
    const tagList = (tags || []).map((t) => t.toLowerCase());

    // Critical: Direct cloud/infrastructure provider credentials, private keys, live payment tokens
    if (
      r.includes('aws') ||
      r.includes('gcp') ||
      r.includes('google') ||
      r.includes('azure') ||
      r.includes('private-key') ||
      r.includes('privatekey') ||
      r.includes('stripe') ||
      r.includes('github') ||
      r.includes('slack')
    ) {
      return { severity: 'critical', confidence: 'high' };
    }

    // High: SaaS API tokens, OAuth secrets, database passwords, high entropy credentials
    if (
      r.includes('token') ||
      r.includes('api-key') ||
      r.includes('apikey') ||
      r.includes('secret') ||
      r.includes('password') ||
      entropy >= 4.0 ||
      tagList.includes('key')
    ) {
      return { severity: 'high', confidence: entropy >= 3.5 ? 'high' : 'medium' };
    }

    // Medium: Generic tokens or lower entropy matches
    if (entropy >= 3.0 || r.includes('generic')) {
      return { severity: 'medium', confidence: 'medium' };
    }

    return { severity: 'low', confidence: 'low' };
  }

  public async scan(options: ScannerAdapterOptions): Promise<ScannerRunResult> {
    const startTime = Date.now();
    const availability = await this.checkAvailability();
    if (!availability.available) {
      return {
        id: this.id,
        status: 'unavailable',
        engine: this.binaryName,
        durationMs: Date.now() - startTime,
        findingCount: 0,
        findings: [],
        errorMessage: availability.error || 'Binary not found',
        completeness: 'indeterminate',
        offline: true,
        remediationGuidance: 'Install Gitleaks via "sudo apt install gitleaks" or download from https://github.com/gitleaks/gitleaks/releases',
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-gitleaks-'));
    const tmpReportFile = path.join(tmpDir, 'gitleaks-report.json');

    try {
      const args = [
        'detect',
        '--source',
        options.workspacePath,
        ...(options.scanGitHistory ? [] : ['--no-git']),
        '--report-format',
        'json',
        '--report-path',
        tmpReportFile,
        '--redact',
        '100',
        '--no-banner',
        '--exit-code',
        '1',
      ];

      const res = await ProcessRunner.run({
        executable: this.binaryName,
        args,
        cwd: options.workspacePath,
        timeoutMs: options.timeoutSeconds * 1000,
        offline: true, // Gitleaks is strictly offline
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
          errorMessage: 'Gitleaks scan timed out',
          completeness: 'indeterminate',
          offline: true,
        };
      }

      // Exit code 0: clean, 1: findings present, > 1: crash/error
      if (res.exitCode !== 0 && res.exitCode !== 1) {
        return {
          id: this.id,
          status: 'failed',
          engine: this.binaryName,
          engineVersion: availability.version,
          durationMs: Date.now() - startTime,
          findingCount: 0,
          findings: [],
          errorMessage: res.stderr || `Gitleaks exited with code ${res.exitCode}`,
          completeness: 'indeterminate',
          offline: true,
        };
      }

      if (res.exitCode === 0 && !fs.existsSync(tmpReportFile)) {
        return {
          id: this.id,
          status: 'completed',
          engine: this.binaryName,
          engineVersion: availability.version,
          durationMs: Date.now() - startTime,
          findingCount: 0,
          findings: [],
          errorMessage: null,
          completeness: 'complete',
          offline: true,
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
          errorMessage: 'Expected Gitleaks report file was not produced',
          completeness: 'indeterminate',
          offline: true,
        };
      }

      const rawContent = fs.readFileSync(tmpReportFile, 'utf8');
      let rawFindings: GitleaksFindingRaw[];
      try {
        rawFindings = JSON.parse(rawContent);
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
          errorMessage: `Malformed JSON from Gitleaks: ${error.message}`,
          completeness: 'indeterminate',
          offline: true,
        };
      }

      const findings: NormalizedFinding[] = [];

      for (const item of rawFindings) {
        const rawSecret = item.Secret;
        const relativePath = path.relative(options.workspacePath, path.resolve(options.workspacePath, item.File));

        // Invariant: Pre-storage central redaction. Redact raw secret immediately before fingerprinting, logging, or storage.
        const redactedMatch = RedactionEngine.redact(item.Match, rawSecret);
        const redactedSummary = RedactionEngine.redact(item.Description, rawSecret);

        const fingerprint = FingerprintGenerator.generateFingerprint({
          category: 'secrets',
          ruleId: item.RuleID,
          relativePath,
          structuralContext: redactedMatch,
        });

        const id = FingerprintGenerator.generatePublicId('secrets', fingerprint);

        const { severity, confidence } = this.mapSecretSeverityAndConfidence(
          item.RuleID,
          item.Entropy,
          item.Tags
        );

        findings.push({
          id,
          fingerprint,
          type: 'hardcoded-secret',
          category: 'secrets',
          scanner: 'gitleaks',
          rule_id: item.RuleID,
          title: `Exposed Secret: ${item.RuleID}`,
          description: redactedSummary || `Potential secret matching rule ${item.RuleID} detected`,
          severity,
          severity_original: 'HIGH',
          confidence,
          location: {
            path: relativePath.split(path.sep).join('/'),
            start_line: item.StartLine,
            end_line: item.EndLine,
          },
          evidence: {
            redacted: true,
            summary: redactedMatch,
            line_snippet: redactedMatch,
          },
          remediation: {
            summary: 'Revoke and rotate the exposed credential immediately. Purge from Git history.',
            fix_available: false,
            fix_strategy: null,
          },
          status: 'new',
          references: [],
        });
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
        completeness: 'complete',
        offline: true,
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
