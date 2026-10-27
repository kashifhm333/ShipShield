import {
  NormalizedFinding,
  ScannerId,
  ScannerStatus,
  Completeness,
  DatabaseFreshness,
} from '@shipshield/contracts';

export interface ScannerRunResult {
  id: ScannerId;
  status: ScannerStatus;
  engine: string;
  engineVersion?: string | undefined;
  durationMs: number;
  findingCount: number;
  findings: NormalizedFinding[];
  errorMessage: string | null;
  completeness?: Completeness | undefined;
  offline?: boolean | undefined;
  dbVersion?: string | undefined;
  dbStatus?: DatabaseFreshness | undefined;
  dbUpdatedAt?: string | undefined;
  dbAgeDays?: number | undefined;
  targetsExamined?: number | undefined;
  skippedChecks?: string[] | undefined;
  remediationGuidance?: string | null | undefined;
}

export interface ScannerAdapterOptions {
  workspacePath: string;
  timeoutSeconds: number;
  offline?: boolean | undefined;
  maxDbAgeDays?: number | undefined;
  customCacheDir?: string | undefined;
  scanGitHistory?: boolean | undefined;
}

export interface ScannerAdapter {
  readonly id: ScannerId;
  readonly name: string;
  readonly binaryName: string;
  isApplicable(workspacePath: string): Promise<boolean>;
  checkAvailability(): Promise<{ available: boolean; version?: string | undefined; error?: string | undefined }>;
  scan(options: ScannerAdapterOptions): Promise<ScannerRunResult>;
}
