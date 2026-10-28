# ShipShield

> **Production-Grade Local-First DevSecOps Security Gate Platform**

[![CI Quality Gate](https://github.com/kashifhm333/ShipShield/actions/workflows/ci.yml/badge.svg)](https://github.com/kashifhm333/ShipShield/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Ubuntu](https://img.shields.io/badge/Ubuntu-24.04%20LTS%20noble-orange.svg)](https://launchpad.net/~kashifhm333/+archive/ubuntu/shipshield)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.19.0-green.svg)](https://nodejs.org/)

**ShipShield** is a developer-first security gate and local-first background engine designed to catch **hardcoded secrets**, **vulnerable dependencies**, **container misconfigurations**, and **infrastructure-as-code (IaC) risks** directly on your machine before code is committed or shipped.

---

## Table of Contents

1. [Key Features](#key-features)
2. [Prerequisites](#prerequisites)
3. [Installation Guidelines](#installation-guidelines)
   - [Option 1: Direct 3-Command Install on Ubuntu / Debian (Recommended)](#option-1-direct-3-command-install-on-ubuntu--debian-recommended)
   - [Option 2: 1-Line Automated Installer (`curl | bash`)](#option-2-1-line-automated-installer-curl--bash)
   - [Option 3: Any OS (Linux, macOS, Windows) via Git & Node.js](#option-3-any-os-linux-macos-windows-via-git--nodejs)
   - [Option 4: Ubuntu / Debian via Launchpad PPA](#option-4-ubuntu--debian-via-launchpad-ppa)
   - [Option 5: Docker & Isolated Container Testing](#option-5-docker--isolated-container-testing)
   - [Maintenance & Uninstallation](#maintenance--uninstallation)
4. [Installing Security Scanner Engines](#installing-security-scanner-engines)
5. [Verifying Your Installation (`doctor`)](#verifying-your-installation-doctor)
6. [CLI Command Reference & Daily Usage Guide](#cli-command-reference--daily-usage-guide)
   - [6.1 Quick Command Cheat Sheet](#61-quick-command-cheat-sheet)
   - [6.2 System Health & Diagnostics (`doctor`)](#62-system-health--diagnostics-doctor)
   - [6.3 Project Setup (`init`)](#63-project-setup-init)
   - [6.4 Security Scans (`scan` & `plan`)](#64-security-scans-scan--plan)
   - [6.5 Vulnerability Intelligence Management (`update-db`)](#65-vulnerability-intelligence-management-update-db)
   - [6.6 Scan History & Results (`scans`, `status`, `results`, `show`)](#66-scan-history--results-scans-status-results-show)
   - [6.7 Automated Remediation & Fixing (`fix` & `verify`)](#67-automated-remediation--fixing-fix--verify)
   - [6.8 Background Engine Daemon (`engine`)](#68-background-engine-daemon-engine)
   - [6.9 Canceling Active Scans (`cancel`)](#69-canceling-active-scans-cancel)
   - [6.10 Global CLI Flags & Options](#610-global-cli-flags--options)
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
- **Background Daemon Acceleration**: An optional per-user background daemon keeps scanner engines pre-warmed for rapid, sub-second execution.
- **Deterministic CI/CD Contracts**: Machine-readable exit codes and pure JSON output formatting.

---

## Prerequisites

Before installing ShipShield, make sure your machine meets the basic requirements:

| Platform | Minimum Requirement | Recommended |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 22.04+ / Debian 12+, macOS 12+, Windows 10/11 (WSL2 or PowerShell) | Ubuntu 24.04 LTS (*noble*) |
| **Node.js** | `>= 18.19.0` (LTS) | `v20.11.0` or `v22.x` |
| **Git** | `v2.30+` | `v2.40+` |

---

## Installation Guidelines

Choose the installation method that fits your environment:

### Option 1: Direct 3-Command Install on Ubuntu / Debian (Recommended)

This is the fastest, simplest method to get ShipShield working on any Ubuntu or Debian machine (Ubuntu 22.04 LTS, 24.04 LTS Noble, 26.04 Resolute, or Debian 12). Zero PPA errors, zero Launchpad delays, and zero manual dependency configuration:

> [!TIP]
> **Cleaning up prior broken PPA entries**: If you previously added the Launchpad PPA on an unsupported Ubuntu series and are encountering `403 Forbidden` errors during `apt update`, remove the stale source entry first:
> ```bash
> sudo rm -f /etc/apt/sources.list.d/kashifhm333-ubuntu-shipshield*
> sudo apt update
> ```

```bash
# 1. Download the official ShipShield package from GitHub Releases
wget https://github.com/kashifhm333/ShipShield/releases/latest/download/shipshield.deb

# 2. Install via APT (automatically pulls Node.js, Gitleaks, and all runtime libraries)
sudo apt install -y ./shipshield.deb

# 3. Verify installation and run diagnostics
shipshield doctor
```
*(If building or installing from the local repository directory, you can run `sudo apt install -y ./dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb`).*

Once installed, the `shipshield` command is immediately available in your `$PATH` at `/usr/bin/shipshield`.

To verify:
```bash
shipshield --version
# Output: 1.0.0
```

---

### Option 2: 1-Line Automated Installer (`curl | bash`)

For automated setups, cloud VMs, and instant single-command installation:

```bash
curl -sSL https://raw.githubusercontent.com/kashifhm333/ShipShield/main/install.sh | sudo bash
```

**What this script does automatically**:
1. Checks for and removes any broken Launchpad PPA configuration files that block `apt update`.
2. Validates or installs the Node.js (`>= 18.19.0`) runtime and Git.
3. Automatically inspects and provisions security scanner engines (**Gitleaks**, **Trivy**, and **Checkov**).
4. Pre-seeds vulnerability intelligence databases for immediate offline scanning capability.
5. Downloads the official release binary `shipshield.deb` from GitHub Releases (or installs from local artifacts).
6. Installs the payload into `/usr/lib/shipshield` and sets up `/usr/local/bin/shipshield` launcher.
7. Executes `shipshield doctor` diagnostics automatically.

**Installer Lifecycle Flags**:
When running `install.sh` directly:
```bash
# Standard installation
sudo ./install.sh

# Repair installation, refresh symlinks, and check scanner binaries
sudo ./install.sh --repair

# Cleanly uninstall ShipShield binaries, runtime files, and systemd services
sudo ./install.sh --uninstall
```

---

### Option 3: Any OS (Linux, macOS, Windows) via Git & Node.js

For macOS, Windows, or non-Debian Linux distributions:

```bash
# 1. Clone the repository
git clone https://github.com/kashifhm333/ShipShield.git
cd ShipShield

# 2. Install dependencies
npm ci

# 3. Compile all packages
npm run build

# 4. Link the CLI globally so shipshield is available anywhere in your terminal
sudo npm link ./apps/cli
```

To verify the CLI command is active:
```bash
shipshield --version
shipshield doctor
```

---

### Option 4: Ubuntu / Debian via Launchpad PPA

For automatic system updates managed through Ubuntu's Canonical Launchpad packaging:

```bash
# 1. Add the official ShipShield PPA
sudo add-apt-repository ppa:kashifhm333/shipshield
sudo apt update

# 2. Install ShipShield
sudo apt install -y shipshield
```

> [!WARNING]
> **Important Launchpad PPA Considerations & Troubleshooting**:
> - **Target Distribution Series**: Launchpad PPA packages are built specifically for target Ubuntu releases (currently **Ubuntu 24.04 LTS `noble`**).
> - **HTTP `403 Forbidden` on `InRelease`**: If your system is running Ubuntu 26.04 (`resolute`), Ubuntu 22.04 (`jammy`), or a non-LTS development release, Canonical's Launchpad server will return `403 Forbidden` on `InRelease` because binary builds for that series do not exist in the archive.
> - **If you encounter `403 Forbidden` or `repository is not signed` errors**:
>   Remove the PPA file to restore APT functionality:
>   ```bash
>   sudo rm -f /etc/apt/sources.list.d/kashifhm333-ubuntu-shipshield*
>   sudo apt update
>   ```
>   Then proceed with **Option 1** or **Option 2** instead, which install the architecture-independent `.deb` bundle cleanly on any Ubuntu or Debian version.

---

### Option 5: Docker & Isolated Container Testing

To run or test ShipShield inside an Ubuntu Docker container (e.g., CI/CD sandbox or containerized dev environment):

```bash
# 1. Launch an Ubuntu 24.04 container
docker run -d --name shipshield-node ubuntu:24.04 sleep infinity

# 2. Copy the .deb package into the container
docker cp dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb shipshield-node:/tmp/

# 3. Install inside the container via APT
docker exec shipshield-node bash -c "apt-get update && apt-get install -y /tmp/shipshield_1.0.0-1~ubuntu24.04.1_all.deb"

# 4. Verify installation
docker exec -it shipshield-node shipshield doctor
```

---

### Maintenance & Uninstallation

ShipShield provides clean lifecycle commands to maintain, repair, or remove all installed components:

```bash
# Option A: Clean uninstallation using the installer script
sudo ./install.sh --uninstall

# Option B: Manual removal of system binaries and runtime libraries
sudo rm -f /usr/local/bin/shipshield /usr/bin/shipshield
sudo rm -rf /usr/lib/shipshield
sudo rm -f /usr/lib/systemd/user/shipshield-engine.service /etc/systemd/user/shipshield-engine.service

# Option C: Purge local scan history, databases, and logs
rm -rf ~/.shipshield
```

---

## Installing Security Scanner Engines

ShipShield orchestrates industry-standard open-source security scanners under the hood. While ShipShield functions out of the box with built-in secret detection via Gitleaks, installing the additional scanners activates comprehensive vulnerability and misconfiguration scanning:

### 1. Gitleaks (Secrets Scanner)
- **Ubuntu / Debian**: Automatically installed via package `Recommends` during APT installation! Or install manually:
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
  sudo mkdir -p -m 755 /etc/apt/keyrings
  wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo gpg --dearmor -o /etc/apt/keyrings/trivy.gpg
  echo "deb [signed-by=/etc/apt/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main" | sudo tee /etc/apt/sources.list.d/trivy.list
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
- **Ubuntu / Debian**:
  ```bash
  # Option A: Isolated system-wide environment (recommended, avoids PEP 668 Debian conflicts)
  sudo apt update && sudo apt install -y python3-venv python3-pip
  sudo python3 -m venv /opt/checkov-venv
  sudo /opt/checkov-venv/bin/pip install checkov
  sudo ln -sf /opt/checkov-venv/bin/checkov /usr/local/bin/checkov

  # Option B: Via pipx
  sudo apt install -y pipx && pipx install checkov
  sudo ln -sf ~/.local/bin/checkov /usr/local/bin/checkov
  ```
- **macOS (Homebrew / pipx)**:
  ```bash
  brew install checkov
  ```
- **Windows (pip / Scoop)**:
  ```powershell
  pip install checkov
  ```

---

## Verifying Your Installation (`doctor`)

Run the comprehensive diagnostics command to check your runtime environment, daemon socket, persistence database, and scanner engines:

```bash
shipshield doctor
```

**Verified Output (Ubuntu 24.04 LTS)**:
```text
🛡️  ShipShield System Diagnostics (Doctor)

1. Runtime Environment:
   ✔ Node.js:        v20.x / v22.x (x64-linux)
   ✔ CLI Path:       /usr/lib/shipshield/apps/cli/dist/index.js
   ✔ User Home:      /root
   ✔ Config Dir:     /root/.shipshield (writable: true)

2. Background Engine & IPC Service:
   ✔ Engine State:   RUNNING (Mode: native)
   ✔ Socket Path:    /root/.shipshield/engine.sock (connected)

3. Local Job Persistence:
   ✔ Database:       /root/.shipshield/shipshield.db (accessible)
   ✔ Job Records:    Accessible

4. Security Scanner Engines & Intelligence:
   ✔ secrets        : AVAILABLE (Gitleaks Secrets Scanner - 8.x)
   ✔ dependencies   : AVAILABLE (Trivy Dependency Vulnerability Scanner - 0.x)
     ↳ Database:     FRESH (0d old, version: 2)
   ✔ containers     : AVAILABLE (Trivy Container & Config Scanner - 0.x)
     ↳ Database:     FRESH (0d old, version: 2)
   ✔ iac            : AVAILABLE (Checkov Infrastructure-as-Code Scanner - 3.x)

=== Diagnostic Summary ===
✔ Offline Scanning Ready: [secrets, dependencies, containers, iac] available without network.
✔ Core systems are operational and ready for scanning.
```

To list scanner availability in a compact format:
```bash
shipshield plan --list-scanners
```

---

## CLI Command Reference & Daily Usage Guide

ShipShield provides a comprehensive local-first CLI for scanning, policy enforcement, background daemon acceleration, and automated vulnerability remediation.

### 6.1 Quick Command Cheat Sheet

| Command | Description | Example |
| :--- | :--- | :--- |
| **`doctor`** | Check scanner engines, environment, and offline database diagnostics | `shipshield doctor` |
| **`check`** | Fast preflight verification of scanner and database readiness | `shipshield check --mode offline` |
| **`policy list`** | List all 17+ native security rules across 6 security categories | `shipshield policy list` |
| **`policy show`** | Inspect rule details, detection logic, and remediation guidance | `shipshield policy show SS-SECRET-001` |
| **`policy validate`** | Validate native rule registry integrity and compliance | `shipshield policy validate` |
| **`db status`** | Check vulnerability database age and freshness | `shipshield db status` |
| **`db update`** | Securely download and atomically activate vulnerability databases | `shipshield db update` |
| **`db verify`** | Cryptographically verify intelligence database integrity | `shipshield db verify` |
| **`config validate`**| Validate syntax and structure of `.shipshield.yaml` | `shipshield config validate` |
| **`init`** | Initialize `.shipshield.yaml` configuration in workspace | `shipshield init` |
| **`scan`** | Run security scans (secrets, dependencies, containers, IaC) | `shipshield scan .` |
| **`scan --mode offline`** | Execute security scans in strict offline mode (no network calls) | `shipshield scan . --mode offline` |
| **`scan --format sarif`** | Produce standard OASIS SARIF v2.1.0 output | `shipshield scan . --format sarif` |
| **`report`** | Read and display recent scan reports from `.shipshield/reports` | `shipshield report` |
| **`plan`** | Run scanners, evaluate policies, and generate report plan | `shipshield plan` |
| **`scans`** | List persistent local scan history and job IDs | `shipshield scans` |
| **`status`** | Display progress, duration, and metrics for a scan job | `shipshield status <scan-id>` |
| **`results`**| Inspect detailed findings from the latest or specified scan | `shipshield results --latest` |
| **`show`** | Inspect an existing report without re-running scanners | `shipshield show --latest` |
| **`fix`** | Plan and preview or apply automated fixes / patches | `shipshield fix --all --dry-run` |
| **`verify`** | Verify whether applied fixes resolved findings | `shipshield verify` |
| **`engine`** | Start, stop, or view logs of the background acceleration daemon | `shipshield engine status` |
| **`cancel`** | Abort an active or queued background scan job | `shipshield cancel <scan-id>` |

---

### 6.2 System Health & Diagnostics (`doctor`)

Check whether runtime dependencies, background sockets, database persistence, and scanner engines are operational:

```bash
# Run comprehensive environment and scanner diagnostics
shipshield doctor

# Output machine-readable diagnostics for automation and CI/CD gates
shipshield doctor --json
```

---

### 6.3 Project Setup (`init`)

Navigate to your project repository and generate a configuration template:

```bash
cd /path/to/your/project

# Initialize .shipshield.yaml config and local report directory (.shipshield/reports)
shipshield init

# Force overwrite an existing configuration
shipshield init --force --yes
```

---

### 6.4 Security Scans (`scan` & `plan`)

#### A. Standard Workspace Scan
Scan the current workspace against all active security engines:
```bash
shipshield scan .
```

#### B. Scan a Specific Directory
```bash
shipshield scan /path/to/workspace
```

#### C. Target Specific Scanners
Run only specific security vectors:
```bash
# Secrets scanner only (Gitleaks)
shipshield scan . --scanner secrets

# Secrets and dependency scanners
shipshield scan . --scanner secrets dependencies

# Containers (Dockerfile) and Infrastructure-as-Code (Terraform/K8s) scanners
shipshield scan . --scanner containers iac
```

#### D. Enforce Severity Thresholds for CI/CD Gates
Exit with a failure code only when critical or high issues are found:
```bash
shipshield scan . --fail-on critical high
```

#### E. Pure JSON Output (Pipelines & Scripting)
Send structured JSON to `stdout` while keeping diagnostics on `stderr`:
```bash
shipshield scan . --format json > report.json
```

#### F. Asynchronous Background Scans (`--detach`)
Submit the scan to the background engine and receive the scan ID immediately without blocking:
```bash
shipshield scan . --detach
```

#### G. Offline Mode & Intelligence Guarantees
```bash
# Force strict offline mode (zero network calls, uses local cached databases)
shipshield scan . --offline

# Display vulnerability intelligence age and freshness status before scanning
shipshield scan . --show-db-status

# Require specific scanners to execute and complete (fails with code 7 if unavailable)
shipshield scan . --require secrets dependencies

# Override freshness threshold for stale intelligence detection (in days)
shipshield scan . --max-db-age 14

# Write scan report to a custom file path
shipshield scan . --format json --output /path/to/report.json

# Set per-scanner execution timeout (in seconds)
shipshield scan . --timeout 120

# Suppress progress spinners and disable color codes
shipshield scan . --quiet --no-color
```

#### H. Policy Evaluation & Planning (`plan`)
Run scanner evaluations and generate report plans without applying fixes:
```bash
shipshield plan
```

---

### 6.5 Vulnerability Intelligence Management (`update-db`)

When operating in an air-gapped or network-restricted environment, ShipShield separates database updates from scanning. Use `update-db` to safely manage vulnerability intelligence:

```bash
# 1. Inspect local database status without downloading (safe read-only check)
shipshield update-db --check-only

# 2. Output database freshness diagnostics as machine-readable JSON
shipshield update-db --check-only --json

# 3. Download, stage, verify, and atomically activate fresh vulnerability intelligence
shipshield update-db

# 4. Target a specific scanner database
shipshield update-db --scanner dependencies

# 5. Force update even if the database is currently considered fresh
shipshield update-db --force
```

> [!NOTE]
> **Atomic Activation & Rollback Guarantee**: Database downloads are staged in an isolated temporary location. Integrity is verified before replacement. If downloading or unpacking fails, the previous working database is automatically preserved without corrupting the local intelligence cache.

---

### 6.6 Scan History & Results (`scans`, `status`, `results`, `show`)

ShipShield automatically tracks scan history locally in SQLite:

```bash
# 1. List past scans for the current repository
shipshield scans

# 2. View execution status and timing metrics for a specific scan
shipshield status <scan-id>

# 3. View detailed security findings of the most recent scan
shipshield results --latest

# 4. View findings for a specific scan by ID
shipshield results <scan-id>

# 5. Inspect an existing scan report without re-running scanners
shipshield show --latest

# 6. Filter findings by severity in terminal view
shipshield show --severity critical
```

---

### 6.7 Automated Remediation & Fixing (`fix` & `verify`)

ShipShield provides automated remediations for supported vulnerabilities:

#### Step 1: Preview Proposed Fixes (Safe Dry-Run Diff)
Preview unified diffs of proposed code changes without altering any files:
```bash
# Preview fixes for all applicable findings
shipshield fix --all --dry-run

# Preview fix for a specific finding ID
shipshield fix SS-SEC-001234
```

#### Step 2: Apply Automated Fixes
```bash
# Apply fixes interactively with user confirmation
shipshield fix --all --apply

# Apply fixes automatically (ideal for CI/CD or non-interactive scripts)
shipshield fix --all --apply --yes
```

#### Step 3: Verify Fix Efficacy
Run a delta verification check to confirm that the applied patches resolved the findings:
```bash
shipshield verify
```

---

### 6.8 Background Engine Daemon (`engine`)

For large codebases, ShipShield includes a local daemon that runs in the background and keeps scanner environments cached for rapid, sub-second subsequent scans.

#### Managing the Engine via CLI:
```bash
# Start the background daemon (runs native host mode by default)
shipshield engine start

# Start the background daemon with containerized scanners
shipshield engine start --docker

# Start daemon in foreground (attached to current terminal for debugging)
shipshield engine start --foreground

# Check engine health and socket status
shipshield engine status

# View live daemon logs
shipshield engine logs

# Stop the daemon
shipshield engine stop
```

#### Managing as a Systemd User Service (Ubuntu / Debian):
```bash
# Enable and start engine on login
systemctl --user enable --now shipshield-engine.service

# Check systemd status
systemctl --user status shipshield-engine.service
```

---

### 6.9 Canceling Active Scans (`cancel`)

Abort an active or queued background scan job:

```bash
shipshield cancel <scan-id>
```

---

### 6.10 Global CLI Flags & Options

These flags can be used across any ShipShield command:

| Option | Description |
| :--- | :--- |
| **`--format <format>`** | Set output format (`text` or `json`). Default is `text`. |
| **`--no-color`** | Strip ANSI color codes (for logs and CI/CD). |
| **`--quiet`** | Suppress progress output and print summaries only. |
| **`--verbose`** | Print scanner subprocess logs and detailed diagnostics. |
| **`--debug`** | Output low-level internal engine debugging logs. |
| **`--non-interactive`** | Disable interactive terminal prompts. |
| **`--config <path>`** | Specify a custom path to `.shipshield.yaml`. |
| **`--project-dir <path>`** | Explicitly declare the project root path. |
| **`--report-dir <path>`** | Override destination directory for generated reports. |
| **`-v, --version`** | Print current ShipShield version (`1.0.0`). |
| **`-h, --help`** | Display contextual help and flag options. |

---

## Configuration Reference (`.shipshield.yaml`)

Place `.shipshield.yaml` in your project root to customize scanning rules:

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
  # Severities that cause shipshield scan to exit with code 1 (policy failure)
  fail_on:
    - "critical"
    - "high"

  # Fail scan if a scanner fails or times out (exit code 4)
  fail_on_incomplete: true

  # Fail-closed policy switches for offline intelligence (exit code 8)
  fail_on_missing_db: true
  fail_on_stale_db: false

  # Enforce required scanner engines (fails with exit code 7 if unavailable)
  required_scanners:
    - "secrets"
    - "dependencies"

# Offline vulnerability intelligence & database freshness thresholds
database:
  freshness_threshold_days: 7
  stale_threshold_days: 30
  auto_update: false

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
```

---

## Exit Code Contracts for CI/CD

ShipShield uses deterministic, standardized exit codes so your CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins) can cleanly branch on specific outcomes without parsing terminal strings:

| Exit Code | Name | Description | CI/CD Action |
| :---: | :--- | :--- | :--- |
| **`0`** | `PASSED` | All scanners completed cleanly; zero findings violate configured policy. | Gate passes (green). |
| **`1`** | `POLICY_FAILED` | Security findings detected that violate configured severity thresholds (`--fail-on`). | Block merge / deployment (red). |
| **`2`** | `USAGE_ERROR` | Invalid CLI arguments, unrecognized flags, or improper command syntax. | Pipeline configuration error. |
| **`3`** | `CONFIGURATION_ERROR` | Corrupt, missing, or unparseable `.shipshield.yaml` configuration. | Fix project configuration. |
| **`4`** | `INCOMPLETE` | Scan execution could not complete (scanner subprocess timed out or failed with `fail_on_incomplete`). | Retry scan or investigate scanner. |
| **`5`** | `REPORT_ERROR` | Error generating, reading, writing, or parsing scan report artifacts on disk. | Check disk permissions / path. |
| **`6`** | `FIX_ERROR` | Automated remediation planning or patch application failure. | Review patch or apply manually. |
| **`7`** | `REQUIRED_SCANNER_UNAVAILABLE` | A scanner explicitly required via `--require` or `policy.required_scanners` is missing or failed. | Install missing scanner engine. |
| **`8`** | `DATABASE_ERROR` | Vulnerability intelligence database is missing, stale, or failed atomic update. | Run `shipshield update-db`. |
| **`10`** | `INTERNAL_ERROR` | Unhandled engine runtime exception or unexpected system failure. | Report issue / check logs. |

---

## Architecture Overview

ShipShield is a pure standalone, CLI-only security engine:

```
ShipShield/
├── apps/
│   └── cli/             # ShipShield CLI entry point & unified command handlers
├── packages/
│   ├── contracts/       # Canonical schemas, exit codes, finding types & version constants
│   ├── scan-core/       # Pure orchestration, 17+ native static rules, sandbox & reporting
│   ├── scanner-adapters/# Subprocess adapters (Gitleaks, Trivy, Checkov)
│   └── schemas/         # Shared data and configuration validation contracts
├── docs/                # Comprehensive engineering and usage guides
│   ├── architecture.md
│   ├── cli-reference.md
│   ├── online-offline.md
│   ├── security-policies.md
│   ├── configuration.md
│   ├── installation.md
│   ├── troubleshooting.md
│   ├── development.md
│   ├── release-process.md
│   └── security-model.md
├── debian/              # Canonical Debian/Ubuntu packaging metadata & overrides
├── packaging/           # Debian package build pipeline (`build-deb.sh`)
└── dist-deb/            # Pre-compiled standalone Debian package artifacts (.deb)
```

See [docs/architecture.md](docs/architecture.md) for full architectural specifications.

---

## Troubleshooting & FAQ

### Q: `apt update` fails with `403 Forbidden` on `https://ppa.launchpadcontent.net/kashifhm333/shipshield/ubuntu <suite> InRelease`
**A**: Launchpad PPAs build binary `.deb` packages for specific target distributions (such as Ubuntu 24.04 LTS `noble`). If your machine is running Ubuntu 26.04 (`resolute`), Ubuntu 22.04 (`jammy`), or a non-LTS release, Launchpad returns `403 Forbidden` because no packages exist for that distribution codename. To fix this and restore APT functionality:
```bash
sudo rm -f /etc/apt/sources.list.d/kashifhm333-ubuntu-shipshield*
sudo apt update
```
Then use [Option 1](#option-1-direct-3-command-install-on-ubuntu--debian-recommended) or [Option 2](#option-2-1-line-automated-installer-curl--bash) to install the universal `.deb` package directly.

### Q: `wget .../releases/latest/download/shipshield.deb` returns `404 Not Found`
**A**: Official release **v1.0.0** is now live on [GitHub Releases](https://github.com/kashifhm333/ShipShield/releases). You can download `shipshield.deb` directly:
```bash
wget https://github.com/kashifhm333/ShipShield/releases/latest/download/shipshield.deb
sudo apt install -y ./shipshield.deb
```

### Q: Why use `apt install ./shipshield_*.deb` instead of `dpkg -i`?
**A**: When using `dpkg -i`, missing dependencies (such as `nodejs` or `gitleaks`) cause the installation to halt until you manually run `apt-get -f install`. In contrast, `apt-get install -y ./package.deb` automatically checks Ubuntu repositories and downloads all required and recommended dependencies in a single, error-free step.

### Q: `shipshield: command not found` after installing
**A**: Ensure `/usr/bin` is in your environment `$PATH`:
```bash
echo $PATH | grep -q "/usr/bin" && echo "OK" || export PATH="/usr/bin:$PATH"
```

### Q: Trivy or Checkov shows `MISSING` in `shipshield doctor`
**A**: ShipShield works even if optional scanners are missing—it simply skips the scanners that are not installed. To activate dependency and IaC scanning, follow the steps in [Installing Security Scanner Engines](#installing-security-scanner-engines).

### Q: How do I test ShipShield in an isolated Docker container?
**A**: You can test ShipShield in a clean Ubuntu container at any time:
```bash
docker run -d --name test-box ubuntu:24.04 sleep infinity
docker cp dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb test-box:/tmp/
docker exec -it test-box bash -c "apt-get update && apt-get install -y /tmp/shipshield_1.0.0-1~ubuntu24.04.1_all.deb"
docker exec -it test-box shipshield doctor
```

### Q: How do I cleanly uninstall or repair my ShipShield installation?
**A**: If you installed via `install.sh`, you can run:
```bash
# Clean removal of binaries, symlinks, runtime files, and systemd services
sudo ./install.sh --uninstall

# Reinstall or repair dependencies and permissions
sudo ./install.sh --repair
```
For manual removal:
```bash
sudo rm -f /usr/local/bin/shipshield /usr/bin/shipshield
sudo rm -rf /usr/lib/shipshield
rm -rf ~/.shipshield
```

### Q: How do I purge all local scan data?
**A**: Scan data is stored safely in your user home directory. To permanently clear local history and databases:
```bash
rm -rf ~/.shipshield
```

---

## License

ShipShield is open-source software licensed under the **[Apache License 2.0](LICENSE)**.
