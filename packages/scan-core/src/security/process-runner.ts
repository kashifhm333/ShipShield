import { spawn, ChildProcess } from 'node:child_process';

export interface ProcessRunnerOptions {
  executable: string;
  args: string[];
  cwd: string;
  envAllowlist?: Record<string, string>;
  timeoutMs: number;
  maxOutputBufferBytes?: number; // Default: 20 * 1024 * 1024 (20MB)
  maxBufferBytes?: number;
}

export interface ProcessRunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  bufferOverflowed: boolean;
}

export class ProcessRunner {
  private static readonly SAFE_ENV_VARS = [
    'PATH',
    'TMPDIR',
    'TEMP',
    'TMP',
    'HOME',
    'USER',
    'LANG',
    'LC_ALL',
    'SYSTEMROOT',
  ];

  /**
   * Constructs an isolated environment containing only safe system keys plus explicit allowlist.
   */
  public static sanitizeEnvironment(allowlist?: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const key of this.SAFE_ENV_VARS) {
      if (process.env[key] !== undefined) {
        sanitized[key] = process.env[key] as string;
      }
    }

    if (allowlist) {
      for (const [k, v] of Object.entries(allowlist)) {
        sanitized[k] = v;
      }
    }

    return sanitized;
  }

  /**
   * Executes a command inside an isolated subprocess with zero shell interpolation,
   * bounded output buffers, and strict timeout escalation (SIGTERM -> SIGKILL).
   */
  public static async run(options: ProcessRunnerOptions): Promise<ProcessRunResult> {
    const maxBuffer = options.maxBufferBytes ?? options.maxOutputBufferBytes ?? 20 * 1024 * 1024;
    const sanitizedEnv = this.sanitizeEnvironment(options.envAllowlist);
    const startTime = Date.now();

    return new Promise<ProcessRunResult>((resolve) => {
      let child: ChildProcess;
      let timedOut = false;
      let bufferOverflowed = false;
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stdout = '';
      let stderr = '';
      let isSettled = false;
      let timeoutTimer: NodeJS.Timeout | null = null;
      let killEscalationTimer: NodeJS.Timeout | null = null;

      const killProcessGroup = (signal: NodeJS.Signals) => {
        if (!child || child.pid === undefined || child.killed) return;
        try {
          if (process.platform !== 'win32') {
            process.kill(-child.pid, signal);
          } else {
            child.kill(signal);
          }
        } catch {
          // Process might already be dead
        }
      };

      try {
        child = spawn(options.executable, options.args, {
          cwd: options.cwd,
          env: sanitizedEnv,
          shell: false,
          detached: process.platform !== 'win32',
        });
      } catch (err: unknown) {
        const error = err as Error;
        return resolve({
          exitCode: 127,
          signal: null,
          stdout: '',
          stderr: error.message || 'Failed to spawn process',
          durationMs: Date.now() - startTime,
          timedOut: false,
          bufferOverflowed: false,
        });
      }

      // Setup timeout
      if (options.timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          timedOut = true;
          killProcessGroup('SIGTERM');

          // Grace period before SIGKILL
          killEscalationTimer = setTimeout(() => {
            killProcessGroup('SIGKILL');
          }, 5000);
        }, options.timeoutMs);
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        const prevBytes = stdoutBytes;
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxBuffer) {
          bufferOverflowed = true;
          killProcessGroup('SIGTERM');
          const remaining = maxBuffer - prevBytes;
          if (remaining > 0) {
            stdout += chunk.subarray(0, remaining).toString('utf8');
          }
        } else {
          stdout += chunk.toString('utf8');
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const prevBytes = stderrBytes;
        stderrBytes += chunk.length;
        if (stderrBytes > maxBuffer) {
          bufferOverflowed = true;
          killProcessGroup('SIGTERM');
          const remaining = maxBuffer - prevBytes;
          if (remaining > 0) {
            stderr += chunk.subarray(0, remaining).toString('utf8');
          }
        } else {
          stderr += chunk.toString('utf8');
        }
      });

      child.on('error', (err: Error) => {
        if (isSettled) return;
        isSettled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (killEscalationTimer) clearTimeout(killEscalationTimer);

        resolve({
          exitCode: 127,
          signal: null,
          stdout,
          stderr: stderr ? `${stderr}\n${err.message}` : err.message,
          durationMs: Date.now() - startTime,
          timedOut: false,
          bufferOverflowed,
        });
      });

      child.on('close', (code, signal) => {
        if (isSettled) return;
        isSettled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (killEscalationTimer) clearTimeout(killEscalationTimer);

        resolve({
          exitCode: timedOut ? null : code,
          signal,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
          timedOut,
          bufferOverflowed,
        });
      });
    });
  }
}
