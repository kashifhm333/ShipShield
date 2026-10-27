import { Command } from 'commander';
import { ScannerId, EXIT_CODES } from '@shipshield/contracts';
import { IntelligenceManager } from '@shipshield/scan-core';

export function makeUpdateDbCommand(): Command {
  return new Command('update-db')
    .description('Safely download, verify, and atomically activate security intelligence databases')
    .option('--scanner <name>', 'Target scanner database to update (dependencies, containers)', 'dependencies')
    .option('--force', 'Force download even if local database is considered fresh')
    .option('--check-only', 'Inspect local database status and freshness without performing downloads')
    .option('--cache-dir <path>', 'Override destination cache directory')
    .option('--json', 'Output results as machine-readable JSON')
    .action(async (options) => {
      const targetScanner = options.scanner as ScannerId;
      const validScanners: ScannerId[] = ['dependencies', 'containers'];

      if (!validScanners.includes(targetScanner)) {
        console.error(
          `Usage Error: Scanner "${targetScanner}" does not support database updates. Valid options: ${validScanners.join(', ')}`
        );
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      if (options.checkOnly) {
        const intel = await IntelligenceManager.inspectScanner(targetScanner);
        if (options.json) {
          process.stdout.write(JSON.stringify(intel, null, 2) + '\n');
        } else {
          console.log(`🛡️  ShipShield Intelligence Status for "${targetScanner}":`);
          console.log(`  Database Present: ${intel.databasePresent ? 'Yes' : 'No'}`);
          console.log(`  Database Version: ${intel.databaseVersion || 'unknown'}`);
          console.log(`  Freshness Status: ${intel.freshness.toUpperCase()}`);
          console.log(`  Age:              ${intel.databaseAgeDays !== null ? `${intel.databaseAgeDays} days` : 'unknown'}`);
          console.log(`  Last Updated:     ${intel.databaseUpdatedAt || 'never'}`);
          if (intel.remediationGuidance) {
            console.log(`  Notice:           ${intel.remediationGuidance}`);
          }
        }
        process.exit(intel.databasePresent ? EXIT_CODES.PASSED : EXIT_CODES.INCOMPLETE);
        return;
      }

      if (!options.json) {
        console.log(`🛡️  Starting safe database update for [${targetScanner}]...`);
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
        console.log('   ↳ Step 2: Validating artifact integrity & compatibility... [PASS]');
        console.log('   ↳ Step 3: Backing up previous working database...');
        console.log('   ↳ Step 4: Atomically activating new intelligence database... [OK]');
        console.log(`\n✔ Database update SUCCEEDED in ${result.durationMs}ms`);
        console.log(`  Previous Version: ${result.previousVersion || 'none'}`);
        console.log(`  New Version:      ${result.newVersion || 'latest'}`);
        console.log(`  Updated At:       ${result.updatedAt || 'now'}`);
        console.log(`  Active Location:  ${result.activePath}\n`);
        process.exit(EXIT_CODES.PASSED);
      } else {
        console.error(`\n❌ Database update FAILED in ${result.durationMs}ms`);
        console.error(`  Error: ${result.errorMessage}`);
        if (result.backupPath) {
          console.error(`  Rollback: Restored last known-good database from ${result.backupPath}`);
        }
        process.exit(EXIT_CODES.DATABASE_ERROR);
      }
    });
}
