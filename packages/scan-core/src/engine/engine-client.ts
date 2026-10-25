import net from 'node:net';
import crypto from 'node:crypto';
import {
  EngineRequest,
  EngineResponse,
  EngineStatus,
  EnginePlanParams,
} from '@shipshield/contracts';
import { getEnginePaths } from './engine-paths.js';

export class EngineClient {
  private readonly socketPath: string;

  constructor(socketPath?: string) {
    this.socketPath = socketPath || getEnginePaths().socketPath;
  }

  public async isEngineRunning(timeoutMs = 300): Promise<boolean> {
    return new Promise((resolve) => {
      let isResolved = false;
      const socket = net.createConnection(this.socketPath);

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          socket.destroy();
          resolve(false);
        }
      }, timeoutMs);

      socket.on('connect', () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          socket.end();
          resolve(true);
        }
      });

      socket.on('error', () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          resolve(false);
        }
      });
    });
  }

  public async sendRequest<T = any>(
    type: EngineRequest['type'],
    params?: Record<string, any>,
    timeoutMs = 30000
  ): Promise<EngineResponse & { data?: T }> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const request: EngineRequest = { id, type, params };

      let buffer = '';
      let isResolved = false;

      const socket = net.createConnection(this.socketPath);

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          socket.destroy();
          reject(new Error(`Engine request timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      socket.on('connect', () => {
        socket.write(JSON.stringify(request) + '\n');
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const newlineIdx = buffer.indexOf('\n');
        if (newlineIdx !== -1) {
          const raw = buffer.slice(0, newlineIdx).trim();
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            socket.end();
            try {
              const parsed = JSON.parse(raw) as EngineResponse;
              resolve(parsed);
            } catch (err) {
              reject(new Error(`Failed to parse engine response: ${err}`));
            }
          }
        }
      });

      socket.on('error', (err) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      socket.on('close', () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          if (buffer.trim()) {
            try {
              resolve(JSON.parse(buffer.trim()));
            } catch (err) {
              reject(new Error(`Engine closed before valid response: ${err}`));
            }
          } else {
            reject(new Error('Engine closed connection without response'));
          }
        }
      });
    });
  }

  public async ping(): Promise<boolean> {
    try {
      const res = await this.sendRequest('ping', undefined, 2000);
      return res.success;
    } catch {
      return false;
    }
  }

  public async getStatus(): Promise<EngineStatus> {
    const res = await this.sendRequest<EngineStatus>('status', undefined, 5000);
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Failed to get engine status');
    }
    return res.data;
  }

  public async runPlan(params: EnginePlanParams): Promise<any> {
    const timeout = (params.timeoutSeconds || 600) * 1000;
    const res = await this.sendRequest('plan', params, timeout + 10000);
    if (!res.success) {
      throw new Error(res.error || 'Engine failed to execute plan');
    }
    return res.data;
  }

  public async stopEngine(): Promise<boolean> {
    try {
      const res = await this.sendRequest('stop', undefined, 3000);
      return res.success;
    } catch {
      return false;
    }
  }
}
