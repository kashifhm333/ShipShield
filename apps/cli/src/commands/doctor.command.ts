import { Command } from 'commander';
import fs from 'node:fs';
import {
  EngineClient,
  getEnginePaths,
  JobStore,
  IntelligenceManager,
} from '@shipshield/scan-core';
import { EXIT_CODES, SHIPSHIELD_VERSION } from '@shipshield/contracts';


export function makeDoctorCommand(): Command {
  return new Command('doctor')
    .description('Run comprehensive environment, service, scanner, and database diagnostics')
    .option('--json', 'Output diagnostics as machine-readable JSON')
    .action(async (options) => {
      const paths = getEnginePaths();
      const client = new EngineClient(paths.socketPath);
      let coreHealthy = true;

      // 1. Runtime Environment Check
      const nodeVersion = process.version;
      const archPlatform = `${process.arch}-${process.platform}`;
      const cliPath = process.argv[1];
      const userHome = process.env.HOME || 'unknown';
      const configDirWritable = fs.existsSync(paths.dir);

      // 2. Background Engine Service Check
      let engineState = 'STOPPED';
      let enginePid: number | null = null;
      let engineMode: string | null = null;
      let engineUptime: number | null = null;
      let engineSocketConnected = false;

      const isEngineRunning = await client.isEngineRunning(300);
      if (isEngineRunning) {
        try {
          const status = await client.getStatus();
          engineState = 'RUNNING';
          enginePid = status.pid;
          engineMode = status.mode;
          engineUptime = status.uptimeSeconds;
          engineSocketConnected = true;
        } catch {
          engineState = 'ONLINE_UNRESPONSIVE';
        }
      }

      // 3. Local SQLite Store Check
      let dbAccessible = false;
      let dbError: string | null = null;
      try {
        const store = new JobStore(paths.dbPath);
        store.listJobs({ limit: 1 });
        store.close();
        dbAccessible = true;
      } catch (err: any) {
        coreHealthy = false;
        dbError = err.message;
      }

      // 4. Intelligence and Scanner Engines Readiness
      const readiness = await IntelligenceManager.getReadinessReport();
      const allHealthy = coreHealthy && readiness.healthy;

      if (options.json) {
        const jsonOutput = {
          schema_version: '1.0',
          tool: {
            name: 'shipshield',
            version: SHIPSHIELD_VERSION,
          },
          healthy: allHealthy,
          offline_ready: readiness.offlineReady,
          timestamp: readiness.timestamp,
          environment: {
            node_version: nodeVersion,
            architecture: archPlatform,
            cli_path: cliPath,
            user_home: userHome,
            config_dir: paths.dir,
            config_dir_writable: configDirWritable,
          },
          engine_service: {
            state: engineState,
            pid: enginePid,
            mode: engineMode,
            uptime_seconds: engineUptime,
            socket_path: paths.socketPath,
            socket_connected: engineSocketConnected,
          },
          persistence: {
            db_path: paths.dbPath,
            accessible: dbAccessible,
            error: dbError,
          },
          scanners: readiness.scanners,
          summary: readiness.summary,
          missing_actions: readiness.missingActions,
        };

        process.stdout.write(JSON.stringify(jsonOutput, null, 2) + '\n');
        process.exit(allHealthy ? EXIT_CODES.PASSED : EXIT_CODES.INCOMPLETE);
        return;
      }

      // Terminal text output
      console.log('🛡️  ShipShield System Diagnostics (Doctor)\n');

      console.log('1. Runtime Environment:');
      console.log(`   ✔ Node.js:        ${nodeVersion} (${archPlatform})`);
      console.log(`   ✔ CLI Path:       ${cliPath}`);
      console.log(`   ✔ User Home:      ${userHome}`);
      console.log(`   ✔ Config Dir:     ${paths.dir} (writable: ${configDirWritable})`);

      console.log('\n2. Background Engine & IPC Service:');
      if (engineSocketConnected) {
        console.log(`   ✔ Engine State:   RUNNING (PID: ${enginePid}, Mode: ${engineMode})`);
        console.log(`   ✔ Socket Path:    ${paths.socketPath} (connected)`);
        console.log(`   ✔ Uptime:         ${engineUptime}s`);
      } else {
        console.log(`   ⚠️ Engine State:   STOPPED (Standalone mode active)`);
        console.log(`   ℹ Socket:         ${paths.socketPath} (not listening)`);
        console.log(`   💡 Action:        Run "shipshield engine start" to enable background acceleration.`);
      }

      console.log('\n3. Local Job Persistence:');
      if (dbAccessible) {
        console.log(`   ✔ Database:       ${paths.dbPath} (accessible)`);
        console.log(`   ✔ Job Records:    Accessible`);
      } else {
        console.log(`   ✖ Database:       ${paths.dbPath} (error: ${dbError})`);
      }

      console.log('\n4. Security Scanner Engines & Intelligence:');
      for (const [id, intel] of Object.entries(readiness.scanners)) {
        if (intel.binaryInstalled) {
          let extra = `AVAILABLE (${intel.scannerName} - ${intel.binaryVersion || 'ready'})`;
          if (intel.databaseRequired) {
            extra += `\n     ↳ Database:     ${intel.freshness.toUpperCase()} (${intel.databaseAgeDays !== null ? `${intel.databaseAgeDays}d old, ` : ''}version: ${intel.databaseVersion || 'unknown'})`;
          }
          console.log(`   ✔ ${id.padEnd(14)} : ${extra}`);
          if (intel.freshness === 'stale' || intel.freshness === 'expired') {
            console.log(`     ⚠️  Notice:      ${intel.remediationGuidance}`);
          }
        } else {
          console.log(`   ✖ ${id.padEnd(14)} : MISSING (binary not installed)`);
          if (intel.remediationGuidance) {
            console.log(`     💡 Fix:         ${intel.remediationGuidance}`);
          }
        }
      }

      console.log('\n=== Diagnostic Summary ===');
      if (readiness.offlineReady) {
        console.log(`✔ Offline Scanning Ready: [${readiness.summary.availableOffline.join(', ')}] available without network.`);
      } else {
        console.log('⚠️  Offline scanning requires attention: Some vulnerability intelligence is missing.');
      }

      if (allHealthy) {
        console.log('✔ Core systems are operational and ready for scanning.\n');
        process.exit(EXIT_CODES.PASSED);
      } else {
        console.log('⚠️ Some components require attention. See recommendations above.\n');
        process.exit(EXIT_CODES.INCOMPLETE);
      }
    });
}
