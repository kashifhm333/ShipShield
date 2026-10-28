import { Severity } from '@shipshield/contracts';

export type PolicyCategory =
  | 'secrets'
  | 'dependencies'
  | 'containers'
  | 'iac'
  | 'kubernetes'
  | 'linux'
  | 'permissions'
  | 'supply-chain'
  | 'cicd'
  | 'general';

export type PolicyConfidence = 'high' | 'medium' | 'low';

export interface PolicyFindingResult {
  rule_id: string;
  category: PolicyCategory;
  severity: Severity;
  confidence: PolicyConfidence;
  title: string;
  description: string;
  remediation: string;
  file_path: string;
  line_start?: number;
  line_end?: number;
  line_snippet?: string;
  raw_evidence?: string;
  standards?: string[];
}

export interface PolicyExecutionContext {
  workspaceRoot: string;
  relativePath: string;
  content: string;
}

export interface PolicyDefinition {
  id: string;
  title: string;
  description: string;
  category: PolicyCategory;
  severity: Severity;
  confidence: PolicyConfidence;
  remediation: string;
  standards: string[];
  version: string;
  filePatterns: string[];
  check(context: PolicyExecutionContext): Promise<PolicyFindingResult[]> | PolicyFindingResult[];
}
