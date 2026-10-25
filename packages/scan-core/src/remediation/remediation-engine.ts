import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NormalizedFinding } from '@shipshield/contracts';
import { FixProposal, FixRegistry } from './fix-registry.js';
import { PathValidator } from '../security/path-validator.js';

export class FixExecutionError extends Error {
  public readonly code: string;
  public readonly exitCode = 6;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FixExecutionError';
    this.code = code;
  }
}

export interface PlanFixOptions {
  projectRoot: string;
  findings: NormalizedFinding[];
  registry: FixRegistry;
  findingIds?: string[] | undefined;
}

export interface ApplyFixOptions {
  projectRoot: string;
  proposals: FixProposal[];
  dryRun?: boolean | undefined;
  apply?: boolean | undefined;
}

export class RemediationEngine {
  /**
   * Plans fixes for applicable findings without modifying any filesystem files.
   */
  public static async planFixes(options: PlanFixOptions): Promise<FixProposal[]> {
    const proposals: FixProposal[] = [];

    const targetFindings = options.findings.filter((f) => {
      if (options.findingIds && options.findingIds.length > 0) {
        return options.findingIds.includes(f.id);
      }
      return f.remediation.fix_available;
    });

    for (const finding of targetFindings) {
      if (finding.category === 'secrets') {
        // Invariant: Never plan automated source edits for secrets
        continue;
      }

      const handler = options.registry.getForFinding(finding);
      if (!handler) {
        continue;
      }

      const targetPath = path.resolve(options.projectRoot, finding.location.path);
      PathValidator.validateContainment(options.projectRoot, targetPath);

      if (!fs.existsSync(targetPath)) {
        continue;
      }

      const originalContent = fs.readFileSync(targetPath, 'utf8');
      const sha256 = crypto.createHash('sha256').update(originalContent).digest('hex');

      const proposal = await handler.planFix(finding, originalContent, sha256);
      if (proposal) {
        proposals.push(proposal);
      }
    }

    return proposals;
  }

  /**
   * Applies planned fix proposals to the filesystem.
   * If apply is not explicitly true, acts as a dry run and touches no files.
   */
  public static async applyFixes(options: ApplyFixOptions): Promise<{
    appliedCount: number;
    proposals: FixProposal[];
  }> {
    // Invariant: Modifying files requires explicit apply === true
    if (!options.apply) {
      return {
        appliedCount: 0,
        proposals: options.proposals,
      };
    }

    // Check for conflicting proposals modifying the same file
    const affectedFiles = new Set<string>();
    for (const p of options.proposals) {
      if (affectedFiles.has(p.targetRelativePath)) {
        throw new FixExecutionError(
          'SS-FIX-CONFLICT',
          `Multiple conflicting fix proposals target the same file: ${p.targetRelativePath}`
        );
      }
      affectedFiles.add(p.targetRelativePath);
    }

    let appliedCount = 0;

    for (const proposal of options.proposals) {
      const targetPath = path.resolve(options.projectRoot, proposal.targetRelativePath);
      PathValidator.validateContainment(options.projectRoot, targetPath);

      if (!fs.existsSync(targetPath)) {
        throw new FixExecutionError(
          'SS-FIX-FILE-NOT-FOUND',
          `Target file to patch no longer exists: ${proposal.targetRelativePath}`
        );
      }

      // Check SHA-256 precondition hash to prevent modifying files that changed concurrently
      const currentContent = fs.readFileSync(targetPath, 'utf8');
      const currentSha256 = crypto.createHash('sha256').update(currentContent).digest('hex');

      if (currentSha256 !== proposal.originalFileSha256) {
        throw new FixExecutionError(
          'SS-FIX-CONCURRENCY',
          `Precondition failed: target file ${proposal.targetRelativePath} was modified after fix was planned.`
        );
      }

      const stat = fs.statSync(targetPath);
      const targetDir = path.dirname(targetPath);
      const tmpFile = path.join(
        targetDir,
        `.shipshield-fix-${crypto.randomBytes(6).toString('hex')}.tmp`
      );

      // Atomic write preserving file mode
      const fd = fs.openSync(tmpFile, 'w', stat.mode);
      try {
        fs.writeSync(fd, proposal.patchedContent, 0, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }

      fs.renameSync(tmpFile, targetPath);
      appliedCount++;
    }

    return {
      appliedCount,
      proposals: options.proposals,
    };
  }
}
