import fs from 'node:fs';
import path from 'node:path';
import { NormalizedFinding, ScannerId } from '@shipshield/contracts';
import { NATIVE_POLICIES } from './native-rules.js';
import { PolicyDefinition, PolicyCategory, PolicyFindingResult } from './native-policy.types.js';
import { FingerprintGenerator } from '../security/fingerprint.js';
import { RedactionEngine } from '../security/redaction-engine.js';

export class NativePolicyRegistry {
  private static readonly policies: Map<string, PolicyDefinition> = new Map(
    NATIVE_POLICIES.map((p) => [p.id, p])
  );

  public static getAllPolicies(): PolicyDefinition[] {
    return Array.from(this.policies.values());
  }

  public static getAll(): PolicyDefinition[] {
    return this.getAllPolicies();
  }

  public static getPolicy(id: string): PolicyDefinition | undefined {
    return this.policies.get(id);
  }

  public static get(id: string): PolicyDefinition | undefined {
    return this.getPolicy(id);
  }

  public static getPoliciesByCategory(category: PolicyCategory): PolicyDefinition[] {
    return Array.from(this.policies.values()).filter((p) => p.category === category);
  }

  public static getByCategory(category: PolicyCategory): PolicyDefinition[] {
    return this.getPoliciesByCategory(category);
  }

  public static validatePolicy(policy: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!policy || typeof policy !== 'object') {
      return { valid: false, errors: ['Policy must be a non-null object'] };
    }

    const p = policy as Partial<PolicyDefinition>;
    if (!p.id || typeof p.id !== 'string') errors.push('Missing or invalid id (string required)');
    if (!p.title || typeof p.title !== 'string') errors.push('Missing or invalid title');
    if (!p.description || typeof p.description !== 'string') errors.push('Missing or invalid description');
    if (!p.category || typeof p.category !== 'string') errors.push('Missing or invalid category');
    if (!p.severity || !['critical', 'high', 'medium', 'low', 'info'].includes(p.severity)) {
      errors.push('Severity must be one of: critical, high, medium, low, info');
    }
    if (!p.remediation || typeof p.remediation !== 'string') errors.push('Missing or invalid remediation');
    if (!Array.isArray(p.filePatterns) || p.filePatterns.length === 0) {
      errors.push('filePatterns must be a non-empty array of pattern strings');
    }

