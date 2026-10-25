import { Command } from 'commander';
import {
  outcomeToExitCode,
  ScannerId,
  Severity,
  EXIT_CODES,
} from '@shipshield/contracts';
import {
  ProjectRootResolver,
  ConfigLoader,
  ScanOrchestrator,
  AdapterRegistry,
  EngineClient,
} from '@shipshield/scan-core';
import {
  GitleaksAdapter,
  TrivyDependenciesAdapter,
  TrivyContainersAdapter,
  CheckovAdapter,
} from '@shipshield/scanner-adapters';
import { TerminalPresenter } from '../presenter/terminal-presenter.js';

export function makePlanCommand(): Command {
  return new Command('plan')
    .description('Run configured security scanners, evaluate policy, and generate reports')
    .option('--scanner <name...>', 'Run only specified scanners (secrets, dependencies, containers, iac)')
    .option('--severity <level>', 'Minimum severity to display')
    .option('--offline', 'Force offline mode for dependency scanner')
    .option('--timeout <sec>', 'Execution timeout per scanner in seconds', parseInt)
    .option('--jobs <count>', 'Maximum parallel scanners to execute', parseInt)
    .option('--fail-on <level...>', 'Severities that trigger policy failure')
    .option('--report <path>', 'Custom report directory')
    .option('--no-report', 'Do not write reports to disk')
    .option('--list-scanners', 'List available scanners and their system availability')
    .action(async (options, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = globalOpts.format === 'json';
      const presenter = new TerminalPresenter(globalOpts.noColor);

      const VALID_SCANNERS: readonly ScannerId[] = ['secrets', 'dependencies', 'containers', 'iac'];

      if (options.scanner) {
        const scannerList = Array.isArray(options.scanner) ? options.scanner : [options.scanner];
        for (const s of scannerList) {
          if (!VALID_SCANNERS.includes(s as ScannerId)) {
            console.error(`Usage Error: Unknown scanner "${s}". Valid options are: ${VALID_SCANNERS.join(', ')}`);
            process.exit(EXIT_CODES.USAGE_ERROR);
            return;
          }
        }
      }

      if (options.jobs !== undefined && (isNaN(options.jobs) || options.jobs <= 0)) {
        console.error('Usage Error: --jobs must be a positive integer.');
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      if (options.timeout !== undefined && (isNaN(options.timeout) || options.timeout <= 0)) {
        console.error('Usage Error: --timeout must be a positive integer in seconds.');
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      const registry = new AdapterRegistry();
      registry.register(new GitleaksAdapter());
      registry.register(new TrivyDependenciesAdapter());
      registry.register(new TrivyContainersAdapter());
      registry.register(new CheckovAdapter());

      if (options.listScanners) {
        console.log('Available security scanners:');
        for (const adapter of registry.getAll()) {
          const avail = await adapter.checkAvailability();
          const status = avail.available ? `AVAILABLE (${avail.version})` : `MISSING (${avail.error})`;
          console.log(`- ${adapter.id.padEnd(14)}: ${status}`);
        }
        process.exit(EXIT_CODES.PASSED);
      }

      let projectRoot: string;
      try {
        projectRoot = ProjectRootResolver.resolve(globalOpts.projectDir);
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Configuration Error: ${error.message}`);
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
      }

      // Check if background engine is available
      const engineClient = new EngineClient();
      let isEngineActive = false;
      try {
        isEngineActive = await engineClient.isEngineRunning(200);
      } catch {
        isEngineActive = false;
      }

      if (isEngineActive) {
        if (!isJson && !globalOpts.quiet) {
          presenter.printBanner();
          console.error(`⚡ Connected to ShipShield Background Engine (fast mode)`);
          console.error(`Scanning project at: ${projectRoot}`);
        }

        try {
          const result = await engineClient.runPlan({
            projectRoot,
            scanners: options.scanner as ScannerId[] | undefined,
            failOn: options.failOn as Severity[] | undefined,
            offline: options.offline,
            timeoutSeconds: options.timeout,
            jobs: options.jobs,
            writeReports: options.report !== false,
          });

          if (isJson) {
            process.stdout.write(JSON.stringify(result.report, null, 2) + '\n');
          } else if (!globalOpts.quiet) {
            presenter.renderReport(result.report);
          }

          process.exit(result.exitCode);
          return;
        } catch (err: unknown) {
          if (!isJson && !globalOpts.quiet) {
            console.error(`Engine scan error: ${(err as Error).message}. Falling back to local runner...`);
          }
        }
      }

      let config;
      try {
        config = ConfigLoader.load(projectRoot, globalOpts.config, {
          failOn: options.failOn as Severity[] | undefined,
          timeoutSeconds: options.timeout,
          maxParallelScanners: options.jobs,
          reportDir: options.report,
          network: options.offline ? 'deny' : undefined,
        });
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Configuration Error: ${error.message}`);
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
      }

      if (!isJson && !globalOpts.quiet) {
        presenter.printBanner();
        console.error(`Scanning project at: ${projectRoot}`);
        console.error(`ℹ Tip: Run 'shipshield engine start' to accelerate scans via background daemon.`);
      }

      try {
        const result = await ScanOrchestrator.run({
          projectRoot,
          config,
          adapters: registry,
          selectedScanners: options.scanner as ScannerId[] | undefined,
          offline: options.offline,
          writeReports: options.report !== false,
        });

        if (isJson) {
          // Invariant: stdout MUST contain ONLY valid JSON with zero extra terminal lines
          process.stdout.write(JSON.stringify(result.report, null, 2) + '\n');
        } else if (!globalOpts.quiet) {
          presenter.renderReport(result.report);
        }

        const exitCode = outcomeToExitCode(result.report.scan.policy_outcome);
        process.exit(exitCode);
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Internal Scan Error: ${error.message}`);
        process.exit(EXIT_CODES.INTERNAL_ERROR);
      }
    });
}
