# ShipShield CLI Reference Manual

ShipShield provides a unified, predictable command-line interface.

## Synopsis

```bash
shipshield [command] [options] [arguments]
```

## Global Flags

| Flag | Description | Default |
|---|---|---|
| `--project-dir <path>` | Workspace path to inspect | Current directory (`.`) |
| `--config <path>` | Explicit path to `.shipshield.yaml` | `.shipshield.yaml` in project root |
| `--report-dir <path>` | Custom destination directory for generated reports | `.shipshield/reports` |
| `--format <format>` | Output format: `text`, `json`, or `sarif` | `text` |
| `--no-color` | Disable ANSI terminal color codes | `false` |
| `--quiet` | Suppress non-essential banner and progress output | `false` |
| `--verbose` | Output scanner execution details and timing | `false` |
| `-v, --version` | Output ShipShield version and exit | - |
| `-h, --help` | Display command help and exit | - |

---

## Commands

### `shipshield scan [path]`
Executes security checks across local source code, manifests, and containers.

```bash
shipshield scan .
shipshield scan ./src --mode offline
shipshield scan . --mode online --severity high,critical
shipshield scan . --scanner secrets,dependencies
shipshield scan . --format sarif --output reports/security.sarif
shipshield scan . --strict --fail-on high,critical
```

**Options:**
- `--mode <online|offline>`: Set scanning mode (default: `online`). In offline mode, zero network calls are initiated.
- `--offline`: Shorthand flag to force strict offline operation.
- `--scanner <name...>`: Restrict scanning to specified categories (`secrets`, `dependencies`, `containers`, `iac`).
- `--fail-on <level...>`: Thresholds triggering exit code `1` (`critical`, `high`, `medium`, `low`).
- `--severity <level...>`: Filter output findings to specified severities.
- `--strict`: Fails if any scanner is incomplete, missing, or has stale intelligence.
- `--format <text|json|sarif>`: Output format.
- `--output <path>`: Write scan report to a specified file.
- `--show-db-status`: Display database freshness and age before running scan.
- `--timeout <sec>`: Execution timeout per scanner in seconds (default: 300).
- `--jobs <count>`: Maximum parallel scanners to execute (default: 4).
- `--no-report`: Do not persist report files to disk.

---

### `shipshield check`
Performs a quick diagnostic health check of the local runtime, scanner availability, and offline readiness.

```bash
shipshield check
shipshield check --mode offline
shipshield check --mode offline --json
```

**Options:**
- `--mode <online|offline>`: Inspection target mode (default: `online`).
- `--json`: Output report in machine-readable JSON format.

---

### `shipshield doctor`
Deep system diagnostics inspecting binary paths, permissions, SQLite storage, and database freshness.

```bash
shipshield doctor
shipshield doctor --json
```

---

### `shipshield policy`
Inspect, manage, and validate native security policies and detection rules.

```bash
# List all native security policies
shipshield policy list
shipshield policy list --category secrets
shipshield policy list --format json

# Display detailed specification and remediation guidance for a policy
shipshield policy show SS-SECRET-001
shipshield policy show SS-DOCKER-001 --json

# Validate custom or workspace policy definitions
shipshield policy validate
shipshield policy validate ./my-policy.json
```

---

### `shipshield db`
Manage, update, and verify local vulnerability intelligence databases.

```bash
# Display vulnerability database freshness and age
shipshield db status
shipshield db status --json

# Download and activate fresh vulnerability intelligence
shipshield db update
shipshield db update --scanner dependencies

# Cryptographically verify the integrity of cached databases
shipshield db verify
```

---

### `shipshield config`
Inspect and validate project configuration files.

```bash
# Validate workspace .shipshield.yaml syntax and schema
shipshield config validate
shipshield config validate --config custom-config.yaml
shipshield config validate --json
```

---

### `shipshield report [scan-id-or-path]`
Inspect and output previously generated scan reports.

```bash
# View latest scan report
shipshield report
shipshield report --latest

# View specific scan by ID or file path
shipshield report scan_abc123xyz
shipshield report .shipshield/reports/scan_abc123xyz.json

# Export report to SARIF format
shipshield report --latest --format sarif
```

---

### `shipshield init`
Generate a clean, secure `.shipshield.yaml` configuration template in the workspace root.

```bash
shipshield init
shipshield init --force
```

---

### `shipshield fix` & `shipshield verify`
Automated non-destructive remediation engine.

```bash
# Preview proposed fixes in dry-run mode (does not modify files)
shipshield fix --dry-run

# Explicitly authorize applying remediation patches
shipshield fix --apply

# Verify that remediation eliminated targeted security findings
shipshield verify
```

---

## Exit Code Contract

ShipShield returns deterministic exit codes adhering to this specification:

| Exit Code | Symbol | Meaning |
|---|---|---|
| `0` | `PASSED` | All security checks completed successfully; no findings breached failure threshold |
| `1` | `POLICY_FAILED` | Security findings breached configured threshold (e.g., HIGH/CRITICAL) |
| `2` | `USAGE_ERROR` | Invalid command-line arguments, invalid flags, or unknown commands |
| `3` | `CONFIGURATION_ERROR` | Syntax error, schema violation, or unreadable `.shipshield.yaml` |
| `4` | `INCOMPLETE` | Scan could not achieve complete coverage (e.g., missing binaries in offline mode) |
| `5` | `REPORT_ERROR` | Failed to write or read report file from filesystem |
| `6` | `FIX_ERROR` | Remediation patch could not be applied or file precondition hash failed |
| `7` | `REQUIRED_SCANNER_UNAVAILABLE` | Explicitly required scanner (`--require`) was not available or failed |
| `8` | `DATABASE_ERROR` | Missing, stale, or corrupted vulnerability intelligence in strict mode |
| `10` | `INTERNAL_ERROR` | Unhandled runtime exception |
