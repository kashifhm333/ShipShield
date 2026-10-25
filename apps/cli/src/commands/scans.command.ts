import { Command } from 'commander';
import { EngineClient, getEnginePaths, JobStore } from '@shipshield/scan-core';
import { EXIT_CODES, JobStatus } from '@shipshield/contracts';

export function makeScansCommand(): Command {
  return new Command('scans')
    .description('List persistent local scan history and job statuses')
    .option('--project <path>', 'Filter scans by project path')
    .option('--status <status>', 'Filter scans by status (accepted, running, completed, policy_failed, incomplete, failed, cancelled)')
    .option('--limit <count>', 'Maximum number of scans to display', parseInt, 20)
    .option('--format <format>', 'Output format (text | json)', 'text')
    .action(async (options) => {
      const isJson = options.format === 'json';
      const paths = getEnginePaths();
      const client = new EngineClient(paths.socketPath);

      let jobs: any[] = [];

      if (await client.isEngineRunning(200)) {
        try {
          jobs = await client.listScans({
            projectRoot: options.project,
            status: options.status as JobStatus | undefined,
            limit: options.limit,
          });
        } catch (err: any) {
          console.error(`Error querying scans from engine: ${err.message}`);
          process.exit(EXIT_CODES.INTERNAL_ERROR);
          return;
        }
      } else {
        // Read directly from local SQLite database file
        const store = new JobStore(paths.dbPath);
        jobs = store.listJobs({
          projectRoot: options.project,
          status: options.status as JobStatus | undefined,
          limit: options.limit,
        });
        store.close();
      }

      if (isJson) {
        process.stdout.write(JSON.stringify(jobs, null, 2) + '\n');
        process.exit(EXIT_CODES.PASSED);
        return;
      }

      if (jobs.length === 0) {
        console.log('No scan records found in local history.');
        console.log(`\nRun your first scan:`);
        console.log(`  shipshield scan .`);
        process.exit(EXIT_CODES.PASSED);
        return;
      }

      console.log(`\n=== ShipShield Scan History (${jobs.length} scans) ===\n`);
      const headers = ['SCAN ID', 'STATUS', 'POLICY', 'CRIT', 'HIGH', 'CREATED', 'PROJECT'];
      console.log(
        headers[0]!.padEnd(32) +
        headers[1]!.padEnd(16) +
        headers[2]!.padEnd(16) +
        headers[3]!.padEnd(8) +
        headers[4]!.padEnd(8) +
        headers[5]!.padEnd(22) +
        headers[6]!
      );
      console.log('-'.repeat(110));

      for (const job of jobs) {
        const id = job.id.padEnd(32);
        const status = (job.status || 'unknown').padEnd(16);
        const policy = (job.policyOutcome || '-').padEnd(16);
        const crit = String(job.criticalCount ?? '-').padEnd(8);
        const high = String(job.highCount ?? '-').padEnd(8);
        const created = (job.createdAt ? job.createdAt.slice(0, 19).replace('T', ' ') : '-').padEnd(22);
        const proj = job.projectName || job.projectRoot;
        console.log(`${id}${status}${policy}${crit}${high}${created}${proj}`);
      }
      console.log('\nUse "shipshield status <scan-id>" or "shipshield results <scan-id>" for details.');
      process.exit(EXIT_CODES.PASSED);
    });
}
