import { z } from 'zod';
import { ScannerIdSchema, SeveritySchema, PolicyOutcomeSchema } from './enums.js';

export const EngineModeSchema = z.enum(['native', 'docker']);
export type EngineMode = z.infer<typeof EngineModeSchema>;

export const EngineScannerStatusSchema = z.object({
  id: ScannerIdSchema,
  name: z.string(),
  available: z.boolean(),
  version: z.string().optional(),
  error: z.string().optional(),
});
export type EngineScannerStatus = z.infer<typeof EngineScannerStatusSchema>;

export const EngineStatusSchema = z.object({
  running: z.boolean(),
  pid: z.number().nullable(),
  mode: EngineModeSchema,
  uptimeSeconds: z.number(),
  socketPath: z.string(),
  dbPath: z.string().optional(),
  version: z.string(),
  scanners: z.array(EngineScannerStatusSchema),
});
export type EngineStatus = z.infer<typeof EngineStatusSchema>;

export const JobStatusSchema = z.enum([
  'accepted',
  'queued',
  'running',
  'completed',
  'policy_failed',
  'incomplete',
  'failed',
  'cancelling',
  'cancelled',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobRecordSchema = z.object({
  id: z.string(),
  projectRoot: z.string(),
  projectName: z.string().optional(),
  status: JobStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  scanners: z.array(ScannerIdSchema),
  failOn: z.array(SeveritySchema).optional(),
  exitCode: z.number().nullable().optional(),
  policyOutcome: PolicyOutcomeSchema.nullable().optional(),
  failureReason: z.string().nullable().optional(),
  reportPath: z.string().nullable().optional(),
  markdownReportPath: z.string().nullable().optional(),
  findingsCount: z.number().optional(),
  criticalCount: z.number().optional(),
  highCount: z.number().optional(),
});
export type JobRecord = z.infer<typeof JobRecordSchema>;

export const EngineRequestTypeSchema = z.enum([
  'ping',
  'status',
  'submit_scan',
  'get_scan',
  'list_scans',
  'get_results',
  'cancel_scan',
  'plan',
  'fix',
  'verify',
  'stop',
]);
export type EngineRequestType = z.infer<typeof EngineRequestTypeSchema>;

export const SubmitScanParamsSchema = z.object({
  projectRoot: z.string(),
  scanners: z.array(ScannerIdSchema).optional(),
  failOn: z.array(SeveritySchema).optional(),
  offline: z.boolean().optional(),
  timeoutSeconds: z.number().optional(),
  jobs: z.number().optional(),
  writeReports: z.boolean().optional(),
  detach: z.boolean().optional(),
});
export type SubmitScanParams = z.infer<typeof SubmitScanParamsSchema>;

export const ListScansParamsSchema = z.object({
  projectRoot: z.string().optional(),
  status: JobStatusSchema.optional(),
  limit: z.number().optional(),
});
export type ListScansParams = z.infer<typeof ListScansParamsSchema>;

export const EnginePlanParamsSchema = SubmitScanParamsSchema;
export type EnginePlanParams = SubmitScanParams;

export const EngineRequestSchema = z.object({
  id: z.string(),
  type: EngineRequestTypeSchema,
  params: z.record(z.any()).optional(),
});
export type EngineRequest = z.infer<typeof EngineRequestSchema>;

export const EngineResponseSchema = z.object({
  id: z.string(),
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  exitCode: z.number().optional(),
});
export type EngineResponse = z.infer<typeof EngineResponseSchema>;
