import { Worker, Job } from 'bullmq';
import { ScanJobProcessor, ScanJobPayload } from './scan-job.processor.js';

export function startWorker(redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379'): Worker {
  console.log(`Starting ShipShield BullMQ Worker connected to ${redisUrl}...`);

  const worker = new Worker(
    'scan_jobs',
    async (job: Job<ScanJobPayload>) => {
      console.log(`[Job ${job.id}] Processing scan job for scan ${job.data.scan_id}`);
      const report = await ScanJobProcessor.process(job.data);
      console.log(`[Job ${job.id}] Completed scan ${job.data.scan_id} with outcome: ${report.scan.policy_outcome}`);
      return report;
    },
    {
      connection: {
        url: redisUrl,
      },
      concurrency: 2,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[Job ${job?.id}] Failed with error:`, err);
  });

  return worker;
}

if (process.argv[1] && (process.argv[1].endsWith('worker.ts') || process.argv[1]?.endsWith('worker.js'))) {
  startWorker();
}
