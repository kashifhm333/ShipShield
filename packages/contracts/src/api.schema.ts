import { z } from 'zod';
import { SeveritySchema, PolicyOutcomeSchema, ScanExecutionStatusSchema } from './enums.js';
import { ScanReportSchema } from './report.schema.js';

export const ErrorCodeSchema = z.enum([
  'INVALID_ARGUMENT',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'RESOURCE_NOT_FOUND',
  'RESOURCE_CONFLICT',
  'POLICY_VIOLATION',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: ErrorCodeSchema,
        message: z.string(),
        request_id: z.string(),
        timestamp: z.string().datetime(),
        details: z
          .array(
            z
              .object({
                field: z.string().optional(),
                issue: z.string(),
              })
              .strict()
          )
          .optional(),
      })
      .strict(),
  })
  .strict();

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const PaginationSchema = z
  .object({
    total_records: z.number().int().min(0),
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().min(0),
    has_more: z.boolean(),
  })
  .strict();

export type Pagination = z.infer<typeof PaginationSchema>;

export const CreateSuppressionSchema = z
  .object({
    fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    finding_id: z.string().optional(),
    scope: z.enum(['global', 'repository', 'branch']).default('repository'),
    repository_id: z.string().optional(),
    reason: z.enum(['false_positive', 'accepted_risk', 'compensating_control', 'test_fixture']),
    justification: z.string().min(10).max(1000),
    expires_at: z.string().datetime(),
  })
  .strict();

export type CreateSuppressionInput = z.infer<typeof CreateSuppressionSchema>;

export const WorkerScanCompletionSchema = z
  .object({
    scan_id: z.string(),
    repository_id: z.string(),
    report: ScanReportSchema,
    worker_node: z.string().optional(),
  })
  .strict();

export type WorkerScanCompletion = z.infer<typeof WorkerScanCompletionSchema>;
