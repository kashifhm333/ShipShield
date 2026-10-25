import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAuditEvent extends Document {
  organization_id: Types.ObjectId;
  actor: {
    actor_id: Types.ObjectId;
    actor_type: 'user' | 'api_key' | 'system';
    email?: string;
    ip_address?: string;
  };
  action: string;
  target: {
    entity_type: string;
    entity_id: string;
  };
  metadata?: Record<string, unknown>;
  created_at: Date;
}

const AuditEventSchema = new Schema<IAuditEvent>(
  {
    organization_id: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    actor: {
      actor_id: { type: Schema.Types.ObjectId, required: true },
      actor_type: { type: String, enum: ['user', 'api_key', 'system'], default: 'user' },
      email: { type: String },
      ip_address: { type: String },
    },
    action: { type: String, required: true },
    target: {
      entity_type: { type: String, required: true },
      entity_id: { type: String, required: true },
    },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

AuditEventSchema.index({ organization_id: 1, created_at: -1 });
AuditEventSchema.index({ 'actor.actor_id': 1, created_at: -1 });

export const AuditEventModel = mongoose.model<IAuditEvent>(
  'AuditEvent',
  AuditEventSchema,
  'audit_events'
);
