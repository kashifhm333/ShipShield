import mongoose, { Schema, Document, Types } from 'mongoose';
import { ScannerId, Severity } from '@shipshield/contracts';

export interface IFinding extends Document {
  organization_id: Types.ObjectId;
  repository_id: Types.ObjectId;
  public_id: string;
  fingerprint: string;
  category: ScannerId;
  scanner: string;
  rule_id: string;
  title: string;
  description: string;
  severity: Severity;
  severity_original: string;
  confidence: 'high' | 'medium' | 'low';
  location: {
    path: string;
    start_line?: number;
    end_line?: number;
    resource_address?: string;
    package_name?: string;
    installed_version?: string;
    fixed_version?: string;
  };
  evidence: {
    redacted: true;
    summary: string;
    line_snippet?: string;
  };
  remediation: {
    summary: string;
    fix_available: boolean;
    fix_strategy?: string | null;
  };
  status: 'new' | 'existing' | 'resolved' | 'changed' | 'accepted' | 'suppressed';
  first_detected_scan_id: string;
  last_detected_scan_id: string;
  first_seen_at: Date;
  last_seen_at: Date;
}

const FindingSchema = new Schema<IFinding>(
  {
    organization_id: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    repository_id: { type: Schema.Types.ObjectId, required: true, ref: 'Repository', index: true },
    public_id: { type: String, required: true, index: true },
    fingerprint: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ['secrets', 'dependencies', 'containers', 'iac'],
      required: true,
    },
    scanner: { type: String, required: true },
    rule_id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'info'],
      required: true,
      index: true,
    },
    severity_original: { type: String, required: true },
    confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'high' },
    location: {
      path: { type: String, required: true },
      start_line: { type: Number },
      end_line: { type: Number },
      resource_address: { type: String },
      package_name: { type: String },
      installed_version: { type: String },
      fixed_version: { type: String },
    },
    evidence: {
      redacted: { type: Boolean, default: true },
      summary: { type: String, required: true },
      line_snippet: { type: String },
    },
    remediation: {
      summary: { type: String, required: true },
      fix_available: { type: Boolean, default: false },
      fix_strategy: { type: String, default: null },
    },
    status: {
      type: String,
      enum: ['new', 'existing', 'resolved', 'changed', 'accepted', 'suppressed'],
      default: 'new',
      index: true,
    },
    first_detected_scan_id: { type: String, required: true },
    last_detected_scan_id: { type: String, required: true },
    first_seen_at: { type: Date, default: Date.now },
    last_seen_at: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
  }
);

// Authoritative compound unique index
FindingSchema.index(
  { organization_id: 1, repository_id: 1, fingerprint: 1 },
  { unique: true }
);

export const FindingModel = mongoose.model<IFinding>('Finding', FindingSchema, 'findings');
