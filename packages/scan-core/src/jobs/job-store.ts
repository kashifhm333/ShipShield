import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JobRecord, JobStatus, ScannerId, Severity } from '@shipshield/contracts';

const nodeRequire = createRequire(import.meta.url);

export class JobStore {
  private db: any = null;
  private readonly dbPath: string;
  private isMemoryOrFallback = false;
  private memoryJobs = new Map<string, JobRecord>();

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.init();
  }

  private init(): void {
    try {
      let DatabaseSync: any = null;
      try {
        const sqlite = nodeRequire('node:sqlite');
        DatabaseSync = sqlite?.DatabaseSync;
      } catch {
        // Fall back
      }

      if (DatabaseSync) {
        if (this.dbPath !== ':memory:') {
          const dir = path.dirname(this.dbPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
        }
        this.db = new DatabaseSync(this.dbPath);
        this.initTables();
        return;
      }
    } catch {
      // Fall through to file fallback
    }

    this.isMemoryOrFallback = true;
    this.loadFallbackFile();
  }

  private initTables(): void {
    if (!this.db) return;
    this.db.exec(`
      PRAGMA user_version = 1;
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        project_name TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        scanners TEXT NOT NULL,
        fail_on TEXT,
        exit_code INTEGER,
        policy_outcome TEXT,
        failure_reason TEXT,
        report_path TEXT,
        markdown_report_path TEXT,
        findings_count INTEGER DEFAULT 0,
        critical_count INTEGER DEFAULT 0,
        high_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS scan_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        message TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scans_project ON scans(project_root);
      CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
      CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at);
    `);
  }

  private loadFallbackFile(): void {
    if (this.dbPath === ':memory:') return;
    try {
      const fallbackFile = this.dbPath + '.json';
      if (fs.existsSync(fallbackFile)) {
        const raw = fs.readFileSync(fallbackFile, 'utf8');
        const list = JSON.parse(raw);
        for (const item of list) {
          this.memoryJobs.set(item.id, item);
        }
      }
    } catch {
      // Ignored
    }
  }

  private persistFallbackFile(): void {
    if (this.dbPath === ':memory:' || !this.isMemoryOrFallback) return;
    try {
      const fallbackFile = this.dbPath + '.json';
      const list = Array.from(this.memoryJobs.values());
      fs.writeFileSync(fallbackFile, JSON.stringify(list, null, 2), 'utf8');
    } catch {
      // Ignored
    }
  }

  public createJob(params: {
    id: string;
    projectRoot: string;
    projectName?: string | undefined;
    scanners?: ScannerId[] | undefined;
    failOn?: Severity[] | undefined;
    createdAt?: string | undefined;
  }): JobRecord {
    const now = params.createdAt || new Date().toISOString();
    const job: JobRecord = {
      id: params.id,
      projectRoot: params.projectRoot,
      projectName: params.projectName || path.basename(params.projectRoot),
      status: 'accepted',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      scanners: params.scanners || ['secrets', 'dependencies', 'containers', 'iac'],
      failOn: params.failOn || ['critical', 'high'],
      exitCode: null,
      policyOutcome: null,
      failureReason: null,
      reportPath: null,
      markdownReportPath: null,
      findingsCount: 0,
      criticalCount: 0,
      highCount: 0,
    };

    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO scans (
          id, project_root, project_name, status, created_at, updated_at,
          scanners, fail_on, findings_count, critical_count, high_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        job.id,
        job.projectRoot,
        job.projectName || null,
        job.status,
        job.createdAt,
        job.updatedAt,
        JSON.stringify(job.scanners),
        JSON.stringify(job.failOn || []),
        0,
        0,
        0
      );
      this.addEvent(job.id, 'accepted', 'Scan job accepted into engine queue');
    } else {
      this.memoryJobs.set(job.id, job);
      this.persistFallbackFile();
    }

    return job;
  }

  public updateJob(id: string, updates: Partial<JobRecord>): JobRecord | null {
    const existing = this.getJob(id);
    if (!existing) return null;

    const updated: JobRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (this.db) {
      const stmt = this.db.prepare(`
        UPDATE scans SET
          status = ?,
          updated_at = ?,
          completed_at = ?,
          exit_code = ?,
          policy_outcome = ?,
          failure_reason = ?,
          report_path = ?,
          markdown_report_path = ?,
          findings_count = ?,
          critical_count = ?,
          high_count = ?
        WHERE id = ?
      `);
      stmt.run(
        updated.status,
        updated.updatedAt,
        updated.completedAt || null,
        updated.exitCode !== undefined ? updated.exitCode : null,
        updated.policyOutcome || null,
        updated.failureReason || null,
        updated.reportPath || null,
        updated.markdownReportPath || null,
        updated.findingsCount || 0,
        updated.criticalCount || 0,
        updated.highCount || 0,
        id
      );

      if (updates.status && updates.status !== existing.status) {
        this.addEvent(id, updates.status, updates.failureReason || `Status changed to ${updates.status}`);
      }
    } else {
      this.memoryJobs.set(id, updated);
      this.persistFallbackFile();
    }

    return updated;
  }

  public addEvent(scanId: string, eventType: string, message?: string): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO scan_events (scan_id, event_type, message, created_at)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(scanId, eventType, message || null, new Date().toISOString());
    } catch {
      // Ignored
    }
  }

  public getJob(id: string): JobRecord | null {
    if (this.db) {
      const stmt = this.db.prepare('SELECT * FROM scans WHERE id = ?');
      const row = stmt.get(id);
      if (!row) return null;
      return this.rowToJob(row);
    }
    return this.memoryJobs.get(id) || null;
  }

  public getLatestJob(projectRoot?: string | undefined): JobRecord | null {
    if (this.db) {
      let query = 'SELECT * FROM scans';
      const params: any[] = [];
      if (projectRoot) {
        query += ' WHERE project_root = ?';
        params.push(projectRoot);
      }
      query += ' ORDER BY created_at DESC, rowid DESC LIMIT 1';
      const stmt = this.db.prepare(query);
      const row = stmt.get(...params);
      if (!row) return null;
      return this.rowToJob(row);
    }

    const all = Array.from(this.memoryJobs.values());
    const filtered = projectRoot ? all.filter((j) => j.projectRoot === projectRoot) : all;
    if (filtered.length === 0) return null;
    filtered.sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return diff !== 0 ? diff : 0;
    });
    return filtered[filtered.length - 1] && filtered[0] ? (new Date(filtered[0].createdAt).getTime() > new Date(filtered[filtered.length - 1]!.createdAt).getTime() ? filtered[0] : filtered.slice().reverse()[0]!) : filtered[0] || null;
  }

  public listJobs(filters?: { projectRoot?: string | undefined; status?: JobStatus | undefined; limit?: number | undefined } | undefined): JobRecord[] {
    const limit = filters?.limit || 50;

    if (this.db) {
      const conditions: string[] = [];
      const params: any[] = [];

      if (filters?.projectRoot) {
        conditions.push('project_root = ?');
        params.push(filters.projectRoot);
      }
      if (filters?.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }

      let query = 'SELECT * FROM scans';
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      query += ' ORDER BY created_at DESC, rowid DESC LIMIT ?';
      params.push(limit);

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params);
      return rows.map((r: any) => this.rowToJob(r));
    }

    let all = Array.from(this.memoryJobs.values());
    if (filters?.projectRoot) {
      all = all.filter((j) => j.projectRoot === filters.projectRoot);
    }
    if (filters?.status) {
      all = all.filter((j) => j.status === filters.status);
    }
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return all.slice(0, limit);
  }

  public recoverInterruptedJobs(): number {
    let count = 0;
    if (this.db) {
      const stmt = this.db.prepare(`
        UPDATE scans
        SET status = 'failed',
            failure_reason = 'Interrupted by engine process restart or crash',
            updated_at = ?
        WHERE status IN ('running', 'accepted', 'queued', 'cancelling')
      `);
      const res = stmt.run(new Date().toISOString());
      count = res.changes || 0;
    } else {
      for (const [id, job] of this.memoryJobs.entries()) {
        if (['running', 'accepted', 'queued', 'cancelling'].includes(job.status)) {
          job.status = 'failed';
          job.failureReason = 'Interrupted by engine process restart or crash';
          job.updatedAt = new Date().toISOString();
          count++;
        }
      }
      this.persistFallbackFile();
    }
    return count;
  }

  public cancelJob(id: string): { cancelled: boolean; message: string } {
    const job = this.getJob(id);
    if (!job) {
      return { cancelled: false, message: `Scan job ${id} not found` };
    }
    if (['completed', 'policy_failed', 'incomplete', 'failed', 'cancelled'].includes(job.status)) {
      return { cancelled: false, message: `Scan job ${id} is already finished with status "${job.status}"` };
    }

    this.updateJob(id, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
      failureReason: 'Cancelled by user request',
    });

    return { cancelled: true, message: `Scan job ${id} successfully cancelled` };
  }

  private rowToJob(row: any): JobRecord {
    return {
      id: row.id,
      projectRoot: row.project_root,
      projectName: row.project_name || undefined,
      status: row.status as JobStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at || null,
      scanners: JSON.parse(row.scanners || '[]'),
      failOn: row.fail_on ? JSON.parse(row.fail_on) : undefined,
      exitCode: row.exit_code !== null ? row.exit_code : null,
      policyOutcome: row.policy_outcome || null,
      failureReason: row.failure_reason || null,
      reportPath: row.report_path || null,
      markdownReportPath: row.markdown_report_path || null,
      findingsCount: row.findings_count || 0,
      criticalCount: row.critical_count || 0,
      highCount: row.high_count || 0,
    };
  }

  public close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Ignored
      }
      this.db = null;
    }
  }
}
