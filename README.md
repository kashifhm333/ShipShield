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
4. [Installing Security Scanner Engines](#installing-security-scanner-engines)
5. [Verifying Your Installation (`doctor`)](#verifying-your-installation-doctor)
6. [Daily Usage Guide](#daily-usage-guide)
   - [6.1 Initialize a Project (`init`)](#61-initialize-a-project-init)
   - [6.2 Run Security Scans (`scan`)](#62-run-security-scans-scan)
   - [6.3 Inspect Scan History & Results (`scans`, `status`, `results`)](#63-inspect-scan-history--results-scans-status-results)
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
3. Downloads the official release binary `shipshield.deb` from GitHub Releases.
4. Installs the payload into `/usr/lib/shipshield` and symlinks `/usr/bin/shipshield`.
5. Executes `shipshield doctor` diagnostics automatically.

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
  sudo apt install -y python3-pip
  # Note: Ubuntu 24.04 enforces PEP 668 externally-managed environments:
  pip install --break-system-packages checkov
  # Or via pipx:
  sudo apt install -y pipx && pipx install checkov
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
   ✔ Node.js:        v18.19.1 (x64-linux)
   ✔ CLI Path:       /usr/lib/shipshield/apps/cli/dist/index.js
   ✔ User Home:      /root
   ✔ Config Dir:     /root/.shipshield (writable: true)

2. Background Engine & IPC Service:
   ✔ Engine State:   RUNNING (Mode: native)
   ✔ Socket Path:    /root/.shipshield/engine.sock (connected)

3. Local Job Persistence:
   ✔ Database:       /root/.shipshield/shipshield.db (accessible)
   ✔ Job Records:    Accessible

4. Security Scanner Engines:
   ✔ secrets        : AVAILABLE (Gitleaks Secrets Scanner)
   ✔ dependencies   : AVAILABLE (Trivy)
   ✔ containers     : AVAILABLE (Trivy)
   ✔ iac            : AVAILABLE (Checkov)

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
Target specific categories (e.g., secrets only):
```bash
shipshield scan . --scanners secrets
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

### 6.3 Inspect Scan History & Results (`scans`, `status`, `results`)

ShipShield automatically tracks scan history locally in SQLite:

```bash
# List past scans for the current repository
shipshield scans

# View status, duration, and metrics for a specific scan
shipshield status <scan-id>

# View detailed findings of a completed scan
shipshield results <scan-id>

# Filter findings by severity in the terminal
shipshield show --severity critical
```

---

### 6.4 Automated Remediation & Dry-Run Diffs (`plan`, `fix`, `verify`)

ShipShield doesn't just flag security issues—it helps remediate them:

#### Step 1: Generate a Policy Evaluation Plan
```bash
shipshield plan
```

#### Step 2: Preview Remediation Diffs (Dry-Run)
Inspect the exact code changes ShipShield proposes to make without modifying your files:
```bash
shipshield show --dry-run
```

#### Step 3: Apply Automated Fixes
```bash
# Apply fixes interactively:
shipshield fix

# Apply all recommended fixes automatically:
shipshield fix --all --yes
```

#### Step 4: Verify Fix Efficacy
Verify that applied changes resolved the vulnerabilities without introducing new policy violations:
```bash
shipshield verify
```

---

### 6.5 Background Engine Acceleration (`engine`)

For large codebases, ShipShield includes a local daemon that runs in the background and keeps scanner environments cached for rapid, sub-second subsequent scans.

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
# Enable and start engine on login
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

### Q: How do I purge all local scan data?
**A**: Scan data is stored safely in your user home directory. To permanently clear local history and databases:
```bash
rm -rf ~/.shipshield
```

---

## License

ShipShield is open-source software licensed under the **[Apache License 2.0](LICENSE)**.
