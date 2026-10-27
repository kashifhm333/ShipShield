import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import {
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
  IntelligenceManager,
} from '@shipshield/scan-core';
import {
  GitleaksAdapter,
  TrivyDependenciesAdapter,
  TrivyContainersAdapter,
  CheckovAdapter,
} from '@shipshield/scanner-adapters';
import { TerminalPresenter } from '../presenter/terminal-presenter.js';

export function makeScanCommand(): Command {
  return new Command('scan')
    .description('Execute a security scan on a project path via the ShipShield Engine')
    .argument('[path]', 'Project workspace path to scan (defaults to current directory)', '.')
    .option('--scanner <name...>', 'Run only specified scanners (secrets, dependencies, containers, iac)')
    .option('--fail-on <level...>', 'Severities that trigger policy failure (critical, high, medium, low)')
    .option('--offline', 'Force offline mode for dependency scanner')
    .option('--timeout <sec>', 'Execution timeout per scanner in seconds', parseInt)
    .option('--jobs <count>', 'Maximum parallel scanners to execute', parseInt)
    .option('--format <format>', 'Output format (text | json)')
    .option('--output <path>', 'Write scan report to specified file path')
    .option('--show-db-status', 'Display vulnerability database status and freshness before scan')
    .option('--require <name...>', 'Require specified scanners to execute and complete (secrets, dependencies, containers, iac)')
    .option('--max-db-age <days>', 'Maximum database age in days before warning or failing on stale intelligence', parseInt)
    .option('--detach', 'Submit scan asynchronously to engine and return scan ID immediately')
    .option('--no-report', 'Do not write reports to disk')
    .action(async (targetPath: string, options, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = (options.format || globalOpts.format) === 'json';
      const presenter = new TerminalPresenter(globalOpts.noColor);

      let projectRoot: string;
      try {
        projectRoot = ProjectRootResolver.resolve(targetPath);
      } catch (err: unknown) {
        console.error(`Configuration Error: ${(err as Error).message}`);
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
        return;
      }

      const client = new EngineClient();
      let isEngineActive = false;
      try {
        isEngineActive = await client.isEngineRunning(200);
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
          const result = await client.submitScan({
            projectRoot,
            scanners: options.scanner as ScannerId[] | undefined,
            failOn: options.failOn as Severity[] | undefined,
            offline: options.offline,
            timeoutSeconds: options.timeout,
            jobs: options.jobs,
            writeReports: options.report !== false,
            detach: options.detach,
          });

          if (options.detach) {
            if (isJson) {
              process.stdout.write(JSON.stringify(result, null, 2) + '\n');
            } else {
              console.log(`✔ Scan job submitted in background.`);
              console.log(`  Scan ID: ${result.scanId}`);
              console.log(`\nTo check progress or view results:`);
              console.log(`  shipshield status ${result.scanId}`);
              console.log(`  shipshield results ${result.scanId}`);
            }
            process.exit(EXIT_CODES.PASSED);
            return;
          }

          if (isJson) {
            process.stdout.write(JSON.stringify(result.report, null, 2) + '\n');
          } else if (!globalOpts.quiet) {
            presenter.renderReport(result.report);
          }

          process.exit(result.exitCode);
          return;
        } catch (err: unknown) {
          if (!isJson && !globalOpts.quiet) {
            console.error(`Engine scan error: ${(err as Error).message}. Falling back to standalone runner...`);
          }
        }
      }

      // Standalone execution if engine is offline
      if (options.detach) {
        console.error('Error: --detach requires the background engine to be running.');
        console.error('Start the engine first: shipshield engine start');
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      const registry = new AdapterRegistry();
      registry.register(new GitleaksAdapter());
      registry.register(new TrivyDependenciesAdapter());
      registry.register(new TrivyContainersAdapter());
      registry.register(new CheckovAdapter());

      let config;
      try {
        config = ConfigLoader.load(projectRoot, globalOpts.config, {
          failOn: options.failOn as Severity[] | undefined,
          timeoutSeconds: options.timeout,
          maxParallelScanners: options.jobs,
          reportDir: globalOpts.reportDir,
          network: options.offline ? 'deny' : undefined,
        });
      } catch (err: unknown) {
        console.error(`Configuration Error: ${(err as Error).message}`);
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
        return;
      }

      if (!isJson && !globalOpts.quiet) {
        presenter.printBanner();
        console.error(`Scanning project at: ${projectRoot}`);
        console.error(`ℹ Tip: Run 'shipshield engine start' to accelerate scans via background daemon.`);
      }

      if (options.showDbStatus && !isJson && !globalOpts.quiet) {
        const readiness = await IntelligenceManager.getReadinessReport(config);
        console.log('\n🛡️  Vulnerability Intelligence & Database Status:');
        for (const [id, intel] of Object.entries(readiness.scanners)) {
          if (intel.databaseRequired) {
            console.log(
              `  • ${id.padEnd(14)}: ${intel.freshness.toUpperCase()} (version: ${intel.databaseVersion || 'unknown'}, age: ${intel.databaseAgeDays !== null ? `${intel.databaseAgeDays}d` : 'unknown'})`
            );
          } else {
            console.log(`  • ${id.padEnd(14)}: LOCAL RULES (offline ready)`);
          }
        }
        console.log('');
      }

      try {
        const result = await ScanOrchestrator.run({
          projectRoot,
          config,
          adapters: registry,
          selectedScanners: options.scanner as ScannerId[] | undefined,
          offline: options.offline,
          writeReports: options.report !== false,
          requireScanners: options.require as ScannerId[] | undefined,
          maxDbAgeDays: options.maxDbAge,
        });

        if (isJson) {
          process.stdout.write(JSON.stringify(result.report, null, 2) + '\n');
        } else if (!globalOpts.quiet) {
          presenter.renderReport(result.report);
        }

        // Handle explicit --output file writing
        if (options.output) {
          const outputPath = path.resolve(process.cwd(), options.output);
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          const contentToWrite = isJson
            ? JSON.stringify(result.report, null, 2) + '\n'
            : result.markdownReportPath && fs.existsSync(result.markdownReportPath)
              ? fs.readFileSync(result.markdownReportPath, 'utf8')
              : JSON.stringify(result.report, null, 2) + '\n';
          fs.writeFileSync(outputPath, contentToWrite, 'utf8');
        }

        const isPolicyFail = result.report.scan.policy_outcome === 'policy_failed';
        const isIncomplete = result.report.scan.policy_outcome === 'incomplete';

        if (isPolicyFail) {
          process.exit(EXIT_CODES.POLICY_FAILED);
        } else if (isIncomplete) {
          const hasMissingRequired = options.require && (options.require as string[]).some((reqId) => {
            const sc = result.report.scanners.find((s) => s.id === reqId);
            return !sc || sc.status !== 'completed';
          });
          const hasMissingDb = result.report.scanners.some((s) => s.db_status === 'missing' || s.db_status === 'invalid');
          if (hasMissingRequired) {
            process.exit(EXIT_CODES.REQUIRED_SCANNER_UNAVAILABLE);
          } else if (hasMissingDb && options.offline) {
            process.exit(EXIT_CODES.DATABASE_ERROR);
          } else {
            process.exit(EXIT_CODES.INCOMPLETE);
          }
        } else {
          process.exit(EXIT_CODES.PASSED);
        }
      } catch (err: unknown) {
        console.error(`Internal Scan Error: ${(err as Error).message}`);
        process.exit(EXIT_CODES.INTERNAL_ERROR);
      }
    });
}
