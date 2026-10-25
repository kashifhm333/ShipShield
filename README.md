# ShipShield

> Production-Grade Local-First DevSecOps Security Gate Platform

[![CI Quality Gate](https://github.com/kashifhm333/ShipShield/actions/workflows/ci.yml/badge.svg)](https://github.com/kashifhm333/ShipShield/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Ubuntu](https://img.shields.io/badge/Ubuntu-24.04%20LTS%20noble-orange.svg)](https://launchpad.net)

ShipShield is a developer-first security gate and local-first background engine designed to detect secrets, vulnerable dependencies, container misconfigurations, and infrastructure-as-code risks before they ship.

---

## Key Features

- **Local-First CLI & Background Engine**: Instant feedback with zero mandatory cloud dependencies. Runs directly on your machine with SQLite/JSON local job persistence.
- **Unified Scanner Orchestration**: Integrates industry-standard engines:
  - **Secrets Detection**: Gitleaks adapter with high-entropy token analysis and pattern rules.
  - **Dependency & Container Analysis**: Trivy adapter for CVE matching across npm, pip, go, cargo, and container images.
  - **Infrastructure as Code (IaC)**: Checkov adapter for Terraform, CloudFormation, Kubernetes, and Dockerfile misconfigurations.
- **Strict Exit Code Contracts**: Deterministic exit codes for frictionless CI/CD automation (`0` = Clean, `1` = Policy Violation, `2` = Scanner Failure, `3` = Configuration Error).
- **Remediation & Dry-Run Engine**: Automated remediation plans, unified diff generation, and verification workflows.
- **Ubuntu Launchpad Packaging**: Native Debian package (`.deb`) and systemd per-user service integration.

---

## Ubuntu Installation (Launchpad PPA)

### 1. Add PPA Repository & Install
```bash
sudo add-apt-repository ppa:kashifhm333/shipshield
sudo apt update
sudo apt install shipshield
```

### 2. Verify Installation & Diagnostic Check
```bash
shipshield --version
shipshield doctor
```

---

## Quickstart

### Run Security Scan
Scan the current workspace against all configured scanners:
```bash
shipshield scan .
```

Scan for specific risks (e.g., secrets and dependencies):
```bash
shipshield scan . --scanners secrets,dependencies
```

Fail only on critical vulnerabilities:
```bash
shipshield scan . --fail-on critical
```

### Background Engine Management
ShipShield includes a local daemon engine running via Unix domain socket:
```bash
shipshield engine start
shipshield engine status
shipshield engine logs
shipshield engine stop
```

### Remediation Planning
Generate an actionable remediation plan with dry-run diffs:
```bash
shipshield plan
shipshield show --dry-run
shipshield fix
shipshield verify
```

---

## Architecture Overview

```
ShipShield/
├── apps/
│   ├── cli/             # ShipShield CLI binary (`shipshield`)
│   ├── api/             # Control Plane REST API (Express + MongoDB)
│   ├── web/             # Modern Security Dashboard (React + Vite)
│   └── worker/          # Scan queue worker (BullMQ + Redis)
├── packages/
│   ├── contracts/       # Canonical schemas, exit codes, and versioning
│   ├── scan-core/       # Pure orchestration, policy engine, and SQLite job store
│   ├── scanner-adapters/# Subprocess adapters (Gitleaks, Trivy, Checkov)
│   └── schemas/         # Data contracts and validation schemas
├── debian/              # Canonical Debian/Ubuntu packaging metadata
└── docs/                # Architecture, threat model, CLI specs, and runbooks
```

---

## Documentation Index

- [Quickstart & Operator Guidelines](start_guideline.md)
- [CLI Specification & Commands](docs/04-cli-specification.md)
- [Scanner Adapter Architecture](docs/03-scanner-adapters.md)
- [Ubuntu Installation & Maintenance Guide](docs/17-ubuntu-installation-and-maintenance.md)
- [Launchpad Release Runbook](docs/18-launchpad-release-runbook.md)
- [Repository File-by-File Audit](docs/15-repository-file-by-file-audit.md)
- [Launchpad Release Readiness Report](docs/16-launchpad-release-readiness.md)

---

## License

Distributed under the Apache 2.0 License. See [`LICENSE`](LICENSE) for details.
