# ShipShield Configuration Reference (`.shipshield.yaml`)

ShipShield projects are configured via `.shipshield.yaml` placed in the repository root.

To generate a default configuration file:
```bash
shipshield init
```

To validate your configuration against the schema:
```bash
shipshield config validate
```

---

## Complete `.shipshield.yaml` Specification

```yaml
schema_version: 1

project:
  name: "my-service"
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
  # Severities that trigger policy failure (exit code 1)
  fail_on:
    - "critical"
    - "high"
  fail_on_incomplete: true
  fail_on_stale_db: false
  fail_on_missing_db: true
  required_scanners:
    - "secrets"
    - "dependencies"

database:
  freshness_threshold_days: 7
  stale_threshold_days: 30
  auto_update: false
```

---

## CLI Overrides

Command-line flags override configuration values for specific runs:
- `--fail-on <levels...>`: Overrides `policy.fail_on`.
- `--strict`: Equivalent to `fail_on_incomplete: true`, `fail_on_stale_db: true`, and `fail_on_missing_db: true`.
- `--mode offline`: Sets network policy to deny external calls.
- `--report-dir <path>`: Overrides `reports.directory`.
- `--timeout <sec>`: Sets per-scanner timeout.
