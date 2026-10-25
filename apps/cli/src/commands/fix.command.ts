import { Command } from 'commander';
import { EXIT_CODES } from '@shipshield/contracts';
import {
  ProjectRootResolver,
  ConfigLoader,
  ReportReader,
  FixRegistry,
  DockerfileNonRootHandler,
  TerraformS3PublicAccessHandler,
  RemediationEngine,
  FixExecutionError,
} from '@shipshield/scan-core';
import { TerminalPresenter } from '../presenter/terminal-presenter.js';

export function makeFixCommand(): Command {
  return new Command('fix')
    .description('Plan and apply automated remediations for supported security findings')
    .argument('[finding-ids...]', 'Specific finding IDs to fix')
    .option('--all', 'Plan fixes for all applicable findings in the report')
    .option('--dry-run', 'Preview proposed file modifications as unified diffs without modifying files (default)')
    .option('--apply', 'Explicitly apply planned patches to project source files')
    .option('--scanner <name>', 'Filter findings by scanner category')
    .option('--report <path>', 'Path to scan report to base remediation on (defaults to latest)')
    .option('--yes', 'Bypass interactive confirmation prompt when applying fixes')
    .action(async (findingIds: string[], options, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();
      const presenter = new TerminalPresenter(globalOpts.noColor);

      const VALID_SCANNERS = ['secrets', 'dependencies', 'containers', 'iac'];
      if (options.scanner && !VALID_SCANNERS.includes(options.scanner)) {
        console.error(`Usage Error: Unknown scanner "${options.scanner}". Valid options are: ${VALID_SCANNERS.join(', ')}`);
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      // Invariant: Mutual exclusion between --dry-run and --apply
      if (options.dryRun && options.apply) {
        console.error('Usage Error: Cannot pass both --dry-run and --apply simultaneously.');
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      // Invariant: Must provide either explicit finding IDs or --all
      const hasFindingIds = Boolean(findingIds && findingIds.length > 0);
      if (!hasFindingIds && !options.all) {
        console.error('Usage Error: Must specify at least one finding ID or pass --all.');
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      // Invariant: Mutual exclusion between explicit finding IDs and --all
      if (hasFindingIds && options.all) {
        console.error('Usage Error: Explicit finding IDs and --all are mutually exclusive.');
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      // Invariant: Default to --dry-run. --yes MUST NOT substitute for --apply
      const isApply = Boolean(options.apply);

      // Invariant: Applying changes requires explicit confirmation
      if (isApply && !options.yes) {
        if (globalOpts.nonInteractive || !process.stdin.isTTY) {
          console.error('Usage Error: In non-interactive mode, applying fixes with --apply requires --yes confirmation.');
          process.exit(EXIT_CODES.USAGE_ERROR);
          return;
        }
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

      let report;
      try {
        const readResult = ReportReader.read(
          projectRoot,
          config.reports.directory,
          options.report || 'latest'
        );
        report = readResult.report;
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Report Error: Cannot load scan report: ${error.message}`);
        process.exit(EXIT_CODES.REPORT_ERROR);
      }

      // Setup registry with supported handlers
      const registry = new FixRegistry();
      registry.register(new DockerfileNonRootHandler());
      registry.register(new TerraformS3PublicAccessHandler());

      let targetFindings = report.findings;
      if (options.scanner) {
        targetFindings = targetFindings.filter((f) => f.category === options.scanner);
      }

      try {
        const proposals = await RemediationEngine.planFixes({
          projectRoot,
          findings: targetFindings,
          registry,
          findingIds: findingIds && findingIds.length > 0 ? findingIds : undefined,
        });

        if (proposals.length === 0) {
          console.log('No automated remediation proposals available for the specified findings.');
          process.exit(EXIT_CODES.PASSED);
        }

        const applyResult = await RemediationEngine.applyFixes({
          projectRoot,
          proposals,
          dryRun: !isApply,
          apply: isApply,
        });

        presenter.renderProposals(applyResult.proposals, isApply);
        process.exit(EXIT_CODES.PASSED);
      } catch (err: unknown) {
        if (err instanceof FixExecutionError) {
          console.error(`Fix Error [${err.code}]: ${err.message}`);
          process.exit(err.exitCode);
        }
        const error = err as Error;
        console.error(`Fix Error: ${error.message}`);
        process.exit(EXIT_CODES.FIX_ERROR);
      }
    });
}
