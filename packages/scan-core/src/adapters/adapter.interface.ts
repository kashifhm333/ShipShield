import { NormalizedFinding, ScannerId, ScannerStatus } from '@shipshield/contracts';

export interface ScannerRunResult {
  id: ScannerId;
  status: ScannerStatus;
  engine: string;
  engineVersion?: string | undefined;
  durationMs: number;
  findingCount: number;
  findings: NormalizedFinding[];
  errorMessage: string | null;
}

export interface ScannerAdapterOptions {
  workspacePath: string;
  timeoutSeconds: number;
  offline?: boolean;
}

export interface ScannerAdapter {
  readonly id: ScannerId;
  readonly name: string;
  readonly binaryName: string;
  isApplicable(workspacePath: string): Promise<boolean>;
  checkAvailability(): Promise<{ available: boolean; version?: string | undefined; error?: string | undefined }>;
  scan(options: ScannerAdapterOptions): Promise<ScannerRunResult>;
}
