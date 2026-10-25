import os, subprocess, json

commit_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip()
commit_msg = subprocess.check_output(['git', 'log', '-1', '--pretty=%B']).decode().strip()
commit_date = subprocess.check_output(['git', 'log', '-1', '--pretty=%cd', '--date=iso']).decode().strip()

md = f"""# 16 — ShipShield Ubuntu Launchpad Release Readiness Assessment

> **Target Release:** Ubuntu 24.04 LTS (*noble*) amd64  
> **Package Name:** `shipshield`  
> **Source Package:** `shipshield`  
> **Audited Commit SHA:** `{commit_sha}`  
> **Commit Date:** `{commit_date}`  
> **Initial Release Readiness Status:** **BLOCKED (Requires Implementation Phase)**  

---

## 1. Executive Summary & Readiness Verdict

ShipShield is a robust, local-first security platform with high test coverage (>85%) and solid security primitives (safe process runner, boundary validation, redaction engine). However, its current packaging prototype (`packaging/build-deb.sh` and `packaging/debian/`) was written as a local binary test build rather than a production-ready Debian source package suitable for Ubuntu Launchpad PPA ingestion.

### Current Verdict: **NOT READY FOR LAUNCHPAD (Pre-Implementation)**
Launchpad builds packages from **Debian source packages** (`.dsc`, `.orig.tar.gz`, `.debian.tar.xz`, and `.changes`) in an **isolated, network-disconnected builder**. The current repository cannot be uploaded to Launchpad as-is due to the following release blockers:

| Blocker ID | Severity | Area | Problem Statement | Required Remediation |
|---|---|---|---|---|
| **BLK-001** | **P0** | Packaging / Deps | `debian/control` requires `nodejs (>= 20.11.0)`, but Ubuntu 24.04 noble official repositories provide `18.19.1`. Launchpad builder will reject build dependencies. | Reconcile Node.js engine compatibility. ShipShield CLI and scan-core rely on standard ES2022 APIs supported on Node >= 18.19.1. Update `package.json` engines and `debian/control` to `nodejs (>= 18.19.0)`. |
| **BLK-002** | **P0** | Launchpad Build Isolation | `debian/rules` attempts `cp -r ... node_modules ...`. Launchpad builders have NO internet access; `npm install` fails with network timeout. `node-zod` is not packaged in Ubuntu noble. | Construct a self-contained Debian source archive (`.orig.tar.gz`) containing bundled production runtime dependencies or offline npm cache, enabling 100% offline compilation and staging. |
| **BLK-003** | **P1** | Debian Metadata | `packaging/debian/control` declares `Recommends: gitleaks, trivy, checkov`. `trivy` and `checkov` DO NOT exist in Ubuntu noble archives. | Move unavailable scanners from `Recommends` to `Suggests` or documentation, preventing APT dependency resolution failure. Keep `gitleaks` in `Recommends`. |
| **BLK-004** | **P1** | Security Hardening | `apps/cli/src/commands/engine.command.ts` contains an experimental Docker execution path using `execSync` and mounting host root `/:/host:ro`. | Refactor or disable the experimental Docker host-mount fallback in production packages to enforce safe native execution. |
| **BLK-005** | **P1** | Version & Distribution | Version `1.0.0` is hardcoded in 5 files. Changelog specifies `stable;` instead of `noble;` and uses placeholder maintainer email. | Implement single versioning source of truth; set distribution to `noble`; support custom maintainer identity via standard Debian environment variables. |
| **BLK-006** | **P1** | Missing Source Package | No `.dsc`, source `.changes`, or `.orig.tar.gz` generation workflow exists. | Implement clean `dpkg-source` and source package build script that passes `lintian`. |

---

## 2. Ubuntu Support Matrix Evaluation

| Parameter | Selected Target | Justification & Verification |
|---|---|---|
| **Distribution Codename** | `noble` | Current Ubuntu Long Term Support (LTS) release (Ubuntu 24.04.5 LTS). Supported through 2029. |
| **CPU Architecture** | `amd64` | Standard x86_64 production target. Package architecture set to `all` or `amd64`. |
| **System Node.js Version** | `18.19.1+dfsg-6ubuntu5` | Verified via `apt-cache policy nodejs` in Ubuntu noble universe. |
| **Installed Node.js Version (Host)** | `22.23.3-1nodesource1` | Developer workstation has NodeSource Node 22 installed. Code is validated on both Node 22 and 18. |
| **External Security Scanners** | Gitleaks (`8.16.0`), Trivy (optional/suggests), Checkov (optional/suggests) | `gitleaks` verified present in `noble-updates/universe`. Trivy and Checkov documented as external integrations. |
| **System Libraries Required** | `libc6`, `git`, `systemd` | All available in Ubuntu noble base repository. |
| **Build Isolation Requirement** | Network-free clean chroot | Must provide offline production dependencies in source archive. |

---

## 3. Product Boundary for Initial Debian Package

```
+----------------------------------------------------------------------------------+
|                    SHIPSHIELD DEBIAN PACKAGE (/usr/lib/shipshield)               |
|                                                                                  |
|  +--------------------+   +-----------------------+   +-----------------------+  |
|  |   apps/cli (dist)  |-->|  packages/scan-core   |-->|  packages/contracts   |  |
|  +--------------------+   +-----------------------+   +-----------------------+  |
|             |                         |                                          |
|             v                         v                                          |
|  +--------------------+   +-----------------------+   +-----------------------+  |
|  | /usr/bin/shipshield|   |  scanner-adapters     |   | engine-daemon.js      |  |
|  +--------------------+   +-----------------------+   +-----------------------+  |
|                                       |                           |              |
|                                       v                           v              |
|                            [gitleaks subprocess]      [systemd user service]     |
|                            [trivy/checkov optional]   [~/.shipshield/db.sqlite]  |
+----------------------------------------------------------------------------------+
          |
          X  EXCLUDED FROM DEBIAN PACKAGE (Separate Hosted Deployments)
          |
     [apps/api] --- [apps/worker] --- [apps/web] --- [MongoDB] --- [Redis]
```

1. **Included in Package:**
   - `/usr/bin/shipshield` (launcher script)
   - `/usr/lib/shipshield/` (compiled CLI, scan-core, scanner-adapters, contracts, and production `node_modules`)
   - `/usr/lib/systemd/user/shipshield-engine.service` (background engine service)
   - `/usr/share/man/man1/shipshield.1.gz` (manual page)
   - `/usr/share/doc/shipshield/` (changelog.Debian.gz, copyright, documentation)

2. **Excluded from Package:**
   - `apps/api` (Hosted REST API Control Plane)
   - `apps/worker` (BullMQ distributed scan queue worker)
   - `apps/web` (Vite + React web frontend)
   - Database dependencies: No MongoDB or Redis required for CLI operation.

---

## 4. Prioritized Implementation Plan

### Phase 1: Engine & CLI Hardening (Fix P0 & P1 Blockers)
1. **Reconcile Node.js Compatibility:**
   - Adjust `package.json` engines to `node: ">=18.19.0"`.
   - Update `packages/contracts/package.json`, `apps/cli/package.json`, etc.
   - Align `commander` and dependencies across root and workspace manifests.
2. **Harden Engine & Systemd Service:**
   - Remove or safely guard the insecure Docker shell execution in `engine.command.ts`.
   - Ensure per-user systemd service handles restart, socket cleanup, and non-root execution cleanly.
   - Add SQLite migration/version pragma to `job-store.ts`.
3. **Harmonize Versioning:**
   - Read version dynamically from package metadata or centralized build constant.

### Phase 2: Debian Source Package Architecture
1. **Source Package Layout:**
   - Establish standard root `debian/` directory containing `control`, `rules`, `changelog`, `copyright`, `source/format` (3.0 quilt or native), `install`, `manpages`, and `service`.
2. **Offline Production Dependency Bundling:**
   - Implement reproducible packaging script that creates the `.orig.tar.gz` archive containing compiled artifacts and production dependencies.
   - Ensure `debian/rules` builds and installs cleanly without network access.
3. **Man Page & Documentation:**
   - Generate `shipshield.1` roff manpage and install to `/usr/share/man/man1/`.
   - Ensure Debian copyright conforms to Machine-readable Debian copyright format (DEP-5).

### Phase 3: Real Build, Lintian & Installation Validation
1. **Local Build:**
   - Execute `dpkg-buildpackage -us -uc -b` and verify binary package.
   - Run `lintian` checks on the `.deb` and `.dsc`.
2. **Source Package Build:**
   - Execute `dpkg-buildpackage -S -us -uc` or `dpkg-source -b` to create `.dsc`, `.tar.gz`, and source `.changes`.
3. **Disposable Installation Verification:**
   - Test package installation on host Ubuntu system or clean container.
   - Validate `/usr/bin/shipshield --version`, `doctor`, `engine start/status/stop`, and real scans against test fixtures.

### Phase 4: Release Documentation & Runbook
1. Create `docs/17-ubuntu-installation-and-maintenance.md`.
2. Create `docs/18-launchpad-release-runbook.md` with exact GPG signing, dput configuration, and PPA upload instructions.
3. Compile final Release Readiness Report.

