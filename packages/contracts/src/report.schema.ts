import { z } from 'zod';
import { ScannerIdSchema, ScannerStatusSchema } from './enums.js';
import { NormalizedFindingSchema } from './finding.schema.js';

export const ScannerSummaryItemSchema = z
  .object({
    id: ScannerIdSchema,
    status: ScannerStatusSchema,
    engine: z.string(),
    engine_version: z.string().optional(),
    duration_ms: z.number().int().min(0),
    finding_count: z.number().int().min(0),
    error_message: z.string().nullable().default(null),
  })
  .strict();

export type ScannerSummaryItem = z.infer<typeof ScannerSummaryItemSchema>;

export const PolicyViolationSchema = z
  .object({
    rule_id: z.string(),
    finding_id: z.string(),
    finding_fingerprint: z.string(),
    message: z.string(),
  })
  .strict();

export type PolicyViolation = z.infer<typeof PolicyViolationSchema>;

export const ScanReportSchema = z
  .object({
    schema_version: z.literal('1.0'),
    tool: z.object({ name: z.literal('shipshield'), version: z.string() }).strict(),
    scan: z
      .object({
        id: z.string().regex(/^scan_[A-Za-z0-9_-]{10,40}$/),
        started_at: z.string().datetime(),
        completed_at: z.string().datetime(),
        scope: z
          .object({
            kind: z.enum(['full', 'changed']),
            root: z.string(),
            base_ref: z.string().optional(),
            base_sha: z.string().optional(),
          })
          .strict(),
        execution_status: z.enum(['completed', 'failed', 'timed_out', 'cancelled']),
        policy_outcome: z.enum(['passed', 'policy_failed', 'incomplete']),
      })
      .strict(),
    project: z
      .object({
        name: z.string(),
        vcs: z
          .object({
            type: z.literal('git'),
            commit: z.string().optional(),
            branch: z.string().optional(),
            dirty: z.boolean().optional(),
          })
          .optional(),
      })
      .strict(),
    scanners: z.array(ScannerSummaryItemSchema),
    summary: z
      .object({
        findings_total: z.number().int().min(0),
        by_severity: z
          .object({
            critical: z.number().int().min(0),
            high: z.number().int().min(0),
            medium: z.number().int().min(0),
            low: z.number().int().min(0),
            info: z.number().int().min(0),
          })
          .strict(),
        policy_violations: z.number().int().min(0),
      })
      .strict(),
    findings: z.array(NormalizedFindingSchema),
    policy: z
      .object({
        passed: z.boolean(),
        rules_evaluated: z.number().int().min(0),
        violations: z.array(PolicyViolationSchema),
      })
      .strict(),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
  })
  .strict();

export type ScanReport = z.infer<typeof ScanReportSchema>;
