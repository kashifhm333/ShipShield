import { Command } from 'commander';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EngineClient,
  getEnginePaths,
  ProcessRunner,
} from '@shipshield/scan-core';
import { EXIT_CODES } from '@shipshield/contracts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function makeEngineCommand(): Command {
  const engineCmd = new Command('engine')
    .description('Manage the background ShipShield security engine daemon');

  // shipshield engine start
  engineCmd
    .command('start')
    .description('Start the ShipShield background engine daemon')
    .option('--native', 'Run native host Node.js daemon (default)')
    .option('--docker', 'Run containerized engine with pre-bundled scanner binaries')
    .option('--foreground', 'Run daemon in foreground (attached to current terminal)')
    .action(async (options) => {
      const paths = getEnginePaths();
      const client = new EngineClient(paths.socketPath);

      if (await client.isEngineRunning()) {
        try {
          const status = await client.getStatus();
          console.log(`ℹ ShipShield Engine is already running (PID: ${status.pid}, Mode: ${status.mode}).`);
          console.log(`  Socket: ${paths.socketPath}`);
          process.exit(EXIT_CODES.PASSED);
          return;
        } catch {
          // Socket exists but unresponsive; continue to start
        }
      }

      const useDocker = !!options.docker;

      if (useDocker) {
        const dockerCheck = await ProcessRunner.run({
          executable: 'docker',
          args: ['--version'],
          cwd: process.cwd(),
          timeoutMs: 5000,
        });

        if (dockerCheck.exitCode !== 0) {
          console.error('Error: Docker is not installed or not available on PATH.');
          process.exit(EXIT_CODES.USAGE_ERROR);
          return;
        }

        console.log('🐳 Starting ShipShield Engine container in background...');
        try {
          // Remove any existing stopped container
          await ProcessRunner.run({
            executable: 'docker',
            args: ['rm', '-f', 'shipshield-engine'],
            cwd: process.cwd(),
            timeoutMs: 10000,
          });

          const runResult = await ProcessRunner.run({
            executable: 'docker',
            args: [
              'run',
              '-d',
              '--name',
              'shipshield-engine',
              '-v',
              `${paths.dir}:/root/.shipshield`,
              '-e',
              'SHIPSHIELD_ENGINE_MODE=docker',
              'shipshield/engine:latest',
            ],
            cwd: process.cwd(),
            timeoutMs: 30000,
          });

          if (runResult.exitCode !== 0) {
            console.error(`Failed to start Docker engine: ${runResult.stderr || runResult.stdout}`);
            process.exit(EXIT_CODES.INTERNAL_ERROR);
            return;
          }

          console.log('✔ ShipShield Engine container started.');
          console.log(`  Socket: ${paths.socketPath}`);
          process.exit(EXIT_CODES.PASSED);
          return;
        } catch (err: any) {
          console.error(`Failed to start Docker engine: ${err?.message || err}`);
          process.exit(EXIT_CODES.INTERNAL_ERROR);
          return;
        }
      }

      // Native background mode
      const daemonScript = path.resolve(__dirname, '../engine-daemon.js');

      if (options.foreground) {
        console.log('🚀 Starting ShipShield Engine in foreground...');
        const child = spawn(process.execPath, [daemonScript], {
          stdio: 'inherit',
          env: { ...process.env, SHIPSHIELD_ENGINE_MODE: 'native' },
        });
        child.on('exit', (code) => process.exit(code || 0));
        return;
      }

      console.log('🚀 Launching ShipShield background engine daemon...');
      const logFd = fs.openSync(paths.logPath, 'a');

      const child = spawn(process.execPath, [daemonScript], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: { ...process.env, SHIPSHIELD_ENGINE_MODE: 'native' },
      });

      child.unref();

      // Wait up to 3 seconds for socket to become active
      const startTime = Date.now();
      let ready = false;
      while (Date.now() - startTime < 3500) {
        await new Promise((r) => setTimeout(r, 150));
        if (await client.isEngineRunning()) {
          ready = true;
          break;
        }
      }

      if (ready) {
        console.log(`✔ ShipShield Engine started successfully in background!`);
        console.log(`  PID:     ${child.pid}`);
        console.log(`  Socket:  ${paths.socketPath}`);
        console.log(`  Logs:    ${paths.logPath}`);
        console.log(`\nRun scans instantly from ANY directory:`);
        console.log(`  cd /path/to/any/project && shipshield plan`);
        process.exit(EXIT_CODES.PASSED);
      } else {
        console.error(`❌ Engine failed to respond within 3 seconds. Check logs at: ${paths.logPath}`);
        process.exit(EXIT_CODES.INTERNAL_ERROR);
      }
    });

  // shipshield engine stop
  engineCmd
    .command('stop')
    .description('Stop the running ShipShield background engine daemon')
    .action(async () => {
      const paths = getEnginePaths();
      const client = new EngineClient(paths.socketPath);

      let stopped = false;
      if (await client.isEngineRunning()) {
        stopped = await client.stopEngine();
      }

      // Also check docker container
      try {
        const dockerPs = await ProcessRunner.run({
          executable: 'docker',
          args: ['ps', '-q', '-f', 'name=shipshield-engine'],
          cwd: process.cwd(),
          timeoutMs: 5000,
        });
        if (dockerPs.exitCode === 0 && dockerPs.stdout.trim().length > 0) {
          await ProcessRunner.run({
            executable: 'docker',
            args: ['rm', '-f', 'shipshield-engine'],
            cwd: process.cwd(),
            timeoutMs: 10000,
          });
          stopped = true;
        }
      } catch {
        // Docker not running or container not found
      }

      // Fallback: check PID file
      if (fs.existsSync(paths.pidPath)) {
        try {
          const pid = parseInt(fs.readFileSync(paths.pidPath, 'utf8').trim(), 10);
          if (!isNaN(pid)) {
            process.kill(pid, 'SIGTERM');
            stopped = true;
          }
        } catch {
          // Process already dead
        }
        try {
          fs.unlinkSync(paths.pidPath);
        } catch {
          // Ignored
        }
      }

      if (fs.existsSync(paths.socketPath)) {
        try {
          fs.unlinkSync(paths.socketPath);
        } catch {
          // Ignored
        }
      }

      if (stopped) {
        console.log('✔ ShipShield Engine daemon stopped.');
      } else {
        console.log('ℹ ShipShield Engine is not running.');
      }
      process.exit(EXIT_CODES.PASSED);
    });

  // shipshield engine status
  engineCmd
    .command('status')
    .description('Display status and health of the ShipShield background engine')
    .action(async () => {
      const paths = getEnginePaths();
      const client = new EngineClient(paths.socketPath);

      if (!(await client.isEngineRunning())) {
        console.log('● ShipShield Engine: STOPPED');
        console.log(`  Socket: ${paths.socketPath} (not listening)`);
        console.log(`\nTo start the engine, run:`);
        console.log(`  shipshield engine start`);
        process.exit(EXIT_CODES.PASSED);
        return;
      }

      try {
        const status = await client.getStatus();
        console.log(`🛡️  ShipShield Engine Status`);
        console.log(`● State:    RUNNING`);
        console.log(`● Mode:     ${status.mode}`);
        console.log(`● PID:      ${status.pid}`);
        console.log(`● Uptime:   ${status.uptimeSeconds}s`);
        console.log(`● Socket:   ${status.socketPath}`);
        console.log(`● Version:  ${status.version}`);
        console.log(`\nRegistered Scanner Engines:`);
        for (const scanner of status.scanners) {
          const icon = scanner.available ? '✔' : '✖';
          const info = scanner.available
            ? `AVAILABLE (${scanner.version || 'ready'})`
            : `MISSING (${scanner.error || 'not found'})`;
          console.log(`  ${icon} ${scanner.id.padEnd(14)} : ${info}`);
        }
        process.exit(EXIT_CODES.PASSED);
      } catch (err: any) {
        console.error(`Error querying engine status: ${err?.message || err}`);
        process.exit(EXIT_CODES.INTERNAL_ERROR);
      }
    });

  // shipshield engine logs
  engineCmd
    .command('logs')
    .description('Display output logs from the background engine daemon')
    .option('-n, --lines <number>', 'Number of lines to show', '50')
    .action((options) => {
      const paths = getEnginePaths();
      if (!fs.existsSync(paths.logPath)) {
        console.log(`No logs found at ${paths.logPath}.`);
        process.exit(EXIT_CODES.PASSED);
        return;
      }

      const count = parseInt(options.lines, 10) || 50;
      const content = fs.readFileSync(paths.logPath, 'utf8');
      const lines = content.split('\n');
      const slice = lines.slice(-count).join('\n');
      console.log(slice);
      process.exit(EXIT_CODES.PASSED);
    });

  return engineCmd;
}
