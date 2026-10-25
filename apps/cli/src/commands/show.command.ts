import { Command } from 'commander';
import { EXIT_CODES, Severity } from '@shipshield/contracts';
import {
  ProjectRootResolver,
  ConfigLoader,
  ReportReader,
} from '@shipshield/scan-core';
import { TerminalPresenter } from '../presenter/terminal-presenter.js';

export function makeShowCommand(): Command {
  return new Command('show')
    .description('Inspect an existing ShipShield scan report without running scanners')
    .argument('[scan-id-or-path]', 'Scan ID or path to JSON report file (defaults to latest)')
    .option('--latest', 'Explicitly show the latest scan report')
    .option('--severity <level>', 'Filter findings by severity')
    .option('--scanner <name>', 'Filter findings by scanner category')
    .option('--limit <count>', 'Limit number of displayed findings', parseInt)
    .action(async (scanIdOrPath, options, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = globalOpts.format === 'json';
      const presenter = new TerminalPresenter(globalOpts.noColor);

      const VALID_SCANNERS = ['secrets', 'dependencies', 'containers', 'iac'];
      if (options.scanner && !VALID_SCANNERS.includes(options.scanner)) {
        console.error(`Usage Error: Unknown scanner "${options.scanner}". Valid options are: ${VALID_SCANNERS.join(', ')}`);
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
      if (options.severity && !VALID_SEVERITIES.includes(options.severity)) {
        console.error(`Usage Error: Unknown severity "${options.severity}". Valid options are: ${VALID_SEVERITIES.join(', ')}`);
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      if (options.limit !== undefined && (isNaN(options.limit) || options.limit < 0)) {
        console.error('Usage Error: --limit must be a non-negative integer.');
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      let projectRoot: string;
      try {
        projectRoot = ProjectRootResolver.resolve(globalOpts.projectDir);
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Configuration Error: ${error.message}`);
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
      }

      let config;
      try {
        config = ConfigLoader.load(projectRoot, globalOpts.config);
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Configuration Error: ${error.message}`);
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
      }

      try {
        const target = options.latest ? 'latest' : scanIdOrPath || 'latest';
        const { report } = ReportReader.read(
          projectRoot,
          config.reports.directory,
          target
        );

        let filteredFindings = [...report.findings];
        if (options.severity) {
          filteredFindings = filteredFindings.filter((f) => f.severity === options.severity);
        }
        if (options.scanner) {
          filteredFindings = filteredFindings.filter((f) => f.category === options.scanner);
        }
        if (options.limit && options.limit > 0) {
          filteredFindings = filteredFindings.slice(0, options.limit);
        }

        const filteredReport = {
          ...report,
          findings: filteredFindings,
        };

        if (isJson) {
          process.stdout.write(JSON.stringify(filteredReport, null, 2) + '\n');
        } else {
          presenter.renderReport(filteredReport);
        }

        process.exit(EXIT_CODES.PASSED);
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Report Error: ${error.message}`);
        process.exit(EXIT_CODES.REPORT_ERROR);
      }
    });
}
