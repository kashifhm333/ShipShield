# 04 — ShipShield CLI Specification

**Document status:** Draft specification for implementation  
**Version:** 1.0  
**Product:** ShipShield  
**Audience:** CLI engineers, scanner-adapter authors, security reviewers, QA, and maintainers  
**Normative language:** **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are requirements terms.

> This document defines intended behavior. A requirement in this specification is not evidence that the corresponding feature has already been implemented.

## 1. Purpose and scope

ShipShield is a local-first security gate that orchestrates established scanners and turns their results into stable, actionable findings. The initial scope covers:

- Secret detection.
- Dependency vulnerability detection.
- Dockerfile and container-image configuration checks.
- Terraform and infrastructure-as-code misconfiguration checks.
- Project-specific policy evaluation.
- Machine-readable and human-readable reports.
- Explicit, reviewable remediation workflows.

The CLI is the first supported interface. A hosted API, dashboard, pull-request integration, and team policy service may be added later, but MUST reuse the same core domain model and outcome semantics.

### 1.1 Design principles

1. **Safe by default:** scanning is read-only with respect to project source files.
2. **No false success:** a scan that did not complete successfully MUST NOT be reported as passed.
3. **Explainable results:** each finding includes evidence, severity, location where available, and a remediation recommendation.
4. **Stable identity:** finding IDs/fingerprints remain stable across equivalent scans where practical.
5. **Explicit remediation:** fixes are previewed before application; changes are not silently made.
6. **Automation-friendly:** deterministic exit codes, JSON output, predictable file paths, and no interactive prompts in CI mode.
7. **Least privilege:** do not execute repository scripts or install dependencies merely to scan a project.
8. **Privacy:** do not print or persist raw secret values by default.

## 2. Supported commands

The first release defines these commands:

| Command | Purpose | Source files modified? |
|---|---|---:|
| `shipshield init` | Create local configuration and report directory | No |
| `shipshield plan` | Run configured scans and create a report | No |
| `shipshield show` | Display findings from an existing report | No |
| `shipshield fix` | Preview or apply supported remediation actions | Only with explicit `--apply` |
| `shipshield verify` | Re-scan after remediation and compare results | No |
| `shipshield version` | Print CLI and schema versions | No |
| `shipshield help` | Show command help | No |

`plan` is named to suggest a security plan, not an infrastructure deployment plan. It MUST NOT provision, destroy, or modify cloud infrastructure.

## 3. Invocation and global behavior

### 3.1 General syntax

```text
shipshield [global-options] <command> [command-options]
```

Global options:

```text
--help, -h                 Show help
--version, -V              Show CLI version
--project-dir <path>       Project root to use (default: current directory)
--config <path>            Explicit configuration file
--report-dir <path>        Override report directory
--format <format>          Output format: text | json
--no-color                 Disable terminal color
--quiet, -q                Suppress non-essential output
--verbose, -v              Enable diagnostic output
--debug                    Enable detailed diagnostic logs; never reveal secrets
--non-interactive          Disable prompts
```

Rules:

- Global options MUST work before the command. Options after the command MUST be accepted where the command parser supports them; the implementation SHOULD accept both positions consistently.
- `--help` MUST NOT require a valid project or configuration.
- `--version` MUST NOT initialize a project, run scanners, or write files.
- `--quiet` MUST NOT suppress errors, exit status, or explicitly requested JSON output.
- `--debug` MUST NOT print secret values, access tokens, private keys, or full sensitive environment variables.
- Unknown options and invalid enum values MUST produce a concise error, usage hint, and the `usage_error` exit code.
- Paths supplied by the user MUST be resolved and validated before use. Relative paths are resolved from the caller's working directory unless a command explicitly documents otherwise.

### 3.2 Project-root resolution

Unless `--project-dir` is supplied, ShipShield MUST resolve the project root as follows:

1. Use the current working directory.
2. If that directory is within a Git worktree, detect the worktree root using Git metadata when available.
3. If the caller explicitly supplies `--project-dir`, use that directory after resolving symlinks and verifying it exists.
4. Do not silently choose a parent directory merely because it contains a ShipShield config. If the current directory is a subdirectory of a project, root discovery MAY use the nearest ancestor containing `.shipshield.yaml` or `.shipshield.yml`; this behavior MUST be documented and tested.
5. If the root cannot be resolved, fail with `configuration_error` or `usage_error` as appropriate.

The selected root MUST be recorded in the report. Reports SHOULD store a project-relative path rather than an absolute path where possible, to reduce accidental disclosure of workstation paths.

