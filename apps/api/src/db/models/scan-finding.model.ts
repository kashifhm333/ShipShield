import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IScanFinding extends Document {
  organization_id: Types.ObjectId;
  scan_id: Types.ObjectId;
  finding_id: Types.ObjectId;
  created_at: Date;
}

const ScanFindingSchema = new Schema<ISCAN_FINDING_TYPE>(
  {
    organization_id: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    scan_id: { type: Schema.Types.ObjectId, required: true, ref: 'Scan', index: true },
    finding_id: { type: Schema.Types.ObjectId, required: true, ref: 'Finding', index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

type ISCAN_FINDING_TYPE = IScanFinding;

ScanFindingSchema.index({ scan_id: 1, finding_id: 1 }, { unique: true });

export const ScanFindingModel = mongoose.model<IScanFinding>(
  'ScanFinding',
  ScanFindingSchema,
  'scan_findings'
);
