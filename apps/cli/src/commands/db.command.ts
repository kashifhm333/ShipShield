import { Command } from 'commander';
import { ScannerId, EXIT_CODES } from '@shipshield/contracts';
import { IntelligenceManager } from '@shipshield/scan-core';

export function makeDbCommand(): Command {
  const dbCmd = new Command('db')
    .description('Manage vulnerability intelligence databases (status, updates, and verification)');

  // 1. shipshield db status
  dbCmd
    .command('status')
    .description('Inspect local vulnerability intelligence database status and freshness')
    .option('--scanner <name>', 'Target scanner database (dependencies, containers)', 'dependencies')
    .option('--json', 'Output diagnostics as JSON')
    .action(async (options) => {
      const targetScanner = options.scanner as ScannerId;
      const validScanners: ScannerId[] = ['dependencies', 'containers'];

      if (!validScanners.includes(targetScanner)) {
        console.error(`Usage Error: Scanner "${targetScanner}" does not support databases. Valid: ${validScanners.join(', ')}`);
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      const intel = await IntelligenceManager.inspectScanner(targetScanner);
      if (options.json) {
        process.stdout.write(JSON.stringify(intel, null, 2) + '\n');
        process.exit(intel.databasePresent ? EXIT_CODES.PASSED : EXIT_CODES.INCOMPLETE);
        return;
      }

      console.log(`🛡️  ShipShield Database Status for "${targetScanner}":`);
      console.log(`  Database Present: ${intel.databasePresent ? 'Yes' : 'No'}`);
      console.log(`  Database Version: ${intel.databaseVersion || 'unknown'}`);
      console.log(`  Freshness Status: ${intel.freshness.toUpperCase()}`);
      console.log(`  Age in Days:      ${intel.databaseAgeDays !== null ? `${intel.databaseAgeDays}d` : 'unknown'}`);
      console.log(`  Last Updated:     ${intel.databaseUpdatedAt || 'never'}`);
      if (intel.remediationGuidance) {
        console.log(`  Notice:           ${intel.remediationGuidance}`);
      }

      process.exit(intel.databasePresent ? EXIT_CODES.PASSED : EXIT_CODES.INCOMPLETE);
    });

  // 2. shipshield db update
  dbCmd
    .command('update')
    .description('Safely download, stage, and atomically activate fresh vulnerability databases')
    .option('--scanner <name>', 'Target scanner database (dependencies, containers)', 'dependencies')
    .option('--force', 'Force download even if local database is considered fresh')
    .option('--cache-dir <path>', 'Override destination cache directory')
    .option('--json', 'Output results as JSON')
    .action(async (options) => {
      const targetScanner = options.scanner as ScannerId;
      const validScanners: ScannerId[] = ['dependencies', 'containers'];

      if (!validScanners.includes(targetScanner)) {
        console.error(`Usage Error: Scanner "${targetScanner}" does not support databases. Valid: ${validScanners.join(', ')}`);
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      if (!options.json) {
        console.log(`🛡️  Updating vulnerability intelligence database for [${targetScanner}]...`);
        console.log('   ↳ Step 1: Downloading intelligence into isolated staging area...');
      }

      const result = await IntelligenceManager.updateDatabase(targetScanner, {
        force: options.force,
        cacheDir: options.cacheDir,
      });

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        process.exit(result.success ? EXIT_CODES.PASSED : EXIT_CODES.DATABASE_ERROR);
        return;
      }

      if (result.success) {
        console.log('   ↳ Step 2: Validating cryptographic integrity & unpacking...');
        console.log('   ↳ Step 3: Atomically activating fresh intelligence...');
        console.log(`✔ Vulnerability database successfully updated to version "${result.newVersion || 'latest'}".\n`);
        process.exit(EXIT_CODES.PASSED);
      } else {
        console.error(`\n✖ Database update failed: ${result.errorMessage}`);
        process.exit(EXIT_CODES.DATABASE_ERROR);
      }
    });

  // 3. shipshield db verify
  dbCmd
    .command('verify')
    .description('Verify the cryptographic checksums and file health of cached databases')
    .option('--scanner <name>', 'Target scanner database (dependencies, containers)', 'dependencies')
    .option('--json', 'Output verification report as JSON')
    .action(async (options) => {
      const targetScanner = options.scanner as ScannerId;
      const validScanners: ScannerId[] = ['dependencies', 'containers'];

      if (!validScanners.includes(targetScanner)) {
        console.error(`Usage Error: Scanner "${targetScanner}" does not support databases. Valid: ${validScanners.join(', ')}`);
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      const res = await IntelligenceManager.verifyDatabase(targetScanner);

      if (options.json) {
        process.stdout.write(JSON.stringify(res, null, 2) + '\n');
        process.exit(res.verified ? EXIT_CODES.PASSED : EXIT_CODES.DATABASE_ERROR);
        return;
      }

      console.log(`🛡️  Verifying Intelligence Database Integrity [${targetScanner}]:`);
      if (res.verified) {
        console.log(`  ✔ Status: VERIFIED`);
        console.log(`  ✔ Files Checked: ${res.filesChecked.join(', ')}`);
        for (const [file, hash] of Object.entries(res.checksums)) {
          console.log(`     ↳ ${file}: sha256:${hash.slice(0, 16)}...`);
        }
        console.log(`\n✔ ${res.message}\n`);
        process.exit(EXIT_CODES.PASSED);
      } else {
        console.log(`  ✖ Status: FAILED`);
        console.log(`  ✖ Error:  ${res.message}\n`);
        process.exit(EXIT_CODES.DATABASE_ERROR);
      }
    });

  return dbCmd;
}
