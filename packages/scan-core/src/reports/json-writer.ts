import fs from 'node:fs';
import path from 'node:path';
import { ScanReport, ScanReportSchema } from '@shipshield/contracts';
import { PathValidator } from '../security/path-validator.js';

export class JsonReportWriter {
  /**
   * Atomically writes a schema-validated ScanReport to the configured report directory.
   * Creates scan-<timestamp>-<scanId>.json and updates latest.json.
   */
  public static write(
    projectRoot: string,
    reportDir: string,
    report: ScanReport
  ): { reportPath: string; latestPath: string } {
    // Validate report schema
    ScanReportSchema.parse(report);

    const resolvedReportDir = path.resolve(projectRoot, reportDir);
    PathValidator.validateContainment(projectRoot, resolvedReportDir);

    if (!fs.existsSync(resolvedReportDir)) {
      fs.mkdirSync(resolvedReportDir, { recursive: true, mode: 0o700 });
    }

    const timestamp = new Date(report.scan.started_at)
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('Z', 'Z');

    const fileName = `scan-${timestamp}-${report.scan.id}.json`;
    const finalReportPath = path.join(resolvedReportDir, fileName);
    const latestPath = path.join(resolvedReportDir, 'latest.json');

    const jsonString = JSON.stringify(report, null, 2);

    // Atomic write pattern: write to tmp file with 0o600, fsync, then rename
    const tmpFile = path.join(resolvedReportDir, `.tmp-scan-${report.scan.id}.json`);
    const fd = fs.openSync(tmpFile, 'w', 0o600);
    try {
      fs.writeSync(fd, jsonString, 0, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    fs.renameSync(tmpFile, finalReportPath);

    // Update latest.json atomically
    const tmpLatest = path.join(resolvedReportDir, `.tmp-latest-${report.scan.id}.json`);
    const fdLatest = fs.openSync(tmpLatest, 'w', 0o600);
    try {
      fs.writeSync(fdLatest, jsonString, 0, 'utf8');
      fs.fsyncSync(fdLatest);
    } finally {
      fs.closeSync(fdLatest);
    }
    fs.renameSync(tmpLatest, latestPath);

    return {
      reportPath: finalReportPath,
      latestPath,
    };
  }
}
