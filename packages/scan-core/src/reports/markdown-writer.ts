import fs from 'node:fs';
import path from 'node:path';
import { ScanReport, ScanReportSchema } from '@shipshield/contracts';
import { PathValidator } from '../security/path-validator.js';

export class MarkdownReportWriter {
  /**
   * Generates a readable Markdown summary of the scan report.
   */
  public static generateMarkdown(report: ScanReport): string {
    const outcomeIcon =
      report.scan.policy_outcome === 'passed'
        ? 'PASSED'
        : report.scan.policy_outcome === 'policy_failed'
        ? 'POLICY FAILED'
        : 'INCOMPLETE';

    const lines: string[] = [
      `# ShipShield Security Gate Report`,
      ``,
      `**Scan ID:** \`${report.scan.id}\`  `,
      `**Status:** **${outcomeIcon}**  `,
      `**Execution Status:** \`${report.scan.execution_status}\`  `,
      `**Started:** \`${report.scan.started_at}\`  `,
      `**Completed:** \`${report.scan.completed_at}\`  `,
      ``,
      `---`,
      ``,
      `## 1. Executive Summary`,
      ``,
      `| Metric | Value |`,
      `|:---|:---|`,
      `| **Total Findings** | ${report.summary.findings_total} |`,
      `| **Critical** | ${report.summary.by_severity.critical} |`,
      `| **High** | ${report.summary.by_severity.high} |`,
      `| **Medium** | ${report.summary.by_severity.medium} |`,
      `| **Low** | ${report.summary.by_severity.low} |`,
      `| **Info** | ${report.summary.by_severity.info} |`,
      `| **Policy Violations** | ${report.summary.policy_violations} |`,
      ``,
      `---`,
      ``,
      `## 2. Scanner Execution Details`,
      ``,
      `| Scanner | Engine | Status | Duration | Findings |`,
      `|:---|:---|:---|:---|:---|`,
    ];

    for (const s of report.scanners) {
      lines.push(
        `| **${s.id}** | ${s.engine}${s.engine_version ? ` v${s.engine_version}` : ''} | \`${s.status}\` | ${s.duration_ms}ms | ${s.finding_count} |`
      );
    }

    if (report.policy.violations.length > 0) {
      lines.push(``, `---`, ``, `## 3. Policy Violations`, ``);
      for (const v of report.policy.violations) {
        lines.push(`- **[${v.rule_id}]** ${v.message} (\`${v.finding_id}\`)`);
      }
    }

    if (report.findings.length > 0) {
      lines.push(``, `---`, ``, `## 4. Findings`, ``);
      for (const f of report.findings) {
        lines.push(
          `### [${f.severity.toUpperCase()}] ${f.title} (\`${f.id}\`)`,
          `- **Category:** \`${f.category}\` | **Scanner:** \`${f.scanner}\` | **Rule:** \`${f.rule_id}\``,
          `- **Location:** \`${f.location.path}${f.location.start_line ? `:${f.location.start_line}` : ''}\``,
          `- **Status:** \`${f.status}\``,
          `- **Remediation:** ${f.remediation.summary} (Fix available: ${f.remediation.fix_available ? 'Yes' : 'No'})`,
          ``,
          `**Evidence:**`,
          '```',
          f.evidence.summary,
          '```',
          ``
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * Atomically writes the Markdown report to disk.
   */
  public static write(
    projectRoot: string,
    reportDir: string,
    report: ScanReport
  ): { reportPath: string; latestPath: string } {
    ScanReportSchema.parse(report);

    const resolvedReportDir = path.resolve(projectRoot, reportDir);
    PathValidator.validateContainment(projectRoot, resolvedReportDir);

    if (!fs.existsSync(resolvedReportDir)) {
      fs.mkdirSync(resolvedReportDir, { recursive: true, mode: 0o700 });
    }

    const timestamp = new Date(report.scan.started_at)
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('Z', 'Z');

    const fileName = `scan-${timestamp}-${report.scan.id}.md`;
    const finalReportPath = path.join(resolvedReportDir, fileName);
    const latestPath = path.join(resolvedReportDir, 'latest.md');

    const mdContent = this.generateMarkdown(report);

    // Atomic write
    const tmpFile = path.join(resolvedReportDir, `.tmp-scan-${report.scan.id}.md`);
    const fd = fs.openSync(tmpFile, 'w', 0o600);
    try {
      fs.writeSync(fd, mdContent, 0, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpFile, finalReportPath);

    // Atomic write latest.md
    const tmpLatest = path.join(resolvedReportDir, `.tmp-latest-${report.scan.id}.md`);
    const fdLatest = fs.openSync(tmpLatest, 'w', 0o600);
    try {
      fs.writeSync(fdLatest, mdContent, 0, 'utf8');
      fs.fsyncSync(fdLatest);
    } finally {
      fs.closeSync(fdLatest);
    }
    fs.renameSync(tmpLatest, latestPath);

    return {
      reportPath: finalReportPath,
      latestPath,
    };
  }
}