### 3.3 Git and non-Git projects

ShipShield MUST support directories that are not Git repositories. Git-specific metadata such as branch, commit SHA, and dirty state is optional and omitted when unavailable. A Git command failure MUST NOT be interpreted as a clean repository.

For Git repositories, ShipShield SHOULD record:

- Repository root (preferably normalized, non-sensitive representation).
- Current branch, if available.
- HEAD commit SHA, if available.
- Whether tracked or untracked changes were present at scan start, if detectable.

The scanner MUST NOT require a network connection unless a selected scanner or explicitly enabled feature requires one.

## 4. `shipshield init`

### 4.1 Syntax

```text
shipshield init [--force] [--minimal] [--yes]
```

### 4.2 Behavior

`init` prepares a project for ShipShield without running a scan.

By default it creates:

```text
<project-root>/
├── .shipshield.yaml
└── .shipshield/
    ├── reports/
    └── cache/              # optional; MUST NOT store secrets
```

The configuration file MUST be created with conservative defaults. The command MUST NOT overwrite an existing configuration unless `--force` is supplied. Even with `--force`, overwriting an existing file MUST require an explicit `--yes` or an interactive confirmation. In non-interactive mode, missing confirmation MUST fail safely.

`--minimal` creates only the configuration file and required report directory, omitting optional cache folders and comments where supported.

`--yes` confirms only the specific operation documented by the command; it MUST NOT implicitly approve future remediation or source-file changes.

### 4.3 Default configuration

The exact YAML parser and schema version MUST be versioned. An illustrative initial configuration:

```yaml
schema_version: 1

project:
  name: auto
  root: .

reports:
  directory: .shipshield/reports
  formats:
    - json
    - markdown
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
    - critical
    - high
  fail_on_incomplete: true

execution:
  timeout_seconds: 600
  max_parallel_scanners: 4
  network: allow
  exclude:
    - .git/**
    - node_modules/**
    - vendor/**
    - .shipshield/**
```

This example is a target configuration. Actual supported keys MUST match the implemented schema; unknown keys MUST be rejected by default, with a helpful field path and line/column information where available. A future compatibility mode MAY allow explicitly ignored unknown fields.

### 4.4 Idempotency and safety

- Running `init` repeatedly MUST be safe.
- Existing reports MUST NOT be deleted by `init`.
- Generated files MUST be written atomically where feasible: write to a temporary file in the destination directory, flush, then rename.
- The command MUST reject destinations that resolve outside the project root unless the user explicitly supplies a supported external path option.
- `.shipshield/` SHOULD be added to `.gitignore` only after checking for an existing entry. ShipShield MUST NOT rewrite unrelated `.gitignore` content.
- `init` MUST NOT create credentials, tokens, or cloud resources.

## 5. `shipshield plan`

### 5.1 Syntax

```text
shipshield plan
  [--scanner <name> ...]
  [--severity <level>]
  [--changed-only]
  [--base <git-ref>]
  [--offline]
  [--timeout <seconds>]
  [--jobs <count>]
  [--fail-on <level>]
  [--report <path>]
  [--no-report]
  [--list-scanners]
```

The implementation may use repeated `--scanner` arguments or a comma-separated list, but MUST choose one documented form and reject ambiguous combinations.

Supported scanner identifiers SHOULD be stable names such as `secrets`, `dependencies`, `containers`, and `iac`. Exact engine names and versions belong in scanner metadata.

### 5.2 Behavior

`plan` runs the enabled scanners against the resolved project root, normalizes their outputs into ShipShield findings, evaluates policy, and writes a report unless `--no-report` is specified.

Default behavior:

1. Load and validate configuration.
2. Resolve project root and scan scope.
3. Create a unique scan ID and record scan start time.
4. Discover applicable files and scanner prerequisites.
5. Run enabled scanner adapters within configured time and resource limits.
6. Normalize and deduplicate findings.
7. Evaluate project policy.
8. Write report artifacts atomically.
9. Print a summary and return an exit code consistent with the final outcome.

A scan MUST NOT be marked `passed` if a required scanner failed, timed out, was skipped due to a missing prerequisite, or could not inspect the required scope. If policy explicitly marks a scanner optional, that scanner may be skipped, but the report MUST state the reason.

### 5.3 Scanner selection

