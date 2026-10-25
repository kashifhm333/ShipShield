import mongoose, { Schema, Document } from 'mongoose';

export interface IWebhookEvent extends Document {
  provider: string;
  delivery_id: string;
  event_type: string;
  installation_id?: number;
  status: 'received' | 'processing' | 'processed' | 'failed' | 'ignored';
  error_message?: string | null;
  received_at: Date;
  processed_at?: Date;
}

const WebhookEventSchema = new Schema<IWebhookEvent>(
  {
    provider: { type: String, default: 'github', required: true },
    delivery_id: { type: String, required: true },
    event_type: { type: String, required: true },
    installation_id: { type: Number },
    status: {
      type: String,
      enum: ['received', 'processing', 'processed', 'failed', 'ignored'],
      default: 'received',
    },
    error_message: { type: String, default: null },
    received_at: { type: Date, default: Date.now },
    processed_at: { type: Date },
  },
  {
    timestamps: false,
  }
);

// Idempotency unique index
WebhookEventSchema.index({ provider: 1, delivery_id: 1 }, { unique: true });

// 7-day TTL index (604800 seconds)
WebhookEventSchema.index({ received_at: 1 }, { expireAfterSeconds: 604800 });

export const WebhookEventModel = mongoose.model<IWebhookEvent>(
  'WebhookEvent',
  WebhookEventSchema,
  'webhook_events'
);
