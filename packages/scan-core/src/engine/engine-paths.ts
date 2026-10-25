import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export interface EnginePaths {
  dir: string;
  socketPath: string;
  pidPath: string;
  logPath: string;
  metadataPath: string;
  dbPath: string;
}

export function getEnginePaths(customSocketPath?: string): EnginePaths {
  const dir = path.join(os.homedir(), '.shipshield');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch {
      // Best-effort
    }
  }

  const socketPath =
    customSocketPath ||
    (process.platform === 'win32'
      ? '\\\\.\\pipe\\shipshield-engine'
      : path.join(dir, 'engine.sock'));

  return {
    dir,
    socketPath,
    pidPath: path.join(dir, 'engine.pid'),
    logPath: path.join(dir, 'engine.log'),
    metadataPath: path.join(dir, 'engine.json'),
    dbPath: path.join(dir, 'shipshield.db'),
  };
}
