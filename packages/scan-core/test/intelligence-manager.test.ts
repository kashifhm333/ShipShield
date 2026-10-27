import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { IntelligenceManager } from '../src/intelligence/intelligence-manager.js';

describe('IntelligenceManager Unit & Integration Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-intel-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Trivy Metadata Parsing', () => {
    it('returns missing metadata when metadata.json does not exist', () => {
      const meta = IntelligenceManager.parseTrivyMetadata(tempDir);
      expect(meta.present).toBe(false);
      expect(meta.dbFilePresent).toBe(false);
      expect(meta.version).toBeNull();
      expect(meta.updatedAt).toBeNull();
      expect(meta.error).toBe('Trivy metadata.json not found in cache');
    });

    it('returns invalid metadata when metadata.json contains malformed JSON', () => {
      const dbDir = path.join(tempDir, 'db');
      fs.mkdirSync(dbDir, { recursive: true });
      fs.writeFileSync(path.join(dbDir, 'metadata.json'), '{ malformed json: true');

      const meta = IntelligenceManager.parseTrivyMetadata(tempDir);
      expect(meta.present).toBe(false);
      expect(meta.error).toContain('Failed to parse Trivy metadata.json');
    });

    it('parses valid metadata and detects presence of trivy.db binary', () => {
      const dbDir = path.join(tempDir, 'db');
      fs.mkdirSync(dbDir, { recursive: true });
      
      const testDate = new Date(Date.now() - 3600000).toISOString();
      fs.writeFileSync(
        path.join(dbDir, 'metadata.json'),
        JSON.stringify({
          Version: 2,
          NextUpdate: '2026-10-28T00:00:00Z',
          UpdatedAt: testDate,
          DownloadedAt: testDate,
        })
      );
      fs.writeFileSync(path.join(dbDir, 'trivy.db'), 'DUMMY_SQLITE_HEADER');

      const meta = IntelligenceManager.parseTrivyMetadata(tempDir);
      expect(meta.present).toBe(true);
      expect(meta.dbFilePresent).toBe(true);
      expect(meta.version).toBe('2');
      expect(meta.updatedAt).toBe(testDate);
      expect(meta.downloadedAt).toBe(testDate);
      expect(meta.error).toBeNull();
    });
  });

  describe('Freshness Calculation', () => {
    it('returns fresh for recent database within freshness threshold', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
      const res = IntelligenceManager.calculateFreshness(twoDaysAgo, 7, 30);
      expect(res.freshness).toBe('fresh');
      expect(res.ageDays).toBe(2);
    });

    it('returns stale for database older than freshness threshold but within stale threshold', () => {
      const twelveDaysAgo = new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString();
      const res = IntelligenceManager.calculateFreshness(twelveDaysAgo, 7, 30);
      expect(res.freshness).toBe('stale');
      expect(res.ageDays).toBe(12);
    });

    it('returns expired for database older than stale threshold', () => {
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
      const res = IntelligenceManager.calculateFreshness(fortyDaysAgo, 7, 30);
      expect(res.freshness).toBe('expired');
      expect(res.ageDays).toBe(40);
    });

    it('returns missing for null timestamp and invalid for unparseable timestamp', () => {
      const resNull = IntelligenceManager.calculateFreshness(null, 7, 30);
      expect(resNull.freshness).toBe('missing');
      expect(resNull.ageDays).toBeNull();

      const resInvalid = IntelligenceManager.calculateFreshness('not-a-timestamp', 7, 30);
      expect(resInvalid.freshness).toBe('invalid');
      expect(resInvalid.ageDays).toBeNull();
    });
  });

  describe('Readiness Report Generation', () => {
    it('generates a full non-destructive diagnostic report', async () => {
      const report = await IntelligenceManager.getReadinessReport();
      expect(report.cliVersion).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.scanners).toBeDefined();
      expect(report.scanners.secrets).toBeDefined();
      expect(report.scanners.dependencies).toBeDefined();
      expect(report.scanners.containers).toBeDefined();
      expect(report.scanners.iac).toBeDefined();

      expect(report.summary.totalScanners).toBe(4);
      expect(Array.isArray(report.summary.availableOffline)).toBe(true);
      expect(Array.isArray(report.missingActions)).toBe(true);
    });
  });

  describe('Database Update Lifecycle & Atomic Activation', () => {
    it('rejects updates for scanners without external databases', async () => {
      const resSecrets = await IntelligenceManager.updateDatabase('secrets');
      expect(resSecrets.success).toBe(false);
      expect(resSecrets.errorMessage).toContain('does not support external database updates');

      const resIac = await IntelligenceManager.updateDatabase('iac');
      expect(resIac.success).toBe(false);
      expect(resIac.errorMessage).toContain('does not support external database updates');
    });

    it('simulates safe staging, verification, and atomic swap for dependencies', async () => {
      const customCache = path.join(tempDir, 'trivy-cache');
      const activeDbDir = path.join(customCache, 'db');
      fs.mkdirSync(activeDbDir, { recursive: true });

      // Seed previous database
      fs.writeFileSync(path.join(activeDbDir, 'metadata.json'), JSON.stringify({
        Version: 1,
        UpdatedAt: '2026-09-01T00:00:00Z',
      }));
      fs.writeFileSync(path.join(activeDbDir, 'trivy.db'), 'OLD_DB_CONTENT');

      // Stage new database
      const stagingDir = path.join(customCache, 'staging-db');
      fs.mkdirSync(stagingDir, { recursive: true });
      fs.writeFileSync(path.join(stagingDir, 'metadata.json'), JSON.stringify({
        Version: 2,
        UpdatedAt: new Date().toISOString(),
      }));
      fs.writeFileSync(path.join(stagingDir, 'trivy.db'), 'NEW_VALID_DB_PAYLOAD');

      // Verify active metadata before swap
      const metaBefore = IntelligenceManager.parseTrivyMetadata(customCache);
      expect(metaBefore.version).toBe('1');

      // Perform atomic activation
      const backupDir = path.join(customCache, 'backup-db');
      if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
      fs.cpSync(activeDbDir, backupDir, { recursive: true });
      fs.cpSync(stagingDir, activeDbDir, { recursive: true });
      fs.rmSync(stagingDir, { recursive: true, force: true });

      // Verify active metadata after swap
      const metaAfter = IntelligenceManager.parseTrivyMetadata(customCache);
      expect(metaAfter.version).toBe('2');
      expect(fs.readFileSync(path.join(activeDbDir, 'trivy.db'), 'utf-8')).toBe('NEW_VALID_DB_PAYLOAD');

      // Verify rollback capability: restore from backup
      fs.cpSync(backupDir, activeDbDir, { recursive: true });
      const metaRestored = IntelligenceManager.parseTrivyMetadata(customCache);
      expect(metaRestored.version).toBe('1');
    });
  });
});
