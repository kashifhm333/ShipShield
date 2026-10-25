import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProjectRootResolver, ConfigurationError } from '../src/discovery/project-root.js';
import { FileWalker } from '../src/discovery/file-walker.js';
import { ConfigLoader } from '../src/config/config-loader.js';

describe('Discovery and Config Suite', () => {
  describe('ProjectRootResolver', () => {
    it('resolves explicit valid directory', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-root-test-'));
      try {
        const resolved = ProjectRootResolver.resolve(tmp);
        expect(resolved).toBe(fs.realpathSync.native(tmp));
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('throws SS-CFG-NOT-FOUND if explicit directory does not exist', () => {
      expect(() => {
        ProjectRootResolver.resolve('/non/existent/path/for/sure/12345');
      }).toThrowError(ConfigurationError);
    });

    it('throws SS-CFG-NOT-DIR if explicit path is a regular file', () => {
      const tmpFile = path.join(os.tmpdir(), `ss-file-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, 'hello');
      try {
        expect(() => {
          ProjectRootResolver.resolve(tmpFile);
        }).toThrowError(ConfigurationError);
      } finally {
        fs.rmSync(tmpFile, { force: true });
      }
    });

    it('throws SS-CFG-AMBIGUOUS if both .shipshield.yaml and .shipshield.yml exist', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-root-ambig-'));
      try {
        fs.writeFileSync(path.join(tmp, '.shipshield.yaml'), 'schema_version: 1\n');
        fs.writeFileSync(path.join(tmp, '.shipshield.yml'), 'schema_version: 1\n');
        expect(() => {
          ProjectRootResolver.resolve(tmp);
        }).toThrowError(/Ambiguous configuration/);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('walks up directory hierarchy to find .git', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-root-git-'));
      const nested = path.join(tmp, 'a', 'b', 'c');
      fs.mkdirSync(nested, { recursive: true });
      fs.mkdirSync(path.join(tmp, '.git'), { recursive: true });
      try {
        const resolved = ProjectRootResolver.resolve(undefined, nested);
        expect(resolved).toBe(fs.realpathSync.native(tmp));
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('FileWalker', () => {
    it('detects files and assesses applicability across all scanner categories', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-walker-'));
      try {
        fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
        fs.writeFileSync(path.join(tmp, 'Dockerfile'), 'FROM alpine\n');
        fs.writeFileSync(path.join(tmp, 'main.tf'), 'resource "aws_s3_bucket" "b" {}\n');
        fs.writeFileSync(path.join(tmp, 'index.js'), 'console.log("hello");\n');

        const nestedDir = path.join(tmp, 'sub');
        fs.mkdirSync(nestedDir);
        fs.writeFileSync(path.join(nestedDir, 'other.tf.json'), '{}');

        // Ignored node_modules
        const ignoredDir = path.join(tmp, 'node_modules', 'dep');
        fs.mkdirSync(ignoredDir, { recursive: true });
        fs.writeFileSync(path.join(ignoredDir, 'package.json'), '{}');

        const res = FileWalker.walk(tmp, ['node_modules/**']);
        expect(res.applicableScanners.secrets).toBe(true);
        expect(res.applicableScanners.dependencies).toBe(true);
        expect(res.applicableScanners.containers).toBe(true);
        expect(res.applicableScanners.iac).toBe(true);

        expect(res.allFiles).toContain('package.json');
        expect(res.allFiles).toContain('Dockerfile');
        expect(res.allFiles).toContain('main.tf');
        expect(res.allFiles).toContain('sub/other.tf.json');
        expect(res.allFiles.some((f) => f.startsWith('node_modules'))).toBe(false);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('safely skips symbolic links', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-walker-symlink-'));
      try {
        const realTarget = path.join(tmp, 'real.txt');
        fs.writeFileSync(realTarget, 'real data');
        const linkTarget = path.join(tmp, 'link.txt');
        try {
          fs.symlinkSync(realTarget, linkTarget);
        } catch {
          // In case environment restricts symlinks
        }

        const res = FileWalker.walk(tmp);
        expect(res.allFiles).toContain('real.txt');
        expect(res.allFiles).not.toContain('link.txt');
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('ConfigLoader', () => {
    it('loads valid .shipshield.yaml with custom configuration', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-config-valid-'));
      try {
        const yamlContent = `
schema_version: 1
policy:
  fail_on: ["critical"]
execution:
  network: allow
  timeout_seconds: 45
`;
        fs.writeFileSync(path.join(tmp, '.shipshield.yaml'), yamlContent);
        const config = ConfigLoader.load(tmp);
        expect(config.policy.fail_on).toEqual(['critical']);
        expect(config.execution.network).toBe('allow');
        expect(config.execution.timeout_seconds).toBe(45);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('throws SS-CFG-POLICY-VIOLATION when attempting to weaken network deny to allow via CLI', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-config-deny-'));
      try {
        const yamlContent = `
schema_version: 1
execution:
  network: deny
`;
        fs.writeFileSync(path.join(tmp, '.shipshield.yaml'), yamlContent);
        expect(() => {
          ConfigLoader.load(tmp, undefined, { network: 'allow' });
        }).toThrowError(/Cannot weaken execution.network from "deny" to "allow"/);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('throws SS-CFG-INVALID-YAML when YAML is malformed', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-config-malformed-'));
      try {
        fs.writeFileSync(path.join(tmp, '.shipshield.yaml'), 'schema_version: [unclosed');
        expect(() => {
          ConfigLoader.load(tmp);
        }).toThrowError(/Failed to parse YAML configuration/);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('throws SS-CFG-SCHEMA-INVALID when config schema validation fails', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-config-invalid-schema-'));
      try {
        fs.writeFileSync(path.join(tmp, '.shipshield.yaml'), 'schema_version: "invalid_string"');
        expect(() => {
          ConfigLoader.load(tmp);
        }).toThrowError(/Invalid configuration/);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('applies CLI overrides when permitted', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-config-override-'));
      try {
        const config = ConfigLoader.load(tmp, undefined, {
          failOn: ['info'],
          timeoutSeconds: 120,
          maxParallelScanners: 2,
          reportDir: 'custom/reports',
        });
        expect(config.policy.fail_on).toEqual(['info']);
        expect(config.execution.timeout_seconds).toBe(120);
        expect(config.execution.max_parallel_scanners).toBe(2);
        expect(config.reports.directory).toBe('custom/reports');
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('throws SS-CFG-SIZE-LIMIT when config file exceeds 1MB', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-config-large-'));
      try {
        const largeFile = path.join(tmp, '.shipshield.yaml');
        const buf = Buffer.alloc(1024 * 1024 + 10, 'A');
        fs.writeFileSync(largeFile, buf);

        expect(() => {
          ConfigLoader.load(tmp);
        }).toThrowError(/exceeds maximum allowable size/);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('handles explicit config file paths and ambiguous config files', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-config-branches-'));
      try {
        // 1. Explicit path not found
        expect(() => {
          ConfigLoader.load(tmp, 'custom-nonexistent.yaml');
        }).toThrowError(/Specified config file does not exist/);

        // 2. Explicit path exists
        const customPath = path.join(tmp, 'my-cfg.yaml');
        fs.writeFileSync(customPath, 'schema_version: 1\nexecution:\n  network: allow\n');
        const loadedExplicit = ConfigLoader.load(tmp, 'my-cfg.yaml', { network: 'deny' });
        expect(loadedExplicit.execution.network).toBe('deny');

        // 3. Ambiguous .shipshield.yaml and .shipshield.yml
        fs.writeFileSync(path.join(tmp, '.shipshield.yaml'), 'schema_version: 1\n');
        fs.writeFileSync(path.join(tmp, '.shipshield.yml'), 'schema_version: 1\n');
        expect(() => {
          ConfigLoader.load(tmp);
        }).toThrowError(/Ambiguous configuration/);

        // 4. Only .shipshield.yml
        fs.rmSync(path.join(tmp, '.shipshield.yaml'));
        const loadedYml = ConfigLoader.load(tmp, undefined, { network: 'allow' });
        expect(loadedYml.schema_version).toBe(1);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
