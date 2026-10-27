import {
  NormalizedFinding,
  ProjectConfig,
  PolicyOutcome,
  PolicyViolation,
  Severity,
} from '@shipshield/contracts';
import { ScannerRunResult } from '../adapters/adapter.interface.js';

export interface ActiveSuppression {
  fingerprint: string;
  expires_at: string;
  reason?: string;
  justification?: string;
}

export interface PolicyEvaluationResult {
  passed: boolean;
  policyOutcome: PolicyOutcome;
  completeness: 'complete' | 'partial' | 'indeterminate';
  rulesEvaluated: number;
  violations: PolicyViolation[];
  summary: {
    findings_total: number;
    by_severity: Record<Severity, number>;
    policy_violations: number;
  };
  findings: NormalizedFinding[];
  warnings: string[];
}

export class PolicyEngine {
  /**
   * Deterministically evaluates scan findings and scanner execution statuses
   * against configured policy thresholds, required scanners, database freshness,
   * and time-bounded suppressions.
   */
  public static evaluate(
    findings: NormalizedFinding[],
    scannerRuns: ScannerRunResult[],
    config: ProjectConfig,
    suppressions: ActiveSuppression[] = []
  ): PolicyEvaluationResult {
    const now = new Date();
    const activeSuppressionMap = new Map<string, ActiveSuppression>();
    const warnings: string[] = [];

    for (const sup of suppressions) {
      if (new Date(sup.expires_at) > now) {
        activeSuppressionMap.set(sup.fingerprint, sup);
      }
    }

    const processedFindings: NormalizedFinding[] = [];
    const violations: PolicyViolation[] = [];
    const bySeverity: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    let rulesEvaluated = 0;

    for (const finding of findings) {
      const cloned = { ...finding };
      bySeverity[cloned.severity] = (bySeverity[cloned.severity] || 0) + 1;

      // Check active suppressions
      if (activeSuppressionMap.has(cloned.fingerprint)) {
        cloned.status = 'suppressed';
      } else {
        rulesEvaluated++;
        if (config.policy.fail_on.includes(cloned.severity)) {
          violations.push({
            rule_id: cloned.rule_id,
            finding_id: cloned.id,
            finding_fingerprint: cloned.fingerprint,
            message: `Severity "${cloned.severity}" violates policy (fail_on: [${config.policy.fail_on.join(', ')}]): ${cloned.title}`,
          });
        }
      }

      processedFindings.push(cloned);
    }

    // Check scanner execution statuses and database freshness
    let hasIncompleteScanner = false;
    let hasMissingRequiredScanner = false;
    let hasStaleOrMissingDb = false;

    for (const run of scannerRuns) {
      if (
        run.status === 'failed' ||
        run.status === 'timed_out' ||
        run.status === 'skipped' ||
        run.status === 'unavailable' ||
        run.status === 'incomplete'
      ) {
        hasIncompleteScanner = true;
      }

      // Check database freshness warnings
      if (run.dbStatus === 'stale') {
        warnings.push(`[${run.id}] Vulnerability database is stale (${run.dbAgeDays ?? 'unknown'} days old). Intelligence may be outdated.`);
        if (config.policy.fail_on_stale_db) {
          hasStaleOrMissingDb = true;
        }
      } else if (run.dbStatus === 'expired') {
        warnings.push(`[${run.id}] Vulnerability database is expired (${run.dbAgeDays ?? 'unknown'} days old). Refresh required.`);
        if (config.policy.fail_on_stale_db) {
          hasStaleOrMissingDb = true;
        }
      } else if (run.dbStatus === 'missing' || run.dbStatus === 'invalid') {
        warnings.push(`[${run.id}] Vulnerability database is missing or invalid.`);
        if (config.policy.fail_on_missing_db) {
          hasStaleOrMissingDb = true;
        }
      }
    }

    // Check required scanners policy
    if (config.policy.required_scanners && config.policy.required_scanners.length > 0) {
      for (const requiredId of config.policy.required_scanners) {
        const found = scannerRuns.find((r) => r.id === requiredId);
        if (!found || found.status !== 'completed') {
          hasMissingRequiredScanner = true;
          warnings.push(`Required scanner "${requiredId}" did not complete cleanly (status: ${found?.status || 'not_executed'}).`);
          break;
        }
      }
    }

    let policyOutcome: PolicyOutcome;
    let passed: boolean;
    let completeness: 'complete' | 'partial' | 'indeterminate';

    // Strict Fail-Closed Outcome Precedence:
    // Incomplete, timed-out, skipped, or failed scanner MUST fail closed.
    // A scan with incomplete scanners MUST NEVER be labeled 'passed' or exit with 0.
    if (hasIncompleteScanner || hasMissingRequiredScanner || hasStaleOrMissingDb) {
      policyOutcome = 'incomplete';
      passed = false;
      completeness = hasMissingRequiredScanner || hasStaleOrMissingDb ? 'indeterminate' : 'partial';
    } else if (violations.length > 0) {
      policyOutcome = 'policy_failed';
      passed = false;
      completeness = 'complete';
    } else {
      policyOutcome = 'passed';
      passed = true;
      completeness = 'complete';
    }

    return {
      passed,
      policyOutcome,
      completeness,
      rulesEvaluated,
      violations,
      summary: {
        findings_total: processedFindings.length,
        by_severity: bySeverity,
        policy_violations: violations.length,
      },
      findings: processedFindings,
      warnings,
    };
  }
}
