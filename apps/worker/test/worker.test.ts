import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceSandbox } from '../src/workspace-sandbox.js';
import { ScanJobProcessor } from '../src/scan-job.processor.js';
import { ProcessRunner } from '@shipshield/scan-core';

describe('Worker and Workspace Sandbox Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('WorkspaceSandbox', () => {
    it('creates isolated directory and removes it on teardown', async () => {
      const sandbox = new WorkspaceSandbox('test1234');
      await sandbox.setup();
      expect(fs.existsSync(sandbox.path)).toBe(true);

      await sandbox.teardown();
      expect(fs.existsSync(sandbox.path)).toBe(false);
    });

    it('shallowCheckout invokes git commands safely without arbitrary execution', async () => {
      const sandbox = new WorkspaceSandbox('testcheckout');
      const runSpy = vi.spyOn(ProcessRunner, 'run').mockResolvedValue({
        exitCode: 0,
        signal: null,
        stdout: '',
        stderr: '',
        durationMs: 10,
        timedOut: false,
        bufferOverflowed: false,
      });

      await sandbox.shallowCheckout('https://github.com/org/repo.git', 'a1b2c3d4e5');

      expect(runSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          executable: 'git',
          args: ['init'],
        })
      );
      expect(runSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          executable: 'git',
          args: ['remote', 'add', 'origin', 'https://github.com/org/repo.git'],
        })
      );
      expect(runSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          executable: 'git',
          args: expect.arrayContaining(['fetch', '--depth', '1', 'origin', 'a1b2c3d4e5']),
        })
      );
      expect(runSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          executable: 'git',
          args: ['checkout', 'FETCH_HEAD'],
        })
      );

      await sandbox.teardown();
    });
  });

  describe('ScanJobProcessor', () => {
    it('executes scan for a local project directory and posts HMAC callback if requested', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-job-test-'));
      fs.writeFileSync(path.join(tempDir, 'index.js'), 'console.log("hello");\n');

      let postedBody = '';
      let postedSignature = '';
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url, init) => {
        postedBody = init.body;
        postedSignature = init.headers['X-Worker-Signature'];
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      });

      try {
        const report = await ScanJobProcessor.process({
          scan_id: 'scan_0123456789job01',
          organization_id: 'org_test_123',
          repository_id: 'repo_test_123',
          commit_sha: 'commit1234567890',
          local_path: tempDir,
          api_callback_url: 'http://localhost:3000/api/v1/internal/scans/scan_0123456789job01/complete',
          internal_hmac_secret: 'secret-hmac-key',
        });

        expect(report.schema_version).toBe('1.0');
        expect(global.fetch).toHaveBeenCalled();
        expect(postedSignature).toBeDefined();
        expect(postedSignature.length).toBe(64); // SHA-256 hex length
        const parsed = JSON.parse(postedBody);
        expect(parsed.organization_id).toBe('org_test_123');
        expect(parsed.report.scan.id).toBe(report.scan.id);
      } finally {
        global.fetch = originalFetch;
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('triggers shallowCheckout when repo_url is provided and local_path is omitted', async () => {
      vi.spyOn(ProcessRunner, 'run').mockResolvedValue({
        exitCode: 0,
        signal: null,
        stdout: '',
        stderr: '',
        durationMs: 5,
        timedOut: false,
        bufferOverflowed: false,
      });

      const report = await ScanJobProcessor.process({
        scan_id: 'scan_0123456789job02',
        organization_id: 'org_test_123',
        repository_id: 'repo_test_123',
        commit_sha: 'commit1234567890',
        repo_url: 'https://github.com/org/repo.git',
      });

      expect(report).toBeDefined();
    });
  });

  describe('startWorker', () => {
    it('initializes BullMQ worker with correct queue and connection', async () => {
      const { startWorker } = await import('../src/worker.js');
      const worker = startWorker('redis://mock:6379');
      expect(worker.name).toBe('scan_jobs');
      await worker.close();
    });
  });
});

