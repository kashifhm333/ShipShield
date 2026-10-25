import { z } from 'zod';

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export const ScannerIdSchema = z.enum(['secrets', 'dependencies', 'containers', 'iac']);
export type ScannerId = z.infer<typeof ScannerIdSchema>;

export const ScannerStatusSchema = z.enum([
  'completed',
  'not_applicable',
  'disabled',
  'skipped',
  'failed',
  'timed_out',
]);
export type ScannerStatus = z.infer<typeof ScannerStatusSchema>;

export const ScanExecutionStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'timed_out',
  'cancelled',
]);
export type ScanExecutionStatus = z.infer<typeof ScanExecutionStatusSchema>;

export const PolicyOutcomeSchema = z.enum([
  'pending',
  'passed',
  'policy_failed',
  'incomplete',
  'error',
]);
export type PolicyOutcome = z.infer<typeof PolicyOutcomeSchema>;
