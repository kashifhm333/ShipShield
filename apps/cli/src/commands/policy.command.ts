import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { NativePolicyRegistry, PolicyCategory } from '@shipshield/scan-core';
import { EXIT_CODES } from '@shipshield/contracts';

export function makePolicyCommand(): Command {
  const policyCmd = new Command('policy')
    .description('Inspect, manage, and validate ShipShield security policies');

  // 1. shipshield policy list
  policyCmd
    .command('list')
    .description('List all available native security policies and detection rules')
    .option('--category <category>', 'Filter policies by category (secrets, containers, iac, etc.)')
    .option('--format <format>', 'Output format (text | json)')
    .option('--json', 'Output policies list as JSON')
    .action((options, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = Boolean(options.json || options.format === 'json' || globalOpts.format === 'json');
      let policies = NativePolicyRegistry.getAllPolicies();
      if (options.category) {
        policies = NativePolicyRegistry.getPoliciesByCategory(options.category as PolicyCategory);
      }

      if (isJson) {
        process.stdout.write(JSON.stringify(policies, null, 2) + '\n');
        process.exit(EXIT_CODES.PASSED);
        return;
      }

      console.log(`🛡️  ShipShield Native Security Policies (${policies.length} rules):\n`);
      console.log(
        'ID'.padEnd(16) +
        'SEVERITY'.padEnd(12) +
        'CATEGORY'.padEnd(16) +
        'TITLE'
      );
      console.log('-'.repeat(80));

      for (const p of policies) {
        console.log(
          p.id.padEnd(16) +
          p.severity.toUpperCase().padEnd(12) +
          p.category.padEnd(16) +
          p.title
        );
      }
      console.log(`\nTo inspect a policy rule in detail, run: shipshield policy show <id>\n`);
      process.exit(EXIT_CODES.PASSED);
    });

  // 2. shipshield policy show <id>
  policyCmd
    .command('show <id>')
    .description('Display detailed specification, remediation advice, and standards mapping for a policy')
    .option('--format <format>', 'Output format (text | json)')
    .option('--json', 'Output policy details as JSON')
    .action((id: string, options, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = Boolean(options.json || options.format === 'json' || globalOpts.format === 'json');
      const policy = NativePolicyRegistry.getPolicy(id.toUpperCase());

      if (!policy) {
        console.error(`Usage Error: Policy "${id}" not found.`);
        process.exit(EXIT_CODES.USAGE_ERROR);
        return;
      }

      if (isJson) {
        process.stdout.write(JSON.stringify(policy, null, 2) + '\n');
        process.exit(EXIT_CODES.PASSED);
        return;
      }

      console.log(`\n🛡️  ShipShield Policy Specification: ${policy.id}`);
      console.log(`● Title:       ${policy.title}`);
      console.log(`● Category:    ${policy.category}`);
      console.log(`● Severity:    ${policy.severity.toUpperCase()}`);
      console.log(`● Confidence:  ${policy.confidence.toUpperCase()}`);
      console.log(`● Version:     ${policy.version}`);
      console.log(`● Standards:   ${policy.standards.join(', ') || 'N/A'}`);
      console.log(`● File Match:  ${policy.filePatterns.join(', ')}`);
      console.log(`\nDescription:`);
      console.log(`  ${policy.description}`);
      console.log(`\nActionable Remediation Guidance:`);
      console.log(`  ${policy.remediation}\n`);
      process.exit(EXIT_CODES.PASSED);
    });

  // 3. shipshield policy validate [file]
  policyCmd
    .command('validate [file]')
    .description('Validate custom policy rule definitions or workspace policy configuration')
    .option('--json', 'Output validation report as JSON')
    .action((filePath: string | undefined, options) => {
      if (filePath) {
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) {
          console.error(`Error: Policy file not found at ${resolved}`);
          process.exit(EXIT_CODES.USAGE_ERROR);
          return;
        }

        try {
          const content = fs.readFileSync(resolved, 'utf8');
          const parsed = JSON.parse(content);
          const validation = NativePolicyRegistry.validatePolicy(parsed);

          if (options.json) {
            process.stdout.write(JSON.stringify(validation, null, 2) + '\n');
            process.exit(validation.valid ? EXIT_CODES.PASSED : EXIT_CODES.POLICY_FAILED);
            return;
          }

          if (validation.valid) {
            console.log(`✔ Policy "${resolved}" is valid and structurally sound.\n`);
            process.exit(EXIT_CODES.PASSED);
          } else {
            console.error(`✖ Policy validation failed:`);
            for (const err of validation.errors) {
              console.error(`  - ${err}`);
            }
            process.exit(EXIT_CODES.POLICY_FAILED);
          }
        } catch (err: unknown) {
          console.error(`Policy Parse Error: ${(err as Error).message}`);
          process.exit(EXIT_CODES.USAGE_ERROR);
        }
      } else {
        // Validate all loaded native policies
        const policies = NativePolicyRegistry.getAllPolicies();
        let allValid = true;
        const failures: Array<{ id: string; errors: string[] }> = [];

        for (const p of policies) {
          const check = NativePolicyRegistry.validatePolicy(p);
          if (!check.valid) {
            allValid = false;
            failures.push({ id: p.id, errors: check.errors });
          }
        }

        if (options.json) {
          process.stdout.write(
            JSON.stringify({ valid: allValid, totalPolicies: policies.length, failures }, null, 2) + '\n'
          );
          process.exit(allValid ? EXIT_CODES.PASSED : EXIT_CODES.POLICY_FAILED);
          return;
        }

        if (allValid) {
          console.log(`✔ All ${policies.length} registered native security policies are valid and verified.\n`);
          process.exit(EXIT_CODES.PASSED);
        } else {
          console.error(`✖ Policy verification encountered ${failures.length} errors.`);
          process.exit(EXIT_CODES.POLICY_FAILED);
        }
      }
    });

  return policyCmd;
}
