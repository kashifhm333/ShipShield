import mongoose, { Schema, Document } from 'mongoose';

export interface IOrganization extends Document {
  name: string;
  slug: string;
  billing_tier: 'free' | 'team' | 'enterprise';
  settings: {
    enforce_org_policy: boolean;
    max_concurrent_scans: number;
    data_retention_days: number;
    allowed_ip_cidrs: string[];
  };
  created_at: Date;
  updated_at: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    billing_tier: {
      type: String,
      enum: ['free', 'team', 'enterprise'],
      default: 'team',
    },
    settings: {
      enforce_org_policy: { type: Boolean, default: true },
      max_concurrent_scans: { type: Number, default: 4 },
      data_retention_days: { type: Number, default: 90 },
      allowed_ip_cidrs: { type: [String], default: [] },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

OrganizationSchema.index({ created_at: -1 });

export const OrganizationModel = mongoose.model<IOrganization>(
  'Organization',
  OrganizationSchema,
  'organizations'
);
