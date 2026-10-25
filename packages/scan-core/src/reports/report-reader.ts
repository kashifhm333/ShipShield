import fs from 'node:fs';
import path from 'node:path';
import { ScanReport, ScanReportSchema } from '@shipshield/contracts';
import { PathValidator } from '../security/path-validator.js';

export class ReportReader {
  /**
   * Reads and parses a ScanReport from a specific file path or scan ID.
   * If scanIdOrPath is omitted or "latest", reads latest.json from reportDir.
   */
  public static read(
    projectRoot: string,
    reportDir: string,
    scanIdOrPath?: string
  ): { report: ScanReport; filePath: string } {
    const resolvedReportDir = path.resolve(projectRoot, reportDir);
    PathValidator.validateContainment(projectRoot, resolvedReportDir);

    let targetFile: string;

    if (!scanIdOrPath || scanIdOrPath === 'latest') {
      targetFile = path.join(resolvedReportDir, 'latest.json');
    } else if (scanIdOrPath.endsWith('.json')) {
      targetFile = path.isAbsolute(scanIdOrPath)
        ? scanIdOrPath
        : path.resolve(projectRoot, scanIdOrPath);
    } else {
      // Find report by scan ID in reportDir
      if (!fs.existsSync(resolvedReportDir)) {
        throw new Error(`Report directory not found: ${resolvedReportDir}`);
      }
      const files = fs.readdirSync(resolvedReportDir);
      const match = files.find(
        (f) => f.includes(scanIdOrPath) && f.endsWith('.json') && !f.startsWith('.tmp')
      );
      if (!match) {
        throw new Error(`No scan report found matching ID "${scanIdOrPath}" in ${resolvedReportDir}`);
      }
      targetFile = path.join(resolvedReportDir, match);
    }

    PathValidator.validateContainment(projectRoot, targetFile);

    if (!fs.existsSync(targetFile)) {
      throw new Error(`Report file not found: ${targetFile}`);
    }

    const content = fs.readFileSync(targetFile, 'utf8');
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(`Report file ${targetFile} contains invalid JSON: ${error.message}`);
    }

    const report = ScanReportSchema.parse(raw);
    return { report, filePath: targetFile };
  }
}
