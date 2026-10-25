import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRepository extends Document {
  organization_id: Types.ObjectId;
  installation_id?: Types.ObjectId;
  provider: 'github';
  external_repo_id: number;
  name: string;
  full_name: string;
  default_branch: string;
  is_private: boolean;
  status: 'active' | 'archived' | 'disabled';
  created_at: Date;
  updated_at: Date;
}

const RepositorySchema = new Schema<IRepository>(
  {
    organization_id: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    installation_id: { type: Schema.Types.ObjectId, ref: 'Installation' },
    provider: { type: String, enum: ['github'], default: 'github' },
    external_repo_id: { type: Number, required: true },
    name: { type: String, required: true },
    full_name: { type: String, required: true },
    default_branch: { type: String, default: 'main' },
    is_private: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['active', 'archived', 'disabled'],
      default: 'active',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

RepositorySchema.index({ organization_id: 1, full_name: 1 }, { unique: true });
RepositorySchema.index({ provider: 1, external_repo_id: 1 }, { unique: true });

export const RepositoryModel = mongoose.model<IRepository>(
  'Repository',
  RepositorySchema,
  'repositories'
);
