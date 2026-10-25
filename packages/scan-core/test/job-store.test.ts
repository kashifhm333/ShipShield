import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JobStore } from '../src/jobs/job-store.js';

describe('JobStore Persistence & Lifecycle Suite', () => {
  let tempDir: string;
  let dbPath: string;
  let store: JobStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-jobstore-test-'));
    dbPath = path.join(tempDir, 'test.db');
    store = new JobStore(dbPath);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates and retrieves a scan job', () => {
    const job = store.createJob({
      id: 'scan_123',
      projectRoot: '/test/project-a',
      projectName: 'project-a',
      scanners: ['secrets', 'dependencies'],
      failOn: ['critical'],
    });

    expect(job.id).toBe('scan_123');
    expect(job.status).toBe('accepted');
    expect(job.projectName).toBe('project-a');

    const fetched = store.getJob('scan_123');
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe('scan_123');
    expect(fetched?.projectRoot).toBe('/test/project-a');
  });

  it('updates job status and reports', () => {
    store.createJob({
      id: 'scan_456',
      projectRoot: '/test/project-b',
    });

    const updated = store.updateJob('scan_456', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      exitCode: 0,
      policyOutcome: 'passed',
      findingsCount: 3,
      criticalCount: 1,
    });

    expect(updated?.status).toBe('completed');
    expect(updated?.findingsCount).toBe(3);
    expect(updated?.criticalCount).toBe(1);

    const fetched = store.getJob('scan_456');
    expect(fetched?.status).toBe('completed');
  });

  it('lists jobs with filters and limit', () => {
    store.createJob({ id: 'scan_1', projectRoot: '/test/repo-1' });
    store.createJob({ id: 'scan_2', projectRoot: '/test/repo-2' });
    store.createJob({ id: 'scan_3', projectRoot: '/test/repo-1' });

    const repo1Jobs = store.listJobs({ projectRoot: '/test/repo-1' });
    expect(repo1Jobs).toHaveLength(2);

    const limited = store.listJobs({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it('gets latest job for a project', () => {
    store.createJob({ id: 'scan_old', projectRoot: '/test/repo-latest' });
    store.createJob({ id: 'scan_new', projectRoot: '/test/repo-latest' });

    const latest = store.getLatestJob('/test/repo-latest');
    expect(latest?.id).toBe('scan_new');
  });

  it('recovers interrupted running jobs on startup', () => {
    store.createJob({ id: 'scan_interrupted', projectRoot: '/test/repo-c' });
    store.updateJob('scan_interrupted', { status: 'running' });

    const recoveredCount = store.recoverInterruptedJobs();
    expect(recoveredCount).toBe(1);

    const job = store.getJob('scan_interrupted');
    expect(job?.status).toBe('failed');
    expect(job?.failureReason).toContain('Interrupted by engine process restart');
  });

  it('cancels active scan job', () => {
    store.createJob({ id: 'scan_to_cancel', projectRoot: '/test/repo-d' });

    const cancelRes = store.cancelJob('scan_to_cancel');
    expect(cancelRes.cancelled).toBe(true);

    const job = store.getJob('scan_to_cancel');
    expect(job?.status).toBe('cancelled');
    expect(job?.failureReason).toBe('Cancelled by user request');
  });
});
