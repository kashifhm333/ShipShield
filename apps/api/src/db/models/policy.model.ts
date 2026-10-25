import mongoose, { Schema, Document, Types } from 'mongoose';
import { Severity } from '@shipshield/contracts';

export interface IPolicy extends Document {
  organization_id: Types.ObjectId;
  repository_id?: Types.ObjectId;
  name: string;
  scope: 'global' | 'repository';
  rules: {
    fail_on_severities: Severity[];
    fail_on_incomplete: boolean;
    max_critical: number;
    max_high: number;
  };
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const PolicySchema = new Schema<IPolicy>(
  {
    organization_id: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    repository_id: { type: Schema.Types.ObjectId, ref: 'Repository', index: true },
    name: { type: String, required: true },
    scope: { type: String, enum: ['global', 'repository'], default: 'global' },
    rules: {
      fail_on_severities: {
        type: [String],
        default: ['critical', 'high'],
      },
      fail_on_incomplete: { type: Boolean, default: true },
      max_critical: { type: Number, default: 0 },
      max_high: { type: Number, default: 0 },
    },
    is_active: { type: Boolean, default: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

PolicySchema.index({ organization_id: 1, repository_id: 1 });

export const PolicyModel = mongoose.model<IPolicy>('Policy', PolicySchema, 'policies');
