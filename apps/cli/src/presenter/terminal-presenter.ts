import { ScanReport, Severity, SHIPSHIELD_VERSION } from '@shipshield/contracts';
import { FixProposal } from '@shipshield/scan-core';

export class TerminalPresenter {
  private readonly useColor: boolean;

  constructor(noColor = false) {
    this.useColor = !noColor && process.stdout.isTTY !== false;
  }

  private color(text: string, code: number): string {
    if (!this.useColor) return text;
    return `\x1b[${code}m${text}\x1b[0m`;
  }

  public bold(text: string): string {
    return this.color(text, 1);
  }

  public red(text: string): string {
    return this.color(text, 31);
  }

  public green(text: string): string {
    return this.color(text, 32);
  }

  public yellow(text: string): string {
    return this.color(text, 33);
  }

  public blue(text: string): string {
    return this.color(text, 34);
  }

  public magenta(text: string): string {
    return this.color(text, 35);
  }

  public cyan(text: string): string {
    return this.color(text, 36);
  }

  public gray(text: string): string {
    return this.color(text, 90);
  }

  public severityBadge(severity: Severity): string {
    switch (severity) {
      case 'critical':
        return this.bold(this.red('[CRITICAL]'));
      case 'high':
        return this.bold(this.red('[HIGH]'));
      case 'medium':
        return this.bold(this.yellow('[MEDIUM]'));
      case 'low':
        return this.bold(this.blue('[LOW]'));
      case 'info':
        return this.gray('[INFO]');
    }
  }

  public printBanner(): void {
    console.error(this.bold(this.cyan(`🛡️  ShipShield Security Gate v${SHIPSHIELD_VERSION}`)));
    console.error(this.gray('Local-first, developer-first DevSecOps gate\n'));
  }

  public renderReport(report: ScanReport): void {
    const outcome = report.scan.policy_outcome;
    let outcomeStr = '';
    if (outcome === 'passed') {
      outcomeStr = this.bold(this.green('PASSED (0 violations)'));
    } else if (outcome === 'policy_failed') {
      outcomeStr = this.bold(this.red(`POLICY FAILED (${report.summary.policy_violations} violations)`));
    } else {
      outcomeStr = this.bold(this.yellow('INCOMPLETE (Scanner incomplete or failed)'));
    }

    console.log(this.bold('\n=== Scan Execution Summary ==='));
    console.log(`Scan ID:   ${this.cyan(report.scan.id)}`);
    console.log(`Outcome:   ${outcomeStr}`);
    console.log(`Duration:  ${new Date(report.scan.completed_at).getTime() - new Date(report.scan.started_at).getTime()}ms`);
    console.log(`Scope:     ${report.scan.scope.kind} (${report.scan.scope.root})`);

    console.log(this.bold('\n--- Scanner Breakdown ---'));
    for (const s of report.scanners) {
      const statusStr =
        s.status === 'completed'
          ? this.green('completed')
          : s.status === 'not_applicable'
          ? this.gray('not applicable')
          : s.status === 'skipped'
          ? this.yellow('skipped')
          : this.red(s.status);

      console.log(
        `• ${this.bold(s.id.padEnd(14))} [${statusStr}] findings: ${s.finding_count} (${s.duration_ms}ms)`
      );
      if (s.error_message) {
        console.log(`  ${this.red('Error:')} ${s.error_message}`);
      }
    }

    console.log(this.bold('\n--- Findings Breakdown by Severity ---'));
    console.log(
      `Critical: ${this.red(String(report.summary.by_severity.critical))} | ` +
      `High: ${this.red(String(report.summary.by_severity.high))} | ` +
      `Medium: ${this.yellow(String(report.summary.by_severity.medium))} | ` +
      `Low: ${this.blue(String(report.summary.by_severity.low))} | ` +
      `Info: ${this.gray(String(report.summary.by_severity.info))}`
    );

    if (report.policy.violations.length > 0) {
      console.log(this.bold('\n--- Policy Violations ---'));
      for (const v of report.policy.violations) {
        console.log(`❌ [${v.finding_id}] ${v.message}`);
      }
    }

    if (report.findings.length > 0) {
      console.log(this.bold('\n--- Top Findings ---'));
      const displayFindings = report.findings.slice(0, 15);
      for (const f of displayFindings) {
        console.log(`\n${this.severityBadge(f.severity)} ${this.bold(f.title)} (${this.cyan(f.id)})`);
        console.log(`  Category:    ${f.category} (${f.scanner} / ${f.rule_id})`);
        console.log(`  Location:    ${f.location.path}${f.location.start_line ? `:${f.location.start_line}` : ''}`);
        console.log(`  Evidence:    ${this.gray(f.evidence.summary)}`);
        console.log(`  Fix:         ${f.remediation.summary} (Fix available: ${f.remediation.fix_available ? this.green('Yes') : 'No'})`);
      }
      if (report.findings.length > 15) {
        console.log(this.gray(`\n... and ${report.findings.length - 15} more findings. View full report in .shipshield/reports/`));
      }
    }

    console.log('');
  }

  public renderProposals(proposals: FixProposal[], isApplied: boolean): void {
    if (proposals.length === 0) {
      console.log(this.gray('\nNo automated fix proposals available for current findings.'));
      return;
    }

    console.log(this.bold(`\n=== Remediation Proposals (${proposals.length} available) ===`));
    for (const p of proposals) {
      console.log(`\nFinding: ${this.cyan(p.findingId)} -> Target: ${this.bold(p.targetRelativePath)}`);
      console.log(`Description: ${p.description}`);
      console.log(this.gray('--- Unified Diff ---'));
      console.log(p.unifiedDiff);
    }

    if (isApplied) {
      console.log(this.bold(this.green(`\n✔ Successfully applied ${proposals.length} patch(es) to disk.`)));
      console.log(this.gray('Run `shipshield verify` to re-scan and verify resolution.'));
    } else {
      console.log(this.yellow('\nℹ️  Dry-run complete. No files were modified.'));
      console.log(this.bold('To apply these changes, run with: ') + this.cyan('shipshield fix --apply'));
    }
  }
}
