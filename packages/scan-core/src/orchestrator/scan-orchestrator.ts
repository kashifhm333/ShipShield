import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  NormalizedFinding,
  ProjectConfig,
  ScanReport,
  ScannerId,
  SEVERITY_WEIGHT,
  SHIPSHIELD_VERSION,
} from '@shipshield/contracts';
import { AdapterRegistry } from '../adapters/adapter-registry.js';
import { ScannerRunResult } from '../adapters/adapter.interface.js';
import { PolicyEngine, ActiveSuppression, PolicyEvaluationResult } from '../policy/policy-engine.js';
import { JsonReportWriter } from '../reports/json-writer.js';
import { MarkdownReportWriter } from '../reports/markdown-writer.js';
import { ProcessRunner } from '../security/process-runner.js';
import { FileWalker } from '../discovery/file-walker.js';
import { NativePolicyRegistry } from '../policy/native-policy-registry.js';

export interface ScanOrchestratorOptions {
  projectRoot: string;
  config: ProjectConfig;
  adapters: AdapterRegistry;
  selectedScanners?: ScannerId[] | undefined;
  offline?: boolean | undefined;
  suppressions?: ActiveSuppression[] | undefined;
  writeReports?: boolean | undefined;
  requireScanners?: ScannerId[] | undefined;
  maxDbAgeDays?: number | undefined;
}

export interface OrchestratorRunResult {
  report: ScanReport;
  jsonReportPath?: string | undefined;
  markdownReportPath?: string | undefined;
  policyResult: PolicyEvaluationResult;
}

