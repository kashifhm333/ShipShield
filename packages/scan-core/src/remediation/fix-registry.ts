import { NormalizedFinding } from '@shipshield/contracts';

export interface FixProposal {
  findingId: string;
  fingerprint: string;
  targetRelativePath: string;
  originalFileSha256: string;
  originalContent: string;
  patchedContent: string;
  unifiedDiff: string;
  description: string;
}

export interface FixHandler {
  readonly strategyId: string;
  readonly supportedRuleIds: string[];
  readonly category: 'containers' | 'iac' | 'dependencies'; // NEVER 'secrets'
  planFix(
    finding: NormalizedFinding,
    fileContent: string,
    fileSha256: string
  ): Promise<FixProposal | null>;
}

export class FixRegistry {
  private readonly handlers = new Map<string, FixHandler>();

  public register(handler: FixHandler): void {
    // Invariant: Secret remediation handlers are strictly prohibited
    if ((handler.category as string) === 'secrets') {
      throw new Error('Automated file modification for secrets is strictly prohibited.');
    }
    this.handlers.set(handler.strategyId, handler);
  }

  public get(strategyId: string): FixHandler | undefined {
    return this.handlers.get(strategyId);
  }

  public getForFinding(finding: NormalizedFinding): FixHandler | undefined {
    if (finding.category === 'secrets' || !finding.remediation.fix_strategy) {
      return undefined;
    }
    const handler = this.handlers.get(finding.remediation.fix_strategy);
    if (handler && handler.supportedRuleIds.includes(finding.rule_id)) {
      return handler;
    }
    return undefined;
  }
}