- Without `--scanner`, run all enabled and applicable scanners.
- With `--scanner`, run only the requested scanners, provided each is enabled or explicitly permitted by the CLI's override rules.
- Unknown scanner names MUST be a usage/configuration error, not silently ignored.
- `--list-scanners` prints scanner IDs, availability, and requirements without scanning.
- If a requested scanner is unavailable, the result MUST be `incomplete` or `configuration_error`, depending on whether it is an environmental failure or invalid configuration.

### 5.4 Changed-only scans

`--changed-only` narrows file-based analysis to files changed relative to `--base <git-ref>` or a documented default base reference. It MUST NOT be treated as a full security scan.

Requirements:

- `--changed-only` MUST require a Git repository and a resolvable base reference.
- If no base is supplied, ShipShield MAY use a configured default base; it MUST NOT silently guess an arbitrary branch.
- Dependency and IaC findings may depend on lockfiles, module files, shared configuration, or transitive dependencies outside the changed-file list. Scanner adapters MUST define how changed-only mode works for their scanner.
- The report MUST set `scope.kind` to `changed` and record the base reference and resolved commit SHA.
- The terminal summary MUST say that the scan was limited in scope.
- A changed-only scan MUST NOT satisfy a policy that requires a full scan unless the policy explicitly allows it.

### 5.5 Offline and network controls

`--offline` MUST prevent ShipShield-controlled network access and pass the equivalent offline option to supported scanners. If a scanner cannot operate offline because required vulnerability databases or metadata are absent, ShipShield MUST report that scanner as incomplete; it MUST NOT claim a clean result.

The `execution.network` configuration supports `allow`, `deny`, and, if implemented, `restricted`. `deny` takes precedence over a command option attempting to allow network access. Any network behavior of external scanner binaries MUST be documented and controlled as far as the scanner supports it.

### 5.6 Output and report artifacts

Default report directory:

```text
<project-root>/.shipshield/reports/
```

Recommended artifact names:

```text
scan-<UTC timestamp>-<scan-id>.json
scan-<UTC timestamp>-<scan-id>.md
latest.json                 # optional convenience pointer/copy
latest.md                   # optional convenience pointer/copy
```

The canonical report MUST be immutable after completion. `latest.*` MUST be an optional convenience artifact and MUST be updated atomically. If report writing fails, the scan MUST return `internal_error` or `incomplete` as defined by the failure stage; it MUST NOT print a success result while failing to persist a report when report output was requested.

`--report <path>` overrides the report destination. It MUST be validated for path traversal, directory creation, symlink behavior, and overwrite policy. If a destination already exists, ShipShield MUST avoid destructive overwrite by default; a deterministic `--report` path may be overwritten only when that behavior is explicitly documented or the caller uses an explicit overwrite option.

`--no-report` suppresses report file creation but MUST NOT suppress the terminal summary. It SHOULD be rejected in CI when configuration requires persistent evidence, unless an explicit override is provided.

### 5.7 Severity filtering and policy

Severity values are ordered:

```text
critical > high > medium > low > info
```

`--severity <level>` filters which findings are displayed and/or included in a scoped report only if its semantics are explicit. It MUST NOT silently change the underlying policy evaluation. The recommended behavior is to keep all findings in the canonical JSON report and filter terminal presentation only.

`--fail-on <level>` overrides the severity threshold for the current invocation, but MUST NOT lower a stricter organization policy. If the policy engine supports only one threshold, the CLI MUST document precedence and reject attempts to weaken a locked policy.

Policy outcome is independent from scanner execution status. A completed scan with policy violations is `policy_failed`, not `incomplete`.

## 6. `shipshield show`

### 6.1 Syntax

```text
shipshield show [<scan-id-or-report-path>]
  [--latest]
  [--severity <level>]
  [--scanner <name>]
  [--status <status>]
  [--format text|json]
  [--limit <count>]
```

### 6.2 Behavior

`show` reads an existing ShipShield report; it MUST NOT launch scanners or alter the report. If no identifier or path is supplied, it SHOULD use the latest completed report in the configured report directory. `--latest` explicitly selects that report.

- A scan ID MUST resolve only within the configured report directory.
- An explicit path MAY point outside the project only when the user supplied the path.
- Invalid, unsupported, truncated, or schema-incompatible reports MUST return `report_error`.
- Filtering MUST not mutate the underlying report.
- JSON mode MUST emit valid JSON to stdout without progress text mixed into it. Diagnostics go to stderr.
- If no findings match the filters, print an explicit “No findings match these filters” message and exit successfully, unless the report outcome itself is a failure that must be propagated.

## 7. `shipshield fix`

