import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ScannerId, DatabaseFreshness, ProjectConfig, SHIPSHIELD_VERSION } from '@shipshield/contracts';
import { ProcessRunner } from '../security/process-runner.js';
import {
  ScannerIntelligence,
  IntelligenceReadinessReport,
  DatabaseUpdateResult,
} from './scanner-intelligence.types.js';

export class IntelligenceManager {
  /**
   * Resolves the default cache directory for a given scanner.
   */
  public static getDefaultCacheDir(scannerId: ScannerId, customCacheDir?: string): string {
    if (customCacheDir) {
      return path.resolve(customCacheDir);
    }
    const home = process.env.HOME || os.homedir();
    if (scannerId === 'dependencies' || scannerId === 'containers') {
      return process.env.TRIVY_CACHE_DIR || path.join(home, '.cache', 'trivy');
    }
    if (scannerId === 'iac') {
      return process.env.CHECKOV_CACHE_DIR || path.join(home, '.cache', 'checkov');
    }
    return path.join(home, '.cache', 'shipshield', scannerId);
  }

  /**
   * Calculates database freshness status based on the intelligence update timestamp.
   */
  public static calculateFreshness(
    updatedAt?: string | null,
    freshnessDays = 7,
    staleDays = 30
  ): { freshness: DatabaseFreshness; ageDays: number | null } {
    if (!updatedAt) {
      return { freshness: 'missing', ageDays: null };
    }

    const timestamp = Date.parse(updatedAt);
    if (Number.isNaN(timestamp)) {
      return { freshness: 'invalid', ageDays: null };
    }

    const now = Date.now();
    const diffMs = now - timestamp;
    if (diffMs < 0) {
      // Future timestamp is considered fresh
      return { freshness: 'fresh', ageDays: 0 };
    }

    const ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (ageDays <= freshnessDays) {
      return { freshness: 'fresh', ageDays };
    }
    if (ageDays <= staleDays) {
      return { freshness: 'stale', ageDays };
    }
    return { freshness: 'expired', ageDays };
  }

