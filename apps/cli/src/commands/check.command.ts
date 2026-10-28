import { Command } from 'commander';
import { IntelligenceManager } from '@shipshield/scan-core';
import { EXIT_CODES, SHIPSHIELD_VERSION } from '@shipshield/contracts';

export function makeCheckCommand(): Command {
  return new Command('check')
    .description('Quickly check system health, scanner readiness, and offline capability')
    .option('--mode <mode>', 'Inspection mode: online or offline', 'online')
    .option('--json', 'Output readiness report as machine-readable JSON')
    .action(async (options) => {
      const isOffline = options.mode === 'offline';
      const readiness = await IntelligenceManager.getReadinessReport();

      if (options.json) {
        process.stdout.write(
          JSON.stringify(
            {
              tool: 'shipshield',
              version: SHIPSHIELD_VERSION,
              mode: options.mode,
              healthy: readiness.healthy,
              offline_ready: readiness.offlineReady,
              summary: readiness.summary,
              scanners: readiness.scanners,
            },
            null,
            2
          ) + '\n'
        );
        process.exit(readiness.healthy ? EXIT_CODES.PASSED : EXIT_CODES.INCOMPLETE);
        return;
      }

      console.log(`🛡️  ShipShield Health & Readiness Check [Mode: ${options.mode.toUpperCase()}]\n`);

      console.log('Scanners & Intelligence Engines:');
      for (const [id, sc] of Object.entries(readiness.scanners)) {
        const icon = sc.binaryInstalled ? '✔' : '✖';
        let detail = sc.binaryInstalled
          ? `AVAILABLE (${sc.scannerName} - ${sc.binaryVersion || 'ready'})`
          : 'MISSING (binary not installed)';
        if (sc.databaseRequired) {
          detail += ` [DB: ${sc.freshness.toUpperCase()}${sc.databaseAgeDays !== null ? `, ${sc.databaseAgeDays}d` : ''}]`;
        }
        console.log(`  ${icon} ${id.padEnd(14)}: ${detail}`);
      }

      console.log('\nNative Policy Engine:');
      console.log('  ✔ native-policies: AVAILABLE (Built-in offline static security rules)');

      console.log('\nReadiness Summary:');
      if (isOffline) {
        if (readiness.offlineReady) {
          console.log(`  ✔ Offline Scanning Ready: [${readiness.summary.availableOffline.join(', ')}] accessible without network.\n`);
          process.exit(EXIT_CODES.PASSED);
        } else {
          console.log(`  ⚠️  Offline Scanning Incomplete: Some vulnerability intelligence is missing or unseeded.\n`);
          process.exit(EXIT_CODES.INCOMPLETE);
        }
      } else {
        if (readiness.healthy) {
          console.log(`  ✔ All security engines are operational and ready for scanning.\n`);
          process.exit(EXIT_CODES.PASSED);
        } else {
          console.log(`  ⚠️  Some scanner engines are missing. Run 'shipshield doctor' for installation guidance.\n`);
          process.exit(EXIT_CODES.PASSED);
        }
      }
    });
}
