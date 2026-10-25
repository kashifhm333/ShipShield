# ShipShield

> **Production-Grade Local-First DevSecOps Security Gate Platform**

[![CI Quality Gate](https://github.com/kashifhm333/ShipShield/actions/workflows/ci.yml/badge.svg)](https://github.com/kashifhm333/ShipShield/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Ubuntu](https://img.shields.io/badge/Ubuntu-24.04%20LTS%20noble-orange.svg)](https://launchpad.net/~kashifhm333/+archive/ubuntu/shipshield)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.19.0-green.svg)](https://nodejs.org/)

**ShipShield** is a developer-first security gate and local-first background engine designed to catch **hardcoded secrets**, **vulnerable dependencies**, **container misconfigurations**, and **infrastructure-as-code (IaC) risks** directly on your laptop before code is committed or shipped.

---

## Table of Contents

1. [Key Features](#key-features)
2. [Prerequisites](#prerequisites)
3. [Installation Guidelines for Your Laptop](#installation-guidelines-for-your-laptop)
   - [Method 1: Ubuntu / Debian Linux via Launchpad PPA (Recommended)](#method-1-ubuntu--debian-linux-via-launchpad-ppa-recommended)
   - [Method 2: Ubuntu / Debian Linux via Direct `.deb` Package](#method-2-ubuntu--debian-linux-via-direct-deb-package)
   - [Method 3: Any Laptop (macOS, Linux, Windows) via Git & Node.js](#method-3-any-laptop-macos-linux-windows-via-git--nodejs)
4. [Installing Security Scanner Engines](#installing-security-scanner-engines)
5. [Verifying Your Installation (`doctor`)](#verifying-your-installation-doctor)
6. [Daily Usage Guide](#daily-usage-guide)
   - [6.1 Initialize a Project (`init`)](#61-initialize-a-project-init)
   - [6.2 Run Security Scans (`scan`)](#62-run-security-scans-scan)
   - [6.3 Inspect Scan History & Results (`scans`, `results`)](#63-inspect-scan-history--results-scans-results)
   - [6.4 Automated Remediation & Dry-Run Diffs (`plan`, `fix`, `verify`)](#64-automated-remediation--dry-run-diffs-plan-fix-verify)
   - [6.5 Background Engine Acceleration (`engine`)](#65-background-engine-acceleration-engine)
7. [Configuration Reference (`.shipshield.yaml`)](#configuration-reference-shipshieldyaml)
8. [Exit Code Contracts for CI/CD](#exit-code-contracts-for-cicd)
9. [Architecture Overview](#architecture-overview)
10. [Troubleshooting & FAQ](#troubleshooting--faq)
11. [License](#license)

---

## Key Features

- **Local-First & Offline Capable**: Instant feedback directly in your terminal with zero mandatory cloud dependencies. Scans run on your machine and persist in a local SQLite database (`~/.shipshield/shipshield.db`).
- **Multi-Vector Security Gate**:
  - 🔑 **Secrets Detection**: High-entropy token analysis and pattern matching via Gitleaks.
  - 📦 **Dependency Vulnerabilities**: CVE scanning across npm, pip, go, cargo, and Maven via Trivy.
  - 🐳 **Container Misconfigurations**: Dockerfile and container image flaw analysis via Trivy.
  - ☁️ **Infrastructure-as-Code (IaC)**: Misconfiguration detection for Terraform, CloudFormation, and Kubernetes manifests via Checkov.
- **Automated Fix & Verify Engine**: Generate actionable remediation plans, preview unified diffs in dry-run mode, apply fixes, and verify deltas.
- **Background Daemon Acceleration**: An optional per-user systemd daemon keeps scanner engines pre-warmed for instant execution.
- **Deterministic CI/CD Contracts**: Machine-readable exit codes and pure JSON output formatting.

---

## Prerequisites

Before installing ShipShield, make sure your laptop meets the basic requirements:

| Platform | Minimum Requirement | Recommended |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 22.04+ / Debian 12+, macOS 12+, Windows 10/11 (WSL2 or PowerShell) | Ubuntu 24.04 LTS (*noble*) |
| **Node.js** | `>= 18.19.0` (LTS) | `v20.11.0` or `v22.x` |
| **Git** | `v2.30+` | `v2.40+` |

---

## Installation Guidelines for Your Laptop

Choose the installation method that fits your operating system:

### Method 1: Ubuntu / Debian Linux via Launchpad PPA (Recommended)

This is the cleanest and easiest method for Ubuntu laptops. It automatically sets up system updates, manual pages, and systemd user services.

```bash
# 1. Add the official ShipShield PPA
sudo add-apt-repository ppa:kashifhm333/shipshield
sudo apt update

# 2. Install ShipShield
sudo apt install -y shipshield
```

---

### Method 2: Ubuntu / Debian Linux via Direct `.deb` Package

If you prefer offline or direct package installation without adding a PPA:

```bash
# 1. Download the latest .deb release artifact from dist-deb/ or GitHub Releases
# Example for version 1.0.0:
sudo apt install -y ./dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb
```
*Note: `apt install ./package.deb` automatically resolves and installs any required dependencies (like `nodejs` and `git`).*

---

### Method 3: Any Laptop (macOS, Linux, Windows) via Git & Node.js

For macOS, Windows, or non-Debian Linux distributions:

```bash
# 1. Clone the repository
git clone https://github.com/kashifhm333/ShipShield.git
cd ShipShield

# 2. Install dependencies
npm ci

# 3. Compile all packages
npm run build

# 4. Link the CLI globally so 'shipshield' is available anywhere in your terminal
npm link ./apps/cli
```

To verify the CLI command is active in your terminal:
```bash
shipshield --version
```

---

## Installing Security Scanner Engines

ShipShield orchestrates industry-standard open-source security scanners under the hood. While ShipShield can run in standalone mode, installing the scanners activates full detection capabilities:

### 1. Gitleaks (Secrets Scanner)
- **Ubuntu / Debian**:
  ```bash
  sudo apt install -y gitleaks
  ```
- **macOS (Homebrew)**:
  ```bash
  brew install gitleaks
  ```
- **Windows (Scoop / Chocolatey)**:
  ```powershell
  choco install gitleaks
  # or
  scoop install gitleaks
  ```

### 2. Trivy (Dependency & Container Scanner)
- **Ubuntu / Debian**:
  ```bash
  sudo apt install -y wget apt-transport-https gnupg lsb-release
  wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | gpg --dearmor | sudo tee /usr/share/keyrings/trivy.gpg > /dev/null
  echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
  sudo apt update && sudo apt install -y trivy
  ```
- **macOS (Homebrew)**:
  ```bash
  brew install aquasecurity/trivy/trivy
  ```
- **Windows (Scoop / Chocolatey)**:
  ```powershell
  choco install trivy
  ```

### 3. Checkov (Infrastructure-as-Code Scanner)
- **All Platforms via Python (`pipx` or `pip`)**:
  ```bash
  # Using pipx (recommended):
  pipx install checkov

  # Or using pip:
  pip install --user checkov
  ```

---

## Verifying Your Installation (`doctor`)

After installation, run the diagnostic command to check system readiness:

```bash
shipshield doctor
```

Sample output:
```text
🛡️  ShipShield System Diagnostics (Doctor)

1. Runtime Environment:
   ✔ Node.js:        v20.11.0 (x64-linux)
   ✔ CLI Path:       /usr/lib/shipshield/apps/cli/dist/index.js
   ✔ Config Dir:     /home/kashif/.shipshield (writable: true)

2. Background Engine & IPC Service:
   ✔ Engine State:   STANDALONE (or RUNNING)
   ✔ Socket:         /home/kashif/.shipshield/engine.sock

3. Local Job Persistence:
   ✔ Database:       /home/kashif/.shipshield/shipshield.db (accessible)

4. Security Scanner Engines:
   ✔ secrets        : AVAILABLE (Gitleaks - 8.18.2)
   ✔ dependencies   : AVAILABLE (Trivy - 0.76.1)
   ✔ containers     : AVAILABLE (Trivy - 0.76.1)
   ✔ iac            : AVAILABLE (Checkov - 3.2.0)

=== Diagnostic Summary ===
✔ Core systems are operational and ready for scanning.
```

To list scanner availability in a compact format:
```bash
shipshield plan --list-scanners
```

---

## Daily Usage Guide

### 6.1 Initialize a Project (`init`)

Navigate to your project repository and generate a configuration template:

```bash
cd /path/to/your/project
shipshield init
```

This creates a customized `.shipshield.yaml` configuration file and a local reports directory at `.shipshield/reports`.

---

### 6.2 Run Security Scans (`scan`)

#### A. Standard Full Scan
Scan the current workspace against all enabled scanners:
```bash
shipshield scan .
```

#### B. Scan for Specific Risks
Target specific categories (e.g., secrets and dependencies only):
```bash
shipshield scan . --scanners secrets,dependencies
```

#### C. Enforce Severity Thresholds
Fail the command only if critical or high vulnerabilities are detected:
```bash
shipshield scan . --fail-on critical,high
```

#### D. JSON Output for CI/CD Pipelines
Output pure JSON to `stdout` with progress and diagnostics directed to `stderr`:
```bash
shipshield scan . --format json > report.json
```

#### E. Quiet & Color-Free Modes
```bash
shipshield scan . --quiet --no-color
```

---

### 6.3 Inspect Scan History & Results (`scans`, `results`)

ShipShield automatically tracks scan history locally in SQLite:

```bash
# List past scans for the current repository
shipshield scans

# View detailed findings of the most recent scan
shipshield results --latest

# View findings of a specific scan by ID
shipshield results <scan-id>

# Filter findings by severity in the terminal
shipshield show --severity critical
```

---

### 6.4 Automated Remediation & Dry-Run Diffs (`plan`, `fix`, `verify`)

ShipShield doesn't just flag security issues—it helps remediate them:

#### Step 1: Generate a Remediation Plan
```bash
shipshield plan
```

#### Step 2: Preview Remediation Diffs (Dry-Run)
Inspect the exact code changes ShipShield proposes to make without modifying your files:
```bash
shipshield show --dry-run
```

#### Step 3: Apply the Automated Fixes
```bash
# Apply fixes interactively:
shipshield fix

# Apply all recommended fixes automatically:
shipshield fix --all --yes
```

#### Step 4: Verify Fix Efficacy
Verify that the applied changes resolved the vulnerabilities without introducing new policy violations:
```bash
shipshield verify
```

---

### 6.5 Background Engine Acceleration (`engine`)

For large codebases, ShipShield includes a local daemon that runs in the background and keeps scanner environments cached for rapid subsequent scans.

#### Managing the Engine via CLI:
```bash
# Start the background daemon
shipshield engine start

# Check engine health and socket status
shipshield engine status

# View live daemon logs
shipshield engine logs

# Stop the daemon
shipshield engine stop
```

#### Managing as a Systemd User Service (Ubuntu / Debian):
```bash
# Enable and start engine on laptop login
systemctl --user enable --now shipshield-engine.service

# Check systemd status
systemctl --user status shipshield-engine.service
```

---

## Configuration Reference (`.shipshield.yaml`)

Place `.shipshield.yaml` in your project root to customize scanning rules:

```yaml
version: "1.0"
project:
  name: "my-web-app"

policy:
  # Severities that cause shipshield scan to exit with code 1
  fail_on:
    - critical
    - high

scanners:
  secrets:
    enabled: true
    engine: "gitleaks"
    exclude_paths:
      - "tests/fixtures/**"
      - "**/*.mock.json"

  dependencies:
    enabled: true
    engine: "trivy"
    ignore_unfixed: false

  containers:
    enabled: true
    engine: "trivy"

  iac:
    enabled: true
    engine: "checkov"

reports:
  directory: ".shipshield/reports"
  formats:
    - json
    - markdown
```

---

## Exit Code Contracts for CI/CD

ShipShield uses deterministic exit codes so your CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins) can cleanly branch on specific outcomes:

| Exit Code | Name | Description |
| :---: | :--- | :--- |
| **`0`** | `PASSED` | All scanners completed cleanly; no findings violate policy. |
| **`1`** | `POLICY_VIOLATION` | Findings detected that violate configured severity thresholds (`--fail-on`). |
| **`2`** | `USAGE_ERROR` | Invalid CLI arguments, flags, or syntax. |
| **`3`** | `CONFIG_ERROR` | Corrupt or unreadable `.shipshield.yaml` configuration. |
| **`4`** | `INTERNAL_ERROR` | Engine error or scanner subprocess failure. |
| **`5`** | `REPORT_ERROR` | Error generating, reading, or parsing scan report artifacts. |

---

## Architecture Overview

```
ShipShield/
├── apps/
│   ├── cli/             # ShipShield CLI binary (shipshield launcher & commands)
│   ├── api/             # Control plane REST API (Express + MongoDB)
│   ├── web/             # Modern security dashboard (React + Vite)
│   └── worker/          # Isolated scan queue runner (BullMQ + Redis)
├── packages/
│   ├── contracts/       # Canonical schemas, exit codes, and version constants
│   ├── scan-core/       # Pure orchestration, policy engine, and SQLite job store
│   ├── scanner-adapters/# Subprocess adapters (Gitleaks, Trivy, Checkov)
│   └── schemas/         # Shared data and configuration contracts
├── debian/              # Canonical Debian/Ubuntu packaging metadata
└── docs/                # Architecture, threat model, CLI specs, and runbooks
```

---

## Troubleshooting & FAQ

### Q: `shipshield: command not found` after installing via PPA
**A**: Ensure `/usr/bin` is in your environment `$PATH`:
```bash
echo $PATH | grep -q "/usr/bin" && echo "OK" || echo "Add /usr/bin to PATH"
```

### Q: Trivy or Checkov shows `MISSING` in `shipshield doctor`
**A**: ShipShield works even if some scanners are missing—it simply skips the scanners that aren't installed. To install the missing scanner, refer to [Installing Security Scanner Engines](#installing-security-scanner-engines).

### Q: How do I purge all local scan data?
**A**: Scan data is stored safely in your user home directory. To permanently clear local history and databases:
```bash
rm -rf ~/.shipshield
```

---

## License

ShipShield is open-source software licensed under the **[Apache License 2.0](LICENSE)**.