    return { valid: errors.length === 0, errors };
  }

  public static validateRuleDefinition(rule: unknown): { valid: boolean; errors: string[] } {
    return this.validatePolicy(rule);
  }

  /**
   * Evaluates all applicable native policies against file content in-memory.
   */
  public static runPoliciesOnContent(
    relativePath: string,
    content: string
  ): PolicyFindingResult[] {
    const results: PolicyFindingResult[] = [];
    const normalizedPath = relativePath.split(path.sep).join('/');
    const applicablePolicies = Array.from(this.policies.values()).filter((policy) =>
      policy.filePatterns.some((pattern) => this.matchesPattern(normalizedPath, pattern))
    );

    const context = {
      workspaceRoot: process.cwd(),
      relativePath: normalizedPath,
      content,
    };

    for (const policy of applicablePolicies) {
      try {
        const res = policy.check(context);
        if (Array.isArray(res)) {
          results.push(...res);
        }
      } catch {
        // Robustness: individual rule check failures do not crash the engine
      }
    }

    return results;
  }

  /**
   * Maps a granular policy category to one of the canonical 4 scanner categories.
   */
  public static mapToScannerId(category: PolicyCategory): ScannerId {
    switch (category) {
      case 'secrets':
        return 'secrets';
      case 'dependencies':
      case 'supply-chain':
        return 'dependencies';
      case 'containers':
        return 'containers';
      case 'iac':
      case 'kubernetes':
      case 'cicd':
      case 'permissions':
      case 'linux':
      case 'general':
      default:
        return 'iac';
    }
  }

  /**
   * Matches a relative file path against glob-like simple pattern extensions or path prefixes.
   */
  public static matchesPattern(relativePath: string, pattern: string): boolean {
    if (pattern === '**/*') return true;

    const norm = relativePath.split(path.sep).join('/');

    // Pattern like **/Dockerfile* or **/Containerfile*
    if (pattern.includes('Dockerfile') && (norm.includes('Dockerfile') || norm.includes('Containerfile'))) {
      return true;
    }
    if (pattern.includes('docker-compose') && (norm.includes('docker-compose') || norm.includes('compose.yml') || norm.includes('compose.yaml'))) {
      return true;
    }
    if (pattern.includes('.github/workflows') && norm.includes('.github/workflows')) {
      return norm.endsWith('.yml') || norm.endsWith('.yaml');
    }

    // Pattern like **/*.tf, **/*.js, **/*.ts
    if (pattern.startsWith('**/*.')) {
      const ext = pattern.slice(4);
      return norm.endsWith(ext);
    }

    // Pattern like **/package.json or **/.npmrc
    if (pattern.startsWith('**/')) {
      const target = pattern.slice(3);
      return norm === target || norm.endsWith('/' + target);
    }

    return norm.endsWith(pattern);
  }

  /**
   * Executes all relevant native policies across provided workspace files.
   * Returns normalized findings adhering to NormalizedFindingSchema.
   */
  public static async execute(
    workspaceRoot: string,
    filePaths: string[]
  ): Promise<NormalizedFinding[]> {
    const findings: NormalizedFinding[] = [];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit to prevent memory exhaustion

    for (const relPath of filePaths) {
      const fullPath = path.resolve(workspaceRoot, relPath);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
        if (!stat.isFile() || stat.size > MAX_FILE_SIZE) continue;
      } catch {
        continue;
      }

      // Check which policies apply to this file
      const applicablePolicies = Array.from(this.policies.values()).filter((policy) =>
        policy.filePatterns.some((pattern) => this.matchesPattern(relPath, pattern))
      );

      if (applicablePolicies.length === 0) continue;

      let content = '';
      try {
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }

      const context = {
        workspaceRoot,
        relativePath: relPath.split(path.sep).join('/'),
        content,
      };

      for (const policy of applicablePolicies) {
        try {
          const results = await policy.check(context);
          for (const res of results) {
            const scannerCategory = this.mapToScannerId(res.category);
            const normalizedPath = FingerprintGenerator.normalizePath(res.file_path);
            const sanitizedSnippet = res.line_snippet ? RedactionEngine.redact(res.line_snippet) : undefined;

            let fingerprint = '';
            if (scannerCategory === 'secrets') {
              fingerprint = FingerprintGenerator.generateFingerprint({
                category: 'secrets',
                ruleId: res.rule_id,
                relativePath: normalizedPath,
                structuralContext: sanitizedSnippet || 'secret-evidence',
              });
            } else if (scannerCategory === 'dependencies') {
              fingerprint = FingerprintGenerator.generateFingerprint({
                category: 'dependencies',
                ruleId: res.rule_id,
                relativePath: normalizedPath,
                packageName: res.title,
                installedVersion: '1.0.0',
              });
            } else if (scannerCategory === 'containers') {
              fingerprint = FingerprintGenerator.generateFingerprint({
                category: 'containers',
                ruleId: res.rule_id,
                relativePath: normalizedPath,
                normalizedInstruction: sanitizedSnippet || res.rule_id,
              });
            } else {
              fingerprint = FingerprintGenerator.generateFingerprint({
                category: 'iac',
                ruleId: res.rule_id,
                relativePath: normalizedPath,
                resourceAddress: `${res.rule_id}:${normalizedPath}`,
              });
            }

            const publicId = FingerprintGenerator.generatePublicId(scannerCategory, fingerprint);

            findings.push({
              id: publicId,
              fingerprint,
              type: `policy-violation-${res.category}`,
              category: scannerCategory,
              scanner: 'shipshield-native',
              rule_id: res.rule_id,
              title: res.title,
              description: res.description,
              severity: res.severity,
              severity_original: res.severity.toUpperCase(),
              confidence: res.confidence,
              location: {
                path: normalizedPath,
                start_line: res.line_start,
                end_line: res.line_end || res.line_start,
              },
              evidence: {
                redacted: true,
                summary: sanitizedSnippet || res.title,
                line_snippet: sanitizedSnippet,
              },
              remediation: {
                summary: res.remediation,
                fix_available: false,
                fix_strategy: null,
              },
              status: 'new',
              references: res.standards || [],
            });
          }
        } catch {
          // Robustness: individual rule check failures do not crash the scan engine
        }
      }
    }

    return findings;
  }
}
