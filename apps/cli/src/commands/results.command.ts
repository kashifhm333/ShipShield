import { Command } from 'commander';
import fs from 'node:fs';
import { EngineClient, getEnginePaths, JobStore } from '@shipshield/scan-core';
import { EXIT_CODES } from '@shipshield/contracts';
import { TerminalPresenter } from '../presenter/terminal-presenter.js';

export function makeResultsCommand(): Command {
  return new Command('results')
    .description('View detailed security findings and report for a completed scan')
    .argument('[scan-id]', 'Scan ID to view results for')
    .option('--latest', 'Show results for the most recent scan')
    .option('--format <format>', 'Output format (text | json)')
    .action(async (scanId: string | undefined, options, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = (options.format || globalOpts.format) === 'json';
      const presenter = new TerminalPresenter(globalOpts.noColor);

      if (!scanId && !options.latest) {
        console.error('Usage Error: Must specify a scan ID or use --latest.');
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      const paths = getEnginePaths();
      const client = new EngineClient(paths.socketPath);

      let resultData: any = null;

      if (await client.isEngineRunning(200)) {
        try {
          resultData = await client.getResults(scanId);
        } catch {
          // Fall through
        }
      }

      if (!resultData) {
        const store = new JobStore(paths.dbPath);
        const job = options.latest ? store.getLatestJob() : store.getJob(scanId!);
        store.close();

        if (!job) {
          console.error(`Report Error: No scan results found.`);
          process.exit(EXIT_CODES.REPORT_ERROR);
          return;
        }

        let report = null;
        if (job.reportPath && fs.existsSync(job.reportPath)) {
          try {
            report = JSON.parse(fs.readFileSync(job.reportPath, 'utf8'));
          } catch {
            // Ignored
          }
        }
        resultData = { job, report };
      }

      if (!resultData || (!resultData.report && !resultData.job)) {
        console.error(`Report Error: Scan report could not be loaded.`);
        process.exit(EXIT_CODES.REPORT_ERROR);
        return;
      }

      if (isJson) {
        process.stdout.write(JSON.stringify(resultData.report || resultData.job, null, 2) + '\n');
        process.exit(EXIT_CODES.PASSED);
        return;
      }

      if (resultData.report) {
        presenter.renderReport(resultData.report);
      } else {
        const job = resultData.job;
        console.log(`\n=== Scan Result: ${job.id} ===`);
        console.log(`Status:  ${job.status.toUpperCase()}`);
        console.log(`Policy:  ${(job.policyOutcome || 'UNKNOWN').toUpperCase()}`);
        console.log(`Total Findings: ${job.findingsCount ?? 0} (Critical: ${job.criticalCount ?? 0}, High: ${job.highCount ?? 0})`);
      }

      process.exit(EXIT_CODES.PASSED);
    });
}
