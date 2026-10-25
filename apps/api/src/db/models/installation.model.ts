import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInstallation extends Document {
  organization_id: Types.ObjectId;
  provider: 'github';
  installation_id: number;
  account_login: string;
  permissions: Record<string, string>;
  created_at: Date;
  updated_at: Date;
}

const InstallationSchema = new Schema<IInstallation>(
  {
    organization_id: { type: Schema.Types.ObjectId, required: true, ref: 'Organization' },
    provider: { type: String, enum: ['github'], default: 'github' },
    installation_id: { type: Number, required: true },
    account_login: { type: String, required: true },
    permissions: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

InstallationSchema.index({ provider: 1, installation_id: 1 }, { unique: true });
InstallationSchema.index({ organization_id: 1 });

export const InstallationModel = mongoose.model<IInstallation>(
  'Installation',
  InstallationSchema,
  'installations'
);
