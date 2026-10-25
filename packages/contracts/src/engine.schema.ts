import { z } from 'zod';
import { ScannerIdSchema, SeveritySchema } from './enums.js';

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
  version: z.string(),
  scanners: z.array(EngineScannerStatusSchema),
});
export type EngineStatus = z.infer<typeof EngineStatusSchema>;

export const EngineRequestTypeSchema = z.enum([
  'ping',
  'status',
  'plan',
  'fix',
  'verify',
  'stop',
]);
export type EngineRequestType = z.infer<typeof EngineRequestTypeSchema>;

export const EnginePlanParamsSchema = z.object({
  projectRoot: z.string(),
  scanners: z.array(ScannerIdSchema).optional(),
  failOn: z.array(SeveritySchema).optional(),
  offline: z.boolean().optional(),
  timeoutSeconds: z.number().optional(),
  jobs: z.number().optional(),
  writeReports: z.boolean().optional(),
});
export type EnginePlanParams = z.infer<typeof EnginePlanParamsSchema>;

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
