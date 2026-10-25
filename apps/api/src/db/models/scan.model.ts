import mongoose, { Schema, Document, Types } from 'mongoose';
import {
  ScanExecutionStatus,
  PolicyOutcome,
  Severity,
} from '@shipshield/contracts';

export interface IScan extends Document {
  organization_id: Types.ObjectId;
  repository_id: Types.ObjectId;
  scan_id: string;
  trigger_type: 'cli' | 'pull_request' | 'push' | 'manual' | 'scheduled';
  commit_sha?: string;
  branch?: string;
  scope: {
    kind: 'full' | 'changed';
    root: string;
    base_ref?: string;
  };
  execution_status: ScanExecutionStatus;
  policy_outcome: PolicyOutcome;
  summary: {
    findings_total: number;
    by_severity: Record<Severity, number>;
    policy_violations: number;
  };
  scanners_run: Array<{
    id: string;
    status: string;
    engine: string;
    duration_ms: number;
    finding_count: number;
    error_message?: string | null;
  }>;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
}

const ScanSchema = new Schema<IScan>(
  {
    organization_id: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    repository_id: { type: Schema.Types.ObjectId, required: true, ref: 'Repository', index: true },
    scan_id: { type: String, required: true, unique: true, index: true },
    trigger_type: {
      type: String,
      enum: ['cli', 'pull_request', 'push', 'manual', 'scheduled'],
      default: 'cli',
    },
    commit_sha: { type: String },
    branch: { type: String },
    scope: {
      kind: { type: String, enum: ['full', 'changed'], default: 'full' },
      root: { type: String, default: '.' },
      base_ref: { type: String },
    },
    execution_status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed', 'timed_out', 'cancelled'],
      default: 'queued',
      index: true,
    },
    policy_outcome: {
      type: String,
      enum: ['pending', 'passed', 'policy_failed', 'incomplete', 'error'],
      default: 'pending',
      index: true,
    },
    summary: {
      findings_total: { type: Number, default: 0 },
      by_severity: {
        critical: { type: Number, default: 0 },
        high: { type: Number, default: 0 },
        medium: { type: Number, default: 0 },
        low: { type: Number, default: 0 },
        info: { type: Number, default: 0 },
      },
      policy_violations: { type: Number, default: 0 },
    },
    scanners_run: { type: [Schema.Types.Mixed as any], default: [] },
    started_at: { type: Date },
    completed_at: { type: Date },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

ScanSchema.index({ organization_id: 1, repository_id: 1, created_at: -1 });

export const ScanModel = mongoose.model<IScan>('Scan', ScanSchema, 'scans');
