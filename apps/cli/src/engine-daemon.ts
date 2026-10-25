import fs from 'node:fs';
import { AdapterRegistry, EngineServer, getEnginePaths } from '@shipshield/scan-core';
import {
  GitleaksAdapter,
  TrivyDependenciesAdapter,
  TrivyContainersAdapter,
  CheckovAdapter,
} from '@shipshield/scanner-adapters';

async function runDaemon(): Promise<void> {
  const paths = getEnginePaths();

  const adapters = new AdapterRegistry();
  adapters.register(new GitleaksAdapter());
  adapters.register(new TrivyDependenciesAdapter());
  adapters.register(new TrivyContainersAdapter());
  adapters.register(new CheckovAdapter());

  const server = new EngineServer({
    socketPath: paths.socketPath,
    adapters,
    mode: (process.env.SHIPSHIELD_ENGINE_MODE as 'native' | 'docker') || 'native',
    version: '1.0.0',
  });

  const cleanup = async () => {
    try {
      await server.stop();
    } catch {
      // Ignored
    }
    process.exit(0);
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGHUP', cleanup);

  try {
    await server.start();
    // Keep alive
  } catch (err) {
    fs.appendFileSync(paths.logPath, `[${new Date().toISOString()}] Server start failed: ${err}\n`);
    process.exit(1);
  }
}

runDaemon().catch((err) => {
  console.error('Fatal daemon error:', err);
  process.exit(1);
});
