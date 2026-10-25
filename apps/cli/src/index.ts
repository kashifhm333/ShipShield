#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import { EXIT_CODES, SHIPSHIELD_VERSION } from '@shipshield/contracts';
import { makeInitCommand } from './commands/init.command.js';
import { makePlanCommand } from './commands/plan.command.js';
import { makeScanCommand } from './commands/scan.command.js';
import { makeScansCommand } from './commands/scans.command.js';
import { makeStatusCommand } from './commands/status.command.js';
import { makeResultsCommand } from './commands/results.command.js';
import { makeCancelCommand } from './commands/cancel.command.js';
import { makeDoctorCommand } from './commands/doctor.command.js';
import { makeShowCommand } from './commands/show.command.js';
import { makeFixCommand } from './commands/fix.command.js';
import { makeVerifyCommand } from './commands/verify.command.js';
import { makeEngineCommand } from './commands/engine.command.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('shipshield')
    .description('Production-grade local-first security gate and DevSecOps platform')
    .version(SHIPSHIELD_VERSION, '-v, --version', 'Output the current version of ShipShield')
    .option('--project-dir <path>', 'Explicit path to project workspace directory')
    .option('--config <path>', 'Path to custom .shipshield.yaml config file')
    .option('--report-dir <path>', 'Override directory for scan reports')
    .option('--format <format>', 'Output format (text | json)', 'text')
    .option('--no-color', 'Disable colored terminal output')
    .option('--quiet', 'Suppress non-essential progress output')
    .option('--verbose', 'Enable verbose scanner execution logs')
    .option('--debug', 'Enable low-level debug output')
    .option('--non-interactive', 'Disable interactive prompts');

  const overrideHandler = (err: CommanderError) => {
    if (
      err.code === 'commander.helpDisplayed' ||
      err.code === 'commander.help' ||
      err.code === 'commander.version'
    ) {
      process.exit(EXIT_CODES.PASSED);
    }
    process.exit(EXIT_CODES.USAGE_ERROR);
  };

  program.exitOverride(overrideHandler);

  const subcommands = [
    makeScanCommand(),
    makeScansCommand(),
    makeStatusCommand(),
    makeResultsCommand(),
    makeCancelCommand(),
    makeDoctorCommand(),
    makeEngineCommand(),
    makeInitCommand(),
    makePlanCommand(),
    makeShowCommand(),
    makeFixCommand(),
    makeVerifyCommand(),
  ];

  for (const cmd of subcommands) {
    cmd.exitOverride(overrideHandler);
    program.addCommand(cmd);
  }

  return program;
}

if (process.argv[1] && (process.argv[1].endsWith('shipshield') || process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'))) {
  const program = createProgram();
  program.parseAsync(process.argv).catch((err) => {
    if (err && typeof err === 'object' && 'exitCode' in err) {
      process.exit((err as { exitCode: number }).exitCode);
    }
    console.error(`Internal Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT_CODES.INTERNAL_ERROR);
  });
}
