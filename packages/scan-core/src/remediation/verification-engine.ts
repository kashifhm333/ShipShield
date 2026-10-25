import { ScanReport } from '@shipshield/contracts';
import { ScanOrchestrator, ScanOrchestratorOptions } from '../orchestrator/scan-orchestrator.js';

export interface VerificationResult {
  baselineReport: ScanReport;
  verifiedReport: ScanReport;
  resolvedFindings: string[]; // List of fingerprints resolved
  remainingFindings: string[]; // List of fingerprints still present
  unverifiedFindings: string[]; // List of fingerprints where scanner failed/skipped
  verificationOutcome: 'passed' | 'policy_failed' | 'incomplete';
  exitCode: number;
}

export class VerificationEngine {
  /**
   * Runs verification comparison between a baseline scan and a new scan.
   * Asserts that fixes actually resolved findings without regressions.
   */
  public static async verify(
    baselineReport: ScanReport,
    scanOptions: ScanOrchestratorOptions
  ): Promise<VerificationResult> {
    const orchestratorResult = await ScanOrchestrator.run(scanOptions);
    const currentReport = orchestratorResult.report;

    const currentScannerStatus = new Map<string, string>();
    for (const s of currentReport.scanners) {
      currentScannerStatus.set(s.id, s.status);
    }

    const currentFingerprints = new Set(currentReport.findings.map((f) => f.fingerprint));

    const resolvedFindings: string[] = [];
    const remainingFindings: string[] = [];
    const unverifiedFindings: string[] = [];

    for (const baseFinding of baselineReport.findings) {
      const scannerStatus = currentScannerStatus.get(baseFinding.category);

      // Invariant: Verification Over Assertion
      // Only transition finding to resolved if scanner completed cleanly
      if (scannerStatus !== 'completed') {
        unverifiedFindings.push(baseFinding.fingerprint);
      } else if (!currentFingerprints.has(baseFinding.fingerprint)) {
        resolvedFindings.push(baseFinding.fingerprint);
      } else {
        remainingFindings.push(baseFinding.fingerprint);
      }
    }

    let verificationOutcome: 'passed' | 'policy_failed' | 'incomplete';
    let exitCode: number;

    if (unverifiedFindings.length > 0 || currentReport.scan.policy_outcome === 'incomplete') {
      verificationOutcome = 'incomplete';
      exitCode = 4;
    } else if (currentReport.scan.policy_outcome === 'policy_failed' || remainingFindings.length > 0) {
      verificationOutcome = 'policy_failed';
      exitCode = 1;
    } else {
      verificationOutcome = 'passed';
      exitCode = 0;
    }

    return {
      baselineReport,
      verifiedReport: currentReport,
      resolvedFindings,
      remainingFindings,
      unverifiedFindings,
      verificationOutcome,
      exitCode,
    };
  }
}