### 7.1 Syntax

```text
shipshield fix [<finding-id> ...]
  [--all]
  [--dry-run]
  [--apply]
  [--scanner <name>]
  [--report <path>]
  [--yes]
```

### 7.2 Safety contract

Remediation is a high-risk operation. The default MUST be preview-only. The CLI MUST NOT modify source files unless the user explicitly passes `--apply`.

- If neither `--dry-run` nor `--apply` is supplied, behave as `--dry-run`.
- `--dry-run` and `--apply` are mutually exclusive.
- `--all` and explicit finding IDs are mutually exclusive unless the implementation defines and documents a safe combined behavior.
- `--yes` MUST NOT substitute for `--apply`.
- ShipShield MUST never automatically rotate or revoke a leaked credential. It may identify the secret type and provide rotation guidance; actual rotation is an external operation requiring a separate, explicit workflow.
- A remediation MUST be supported by a scanner adapter and an allowlisted fix strategy. No arbitrary shell command from a repository finding may be executed.
- The CLI MUST show files to be modified, the proposed change, and any relevant risk before applying changes.
- Fixes MUST preserve file permissions where appropriate and avoid following symlinks outside the project root.
- Before applying a patch, validate that the target file has not changed since the fix was generated. If it has changed, abort that fix and ask the user to re-run the scan.
- When practical, apply each fix atomically and keep a recoverable diff or backup in a protected temporary location. Do not leave plaintext secrets in backups.
- If multiple fixes overlap or conflict, do not guess; report the conflict and leave affected files unchanged.
- The command MUST report applied, skipped, failed, and unsupported fixes separately.
- After applying changes, the CLI SHOULD recommend `shipshield verify` and MUST NOT claim the issue is resolved until a subsequent scan confirms it.

### 7.3 Finding selection and unsupported fixes

- A finding ID MUST match a finding in a valid report for the current project, unless an explicit report reference is supplied by a future supported option.
- `--all` means all currently supported and eligible fixes, not every finding.
- Unsupported fixes MUST be listed with the reason; they MUST NOT be treated as successful remediation.
- `--apply` in non-interactive mode MAY proceed only when all required confirmation requirements are met. For CI, applying fixes SHOULD be disabled by default and require an explicit configuration opt-in.
- If no IDs are provided and `--all` is absent, ShipShield MUST show usage/help and exit with `usage_error`.

## 8. `shipshield verify`

### 8.1 Syntax

```text
shipshield verify [--before <scan-id-or-report-path>]
  [--after <scan-id-or-report-path>]
  [--scanner <name> ...]
  [--full]
```

### 8.2 Behavior

`verify` validates remediation by comparing a pre-fix report with a fresh scan or an explicitly supplied after-report.

Recommended default flow:

1. Resolve the baseline report, defaulting to the latest suitable report before the current verification scan.
2. Run a fresh scan using the same project root and compatible configuration.
3. Compare findings using stable fingerprints.
4. Report resolved, still present, new, changed, and unverified findings.
5. Return the exit code associated with the new scan outcome and configured policy.

If an after-report is supplied, ShipShield MUST validate project identity, report schema, scan scope, and timestamp ordering. Comparisons between incompatible scopes MUST be labeled incomplete or incomparable rather than asserting findings are resolved.

`--full` requests a full scan even if the baseline was changed-only. The report MUST preserve both baseline and current scan IDs. A finding disappearing from output due to filtering or scanner failure MUST NOT be counted as resolved.

## 9. Outcome model and exit codes

### 9.1 Distinct concepts

ShipShield MUST model these separately:

- **Execution status:** whether required scanning steps completed.
- **Policy result:** whether completed findings violate configured policy.
- **Finding status:** whether a finding is new, existing, resolved, changed, or accepted/suppressed under policy.
- **Command result:** the process exit code.

A “no findings” result is meaningful only when the required scope was successfully scanned.

### 9.2 Canonical outcomes

| Outcome | Meaning |
|---|---|
| `passed` | Required scan completed and policy passed |
| `policy_failed` | Required scan completed, but one or more findings violate policy |
| `incomplete` | Some required analysis could not be completed; results are not sufficient to claim a pass |
| `configuration_error` | Configuration is invalid or required configuration cannot be loaded |
| `usage_error` | Invalid command, argument, or option |
| `report_error` | A report is missing, corrupt, unsupported, or cannot be read |
| `fix_error` | A requested remediation could not safely complete |
| `internal_error` | Unexpected ShipShield failure |

