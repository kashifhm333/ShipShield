import { z } from 'zod';
import { ScannerIdSchema, SeveritySchema } from './enums.js';

export const FindingLocationSchema = z
  .object({
    path: z.string().min(1),
    start_line: z.number().int().min(1).optional(),
    end_line: z.number().int().min(1).optional(),
    resource_address: z.string().optional(),
    package_name: z.string().optional(),
    installed_version: z.string().optional(),
    fixed_version: z.string().optional(),
  })
  .strict();

export type FindingLocation = z.infer<typeof FindingLocationSchema>;

export const FindingEvidenceSchema = z
  .object({
    redacted: z.literal(true),
    summary: z.string().max(1024),
    line_snippet: z.string().max(512).optional(),
  })
  .strict();

export type FindingEvidence = z.infer<typeof FindingEvidenceSchema>;

export const FindingRemediationSchema = z
  .object({
    summary: z.string().min(1),
    fix_available: z.boolean(),
    fix_strategy: z.string().nullable().default(null),
  })
  .strict();

export type FindingRemediation = z.infer<typeof FindingRemediationSchema>;

export const NormalizedFindingSchema = z
  .object({
    id: z.string().regex(/^SS-(SEC|DEP|CON|IAC)-[A-Z0-9]{4,12}$/),
    fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    type: z.string().min(1),
    category: ScannerIdSchema,
    scanner: z.string().min(1),
    rule_id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    severity: SeveritySchema,
    severity_original: z.string().min(1),
    confidence: z.enum(['high', 'medium', 'low']).default('high'),
    location: FindingLocationSchema,
    evidence: FindingEvidenceSchema,
    remediation: FindingRemediationSchema,
    status: z
      .enum(['new', 'existing', 'resolved', 'changed', 'accepted', 'suppressed'])
      .default('new'),
    references: z.array(z.string()).default([]),
  })
  .strict();

export type NormalizedFinding = z.infer<typeof NormalizedFindingSchema>;
