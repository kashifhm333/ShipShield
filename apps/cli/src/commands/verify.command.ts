import { Command } from 'commander';
import { EXIT_CODES, ScannerId } from '@shipshield/contracts';
import {
  ProjectRootResolver,
  ConfigLoader,
  ReportReader,
  VerificationEngine,
  AdapterRegistry,
} from '@shipshield/scan-core';
import {
  GitleaksAdapter,
  TrivyDependenciesAdapter,
  TrivyContainersAdapter,
  CheckovAdapter,
} from '@shipshield/scanner-adapters';
import { TerminalPresenter } from '../presenter/terminal-presenter.js';

export function makeVerifyCommand(): Command {
  return new Command('verify')
    .description('Verify whether applied fixes successfully resolved previously detected findings')
    .option('--before <id-or-path>', 'Baseline report to compare against (defaults to latest)')
    .option('--after <id-or-path>', 'Existing post-fix report (runs fresh scan if omitted)')
    .option('--scanner <name...>', 'Restrict verification scan to specified scanners')
    .action(async (options, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();
      const presenter = new TerminalPresenter(globalOpts.noColor);

      const VALID_SCANNERS: readonly string[] = ['secrets', 'dependencies', 'containers', 'iac'];
      if (options.scanner) {
        const scannerList = Array.isArray(options.scanner) ? options.scanner : [options.scanner];
        for (const s of scannerList) {
          if (!VALID_SCANNERS.includes(s)) {
            console.error(`Usage Error: Unknown scanner "${s}". Valid options are: ${VALID_SCANNERS.join(', ')}`);
            process.exit(EXIT_CODES.USAGE_ERROR);
            return;
          }
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

      let baselineReport;
      try {
        const readResult = ReportReader.read(
          projectRoot,
          config.reports.directory,
          options.before || 'latest'
        );
        baselineReport = readResult.report;
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Report Error: Cannot load baseline report: ${error.message}`);
        process.exit(EXIT_CODES.REPORT_ERROR);
      }

      const registry = new AdapterRegistry();
      registry.register(new GitleaksAdapter());
      registry.register(new TrivyDependenciesAdapter());
      registry.register(new TrivyContainersAdapter());
      registry.register(new CheckovAdapter());

      try {
        const verifyResult = await VerificationEngine.verify(baselineReport, {
          projectRoot,
          config,
          adapters: registry,
          selectedScanners: options.scanner as ScannerId[] | undefined,
        });

        console.log(presenter.bold('\n=== ShipShield Verification Delta ==='));
        console.log(`Resolved findings:    ${presenter.green(String(verifyResult.resolvedFindings.length))}`);
        console.log(`Remaining findings:   ${presenter.red(String(verifyResult.remainingFindings.length))}`);
        console.log(`Unverified findings:  ${presenter.yellow(String(verifyResult.unverifiedFindings.length))}`);

        if (verifyResult.unverifiedFindings.length > 0) {
          console.log(
            presenter.yellow(
              '\n⚠️  Some findings could not be verified because their scanner did not complete cleanly.'
            )
          );
        }

        if (verifyResult.verificationOutcome === 'passed') {
          console.log(presenter.bold(presenter.green('\n✔ Verification PASSED: All target findings resolved.')));
        } else if (verifyResult.verificationOutcome === 'incomplete') {
          console.log(presenter.bold(presenter.yellow('\n⚠️  Verification INCOMPLETE: Scanner failed or timed out.')));
        } else {
          console.log(presenter.bold(presenter.red('\n❌ Verification FAILED: Unresolved findings remain.')));
        }

        process.exit(verifyResult.exitCode);
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Verification Error: ${error.message}`);
        process.exit(EXIT_CODES.INTERNAL_ERROR);
      }
    });
}
