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
  IntelligenceManager,
} from '@shipshield/scan-core';
import { NormalizedFinding, Severity } from '@shipshield/contracts';

interface TrivyVulnRaw {
  VulnerabilityID: string;
  PkgName: string;
  InstalledVersion: string;
  FixedVersion?: string;
  Severity: string;
  Title?: string;
  Description?: string;
  PrimaryURL?: string;
  References?: string[];
}

interface TrivyResultRaw {
  Target: string;
  Class: string;
  Type: string;
  Vulnerabilities?: TrivyVulnRaw[];
}

interface TrivyReportRaw {
  Results?: TrivyResultRaw[];
}

export class TrivyDependenciesAdapter implements ScannerAdapter {
  public readonly id = 'dependencies' as const;
  public readonly name = 'Trivy Dependency Vulnerability Scanner';
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
        status: 'unavailable',
        engine: this.binaryName,
        durationMs: Date.now() - startTime,
        findingCount: 0,
        findings: [],
        errorMessage: availability.error || 'Binary not found',
        completeness: 'indeterminate',
        offline: Boolean(options.offline),
        remediationGuidance: 'Install Trivy from https://aquasecurity.github.io/trivy/latest/getting-started/installation/',
      };
    }

    const cacheDir = IntelligenceManager.getDefaultCacheDir('dependencies', options.customCacheDir);
    const meta = IntelligenceManager.parseTrivyMetadata(cacheDir);
    const { freshness, ageDays } = IntelligenceManager.calculateFreshness(meta.updatedAt, 7, options.maxDbAgeDays ?? 30);

    // Invariant: Never report a clean assessment if required database is missing in offline mode
    if (options.offline && (!meta.present || !meta.dbFilePresent)) {
      return {
        id: this.id,
        status: 'unavailable',
        engine: this.binaryName,
        engineVersion: availability.version,
        durationMs: Date.now() - startTime,
        findingCount: 0,
        findings: [],
        errorMessage: 'Trivy vulnerability database is missing in local cache. Offline dependency scanning cannot proceed without cached intelligence.',
        completeness: 'indeterminate',
        offline: true,
        dbStatus: 'missing',
        remediationGuidance: 'Run "shipshield update-db --scanner dependencies" while online to download the local vulnerability database.',
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-trivy-deps-'));
    const tmpReportFile = path.join(tmpDir, 'trivy-deps-report.json');

    try {
      const args = [
        'fs',
        '--scanners',
        'vuln',
        '--format',
        'json',
        '--output',
        tmpReportFile,
        '--quiet',
        '--exit-code',
        '1',
        ...(options.customCacheDir ? ['--cache-dir', options.customCacheDir] : []),
        ...(options.offline ? ['--offline-scan', '--skip-db-update', '--skip-java-db-update'] : []),
        options.workspacePath,
      ];

      const res = await ProcessRunner.run({
        executable: this.binaryName,
        args,
        cwd: options.workspacePath,
        timeoutMs: options.timeoutSeconds * 1000,
        offline: options.offline,
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
          errorMessage: 'Trivy dependency scan timed out',
          completeness: 'indeterminate',
          offline: Boolean(options.offline),
          dbVersion: meta.version || undefined,
          dbStatus: freshness,
          dbUpdatedAt: meta.updatedAt || undefined,
          dbAgeDays: ageDays ?? undefined,
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
          completeness: 'indeterminate',
          offline: Boolean(options.offline),
          dbVersion: meta.version || undefined,
          dbStatus: freshness,
          dbUpdatedAt: meta.updatedAt || undefined,
          dbAgeDays: ageDays ?? undefined,
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
          completeness: 'indeterminate',
          offline: Boolean(options.offline),
          dbVersion: meta.version || undefined,
          dbStatus: freshness,
          dbUpdatedAt: meta.updatedAt || undefined,
          dbAgeDays: ageDays ?? undefined,
        };
      }

      const rawContent = fs.readFileSync(tmpReportFile, 'utf8');
      let parsed: TrivyReportRaw;
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
          completeness: 'indeterminate',
          offline: Boolean(options.offline),
          dbVersion: meta.version || undefined,
          dbStatus: freshness,
          dbUpdatedAt: meta.updatedAt || undefined,
          dbAgeDays: ageDays ?? undefined,
        };
      }

      const findings: NormalizedFinding[] = [];

      for (const resTarget of parsed.Results || []) {
        const relPath = path.relative(options.workspacePath, path.resolve(options.workspacePath, resTarget.Target));

        for (const vuln of resTarget.Vulnerabilities || []) {
          const fingerprint = FingerprintGenerator.generateFingerprint({
            category: 'dependencies',
            ruleId: vuln.VulnerabilityID,
            relativePath: relPath,
            packageName: vuln.PkgName,
            installedVersion: vuln.InstalledVersion,
          });

          const id = FingerprintGenerator.generatePublicId('dependencies', fingerprint);
          const severity = this.mapSeverity(vuln.Severity);

          const summary = RedactionEngine.redact(vuln.Title || vuln.Description || `Vulnerability ${vuln.VulnerabilityID} in ${vuln.PkgName}`);

          findings.push({
            id,
            fingerprint,
            type: 'dependency-vulnerability',
            category: 'dependencies',
            scanner: 'trivy',
            rule_id: vuln.VulnerabilityID,
            title: `${vuln.PkgName} ${vuln.InstalledVersion} - ${vuln.VulnerabilityID}`,
            description: summary,
            severity,
            severity_original: vuln.Severity,
            confidence: 'high',
            location: {
              path: relPath.split(path.sep).join('/'),
              package_name: vuln.PkgName,
              installed_version: vuln.InstalledVersion,
              fixed_version: vuln.FixedVersion,
            },
            evidence: {
              redacted: true,
              summary: `Installed version: ${vuln.InstalledVersion}, Fixed version: ${vuln.FixedVersion || 'none'}`,
            },
            remediation: {
              summary: vuln.FixedVersion
                ? `Upgrade ${vuln.PkgName} to version ${vuln.FixedVersion} or higher.`
                : `No known fix version yet for ${vuln.PkgName}.`,
              fix_available: Boolean(vuln.FixedVersion),
              fix_strategy: vuln.FixedVersion ? 'dependency-upgrade' : null,
            },
            status: 'new',
            references: vuln.References || (vuln.PrimaryURL ? [vuln.PrimaryURL] : []),
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
        completeness: freshness === 'stale' || freshness === 'expired' ? 'partial' : 'complete',
        offline: Boolean(options.offline),
        dbVersion: meta.version || undefined,
        dbStatus: freshness,
        dbUpdatedAt: meta.updatedAt || undefined,
        dbAgeDays: ageDays ?? undefined,
        targetsExamined: parsed.Results ? parsed.Results.length : 0,
        remediationGuidance: freshness === 'stale' || freshness === 'expired'
          ? `Local vulnerability database is ${ageDays} days old (${freshness}). Run "shipshield update-db" to refresh intelligence.`
          : null,
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