### 9.3 Exit-code table

The initial CLI contract reserves these codes:

| Exit code | Meaning | CI interpretation |
|---:|---|---|
| `0` | `passed`; or a read-only informational command succeeded | Success |
| `1` | `policy_failed` | Block according to policy |
| `2` | `usage_error` | Fix invocation |
| `3` | `configuration_error` | Fix configuration |
| `4` | `incomplete` | Fail closed by default; investigate scanner coverage |
| `5` | `report_error` | Fix report input/output |
| `6` | `fix_error` | Remediation did not complete safely |
| `10` | `internal_error` | Unexpected failure; collect redacted diagnostics |

The numeric mapping MUST be centralized in one exit-code module and tested. Additional codes MUST be documented before release. Shell callers should rely on these codes, not parse human-readable messages.

A successful `show` command may return `0` even if the displayed report records `policy_failed`; an optional `--propagate-outcome` mode MAY return the stored scan outcome's exit code. If supported, this behavior MUST be documented and stable. The default must be consistent across versions.

## 10. Report schema

### 10.1 Requirements

Reports are the durable contract between the CLI, future dashboard/API, CI integrations, and remediation workflows. The JSON schema MUST be versioned independently from the CLI version. Breaking schema changes require a new major schema version or an explicit migration.

A report MUST contain:

- Schema version.
- ShipShield CLI version.
- Unique scan ID.
- Start/end timestamps in UTC ISO 8601 format.
- Project metadata.
- Scan scope and enabled scanners.
- Per-scanner status and diagnostics.
- Overall execution status and policy outcome.
- Normalized findings.
- Policy evaluation summary.
- Redacted errors and warnings.

### 10.2 Illustrative JSON report

```json
{
  "schema_version": "1.0",
  "tool": {
    "name": "shipshield",
    "version": "0.1.0"
  },
  "scan": {
    "id": "scan_01JEXAMPLE0000000000000000",
    "started_at": "2026-10-24T12:00:00Z",
    "completed_at": "2026-10-24T12:00:08Z",
    "scope": {
      "kind": "full",
      "root": "."
    },
    "execution_status": "completed",
    "policy_outcome": "policy_failed"
  },
  "project": {
    "name": "mobilemart",
    "vcs": {
      "type": "git",
      "commit": "0123456789abcdef0123456789abcdef01234567",
      "branch": "main"
    }
  },
  "scanners": [
    {
      "id": "secrets",
      "status": "completed",
      "engine": "example-engine",
      "engine_version": "1.2.3",
      "duration_ms": 1200,
      "finding_count": 1
    },
    {
      "id": "dependencies",
      "status": "completed",
      "duration_ms": 3200,
      "finding_count": 2
    }
  ],
  "summary": {
    "findings_total": 3,
    "by_severity": {
      "critical": 1,
      "high": 1,
      "medium": 1,
      "low": 0,
      "info": 0
    },
    "policy_violations": 2
  },
  "findings": [
    {
      "id": "SS-EXAMPLE-7K2M",
      "fingerprint": "sha256:example",
      "type": "secret.exposed_credential",
      "title": "Potential exposed credential",
      "description": "A credential-like value was detected.",
      "severity": "critical",
      "confidence": "high",
      "scanner": "secrets",
      "location": {
        "path": "config/example.env",
        "start_line": 12,
        "end_line": 12
      },
      "evidence": {
        "redacted": true,
        "summary": "Credential-like value detected; value omitted."
      },
      "remediation": {
        "summary": "Revoke or rotate the credential, then remove it from source history where appropriate.",
        "fix_available": false
      },
      "status": "new",
      "references": []
    }
  ],
  "policy": {
    "passed": false,
    "rules_evaluated": 4,
    "violations": [
      {
        "rule_id": "block-critical",
        "finding_id": "SS-EXAMPLE-7K2M",
        "message": "Critical findings are not permitted."
      }
    ]
  },
  "warnings": [],
  "errors": []
}
```

This example is illustrative. Required fields and allowed enums MUST be codified in a published JSON Schema. Do not expose secret values in evidence, logs, exception messages, or terminal output.

### 10.3 Finding data contract

Each finding SHOULD include:

