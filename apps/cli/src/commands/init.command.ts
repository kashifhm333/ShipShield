import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Command } from 'commander';
import { EXIT_CODES } from '@shipshield/contracts';
import { ProjectRootResolver, PathValidator } from '@shipshield/scan-core';

export function makeInitCommand(): Command {
  return new Command('init')
    .description('Initialize ShipShield configuration and report directories in project root')
    .option('--force', 'Allow overwriting existing configuration file')
    .option('--minimal', 'Create minimal configuration file')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (options: { force?: boolean; minimal?: boolean; yes?: boolean }, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();
      let projectRoot: string;
      try {
        projectRoot = ProjectRootResolver.resolve(globalOpts.projectDir);
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Configuration Error: ${error.message}`);
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
      }

      const configPath = path.join(projectRoot, '.shipshield.yaml');
      const reportsDir = path.join(projectRoot, '.shipshield', 'reports');

      try {
        PathValidator.validateContainment(projectRoot, configPath);
        PathValidator.validateContainment(projectRoot, reportsDir);
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Security Boundary Error: ${error.message}`);
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
      }

      if (fs.existsSync(configPath) && (!options.force || !options.yes)) {
        console.error(
          `Error: Configuration file already exists at ${configPath}. Use --force --yes to overwrite.`
        );
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
      }

      const minimalConfig = `schema_version: 1
project:
  name: "auto"
  root: "."
policy:
  fail_on:
    - "critical"
    - "high"
`;

      const fullConfig = `schema_version: 1
project:
  name: "auto"
  root: "."
reports:
  directory: ".shipshield/reports"
  formats:
    - "json"
    - "markdown"
  retain: 20
scan:
  secrets:
    enabled: true
  dependencies:
    enabled: true
  containers:
    enabled: true
  iac:
    enabled: true
policy:
  fail_on:
    - "critical"
    - "high"
  fail_on_incomplete: true
execution:
  timeout_seconds: 600
  max_parallel_scanners: 4
  network: "allow"
  exclude:
    - ".git/**"
    - "node_modules/**"
    - "vendor/**"
    - "dist/**"
    - ".shipshield/**"
`;

      const content = options.minimal ? minimalConfig : fullConfig;
      const tmpConfigPath = path.join(
        projectRoot,
        `.shipshield-cfg-${crypto.randomBytes(6).toString('hex')}.tmp`
      );
      fs.writeFileSync(tmpConfigPath, content, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmpConfigPath, configPath);

      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true, mode: 0o700 });
      }

      console.log(`✔ Created ShipShield configuration: ${configPath}`);
      console.log(`✔ Created reports directory: ${reportsDir}`);
      process.exit(EXIT_CODES.PASSED);
    });
}
