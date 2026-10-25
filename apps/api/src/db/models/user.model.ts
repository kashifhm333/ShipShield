import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  full_name: string;
  avatar_url?: string;
  auth_provider: 'github' | 'saml' | 'local';
  auth_provider_id: string;
  status: 'active' | 'suspended' | 'pending';
  created_at: Date;
  updated_at: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, index: true },
    full_name: { type: String, required: true },
    avatar_url: { type: String },
    auth_provider: {
      type: String,
      enum: ['github', 'saml', 'local'],
      required: true,
    },
    auth_provider_id: { type: String, required: true },
    status: {
      type: String,
      enum: ['active', 'suspended', 'pending'],
      default: 'active',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

UserSchema.index({ auth_provider: 1, auth_provider_id: 1 }, { unique: true });

export const UserModel = mongoose.model<IUser>('User', UserSchema, 'users');
