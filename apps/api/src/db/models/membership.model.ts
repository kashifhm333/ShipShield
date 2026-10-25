import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMembership extends Document {
  organization_id: Types.ObjectId;
  user_id: Types.ObjectId;
  role: 'owner' | 'admin' | 'security_engineer' | 'developer' | 'viewer';
  status: 'active' | 'invited' | 'revoked';
  created_at: Date;
  updated_at: Date;
}

const MembershipSchema = new Schema<IMembership>(
  {
    organization_id: { type: Schema.Types.ObjectId, required: true, ref: 'Organization' },
    user_id: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    role: {
      type: String,
      enum: ['owner', 'admin', 'security_engineer', 'developer', 'viewer'],
      default: 'developer',
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'revoked'],
      default: 'active',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

MembershipSchema.index({ organization_id: 1, user_id: 1 }, { unique: true });
MembershipSchema.index({ user_id: 1, status: 1 });

export const MembershipModel = mongoose.model<IMembership>(
  'Membership',
  MembershipSchema,
  'memberships'
);
