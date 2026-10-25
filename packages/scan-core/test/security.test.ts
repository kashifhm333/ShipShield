import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PathValidator, SecurityBoundaryError } from '../src/security/path-validator.js';
import { RedactionEngine } from '../src/security/redaction-engine.js';
import { FingerprintGenerator } from '../src/security/fingerprint.js';
import { ProcessRunner } from '../src/security/process-runner.js';

describe('Security Primitives Suite', () => {
  describe('PathValidator', () => {
    it('allows valid paths contained within project root', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-test-root-'));
      try {
        const file = path.join(root, 'src', 'index.ts');
        fs.mkdirSync(path.join(root, 'src'), { recursive: true });
        fs.writeFileSync(file, 'console.log("hello");');

        const rel = PathValidator.validateContainment(root, file);
        expect(rel).toBe('src/index.ts');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('blocks directory traversal attempts (../../etc/passwd)', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-test-root-'));
      try {
        const traversalTarget = path.join(root, '..', '..', 'etc', 'passwd');
        expect(() => PathValidator.validateContainment(root, traversalTarget)).toThrow(
          SecurityBoundaryError
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('blocks symlinks pointing outside project root', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-test-root-'));
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-test-outside-'));
      try {
        const secretFile = path.join(outside, 'secret.txt');
        fs.writeFileSync(secretFile, 'sensitive data');

        const symlinkPath = path.join(root, 'symlink-to-secret');
        try {
          fs.symlinkSync(secretFile, symlinkPath);
        } catch {
          // In some restricted environments symlink creation requires admin rights
          return;
        }

        expect(() => PathValidator.validateContainment(root, symlinkPath)).toThrow(
          SecurityBoundaryError
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    it('strips ANSI escape sequences and control characters', () => {
      const polluted = '\x1b[31m/workspace/\x00evil/path\x1b[0m';
      const sanitized = PathValidator.sanitizePathString(polluted);
      expect(sanitized).toBe('/workspace/evil/path');
    });

    it('throws error if root directory does not exist', () => {
      expect(() => {
        PathValidator.validateContainment('/non/existent/root/dir/123', 'file.txt');
      }).toThrow(/Root directory does not exist/);
    });

    it('returns "." when candidate is identical to root', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-test-dot-'));
      try {
        const rel = PathValidator.validateContainment(root, root);
        expect(rel).toBe('.');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe('RedactionEngine', () => {
    it('redacts literal raw secrets with 0% leakage', () => {
      const raw = 'my-super-secret-password-12345';
      const text = `Error connecting with auth: ${raw} to database`;
      const redacted = RedactionEngine.redact(text, raw);
      expect(redacted).not.toContain(raw);
      expect(redacted).toBe('Error connecting with auth: **** to database');
    });

    it('redacts AWS Access Keys', () => {
      const text = 'AWS_KEY=AKIAIOSFODNN7EXAMPLE in config';
      const redacted = RedactionEngine.redact(text);
      expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(redacted).toContain('AKIA****');
    });

    it('redacts GitHub Tokens', () => {
      const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const text = `Authorization: token ${token}`;
      const redacted = RedactionEngine.redact(text);
      expect(redacted).not.toContain(token);
      expect(redacted).toContain('ghp_****');
    });

    it('redacts Private Key Blocks', () => {
      const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1+
sometestkeydatahere
-----END RSA PRIVATE KEY-----`;
      const redacted = RedactionEngine.redact(pem);
      expect(redacted).not.toContain('sometestkeydatahere');
      expect(redacted).toContain('[REDACTED PRIVATE KEY]');
    });

    it('redacts high-entropy Base64/Hex tokens (H > 4.5)', () => {
      // Base64 string with diverse characters (uppercase, lowercase, digits, symbols) has H > 4.5
      const highEntropy = 'dGhpcy1pcy1hLXN1cGVyLXNlY3JldC1oaWdoLWVudHJvcHktdG9rZW4tOTk5IV8rPQ';
      expect(RedactionEngine.calculateEntropy(highEntropy)).toBeGreaterThan(4.5);
      const text = `const data = "${highEntropy}";`;
      const redacted = RedactionEngine.redact(text);
      expect(redacted).not.toContain(highEntropy);
      expect(redacted).toContain('****************');
    });
  });

  describe('FingerprintGenerator', () => {
    it('computes deterministic fingerprints for secrets using structural context', () => {
      const fp1 = FingerprintGenerator.generateFingerprint({
        category: 'secrets',
        ruleId: 'aws-secret',
        relativePath: 'src/config.ts',
        structuralContext: 'const key = "AKIA****";',
      });

      const fp2 = FingerprintGenerator.generateFingerprint({
        category: 'secrets',
        ruleId: 'aws-secret',
        relativePath: 'src/config.ts',
        structuralContext: 'const key = "AKIA****";',
      });

      expect(fp1).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(fp1).toBe(fp2);

      const pubId = FingerprintGenerator.generatePublicId('secrets', fp1);
      expect(pubId).toMatch(/^SS-SEC-[A-Z0-9]{4,12}$/);
    });

    it('computes deterministic fingerprints for dependencies without line numbers', () => {
      const fp = FingerprintGenerator.generateFingerprint({
        category: 'dependencies',
        ruleId: 'CVE-2023-1234',
        relativePath: 'package.json',
        packageName: 'lodash',
        installedVersion: '4.17.20',
      });
      expect(fp).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });

  describe('ProcessRunner', () => {
    it('sanitizes child environment and excludes sensitive env vars', async () => {
      process.env.AWS_SECRET_ACCESS_KEY = 'super-secret-key';
      const result = await ProcessRunner.run({
        executable: 'node',
        args: ['-e', 'console.log(JSON.stringify(process.env))'],
        cwd: process.cwd(),
        timeoutMs: 5000,
      });

      delete process.env.AWS_SECRET_ACCESS_KEY;
      expect(result.exitCode).toBe(0);
      const childEnv = JSON.parse(result.stdout);
      expect(childEnv.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect(childEnv.PATH).toBeDefined();
    });

    it('handles process timeouts cleanly with SIGTERM', async () => {
      const result = await ProcessRunner.run({
        executable: 'node',
        args: ['-e', 'setTimeout(() => {}, 10000)'],
        cwd: process.cwd(),
        timeoutMs: 200,
      });

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBeNull();
    });

    it('caps stdout and stderr when buffer overflow threshold is reached', async () => {
      const result = await ProcessRunner.run({
        executable: 'node',
        args: ['-e', 'process.stdout.write("A".repeat(5000)); process.stderr.write("B".repeat(5000));'],
        cwd: process.cwd(),
        timeoutMs: 5000,
        maxBufferBytes: 50,
      });

      expect(result.bufferOverflowed).toBe(true);
      expect(result.stdout.length).toBeLessThanOrEqual(50);
      expect(result.stderr.length).toBeLessThanOrEqual(50);
    });
  });
});
