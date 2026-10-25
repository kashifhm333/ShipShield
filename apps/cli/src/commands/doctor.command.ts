import { Command } from 'commander';
import fs from 'node:fs';
import {
  EngineClient,
  getEnginePaths,
  AdapterRegistry,
  JobStore,
} from '@shipshield/scan-core';
import {
  GitleaksAdapter,
  TrivyDependenciesAdapter,
  TrivyContainersAdapter,
  CheckovAdapter,
} from '@shipshield/scanner-adapters';
import { EXIT_CODES } from '@shipshield/contracts';

export function makeDoctorCommand(): Command {
  return new Command('doctor')
    .description('Run comprehensive environment, service, scanner, and database diagnostics')
    .action(async () => {
      console.log('🛡️  ShipShield System Diagnostics (Doctor)\n');

      const paths = getEnginePaths();
      const client = new EngineClient(paths.socketPath);
      let allHealthy = true;

      // 1. CLI & Node Runtime
      console.log('1. Runtime Environment:');
      console.log(`   ✔ Node.js:        ${process.version} (${process.arch}-${process.platform})`);
      console.log(`   ✔ CLI Path:       ${process.argv[1]}`);
      console.log(`   ✔ User Home:      ${process.env.HOME || 'unknown'}`);
      console.log(`   ✔ Config Dir:     ${paths.dir} (writable: ${fs.existsSync(paths.dir)})`);

      // 2. Background Engine Service
      console.log('\n2. Background Engine & IPC Service:');
      const isEngineRunning = await client.isEngineRunning(300);
      if (isEngineRunning) {
        try {
          const status = await client.getStatus();
          console.log(`   ✔ Engine State:   RUNNING (PID: ${status.pid}, Mode: ${status.mode})`);
          console.log(`   ✔ Socket Path:    ${paths.socketPath} (connected)`);
          console.log(`   ✔ Uptime:         ${status.uptimeSeconds}s`);
        } catch (err: any) {
          console.log(`   ⚠️ Engine State:   ONLINE but status query failed: ${err.message}`);
        }
      } else {
        console.log(`   ⚠️ Engine State:   STOPPED (Standalone mode active)`);
        console.log(`   ℹ Socket:         ${paths.socketPath} (not listening)`);
        console.log(`   💡 Action:        Run "shipshield engine start" to enable background acceleration.`);
      }

      // 3. Local SQLite Persistence Store
      console.log('\n3. Local Job Persistence:');
      try {
        const store = new JobStore(paths.dbPath);
        const count = store.listJobs({ limit: 1 }).length;
        store.close();
        console.log(`   ✔ Database:       ${paths.dbPath} (accessible)`);
        console.log(`   ✔ Job Records:    Accessible`);
      } catch (err: any) {
        allHealthy = false;
        console.log(`   ✖ Database:       ${paths.dbPath} (error: ${err.message})`);
      }

      // 4. Scanner Engines
      console.log('\n4. Security Scanner Engines:');
      const registry = new AdapterRegistry();
      registry.register(new GitleaksAdapter());
      registry.register(new TrivyDependenciesAdapter());
      registry.register(new TrivyContainersAdapter());
      registry.register(new CheckovAdapter());

      for (const adapter of registry.getAll()) {
        const check = await adapter.checkAvailability();
        if (check.available) {
          console.log(`   ✔ ${adapter.id.padEnd(14)} : AVAILABLE (${adapter.name} - ${check.version || 'ready'})`);
        } else {
          console.log(`   ✖ ${adapter.id.padEnd(14)} : MISSING (${check.error || 'not installed'})`);
          if (adapter.id === 'secrets') {
            console.log(`     💡 Fix: Install Gitleaks (sudo apt install gitleaks or https://github.com/gitleaks/gitleaks/releases)`);
          } else if (adapter.id === 'dependencies' || adapter.id === 'containers') {
            console.log(`     💡 Fix: Install Trivy (https://aquasecurity.github.io/trivy/latest/getting-started/installation/)`);
          } else if (adapter.id === 'iac') {
            console.log(`     💡 Fix: Install Checkov (pip install checkov or https://www.checkov.io/)`);
          }
        }
      }

      // Summary
      console.log('\n=== Diagnostic Summary ===');
      if (allHealthy) {
        console.log('✔ Core systems are operational and ready for scanning.\n');
        process.exit(EXIT_CODES.PASSED);
      } else {
        console.log('⚠️ Some components require attention. See recommendations above.\n');
        process.exit(EXIT_CODES.INCOMPLETE);
      }
    });
}
