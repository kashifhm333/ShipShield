import { Command } from 'commander';
import { EngineClient, getEnginePaths, JobStore } from '@shipshield/scan-core';
import { EXIT_CODES } from '@shipshield/contracts';

export function makeCancelCommand(): Command {
  return new Command('cancel')
    .description('Cancel an active or queued background scan job')
    .argument('<scan-id>', 'The scan ID to cancel')
    .action(async (scanId: string) => {
      const paths = getEnginePaths();
      const client = new EngineClient(paths.socketPath);

      if (await client.isEngineRunning(200)) {
        try {
          const res = await client.cancelScan(scanId);
          console.log(res.message);
          process.exit(EXIT_CODES.PASSED);
          return;
        } catch (err: any) {
          console.error(`Error requesting cancellation: ${err.message}`);
          process.exit(EXIT_CODES.INTERNAL_ERROR);
          return;
        }
      }

      // If engine is not running, update state in local DB
      const store = new JobStore(paths.dbPath);
      const res = store.cancelJob(scanId);
      store.close();

      console.log(res.message);
      process.exit(EXIT_CODES.PASSED);
    });
}
