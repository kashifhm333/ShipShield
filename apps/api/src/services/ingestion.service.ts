import { Types } from 'mongoose';
import { ScanReport } from '@shipshield/contracts';
import { RedactionEngine } from '@shipshield/scan-core';
import { FindingModel } from '../db/models/finding.model.js';
import { ScanFindingModel } from '../db/models/scan-finding.model.js';
import { ScanModel, IScan } from '../db/models/scan.model.js';

export interface IngestScanResultInput {
  organizationId: string;
  repositoryId: string;
  scanId: string;
  report: ScanReport;
}

export class IngestionService {
  /**
   * Ingests, sanitizes, and normalizes scan results from worker into MongoDB.
   * Performs upserts on findings collection and links via scan_findings.
   */
  public static async ingestScanResults(input: IngestScanResultInput): Promise<IScan | null> {
    const orgId = new Types.ObjectId(input.organizationId);
    const repoId = new Types.ObjectId(input.repositoryId);
    const now = new Date();

    const scanDoc = await ScanModel.findOne({
      organization_id: orgId,
      scan_id: input.scanId,
    });

    if (!scanDoc) {
      throw new Error(`Scan not found: ${input.scanId}`);
    }

    const findingIdList: Types.ObjectId[] = [];

    // Process each finding
    for (const finding of input.report.findings) {
      // Defense in depth: scrub evidence via RedactionEngine
      const sanitizedSummary = RedactionEngine.redact(finding.evidence.summary);
      const sanitizedSnippet = finding.evidence.line_snippet
        ? RedactionEngine.redact(finding.evidence.line_snippet)
        : undefined;

      const upsertedFinding = await FindingModel.findOneAndUpdate(
        {
          organization_id: orgId,
          repository_id: repoId,
          fingerprint: finding.fingerprint,
        },
        {
          $set: {
            public_id: finding.id,
            category: finding.category,
            scanner: finding.scanner,
            rule_id: finding.rule_id,
            title: finding.title,
            description: finding.description,
            severity: finding.severity,
            severity_original: finding.severity_original,
            confidence: finding.confidence,
            location: finding.location,
            evidence: {
              redacted: true,
              summary: sanitizedSummary,
              line_snippet: sanitizedSnippet,
            },
            remediation: finding.remediation,
            status: finding.status,
            last_detected_scan_id: input.scanId,
            last_seen_at: now,
          },
          $setOnInsert: {
            first_detected_scan_id: input.scanId,
            first_seen_at: now,
          },
        },
        { upsert: true, new: true }
      );

      findingIdList.push(upsertedFinding._id as Types.ObjectId);

      // Upsert scan_findings junction link with strict tenant isolation filter
      await ScanFindingModel.findOneAndUpdate(
        {
          organization_id: orgId,
          scan_id: scanDoc._id,
          finding_id: upsertedFinding._id,
        },
        {
          $setOnInsert: {
            organization_id: orgId,
            scan_id: scanDoc._id,
            finding_id: upsertedFinding._id,
          },
        },
        { upsert: true }
      );
    }

    // Update scan status and summary metrics
    scanDoc.execution_status = input.report.scan.execution_status;
    scanDoc.policy_outcome = input.report.scan.policy_outcome;
    scanDoc.summary = input.report.summary;
    scanDoc.scanners_run = input.report.scanners;
    scanDoc.completed_at = new Date(input.report.scan.completed_at);

    await scanDoc.save();
    return scanDoc;
  }
}
