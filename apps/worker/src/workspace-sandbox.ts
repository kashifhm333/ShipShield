import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProcessRunner } from '@shipshield/scan-core';

export class WorkspaceSandbox {
  private readonly workspaceDir: string;

  constructor(scanId: string) {
    this.workspaceDir = path.join(os.tmpdir(), `shipshield-work-${scanId}`);
  }

  public get path(): string {
    return this.workspaceDir;
  }

  public async setup(): Promise<void> {
    if (!fs.existsSync(this.workspaceDir)) {
      fs.mkdirSync(this.workspaceDir, { recursive: true, mode: 0o700 });
    }
  }

  public async shallowCheckout(repoUrl: string, commitSha: string): Promise<void> {
    if (repoUrl.startsWith('-') || commitSha.startsWith('-')) {
      throw new Error('Invalid repository URL or commit SHA: arguments starting with hyphen are disallowed');
    }

    await this.setup();

    // 1. git init
    await ProcessRunner.run({
      executable: 'git',
      args: ['init'],
      cwd: this.workspaceDir,
      timeoutMs: 10000,
    });

    // 2. git remote add origin
    await ProcessRunner.run({
      executable: 'git',
      args: ['remote', 'add', 'origin', repoUrl],
      cwd: this.workspaceDir,
      timeoutMs: 10000,
    });

    // 3. git fetch --depth 1 origin <commitSha>
    await ProcessRunner.run({
      executable: 'git',
      args: [
        '-c',
        'protocol.file.allow=never',
        'fetch',
        '--depth',
        '1',
        'origin',
        commitSha,
        '--no-recurse-submodules',
      ],
      cwd: this.workspaceDir,
      timeoutMs: 30000,
    });

    // 4. git checkout FETCH_HEAD
    await ProcessRunner.run({
      executable: 'git',
      args: ['checkout', 'FETCH_HEAD'],
      cwd: this.workspaceDir,
      timeoutMs: 15000,
    });
  }

  public async teardown(): Promise<void> {
    try {
      if (fs.existsSync(this.workspaceDir)) {
        fs.rmSync(this.workspaceDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore teardown errors
    }
  }
}