export class ScanOrchestrator {
  private static generateScanId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `scan_${timestamp}${random}`;
  }

  private static async getGitMetadata(projectRoot: string): Promise<{
    type: 'git';
    commit?: string;
    branch?: string;
    dirty?: boolean;
  } | undefined> {
    if (!fs.existsSync(path.join(projectRoot, '.git'))) {
      return undefined;
    }

    try {
      const commitRes = await ProcessRunner.run({
        executable: 'git',
        args: ['rev-parse', 'HEAD'],
        cwd: projectRoot,
        timeoutMs: 3000,
      });

      const branchRes = await ProcessRunner.run({
        executable: 'git',
        args: ['rev-parse', '--abbrev-ref', 'HEAD'],
        cwd: projectRoot,
        timeoutMs: 3000,
      });

      const statusRes = await ProcessRunner.run({
        executable: 'git',
        args: ['status', '--porcelain'],
        cwd: projectRoot,
        timeoutMs: 3000,
      });

      const commit = commitRes.exitCode === 0 ? commitRes.stdout.trim() : undefined;
      const branch = branchRes.exitCode === 0 ? branchRes.stdout.trim() : undefined;
      const dirty = statusRes.exitCode === 0 ? statusRes.stdout.trim().length > 0 : undefined;

      const meta: { type: 'git'; commit?: string; branch?: string; dirty?: boolean } = { type: 'git' };
      if (commit) meta.commit = commit;
      if (branch) meta.branch = branch;
      if (dirty !== undefined) meta.dirty = dirty;
      return meta;
    } catch {
      return { type: 'git' };
    }
  }

  public static async run(options: ScanOrchestratorOptions): Promise<OrchestratorRunResult> {
    const startedAt = new Date().toISOString();
    const scanId = this.generateScanId();
    const isOffline = Boolean(options.offline || options.config.execution.network === 'deny');

    // Merge required scanners if specified
    if (options.requireScanners && options.requireScanners.length > 0) {
      options.config.policy.required_scanners = Array.from(
        new Set([...options.config.policy.required_scanners, ...options.requireScanners])
      );
    }

    // 1. Discover files and check applicability
    const discovered = FileWalker.walk(options.projectRoot, options.config.execution.exclude);

    // 2. Select enabled and applicable adapters
    const allAdapters = options.adapters.getAll();
    const selectedAdapters = allAdapters.filter((adapter) => {
      // CLI filter check
      if (options.selectedScanners && !options.selectedScanners.includes(adapter.id)) {
        return false;
      }
      // Config enabled check
      const configEntry = options.config.scan[adapter.id];
      if (configEntry && !configEntry.enabled) {
        return false;
      }
      return true;
    });

    // 3. Concurrency-limited execution
    const maxParallel = options.config.execution.max_parallel_scanners;
    const scannerRuns: ScannerRunResult[] = [];
    const executionQueue = [...selectedAdapters];

    const worker = async () => {
      while (executionQueue.length > 0) {
        const adapter = executionQueue.shift();
        if (!adapter) break;

        const isApplicable = discovered.applicableScanners[adapter.id];
        if (!isApplicable) {
          scannerRuns.push({
            id: adapter.id,
            status: 'not_applicable',
            engine: adapter.binaryName,
            durationMs: 0,
            findingCount: 0,
            findings: [],
            errorMessage: null,
            completeness: 'complete',
            offline: isOffline,
          });
          continue;
        }

        const runResult = await adapter.scan({
          workspacePath: options.projectRoot,
          timeoutSeconds: options.config.execution.timeout_seconds,
          offline: isOffline,
          maxDbAgeDays: options.maxDbAgeDays ?? options.config.database.stale_threshold_days,
          customCacheDir: options.config.database.custom_cache_dir,
        });
        scannerRuns.push(runResult);
      }
    };

    const workerPromises: Promise<void>[] = [];
    for (let i = 0; i < Math.min(maxParallel, selectedAdapters.length); i++) {
      workerPromises.push(worker());
    }
    await Promise.all(workerPromises);

    // 4. Collect and deduplicate findings by fingerprint
    const allFindingsMap = new Map<string, NormalizedFinding>();
    for (const run of scannerRuns) {
      for (const finding of run.findings) {
        if (!allFindingsMap.has(finding.fingerprint)) {
          allFindingsMap.set(finding.fingerprint, finding);
        }
      }
    }

    // Execute built-in native policies across discovered workspace files
    try {
      const nativeFindings = await NativePolicyRegistry.execute(
        options.projectRoot,
        discovered.allFiles
      );
      for (const nf of nativeFindings) {
        if (!allFindingsMap.has(nf.fingerprint)) {
          allFindingsMap.set(nf.fingerprint, nf);
        }
      }
    } catch {
      // Robustness: policy execution errors never abort scan
    }

    // Sort findings deterministically: Severity DESC, Path ASC, StartLine ASC
    const sortedFindings = Array.from(allFindingsMap.values()).sort((a, b) => {
      const weightDiff = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
      if (weightDiff !== 0) return weightDiff;
      const pathDiff = a.location.path.localeCompare(b.location.path);
      if (pathDiff !== 0) return pathDiff;
      const lineA = a.location.start_line ?? 0;
      const lineB = b.location.start_line ?? 0;
      return lineA - lineB;
    });

    // 5. Evaluate policy
    const policyResult = PolicyEngine.evaluate(
      sortedFindings,
      scannerRuns,
      options.config,
      options.suppressions || []
    );

    const completedAt = new Date().toISOString();
    const gitMeta = await this.getGitMetadata(options.projectRoot);

    const hasTimedOut = scannerRuns.some((r) => r.status === 'timed_out');
    const hasFailedOrSkipped = scannerRuns.some(
      (r) =>
        r.status === 'failed' ||
        r.status === 'skipped' ||
        r.status === 'unavailable' ||
        r.status === 'incomplete'
    );
    const executionStatus: 'completed' | 'failed' | 'timed_out' = hasTimedOut
      ? 'timed_out'
      : hasFailedOrSkipped
        ? 'failed'
        : 'completed';

    // Calculate database summary counts
    let freshCount = 0;
    let staleCount = 0;
    let expiredCount = 0;
    let missingCount = 0;
    let unknownCount = 0;

    for (const r of scannerRuns) {
      if (r.dbStatus === 'fresh') freshCount++;
      else if (r.dbStatus === 'stale') staleCount++;
      else if (r.dbStatus === 'expired') expiredCount++;
      else if (r.dbStatus === 'missing') missingCount++;
      else if (r.dbStatus === 'unknown' || r.dbStatus === 'invalid') unknownCount++;
    }

    // 6. Build final ScanReport
    const report: ScanReport = {
      schema_version: '1.0',
      tool: {
        name: 'shipshield',
        version: SHIPSHIELD_VERSION,
      },
      scan: {
        id: scanId,
        started_at: startedAt,
        completed_at: completedAt,
        mode: isOffline ? 'offline' : 'online_assisted',
        completeness: policyResult.completeness,
        scope: {
          kind: 'full',
          root: options.projectRoot,
        },
        execution_status: executionStatus,
        policy_outcome: policyResult.policyOutcome as 'passed' | 'policy_failed' | 'incomplete',
        db_summary: {
          fresh: freshCount,
          stale: staleCount,
          expired: expiredCount,
          missing: missingCount,
          unknown: unknownCount,
        },
      },
      project: {
        name: options.config.project.name,
        vcs: gitMeta,
      },
      scanners: scannerRuns.map((r) => ({
        id: r.id,
        status: r.status,
        engine: r.engine,
        engine_version: r.engineVersion,
        duration_ms: r.durationMs,
        finding_count: r.findingCount,
        error_message: r.errorMessage,
        completeness: r.completeness ?? 'complete',
        offline: r.offline ?? isOffline,
        db_version: r.dbVersion,
        db_status: r.dbStatus ?? 'not_applicable',
        db_updated_at: r.dbUpdatedAt,
        db_age_days: r.dbAgeDays,
        targets_examined: r.targetsExamined,
        skipped_checks: r.skippedChecks ?? [],
        remediation_guidance: r.remediationGuidance ?? null,
      })),
      summary: policyResult.summary,
      findings: policyResult.findings,
      policy: {
        passed: policyResult.passed,
        rules_evaluated: policyResult.rulesEvaluated,
        violations: policyResult.violations,
      },
      warnings: policyResult.warnings,
      errors: scannerRuns.filter((r) => r.errorMessage).map((r) => `[${r.id}] ${r.errorMessage}`),
    };

    // 7. Write reports if configured
    let jsonReportPath: string | undefined;
    let markdownReportPath: string | undefined;

    const shouldWrite = options.writeReports !== false;
    if (shouldWrite) {
      if (options.config.reports.formats.includes('json')) {
        const res = JsonReportWriter.write(
          options.projectRoot,
          options.config.reports.directory,
          report
        );
        jsonReportPath = res.reportPath;
      }
      if (options.config.reports.formats.includes('markdown')) {
        const res = MarkdownReportWriter.write(
          options.projectRoot,
          options.config.reports.directory,
          report
        );
        markdownReportPath = res.reportPath;
      }
    }

    return {
      report,
      jsonReportPath,
      markdownReportPath,
      policyResult,
    };
  }
}
