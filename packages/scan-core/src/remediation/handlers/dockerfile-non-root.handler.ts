import { createTwoFilesPatch } from 'diff';
import { NormalizedFinding } from '@shipshield/contracts';
import { FixHandler, FixProposal } from '../fix-registry.js';

export class DockerfileNonRootHandler implements FixHandler {
  public readonly strategyId = 'dockerfile-non-root';
  public readonly supportedRuleIds = ['DS002', 'AVD-DS-0002'];
  public readonly category = 'containers' as const;

  public async planFix(
    finding: NormalizedFinding,
    fileContent: string,
    fileSha256: string
  ): Promise<FixProposal | null> {
    const lines = fileContent.split(/\r?\n/);
    const hasUserInstruction = lines.some((l) => /^\s*USER\s+/i.test(l));

    if (hasUserInstruction) {
      // If user instruction already exists, cannot safely auto-patch without deeper AST parsing
      return null;
    }

    // Insert non-root user (e.g., USER 10001:10001 or USER node) before CMD or ENTRYPOINT
    let insertIndex = lines.length;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim().toUpperCase() || '';
      if (line.startsWith('CMD ') || line.startsWith('ENTRYPOINT ')) {
        insertIndex = i;
        break;
      }
    }

    const nonRootLines = [
      '',
      '# Added by ShipShield automated security remediation: run container as non-root user',
      'USER 10001:10001',
    ];

    const newLines = [
      ...lines.slice(0, insertIndex),
      ...nonRootLines,
      ...lines.slice(insertIndex),
    ];

    const patchedContent = newLines.join('\n');
    const unifiedDiff = createTwoFilesPatch(
      finding.location.path,
      finding.location.path,
      fileContent,
      patchedContent,
      'original',
      'shipshield-fix'
    );

    return {
      findingId: finding.id,
      fingerprint: finding.fingerprint,
      targetRelativePath: finding.location.path,
      originalFileSha256: fileSha256,
      originalContent: fileContent,
      patchedContent,
      unifiedDiff,
      description: 'Add non-root USER instruction to Dockerfile to prevent root execution.',
    };
  }
}
