import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import { ConfigLoader, ProjectRootResolver } from '@shipshield/scan-core';
import { EXIT_CODES } from '@shipshield/contracts';

export function makeConfigCommand(): Command {
  const configCmd = new Command('config')
    .description('Manage and validate ShipShield configuration');

  configCmd
    .command('validate')
    .description('Validate the syntax, schema, and security policy rules of .shipshield.yaml')
    .option('--config <path>', 'Explicit path to configuration file')
    .option('--json', 'Output validation result as JSON')
    .action((options, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();
      let projectRoot: string;
      try {
        projectRoot = ProjectRootResolver.resolve(globalOpts.projectDir);
      } catch (err: unknown) {
        console.error(`Configuration Error: ${(err as Error).message}`);
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
        return;
      }

      const explicitPath = options.config || globalOpts.config;
      const targetConfigPath = explicitPath
        ? path.resolve(explicitPath)
        : path.join(projectRoot, '.shipshield.yaml');

      if (!fs.existsSync(targetConfigPath)) {
        if (options.json) {
          process.stdout.write(
            JSON.stringify(
              {
                valid: false,
                path: targetConfigPath,
                error: `Configuration file not found at ${targetConfigPath}`,
              },
              null,
              2
            ) + '\n'
          );
        } else {
          console.error(`Error: Configuration file not found at ${targetConfigPath}`);
          console.error(`Run 'shipshield init' to generate a configuration template.`);
        }
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
        return;
      }

      try {
        const loadedConfig = ConfigLoader.load(projectRoot, targetConfigPath);
        if (options.json) {
          process.stdout.write(
            JSON.stringify(
              {
                valid: true,
                path: targetConfigPath,
                config: loadedConfig,
              },
              null,
              2
            ) + '\n'
          );
        } else {
          console.log(`🛡️  ShipShield Configuration Validation`);
          console.log(`✔ Config Path:    ${targetConfigPath}`);
          console.log(`✔ Schema Version: ${loadedConfig.schema_version}`);
          console.log(`✔ Project Name:   ${loadedConfig.project.name}`);
          console.log(`✔ Policy Fail-On: [${loadedConfig.policy.fail_on.join(', ')}]`);
          console.log(`✔ Scanners:       secrets: ${loadedConfig.scan.secrets.enabled}, deps: ${loadedConfig.scan.dependencies.enabled}, containers: ${loadedConfig.scan.containers.enabled}, iac: ${loadedConfig.scan.iac.enabled}`);
          console.log(`\n✔ Configuration is valid and structurally compliant.\n`);
        }
        process.exit(EXIT_CODES.PASSED);
      } catch (err: unknown) {
        if (options.json) {
          process.stdout.write(
            JSON.stringify(
              {
                valid: false,
                path: targetConfigPath,
                error: (err as Error).message,
              },
              null,
              2
            ) + '\n'
          );
        } else {
          console.error(`✖ Configuration validation failed for ${targetConfigPath}:`);
          console.error(`  ${(err as Error).message}`);
        }
        process.exit(EXIT_CODES.CONFIGURATION_ERROR);
      }
    });

  return configCmd;
}