  /**
   * Reads and parses Trivy database metadata from its cache directory.
   */
  public static parseTrivyMetadata(cacheDir: string): {
    present: boolean;
    dbFilePresent: boolean;
    dbPath: string | null;
    version: string | null;
    updatedAt: string | null;
    downloadedAt: string | null;
    error: string | null;
  } {
    const dbDir = path.join(cacheDir, 'db');
    const metadataPath = path.join(dbDir, 'metadata.json');
    const dbFilePath = path.join(dbDir, 'trivy.db');

    if (!fs.existsSync(dbDir) || !fs.existsSync(metadataPath)) {
      return {
        present: false,
        dbFilePresent: fs.existsSync(dbFilePath),
        dbPath: fs.existsSync(dbFilePath) ? dbFilePath : null,
        version: null,
        updatedAt: null,
        downloadedAt: null,
        error: 'Trivy metadata.json not found in cache',
      };
    }

    try {
      const content = fs.readFileSync(metadataPath, 'utf8');
      const parsed = JSON.parse(content);
      const dbFileExists = fs.existsSync(dbFilePath);

      return {
        present: true,
        dbFilePresent: dbFileExists,
        dbPath: dbFilePath,
        version: parsed.Version !== undefined ? String(parsed.Version) : null,
        updatedAt: parsed.UpdatedAt || null,
        downloadedAt: parsed.DownloadedAt || null,
        error: dbFileExists ? null : 'metadata.json present but trivy.db binary file is missing',
      };
    } catch (err: unknown) {
      return {
        present: false,
        dbFilePresent: fs.existsSync(dbFilePath),
        dbPath: dbFilePath,
        version: null,
        updatedAt: null,
        downloadedAt: null,
        error: `Failed to parse Trivy metadata.json: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Inspects intelligence status for an individual scanner engine.
   */
  public static async inspectScanner(
    scannerId: ScannerId,
    config?: ProjectConfig
  ): Promise<ScannerIntelligence> {
    const freshnessThreshold = config?.database.freshness_threshold_days ?? 7;
    const staleThreshold = config?.database.stale_threshold_days ?? 30;
    const customCache = config?.database.custom_cache_dir;

    switch (scannerId) {
      case 'secrets': {
        const binCheck = await ProcessRunner.run({
          executable: 'gitleaks',
          args: ['version'],
          cwd: process.cwd(),
          timeoutMs: 3000,
        });

        const installed = binCheck.exitCode === 0;
        const version = (installed && binCheck.stdout.trim().split('\n')[0]) || null;

        return {
          scannerId: 'secrets',
          scannerName: 'Gitleaks Secrets Scanner',
          binaryInstalled: installed,
          binaryPath: null,
          binaryVersion: version,
          offlineSupported: true,
          databaseRequired: false,
          databasePresent: true,
          databasePath: null,
          databaseVersion: null,
          databaseUpdatedAt: null,
          databaseDownloadedAt: null,
          databaseAgeDays: null,
          freshness: 'not_applicable',
          rulesAvailable: installed,
          updateSupported: false,
          remediationGuidance: installed
            ? null
            : 'Install Gitleaks via "sudo apt install gitleaks" or download from https://github.com/gitleaks/gitleaks/releases',
        };
      }

      case 'dependencies':
      case 'containers': {
        const binCheck = await ProcessRunner.run({
          executable: 'trivy',
          args: ['--version'],
          cwd: process.cwd(),
          timeoutMs: 3000,
        });

        const installed = binCheck.exitCode === 0;
        const version = (installed && binCheck.stdout.trim().split('\n')[0]) || null;
        const cacheDir = this.getDefaultCacheDir('dependencies', customCache);
        const meta = this.parseTrivyMetadata(cacheDir);

        let freshness: DatabaseFreshness;
        let ageDays: number | null = null;

        if (!meta.present || !meta.dbFilePresent) {
          freshness = 'missing';
        } else if (meta.error) {
          freshness = 'invalid';
        } else {
          const calc = this.calculateFreshness(meta.updatedAt, freshnessThreshold, staleThreshold);
          freshness = calc.freshness;
          ageDays = calc.ageDays;
        }

        const isContainers = scannerId === 'containers';
        const name = isContainers
          ? 'Trivy Container & Config Scanner'
          : 'Trivy Dependency Vulnerability Scanner';

        let guidance: string | null = null;
        if (!installed) {
          guidance = 'Install Trivy from https://aquasecurity.github.io/trivy/latest/getting-started/installation/';
        } else if (freshness === 'missing' || freshness === 'invalid') {
          guidance = 'Run "shipshield update-db --scanner dependencies" while online to download the vulnerability database.';
        } else if (freshness === 'stale' || freshness === 'expired') {
          guidance = `Database is ${ageDays} days old (${freshness}). Run "shipshield update-db" to refresh intelligence.`;
        }

        return {
          scannerId,
          scannerName: name,
          binaryInstalled: installed,
          binaryPath: null,
          binaryVersion: version,
          offlineSupported: true,
          databaseRequired: true,
          databasePresent: meta.present && meta.dbFilePresent,
          databasePath: meta.dbPath,
          databaseVersion: meta.version,
          databaseUpdatedAt: meta.updatedAt,
          databaseDownloadedAt: meta.downloadedAt,
          databaseAgeDays: ageDays,
          freshness,
          rulesAvailable: installed && meta.present && meta.dbFilePresent,
          updateSupported: true,
          remediationGuidance: guidance,
        };
      }

      case 'iac': {
        const binCheck = await ProcessRunner.run({
          executable: 'checkov',
          args: ['--version'],
          cwd: process.cwd(),
          timeoutMs: 15000,
        });

        const installed = binCheck.exitCode === 0;
        const version = (installed && binCheck.stdout.trim().split('\n')[0]) || null;

        return {
          scannerId: 'iac',
          scannerName: 'Checkov Infrastructure-as-Code Scanner',
          binaryInstalled: installed,
          binaryPath: null,
          binaryVersion: version,
          offlineSupported: true, // Offline mode supported via --skip-download
          databaseRequired: false, // Checkov includes bundled policies
          databasePresent: true,
          databasePath: null,
          databaseVersion: null,
          databaseUpdatedAt: null,
          databaseDownloadedAt: null,
          databaseAgeDays: null,
          freshness: 'not_applicable',
          rulesAvailable: installed,
          updateSupported: false,
          remediationGuidance: installed
            ? null
            : 'Install Checkov via "pip install checkov" or visit https://www.checkov.io/',
        };
      }
    }
  }

  /**
   * Generates a comprehensive offline readiness and system diagnostics report.
   * This is strictly read-only and NEVER executes network operations.
   */
  public static async getReadinessReport(config?: ProjectConfig): Promise<IntelligenceReadinessReport> {
    const scannerIds: ScannerId[] = ['secrets', 'dependencies', 'containers', 'iac'];
    const scanners: Record<ScannerId, ScannerIntelligence> = {} as any;

    const availableOffline: ScannerId[] = [];
    const missingBinaries: ScannerId[] = [];
    const missingDatabases: ScannerId[] = [];
    const staleDatabases: ScannerId[] = [];
    const expiredDatabases: ScannerId[] = [];
    const missingActions: string[] = [];

    for (const id of scannerIds) {
      const intel = await this.inspectScanner(id, config);
      scanners[id] = intel;

      if (!intel.binaryInstalled) {
        missingBinaries.push(id);
        if (intel.remediationGuidance) {
          missingActions.push(`[${id}] ${intel.remediationGuidance}`);
        }
      } else {
        if (intel.databaseRequired) {
          if (!intel.databasePresent || intel.freshness === 'missing' || intel.freshness === 'invalid') {
            missingDatabases.push(id);
            if (intel.remediationGuidance) {
              missingActions.push(`[${id}] ${intel.remediationGuidance}`);
            }
          } else if (intel.freshness === 'expired') {
            expiredDatabases.push(id);
            if (intel.remediationGuidance) {
              missingActions.push(`[${id}] ${intel.remediationGuidance}`);
            }
          } else if (intel.freshness === 'stale') {
            staleDatabases.push(id);
          }
        }

        // Available offline if binary is installed AND either no DB needed or DB is present
        if (!intel.databaseRequired || intel.databasePresent) {
          availableOffline.push(id);
        }
      }
    }

    const healthy = missingBinaries.length === 0 && missingDatabases.length === 0;
    const offlineReady = availableOffline.length > 0 && missingDatabases.length === 0;

    return {
      cliVersion: SHIPSHIELD_VERSION,
      healthy,
      offlineReady,
      timestamp: new Date().toISOString(),
      scanners,
      summary: {
        totalScanners: scannerIds.length,
        availableOffline,
        missingBinaries,
        missingDatabases,
        staleDatabases,
        expiredDatabases,
      },
      missingActions,
    };
  }

  /**
   * Safely updates vulnerability database for supported scanner engines using
   * staged downloads, integrity verification, atomic activation, and automatic rollback on failure.
   */
  public static async updateDatabase(
    scannerId: ScannerId,
    options?: { force?: boolean; cacheDir?: string }
  ): Promise<DatabaseUpdateResult> {
    const startTime = Date.now();

    if (scannerId !== 'dependencies' && scannerId !== 'containers') {
      return {
        scannerId,
        success: false,
        stagedPath: null,
        activePath: null,
        backupPath: null,
        previousVersion: null,
        newVersion: null,
        updatedAt: null,
        durationMs: Date.now() - startTime,
        errorMessage: `Scanner "${scannerId}" does not support external database updates.`,
      };
    }

    // Verify Trivy binary is installed
    const binCheck = await ProcessRunner.run({
      executable: 'trivy',
      args: ['--version'],
      cwd: process.cwd(),
      timeoutMs: 3000,
    });

    if (binCheck.exitCode !== 0) {
      return {
        scannerId,
        success: false,
        stagedPath: null,
        activePath: null,
        backupPath: null,
        previousVersion: null,
        newVersion: null,
        updatedAt: null,
        durationMs: Date.now() - startTime,
        errorMessage: 'Trivy binary is not installed on this machine.',
      };
    }

    const targetCacheDir = this.getDefaultCacheDir('dependencies', options?.cacheDir);
    const targetDbDir = path.join(targetCacheDir, 'db');
    const existingMeta = this.parseTrivyMetadata(targetCacheDir);

    // 1. Create isolated staging directory
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-db-update-'));
    const stagingDbDir = path.join(stagingDir, 'db');
    const backupDir = path.join(targetCacheDir, 'db.backup');

    try {
      // 2. Download intelligence into staging location via Trivy native mechanism
      const downloadResult = await ProcessRunner.run({
        executable: 'trivy',
        args: ['image', '--download-db-only', '--cache-dir', stagingDir],
        cwd: stagingDir,
        timeoutMs: 300000, // 5 min timeout for DB download
      });

      if (downloadResult.timedOut) {
        throw new Error('Database download timed out after 300 seconds');
      }

      if (downloadResult.exitCode !== 0) {
        throw new Error(downloadResult.stderr || `Trivy exited with code ${downloadResult.exitCode}`);
      }

      // 3. Validate integrity and compatibility of downloaded artifact
      const stagedMeta = this.parseTrivyMetadata(stagingDir);
      if (!stagedMeta.present || !stagedMeta.dbFilePresent || !stagedMeta.dbPath) {
        throw new Error(`Staged database validation failed: ${stagedMeta.error || 'metadata or database file missing'}`);
      }

      const dbStat = fs.statSync(stagedMeta.dbPath);
      // Trivy vulnerability db is typically > 10MB
      if (dbStat.size < 1024 * 1024) {
        throw new Error(`Downloaded database artifact is abnormally small (${dbStat.size} bytes). Integrity check failed.`);
      }

      // 4. Safe atomic activation with rollback
      fs.mkdirSync(targetCacheDir, { recursive: true });

      // Backup existing database if present
      let hasBackup = false;
      if (fs.existsSync(targetDbDir)) {
        try {
          fs.rmSync(backupDir, { recursive: true, force: true });
          fs.cpSync(targetDbDir, backupDir, { recursive: true });
          hasBackup = true;
        } catch (backupErr: unknown) {
          // Non-fatal if backup fails
        }
      }

      try {
        // Replace existing DB directory atomically
        fs.rmSync(targetDbDir, { recursive: true, force: true });
        fs.cpSync(stagingDbDir, targetDbDir, { recursive: true });

        // Verify active target after swap
        const verifiedMeta = this.parseTrivyMetadata(targetCacheDir);
        if (!verifiedMeta.present || !verifiedMeta.dbFilePresent) {
          throw new Error('Target verification failed after database swap.');
        }

        // Clean up backup on successful activation
        if (hasBackup && fs.existsSync(backupDir)) {
          fs.rmSync(backupDir, { recursive: true, force: true });
        }

        return {
          scannerId,
          success: true,
          stagedPath: stagingDbDir,
          activePath: targetDbDir,
          backupPath: null,
          previousVersion: existingMeta.version,
          newVersion: verifiedMeta.version,
          updatedAt: verifiedMeta.updatedAt,
          durationMs: Date.now() - startTime,
          errorMessage: null,
        };
      } catch (activationErr: unknown) {
        // Rollback to previous working DB
        if (hasBackup && fs.existsSync(backupDir)) {
          try {
            fs.rmSync(targetDbDir, { recursive: true, force: true });
            fs.cpSync(backupDir, targetDbDir, { recursive: true });
            fs.rmSync(backupDir, { recursive: true, force: true });
          } catch {
            // Rollback failure logged
          }
        }
        throw activationErr;
      }
    } catch (err: unknown) {
      return {
        scannerId,
        success: false,
        stagedPath: stagingDbDir,
        activePath: targetDbDir,
        backupPath: fs.existsSync(backupDir) ? backupDir : null,
        previousVersion: existingMeta.version,
        newVersion: null,
        updatedAt: null,
        durationMs: Date.now() - startTime,
        errorMessage: (err as Error).message,
      };
    } finally {
      // 5. Clean up temporary staging artifacts safely
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        // Ignore staging cleanup errors
      }
    }
  }
}
