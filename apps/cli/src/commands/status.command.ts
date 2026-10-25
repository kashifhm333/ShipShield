import { Command } from 'commander';
import { EngineClient, getEnginePaths, JobStore } from '@shipshield/scan-core';
import { EXIT_CODES } from '@shipshield/contracts';

export function makeStatusCommand(): Command {
  return new Command('status')
    .description('Display detailed status and execution metrics for a specific scan job')
    .argument('<scan-id>', 'The unique identifier of the scan (e.g. scan_...)')
    .option('--format <format>', 'Output format (text | json)', 'text')
    .action(async (scanId: string, options) => {
      const isJson = options.format === 'json';
      const paths = getEnginePaths();
      const client = new EngineClient(paths.socketPath);

      let job: any = null;

      if (await client.isEngineRunning(200)) {
        try {
          job = await client.getScan(scanId);
        } catch {
          // Fall through to local db
        }
      }

      if (!job) {
        const store = new JobStore(paths.dbPath);
        job = store.getJob(scanId);
        store.close();
      }

      if (!job) {
        console.error(`Error: Scan job "${scanId}" not found in local history.`);
        process.exit(EXIT_CODES.REPORT_ERROR);
        return;
      }

      if (isJson) {
        process.stdout.write(JSON.stringify(job, null, 2) + '\n');
        process.exit(EXIT_CODES.PASSED);
        return;
      }

      console.log(`\n=== ShipShield Scan Job Status ===`);
      console.log(`Scan ID:        ${job.id}`);
      console.log(`Status:         ${job.status.toUpperCase()}`);
      console.log(`Project:        ${job.projectName || job.projectRoot}`);
      console.log(`Location:       ${job.projectRoot}`);
      console.log(`Created:        ${job.createdAt}`);
      console.log(`Completed:      ${job.completedAt || 'In progress / running'}`);
      console.log(`Scanners:       ${job.scanners.join(', ')}`);

      if (job.policyOutcome) {
        console.log(`Policy Outcome: ${job.policyOutcome.toUpperCase()}`);
        console.log(`Findings Total: ${job.findingsCount ?? 0} (Critical: ${job.criticalCount ?? 0}, High: ${job.highCount ?? 0})`);
      }

      if (job.failureReason) {
        console.log(`Failure Reason: ${job.failureReason}`);
      }

      if (job.reportPath) {
        console.log(`Report Artifact: ${job.reportPath}`);
      }

      console.log('');
      process.exit(EXIT_CODES.PASSED);
    });
}
