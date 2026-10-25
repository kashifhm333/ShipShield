import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ProjectConfig, ProjectConfigSchema } from '@shipshield/contracts';
import { ConfigurationError } from '../discovery/project-root.js';

export interface CliConfigOverrides {
  network?: 'allow' | 'deny' | undefined;
  failOn?: ('critical' | 'high' | 'medium' | 'low' | 'info')[] | undefined;
  timeoutSeconds?: number | undefined;
  maxParallelScanners?: number | undefined;
  reportDir?: string | undefined;
}

export class ConfigLoader {
  private static readonly MAX_CONFIG_BYTES = 1024 * 1024; // 1MB

  /**
   * Loads and validates the project configuration from rootDir or explicit configPath.
   * Merges in CLI overrides while preserving security invariants.
   */
  public static load(
    rootDir: string,
    explicitConfigPath?: string,
    overrides?: CliConfigOverrides
  ): ProjectConfig {
    let configFilePath: string | null = null;

    if (explicitConfigPath) {
      const resolved = path.resolve(rootDir, explicitConfigPath);
      if (!fs.existsSync(resolved)) {
        throw new ConfigurationError(
          'SS-CFG-NOT-FOUND',
          `Specified config file does not exist: ${explicitConfigPath}`
        );
      }
      configFilePath = resolved;
    } else {
      const defaultYaml = path.join(rootDir, '.shipshield.yaml');
      const defaultYml = path.join(rootDir, '.shipshield.yml');

      if (fs.existsSync(defaultYaml) && fs.existsSync(defaultYml)) {
        throw new ConfigurationError(
          'SS-CFG-AMBIGUOUS',
          `Ambiguous configuration: both .shipshield.yaml and .shipshield.yml exist in ${rootDir}`
        );
      }

      if (fs.existsSync(defaultYaml)) {
        configFilePath = defaultYaml;
      } else if (fs.existsSync(defaultYml)) {
        configFilePath = defaultYml;
      }
    }

    let parsedFileConfig: Record<string, unknown> = {};

    if (configFilePath) {
      const stat = fs.statSync(configFilePath);
      if (stat.size > this.MAX_CONFIG_BYTES) {
        throw new ConfigurationError(
          'SS-CFG-SIZE-LIMIT',
          `Configuration file exceeds maximum allowable size of 1MB: ${configFilePath}`
        );
      }

      const raw = fs.readFileSync(configFilePath, 'utf8');
      try {
        parsedFileConfig = YAML.parse(raw, { maxAliasCount: 10 }) || {};
      } catch (err: unknown) {
        const error = err as Error;
        throw new ConfigurationError(
          'SS-CFG-INVALID-YAML',
          `Failed to parse YAML configuration: ${error.message}`
        );
      }
    }

    // Validate using Zod
    const validationResult = ProjectConfigSchema.safeParse(parsedFileConfig);
    if (!validationResult.success) {
      const issues = validationResult.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new ConfigurationError(
        'SS-CFG-SCHEMA-INVALID',
        `Invalid configuration in ${configFilePath || 'default'}:\n${issues}`
      );
    }

    const config = validationResult.data;

    // Apply CLI overrides if present
    if (overrides) {
      if (overrides.network) {
        // Invariant: If execution.network === 'deny' in config, CLI flag cannot weaken it to 'allow'
        if (config.execution.network === 'deny' && overrides.network === 'allow') {
          throw new ConfigurationError(
            'SS-CFG-POLICY-VIOLATION',
            'Cannot weaken execution.network from "deny" to "allow" via CLI flags.'
          );
        }
        config.execution.network = overrides.network;
      }

      if (overrides.failOn) {
        config.policy.fail_on = overrides.failOn;
      }

      if (overrides.timeoutSeconds !== undefined) {
        config.execution.timeout_seconds = overrides.timeoutSeconds;
      }

      if (overrides.maxParallelScanners !== undefined) {
        config.execution.max_parallel_scanners = overrides.maxParallelScanners;
      }

      if (overrides.reportDir) {
        config.reports.directory = overrides.reportDir;
      }
    }

    return config;
  }
}