- `id`: readable identifier for user reference.
- `fingerprint`: stable hash derived from normalized finding type, normalized resource identity, and stable location/context; MUST NOT include raw secret material.
- `type`: namespaced rule/finding type.
- `title` and `description`.
- `severity`: `critical`, `high`, `medium`, `low`, or `info`.
- `confidence`: `high`, `medium`, or `low`, when supported.
- `scanner` and rule/engine identity.
- `location`: relative path and line/column/range where available.
- `evidence`: redacted summary; never raw secret values by default.
- `remediation`: human guidance and whether an automated fix is available.
- `status`: `new`, `existing`, `resolved`, `changed`, `accepted`, or `suppressed`, when a baseline is available.
- `references`: validated URLs or advisory IDs where available.

The finding `id` may be regenerated per report if necessary, but the fingerprint SHOULD remain stable. Do not use line number alone as a fingerprint because inserting unrelated lines can shift locations.

### 10.4 Scanner status contract

Each scanner MUST report one of:

- `completed`
- `not_applicable`
- `disabled`
- `skipped`
- `failed`
- `timed_out`

A `skipped`, `failed`, or `timed_out` required scanner makes the overall scan `incomplete`, unless a more specific configuration or internal error takes precedence. `not_applicable` is allowed only when applicability was evaluated and recorded. A missing scanner executable is not equivalent to zero findings.

## 11. Configuration contract

### 11.1 File selection and precedence

Configuration precedence, from lowest to highest:

1. Built-in defaults.
2. Project configuration (`.shipshield.yaml` or `.shipshield.yml`; choose one canonical file name and document alternate support).
3. Explicit configuration selected by `--config`.
4. Command-line overrides.
5. Organization-enforced policy, where available, which cannot be weakened by project or command-line settings.

If both supported project configuration filenames exist, ShipShield MUST fail with an actionable ambiguity error rather than silently choosing one.

### 11.2 Validation

- Validate configuration before starting scanner processes.
- Report exact invalid key paths and permitted values.
- Reject duplicate keys, unsupported schema versions, invalid paths, invalid timeout values, negative limits, and invalid severity levels.
- Do not evaluate configuration as executable code.
- Do not interpolate arbitrary environment variables into commands.
- Environment variables may be used only for explicitly documented fields and MUST never be dumped in diagnostics.
- Secrets used by scanner integrations MUST be read from documented secret sources and redacted.

### 11.3 Configuration migration

When a newer CLI reads an older schema, it SHOULD support a documented migration path. It MUST NOT silently rewrite the user's configuration. Any migration command should preview the changes and require explicit application.

## 12. Output contract

### 12.1 Human-readable output

Human output SHOULD include:

- Project name and scan ID.
- Scan scope: full or changed-only.
- Scanner completion summary.
- Finding counts by severity.
- Top findings with ID, severity, rule/type, file and line where available.
- Overall outcome and next recommended command.
- Report paths.

Example:

```text
ShipShield — Security Plan
Project: mobilemart
Scope: full
Scan: scan_01JEXAMPLE0000000000000000

Scanners: 4 completed, 0 failed
Findings: 1 critical, 1 high, 1 medium, 0 low, 0 info

CRITICAL SS-EXAMPLE-7K2M  Potential exposed credential
  config/example.env:12
  Recommendation: revoke/rotate the credential and remove it from source.

Outcome: POLICY FAILED
Report: .shipshield/reports/scan-2026-10-24T120008Z-scan_01JEXAMPLE0000000000000000.json
```

The CLI MUST avoid color as the sole carrier of meaning. Severity labels and outcomes must remain understandable without color.

### 12.2 JSON stdout

When `--format json` is used for a command's machine-readable response:

- stdout MUST contain one valid JSON document and no progress messages.
- Diagnostics and progress go to stderr.
- JSON output MUST use UTF-8.
- The schema/version for command output MUST be documented; it may differ from the persisted report schema.
- Output ordering SHOULD be deterministic where practical.

### 12.3 Exit status and pipelines

The process exit code is authoritative for success/failure. When output is piped, the CLI MUST preserve the same exit-code semantics. Broken pipes SHOULD be handled without dumping a stack trace. On Unix-like systems, avoid leaking secrets in shell traces or command-line arguments.

## 13. Errors and diagnostics

Errors MUST be actionable and redacted. A diagnostic SHOULD include:

- Error code/category.
- What operation failed.
- Safe context (scanner name, relative path, report ID).
- A suggested recovery step.
- A correlation/scan ID when one exists.

Never include raw secret values, auth headers, private key contents, access tokens, or unrestricted environment dumps. Stack traces are reserved for `--debug` and MUST remain redacted.

Examples:

```text
Error [SS-CFG-004]: Unknown configuration key "scan.dependecies".
Did you mean "scan.dependencies"?
```

