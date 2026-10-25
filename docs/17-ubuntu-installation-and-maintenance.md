# ShipShield — Ubuntu Installation & Maintenance Guide

## 1. Executive Overview

This guide details the deployment, configuration, operational management, and lifecycle maintenance of **ShipShield** on **Ubuntu Linux**, specifically targeting the **Ubuntu 24.04 LTS (*noble*)** series.

ShipShield provides a local-first DevSecOps security gate platform that detects hardcoded secrets, vulnerable dependencies, container configuration flaws, and infrastructure-as-code misconfigurations before code is deployed.

---

## 2. Product Boundary & Operating Modes

ShipShield is engineered with a strict boundary between two distinct operating modes:

### 2.1 Local CLI Distribution (The Ubuntu Package)
The standard Ubuntu package (`shipshield`) includes only the components necessary for local developer execution and CI/CD security gating:
- **CLI Binary Launcher**: `/usr/bin/shipshield`
- **Application Engine Bundle**: `/usr/lib/shipshield/`
- **Systemd Per-User Service**: `/usr/lib/systemd/user/shipshield-engine.service`
- **UNIX Manpage**: `/usr/share/man/man1/shipshield.1.gz`
- **Local Job Persistence**: SQLite database (`~/.shipshield/shipshield.db`) with automatic atomic JSON fallback
- **IPC Daemon**: Unix domain socket (`~/.shipshield/engine.sock`)

**Zero Mandatory External Services**: A local scan does **not** require MongoDB, Redis, Docker, Kubernetes, or hosted cloud services.

### 2.2 Hosted Platform (Excluded from Base Package)
The cloud-scale multi-tenant control plane consists of:
- REST API Server (`apps/api/`)
- Distributed BullMQ Worker (`apps/worker/`)
- Web Management Console (`apps/web/`)
- MongoDB & Redis instances
These services remain separately deployable via Docker Compose or Kubernetes and are deliberately excluded from the local desktop/server Debian package.

---

## 3. Ubuntu Support Matrix & System Prerequisites

| Attribute | Specification |
| :--- | :--- |
| **Target Distribution** | Ubuntu 24.04 LTS (*noble*) |
| **Supported Architectures** | `amd64`, `all` (portable Node.js runtime) |
| **Minimum Node.js Runtime** | `nodejs (>= 18.19.0)` (Satisfied natively by Ubuntu 24.04 archive `18.19.1+dfsg-6ubuntu5`) |
| **Required System Utilities**| `git` |
| **Recommended Scanners** | `gitleaks` (available in `noble-updates/universe`) |
| **Optional Scanners** | `trivy` (Aqua Security), `checkov` (Bridgecrew / Prisma Cloud) |

---

## 4. End-User Installation via Launchpad PPA

### Step 1: Add the ShipShield PPA
```bash
sudo add-apt-repository ppa:kashifhm333/shipshield
sudo apt update
```

### Step 2: Install the ShipShield Package
```bash
sudo apt install -y shipshield
```
*Note*: This automatically installs `nodejs`, `git`, and recommends `gitleaks`.

### Step 3: Install Recommended & Optional Security Scanners

#### A. Secrets Scanner (`gitleaks`)
Installed directly from Ubuntu universe repositories:
```bash
sudo apt install -y gitleaks
```

#### B. Dependency & Container Scanner (`trivy`)
Installed via Aqua Security's official Debian repository:
```bash
sudo apt install -y wget apt-transport-https gnupg lsb-release
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | gpg --dearmor | sudo tee /usr/share/keyrings/trivy.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
sudo apt update
sudo apt install -y trivy
```

#### C. Infrastructure-as-Code Scanner (`checkov`)
Installed via Python `pipx` or `pip`:
```bash
sudo apt install -y pipx
pipx ensurepath
pipx install checkov
```

---

## 5. System Health Verification

Execute the built-in diagnostic suite to confirm all subsystems are operational:

```bash
shipshield doctor
```

Expected diagnostic output:
```
🛡️  ShipShield System Diagnostics (Doctor)

1. Runtime Environment:
   ✔ Node.js:        v18.19.1 (or v20+/v22+)
   ✔ CLI Path:       /usr/lib/shipshield/apps/cli/dist/index.js
   ✔ Config Dir:     /home/<user>/.shipshield (writable: true)

2. Background Engine & IPC Service:
   ✔ Engine State:   RUNNING / STANDALONE
   ✔ Socket:         /home/<user>/.shipshield/engine.sock

3. Local Job Persistence:
   ✔ Database:       /home/<user>/.shipshield/shipshield.db (accessible)

4. Security Scanner Engines:
   ✔ secrets        : AVAILABLE (Gitleaks)
   ✔ dependencies   : AVAILABLE (Trivy)
   ✔ containers     : AVAILABLE (Trivy)
   ✔ iac            : AVAILABLE (Checkov)

=== Diagnostic Summary ===
✔ Core systems are operational and ready for scanning.
```

---

## 6. Background Engine & Systemd Lifecycle

ShipShield features a low-overhead background daemon that pre-warms scanner caches and coordinates scan jobs over an authenticated Unix domain socket.

### 6.1 User-Level Service Management
The engine is configured as a systemd **user** service (`shipshield-engine.service`), running with your user's permissions without requiring root privileges.

To enable and start the engine on login:
```bash
systemctl --user enable --now shipshield-engine.service
```

To inspect service health:
```bash
systemctl --user status shipshield-engine.service
```

To view live engine logs:
```bash
journalctl --user -u shipshield-engine.service -f
```

To stop the engine:
```bash
systemctl --user stop shipshield-engine.service
```

### 6.2 CLI-Based Engine Control
Alternatively, manage the daemon directly through the CLI:
```bash
shipshield engine start
shipshield engine status
shipshield engine logs
shipshield engine stop
```

---

## 7. Package Maintenance & Upgrades

### Upgrading ShipShield
To upgrade to the latest release published in the PPA:
```bash
sudo apt update
sudo apt --only-upgrade install shipshield
```
*Note*: Existing scan history in `~/.shipshield/shipshield.db` and configuration in `~/.shipshield/` are automatically preserved during upgrades.

### Removing ShipShield
To remove the package binaries and system services while preserving scan records:
```bash
sudo apt remove shipshield
```

### Complete Purge
To remove the package and system files:
```bash
sudo apt purge shipshield
```

> **Data Preservation Policy**:
> In accordance with Debian Policy Manual §10.7.3, package purge operations **never** delete user files located in home directories (`~/.shipshield/`). If you wish to permanently erase your local scan history and databases, execute manually:
> ```bash
> rm -rf ~/.shipshield
> ```
