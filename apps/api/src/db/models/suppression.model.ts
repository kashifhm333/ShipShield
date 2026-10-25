import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISuppression extends Document {
  organization_id: Types.ObjectId;
  repository_id?: Types.ObjectId;
  finding_id?: Types.ObjectId;
  fingerprint: string;
  scope: 'global' | 'repository' | 'branch';
  reason: 'false_positive' | 'accepted_risk' | 'compensating_control' | 'test_fixture';
  justification: string;
  created_by: Types.ObjectId;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

const SuppressionSchema = new Schema<ISuppression>(
  {
    organization_id: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    repository_id: { type: Schema.Types.ObjectId, ref: 'Repository', index: true },
    finding_id: { type: Schema.Types.ObjectId, ref: 'Finding' },
    fingerprint: { type: String, required: true, index: true },
    scope: {
      type: String,
      enum: ['global', 'repository', 'branch'],
      default: 'repository',
    },
    reason: {
      type: String,
      enum: ['false_positive', 'accepted_risk', 'compensating_control', 'test_fixture'],
      required: true,
    },
    justification: { type: String, required: true },
    created_by: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    expires_at: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// TTL Index for automatic expiration: expireAfterSeconds = 0
SuppressionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
SuppressionSchema.index({ organization_id: 1, fingerprint: 1 });

export const SuppressionModel = mongoose.model<ISuppression>(
  'Suppression',
  SuppressionSchema,
  'suppressions'
);
