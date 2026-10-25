import crypto from 'node:crypto';
import {
  ProjectConfigSchema,
  ScanReport,
} from '@shipshield/contracts';
import {
  ScanOrchestrator,
  AdapterRegistry,
} from '@shipshield/scan-core';
import {
  GitleaksAdapter,
  TrivyDependenciesAdapter,
  TrivyContainersAdapter,
  CheckovAdapter,
} from '@shipshield/scanner-adapters';
import { WorkspaceSandbox } from './workspace-sandbox.js';

export interface ScanJobPayload {
  scan_id: string;
  organization_id: string;
  repository_id: string;
  commit_sha: string;
  repo_url?: string;
  local_path?: string;
  api_callback_url?: string;
  internal_hmac_secret?: string;
}

export class ScanJobProcessor {
  public static async process(job: ScanJobPayload): Promise<ScanReport> {
    const sandbox = new WorkspaceSandbox(job.scan_id);
    await sandbox.setup();

    try {
      const targetDir = job.local_path || sandbox.path;

      if (job.repo_url && !job.local_path) {
        await sandbox.shallowCheckout(job.repo_url, job.commit_sha);
      }

      const registry = new AdapterRegistry();
      registry.register(new GitleaksAdapter());
      registry.register(new TrivyDependenciesAdapter());
      registry.register(new TrivyContainersAdapter());
      registry.register(new CheckovAdapter());

      const config = ProjectConfigSchema.parse({ schema_version: 1 });

      const result = await ScanOrchestrator.run({
        projectRoot: targetDir,
        config,
        adapters: registry,
        writeReports: false,
      });

      // Post back to API if callback is specified
      if (job.api_callback_url && job.internal_hmac_secret) {
        const body = JSON.stringify({
          organization_id: job.organization_id,
          repository_id: job.repository_id,
          report: result.report,
        });

        const signature = crypto
          .createHmac('sha256', job.internal_hmac_secret)
          .update(Buffer.from(body))
          .digest('hex');

        await fetch(job.api_callback_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Worker-Signature': signature,
          },
          body,
        });
      }

      return result.report;
    } finally {
      await sandbox.teardown();
    }
  }
}