```text
Scan incomplete: dependency scanner timed out after 120 seconds.
No clean result can be reported. Try increasing execution.timeout_seconds
or inspect the scanner diagnostics in the report.
```

The CLI MUST distinguish user-correctable errors from internal defects. It MUST NOT convert an exception into a successful empty report.

## 14. Security requirements

### 14.1 File-system safety

- Resolve and validate project root and output paths.
- Prevent path traversal and unsafe archive extraction.
- Do not follow symlinks outside the project root when reading or modifying project files unless explicitly allowed by a documented option.
- Exclude `.git/`, report/cache directories, and dependency/vendor directories by default where appropriate; users may override exclusions.
- Use atomic report writes and restrictive permissions for files that could contain sensitive metadata.
- Do not store scanner raw output unless required, redacted, and explicitly enabled.
- Treat project files and scanner output as untrusted input.

### 14.2 Process execution

- Use process APIs with argument arrays; do not construct shell command strings from repository-controlled data.
- Set execution timeouts, bounded stdout/stderr, and resource limits where supported.
- Terminate child process groups on timeout where the platform allows it.
- Never run project lifecycle scripts, Makefiles, hooks, or arbitrary commands by default.
- Pin or verify scanner versions where feasible and report engine versions.
- Scanner adapters MUST validate exit status and output schema. An empty or malformed output file after a scanner failure is not a clean scan.
- Do not use `eval`, shell expansion, or dynamic code execution for configuration or findings.

### 14.3 Secret handling

- Redact before logging, formatting, serializing, and raising errors.
- Do not include raw secret strings in finding IDs, fingerprints, URLs, telemetry, or crash reports.
- If matching context is necessary, persist a redacted snippet or keyed digest, not the original value.
- Do not send source code or findings to a hosted service unless the user explicitly enables that feature and receives clear disclosure.
- Disable telemetry by default for the initial local-first release unless a separate, documented opt-in is introduced.

### 14.4 Remediation safety

- Scan is read-only.
- Fix is preview-only unless `--apply` is explicit.
- Validate file hashes and expected content before patching.
- Reject ambiguous, stale, overlapping, or out-of-root patches.
- Never auto-fix secrets by editing source alone and implying the credential is safe; credential revocation/rotation is separate.
- Do not auto-apply dependency upgrades across major versions without explicit, rule-specific approval.

## 15. Performance and reliability

The implementation SHOULD:

- Run independent scanner adapters concurrently up to `max_parallel_scanners`.
- Apply per-scanner and whole-scan deadlines.
- Bound memory and output size for each scanner.
- Cache only safe, versioned, non-sensitive intermediate data; cache use must not change correctness.
- Report duration and completion status for each scanner.
- Support cancellation (Ctrl+C) and write a partial diagnostic report when safe and feasible.
- On cancellation, return a non-zero result and never label the scan passed.
- Keep report writes atomic and detect disk-full/permission errors.
- Make repeated scans deterministic in ordering and normalization, even if underlying scanner output order varies.

A cache MUST be invalidated when relevant inputs, scanner versions, configuration, policy, or database versions change.

## 16. Compatibility and platform support

The initial release SHOULD target supported current versions of Linux, macOS, and Windows. Exact minimum OS and runtime versions MUST be published before release.

- Paths MUST be handled with platform-aware APIs.
- Use UTC timestamps in reports.
- Handle Windows drive letters, case-insensitive paths, and path separators consistently.
- Do not assume `/bin/sh`, GNU-specific utilities, or Unix permissions on all platforms.
- Use UTF-8 for report files and handle non-ASCII paths.
- Document which external scanner engines are supported on each platform.

## 17. Testing requirements

Every command MUST have unit tests for argument parsing, validation, output formatting, and exit codes, plus integration tests for filesystem and process behavior.

### 17.1 Required acceptance tests

1. `--help` and `--version` work outside a project and create no files.
2. `init` creates default files and repeated invocation does not destroy user changes.
3. `init --force` does not overwrite without the required confirmation.
4. Invalid configuration fails before scanner execution.
5. A scanner that exits non-zero cannot produce `passed`.
6. A scanner timeout produces `incomplete` and a non-zero exit code.
7. Missing scanner binaries are not treated as zero findings.
8. A full scan records its scope and all required scanner statuses.
9. A changed-only scan requires a valid base and is visibly labeled limited scope.
10. JSON stdout is valid JSON with no human progress lines.
11. Raw secret values do not appear in terminal output, JSON reports, diagnostics, or debug logs.
12. Report writing failure does not return success.
13. `show` never runs scanners and does not mutate reports.
14. `fix` without `--apply` makes no source changes.
15. `fix --apply` rejects stale patches, symlink escapes, and overlapping changes.
16. `verify` does not mark findings resolved when a scanner failed or scope was narrower.
17. Exit codes match the documented mapping on Linux, macOS, and Windows.
18. Interrupting a scan never produces a passed outcome.
19. Unsupported report schema versions fail with `report_error`.
20. Repeated scans produce stable finding fingerprints for equivalent findings.

