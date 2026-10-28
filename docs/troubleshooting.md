# Troubleshooting ShipShield

Common issues, diagnostic workflows, and remediation steps.

---

## 1. Diagnostic Workflows

Run the built-in diagnostic commands:
```bash
# 1. Inspect scanner binaries, environment, and permissions
shipshield doctor

# 2. Inspect offline readiness and database presence
shipshield check --mode offline

# 3. Cryptographically verify local database files
shipshield db verify

# 4. Validate configuration syntax
shipshield config validate
```

---

## 2. Common Scenarios

### Scanner Binary Not Found (`exit code 4` or `7`)
**Symptom:** `Error: Binary not found for scanner dependencies: trivy`
**Cause:** Third-party scanner engine is not installed in system `$PATH`.
**Resolution:**
- For secrets: install `gitleaks` (`apt install gitleaks` or from GitHub releases).
- For dependencies/containers: install `trivy` (`curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin`).
- For IaC: install `checkov` (`pip install checkov`).
- Note: ShipShield native static analysis policies continue to execute even if external binaries are missing!

### Database Missing or Stale in Offline Mode (`exit code 8`)
**Symptom:** `Vulnerability database is missing or invalid`
**Resolution:**
When internet connectivity is available, run:
```bash
shipshield db update
```
If operating in an air-gapped environment, transfer `~/.cache/trivy/db/trivy.db` from an online machine into the target directory.

### Configuration Schema Errors (`exit code 3`)
**Symptom:** `Configuration Error: Invalid configuration in .shipshield.yaml`
**Resolution:**
Run `shipshield config validate` to view line-by-line schema violation errors. Check that `schema_version: 1` is present.
