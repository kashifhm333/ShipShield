import { ScanReport, NormalizedFinding, Severity } from '@shipshield/contracts';

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  defaultConfiguration: {
    level: 'error' | 'warning' | 'note';
  };
  help: { text: string };
  properties?: Record<string, unknown>;
}

export interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: {
        uri: string;
        uriBaseId?: string;
      };
      region?: {
        startLine?: number;
        endLine?: number;
        snippet?: { text: string };
      };
    };
  }>;
}

export interface SarifDocument {
  $schema: string;
  version: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri: string;
        rules: SarifRule[];
      };
    };
    results: SarifResult[];
  }>;
}

export class SarifFormatter {
  private static severityToSarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
      case 'info':
      default:
        return 'note';
    }
  }

  public static format(report: ScanReport): SarifDocument {
    const rulesMap = new Map<string, SarifRule>();
    const results: SarifResult[] = [];

    for (const finding of report.findings) {
      if (!rulesMap.has(finding.rule_id)) {
        rulesMap.set(finding.rule_id, {
          id: finding.rule_id,
          name: finding.title,
          shortDescription: { text: finding.title },
          fullDescription: { text: finding.description },
          defaultConfiguration: {
            level: this.severityToSarifLevel(finding.severity),
          },
          help: { text: finding.remediation.summary },
          properties: {
            category: finding.category,
            confidence: finding.confidence,
          },
        });
      }

      const sarifResult: SarifResult = {
        ruleId: finding.rule_id,
        level: this.severityToSarifLevel(finding.severity),
        message: { text: finding.description },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: finding.location.path,
              },
              region: {
                startLine: finding.location.start_line || 1,
                endLine: finding.location.end_line || finding.location.start_line || 1,
                ...(finding.evidence.line_snippet ? { snippet: { text: finding.evidence.line_snippet } } : {}),
              },
            },
          },
        ],
      };

      results.push(sarifResult);
    }

    return {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'ShipShield',
              version: report.tool.version,
              informationUri: 'https://github.com/kashifhm333/ShipShield',
              rules: Array.from(rulesMap.values()),
            },
          },
          results,
        },
      ],
    };
  }
}
