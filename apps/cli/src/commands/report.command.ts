import { Command } from 'commander';
import { EXIT_CODES, Severity } from '@shipshield/contracts';
import {
  ProjectRootResolver,
  ReportReader,
  SarifFormatter,
} from '@shipshield/scan-core';
import { TerminalPresenter } from '../presenter/terminal-presenter.js';

export function makeReportCommand(): Command {
  return new Command('report')
    .description('Inspect and display security scan reports')
    .argument('[scan-id-or-path]', 'Scan ID or path to JSON report file (defaults to latest)')
    .option('--latest', 'Show the latest scan report (default)')
    .option('--severity <level>', 'Filter findings by minimum severity (critical, high, medium, low, info)')
    .option('--scanner <name>', 'Filter findings by scanner category')
    .option('--format <format>', 'Output format: text, json, or sarif', 'text')
    .action(async (scanIdOrPath, options, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();
      const format = options.format || globalOpts.format || 'text';
      const presenter = new TerminalPresenter(globalOpts.noColor);

      let projectRoot: string;
      try {
        projectRoot = ProjectRootResolver.resolve(globalOpts.projectDir);
      } catch (err: unknown) {
        console.error(`Configuration Error: ${(err as Error).message}`);
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
        return;
      }

      let reportData: { report: any; filePath: string };
      const reportDir = globalOpts.reportDir || '.shipshield/reports';
      try {
        const target = scanIdOrPath || (options.latest ? 'latest' : 'latest');
        reportData = ReportReader.read(projectRoot, reportDir, target);
      } catch (err: unknown) {
        console.error(`Report Error: ${(err as Error).message}`);
        process.exit(EXIT_CODES.REPORT_ERROR);
        return;
      }

      const report = reportData.report;

      // Filter findings if requested
      if (options.scanner) {
        report.findings = report.findings.filter((f: any) => f.category === options.scanner);
      }
      if (options.severity) {
        report.findings = report.findings.filter(
          (f: any) => f.severity.toLowerCase() === options.severity.toLowerCase()
        );
      }

      if (format === 'sarif') {
        const sarifDoc = SarifFormatter.format(report);
        process.stdout.write(JSON.stringify(sarifDoc, null, 2) + '\n');
        process.exit(EXIT_CODES.PASSED);
        return;
      }

      if (format === 'json') {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        process.exit(EXIT_CODES.PASSED);
        return;
      }

      presenter.renderReport(report);
      process.exit(EXIT_CODES.PASSED);
    });
}
