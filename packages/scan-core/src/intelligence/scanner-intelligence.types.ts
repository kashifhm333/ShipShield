import { ScannerId, DatabaseFreshness } from '@shipshield/contracts';

export interface ScannerIntelligence {
  scannerId: ScannerId;
  scannerName: string;
  binaryInstalled: boolean;
  binaryPath: string | null;
  binaryVersion: string | null;
  offlineSupported: boolean;
  databaseRequired: boolean;
  databasePresent: boolean;
  databasePath: string | null;
  databaseVersion: string | null;
  databaseUpdatedAt: string | null;
  databaseDownloadedAt: string | null;
  databaseAgeDays: number | null;
  freshness: DatabaseFreshness;
  rulesAvailable: boolean;
  updateSupported: boolean;
  remediationGuidance: string | null;
}

export interface IntelligenceReadinessReport {
  cliVersion: string;
  healthy: boolean;
  offlineReady: boolean;
  timestamp: string;
  scanners: Record<ScannerId, ScannerIntelligence>;
  summary: {
    totalScanners: number;
    availableOffline: ScannerId[];
    missingBinaries: ScannerId[];
    missingDatabases: ScannerId[];
    staleDatabases: ScannerId[];
    expiredDatabases: ScannerId[];
  };
  missingActions: string[];
}

export interface DatabaseUpdateResult {
  scannerId: ScannerId;
  success: boolean;
  stagedPath: string | null;
  activePath: string | null;
  backupPath: string | null;
  previousVersion: string | null;
  newVersion: string | null;
  updatedAt: string | null;
  durationMs: number;
  errorMessage: string | null;
}