### 17.2 Test fixtures

Maintain sanitized fixtures for:

- Known fake secrets and redaction cases.
- Vulnerable and non-vulnerable dependency manifests/lockfiles.
- Unsafe and safe Dockerfiles.
- Misconfigured and compliant Terraform.
- Scanner timeout, malformed output, missing executable, permission denial, and non-zero exit.
- Symlink/path traversal attempts.
- Corrupt, truncated, and old-version reports.
- Conflicting and stale remediation patches.

Fixtures MUST use synthetic credentials that are not valid secrets.

## 18. Implementation boundaries

The CLI MUST be a thin orchestration layer over a reusable core. Avoid embedding scanner logic directly in command handlers.

Recommended module boundaries:

```text
src/
  cli/
    parse-args
    commands/
      init
      plan
      show
      fix
      verify
  core/
    project-root
    config-loader
    scan-orchestrator
    scanner-registry
    policy-engine
    finding-normalizer
    fingerprint
    report-writer
    report-reader
    remediation-engine
    verification
    exit-codes
  adapters/
    secrets/
    dependencies/
    containers/
    iac/
  security/
    redaction
    path-validation
    process-runner
  schemas/
    config-v1.schema.json
    report-v1.schema.json
  tests/
```

Names are illustrative; the implementation may choose another structure while preserving separation of concerns and contracts.

## 19. Release gates

Do not call the CLI production-ready until:

- [ ] Command syntax and exit codes are frozen and documented.
- [ ] Config and report schemas are versioned and validated.
- [ ] All required scanner adapters validate execution status and output.
- [ ] `incomplete` is handled consistently in CLI, reports, and CI.
- [ ] Secret redaction tests pass across all output paths.
- [ ] Path traversal, symlink, and process-injection tests pass.
- [ ] Fix operations are preview-first and protected by stale-file checks.
- [ ] JSON output is machine-readable and stable.
- [ ] Linux, macOS, and Windows support claims match tested platforms.
- [ ] Installation, upgrade, rollback, and scanner dependency guidance are published.
- [ ] Security review and threat-model review are complete.
- [ ] Known limitations and unsupported scanner scenarios are documented.

## 20. Decisions to settle before implementation

The following should be decided once and reflected in the code and docs:

1. Implementation language and packaging/distribution method.
2. Exact scanner engines, licensing, version pinning, and platform support.
3. Whether `--format json` means command summary JSON or the full report; recommended: full structured result for `plan`, report-shaped output for `show`.
4. Whether `latest.json` is a copy or pointer; avoid symlink assumptions across platforms.
5. How a baseline is selected for `verify` when multiple reports exist.
6. Whether `.shipshield/` reports are committed to Git or ignored by default. Recommended default: ignore generated reports unless the team explicitly opts into versioning.
7. How organization-enforced policy is delivered and protected from local weakening in a future hosted version.
8. Whether `fix --apply` is available in the first release or preview-only until remediation review is complete.

---

## Appendix A — Quick command reference

```bash
# Create configuration and local report directories
shipshield init

# Run all enabled scanners
shipshield plan

# Run selected scanner(s)
shipshield plan --scanner secrets --scanner dependencies

# Run a limited scan against a known base
shipshield plan --changed-only --base origin/main

# Run without network access
shipshield plan --offline

# Emit machine-readable scan output
shipshield plan --format json

# Show the latest report
shipshield show --latest

# Filter displayed findings
shipshield show --latest --severity high

# Preview a fix (default behavior)
shipshield fix SS-EXAMPLE-7K2M --dry-run

# Apply an explicitly reviewed fix
shipshield fix SS-EXAMPLE-7K2M --apply

# Re-scan and verify
shipshield verify --full

# Print version
shipshield version
```

These examples define intended command behavior and must be adjusted if the shipped parser chooses a different but documented syntax. Never use the examples as evidence that commands already exist.
