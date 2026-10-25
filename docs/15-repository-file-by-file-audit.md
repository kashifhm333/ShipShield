# 15 — ShipShield Exhaustive Repository File-by-File Audit

> **Audit Target Revision:** `2a202859123e8f225d4c082eb541f1fd347131a2`  
> **Commit Message:** `cli changes`  
> **Commit Date:** `2026-10-25 19:38:51 +0500`  
> **Repository:** `https://github.com/kashifhm333/ShipShield.git`  
> **Default Branch:** `main`  
> **Audit Date:** `2026-10-25`  
> **Status:** Complete exhaustive file-by-file inspection of all 201 tracked files.  

---

## 1. Executive Summary & Repository Identity

An exhaustive file-by-file audit was conducted on commit `2a202859123e8f225d4c082eb541f1fd347131a2`. Every single tracked file (201 files across 13 functional areas) was inspected for purpose, dependencies, runtime impact, packaging impact, quality issues, security vulnerabilities, and release suitability.

| Metric | Value |
|---|---|
| **Tracked Files** | 201 |
| **Files Inspected** | 201 (100% coverage) |
| **Files Not Inspected** | 0 |
| **Total Lines of Source/Config** | 31,871 |
| **Total Size on Disk** | 1,522,297 bytes (1486.6 KB) |
| **Repository Clean State** | Verified clean working tree |
| **Baseline Movement** | `main` has not moved since baseline commit `2a202859123e8f225d4c082eb541f1fd347131a2` |

---

## 2. Priority-Ranked Findings Summary

### 2.1 P0: Release-Blocking & Critical Packaging Blockers
1. **Node.js LTS Dependency Unavailability in Ubuntu 24.04 Official Repositories (`packaging/debian/control:5,11`):**
   - ShipShield specifies `nodejs (>= 20.11.0)` in `debian/control` and root `package.json`.
   - Official Ubuntu 24.04 (noble) repositories only provide Node.js `18.19.1+dfsg-6ubuntu5`.
   - On Launchpad PPA builders (which have strictly isolated network and only official Ubuntu repositories), the build will fail immediately with unsatisfied `Build-Depends: nodejs (>= 20.11.0)`.
   - **Resolution Required:** Validate Node.js 18.19.1 compatibility (or evaluate a bundled, pinned, verified runtime architecture) and adjust package dependencies.

2. **Launchpad Build Isolation & Missing Production Dependencies (`packaging/debian/rules:12`):**
   - Launchpad builders have NO network access during package construction (`dpkg-buildpackage`).
   - The current `debian/rules` attempts `cp -r ... node_modules ...`, assuming developer host `node_modules` exists.
   - In a clean source build, `node_modules` is absent and `npm install` cannot access `registry.npmjs.org`.
   - `node-zod` does not exist in Ubuntu noble; `node-commander` and `node-diff` versions in noble are outdated.
   - **Resolution Required:** Construct a self-contained Debian source package (`.orig.tar.gz`) containing bundled/vendored production runtime dependencies so the build succeeds with zero network access.

### 2.2 P1: Major Reliability, Correctness & Security Blockers
1. **Missing Scanner Packages in Ubuntu Repositories (`packaging/debian/control:12`):**
   - `packaging/debian/control` recommends `gitleaks, trivy, checkov`.
   - `gitleaks` is present in Ubuntu noble, but `trivy` and `checkov` DO NOT exist in official Ubuntu archives.
   - Declaring non-existent packages in `Recommends` causes APT installation failures or warnings.
   - **Resolution Required:** Demote missing scanners from `Recommends` to `Suggests` or document manual external installation.

2. **Unsafe Docker Path in Engine Command (`apps/cli/src/commands/engine.command.ts:62-68`):**
   - `shipshield engine start --docker` executes `execSync` with raw string concatenation and mounts the entire host root filesystem (`/:/host:ro`).
   - **Resolution Required:** Refactor or disable the experimental Docker fallback in the production Ubuntu package.

3. **Debian Changelog Distribution & Maintainer Metadata (`packaging/debian/changelog:1,8`):**
   - Changelog targets `stable` instead of the Ubuntu release codename `noble`.
   - Maintainer email is placeholder `maintainers@shipshield.dev`.
   - **Resolution Required:** Update changelog with `noble` distribution, unique PPA version, and configurable maintainer identity.

4. **Hardcoded Monorepo Lint Script (`package.json:19`):**
   - `npm run lint` executes `echo 'Linting complete'` rather than a real static analysis tool.
   - **Resolution Required:** Add real static analysis check.

### 2.3 P2: Important Quality & Maintainability Improvements
1. **Hardcoded Version Strings (`1.0.0`):**
   - Hardcoded in `apps/cli/src/index.ts:23`, `presenter/terminal-presenter.ts:64`, `engine-daemon.ts:23`, `scan-orchestrator.ts:197`, and `packaging/build-deb.sh:8`.
2. **Tracked Compiler Caches & Reports:**
   - 7 `tsconfig.tsbuildinfo` files and multiple scan reports committed to Git despite `.gitignore` rules.
3. **SQLite Persistence Schema Versioning (`packages/scan-core/src/jobs/job-store.ts:51`):**
   - Schema creation lacks migration version tracking.

### 2.4 P3: Non-Blocking Cleanup
1. **Duplicate Master Document (`docs/README (2).md`):** File contains space and parenthesis.
2. **Documentation Inconsistency:** `start_guideline.md` does not document `shipshield engine`, `scans`, or `cancel` subcommands.

---

## 3. Product Boundary Definition for Ubuntu Package

ShipShield comprises two distinct operational modes:

### Mode A: Local CLI & Background Engine Distribution (Packaged in `.deb`)
- **Components Included:**
  - `/usr/bin/shipshield` executable launcher
  - `@shipshield/cli` compiled output and runtime
  - `@shipshield/scan-core` scanning engine, config loader, policy engine, report writers
  - `@shipshield/contracts` schemas and exit codes
  - `@shipshield/scanner-adapters` (Gitleaks, Trivy, Checkov subprocess adapters)
  - Local background engine daemon (`engine-daemon.js`)
  - User systemd service (`/usr/lib/systemd/user/shipshield-engine.service`)
  - Local job store (SQLite in `~/.shipshield/shipshield.db` with file fallback)
  - Man page documentation (`/usr/share/man/man1/shipshield.1.gz`)
- **Zero Infrastructure Requirement:** A local scan requires **NO MongoDB, Redis, Docker, Kubernetes, API server, or Web UI**.

### Mode B: Hosted Enterprise Platform (Separately Deployed)
- **Components Excluded from `.deb`:**
  - `apps/api/` (Express REST API Control Plane)
  - `apps/worker/` (BullMQ asynchronous scan worker)
  - `apps/web/` (React + Vite security dashboard)
  - `docker-compose.yml`, MongoDB, Redis configurations

---

## 4. File-by-File Exhaustive Audit Table

| Path | Category | Lines | Size (Bytes) | Runtime Impact | Packaging Action | Findings / Severity |
|---|---|---|---|---|---|---|
| [`.github/workflows/ci.yml`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/.github/workflows/ci.yml) | ci-cd | 37 | 869 | Continuous Integration quality | Fix | P1: Uses npm install --legacy-peer-deps rather than deterministic npm ci.; Missing Debian packaging, source package, and ins... |
| [`.gitignore`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/.gitignore) | root-config | 13 | 145 | None (VCS configuration) | Fix | P2: Contradiction: *.tsbuildinfo is in .gitignore (line 12), but 7 tsconfig.tsbuildinfo files are tracked in git.; Contradic... |
| [`.shipshield.yaml`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/.shipshield.yaml) | root-config | 34 | 548 | Local CLI, engine, and CI dogf | Keep | Clean |
| [`Dockerfile`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/Dockerfile) | root-config | 90 | 3056 | Hosted platform / containerize | Investigate | P2: Uses --legacy-peer-deps during npm install (lines 22, 39, 80) indicating peer dependency version mismatches.; Uses --bre... |
| [`apps/api/package.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/package.json) | apps-api | 28 | 621 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/app.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/app.ts) | apps-api | 76 | 2420 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/config/env.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/config/env.ts) | apps-api | 32 | 1708 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/connection.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/connection.ts) | apps-api | 15 | 410 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/models/audit-event.model.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/models/audit-event.model.ts) | apps-api | 48 | 1369 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/models/finding.model.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/models/finding.model.ts) | apps-api | 107 | 3360 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/models/installation.model.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/models/installation.model.ts) | apps-api | 33 | 1034 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/models/membership.model.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/models/membership.model.ts) | apps-api | 39 | 1141 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/models/organization.model.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/models/organization.model.ts) | apps-api | 44 | 1182 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/models/policy.model.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/models/policy.model.ts) | apps-api | 44 | 1395 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/models/repository.model.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/models/repository.model.ts) | apps-api | 45 | 1441 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/models/scan-finding.model.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/models/scan-finding.model.ts) | apps-api | 29 | 892 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/models/scan.model.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/models/scan.model.ts) | apps-api | 91 | 2724 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/models/suppression.model.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/models/suppression.model.ts) | apps-api | 50 | 1713 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/models/user.model.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/models/user.model.ts) | apps-api | 38 | 1044 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/db/models/webhook-event.model.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/db/models/webhook-event.model.ts) | apps-api | 44 | 1285 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/middleware/auth.middleware.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/middleware/auth.middleware.ts) | apps-api | 145 | 4312 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/middleware/error.middleware.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/middleware/error.middleware.ts) | apps-api | 73 | 1776 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/middleware/request-id.middleware.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/middleware/request-id.middleware.ts) | apps-api | 20 | 584 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/middleware/tenant.middleware.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/middleware/tenant.middleware.ts) | apps-api | 32 | 1087 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/routes/findings.routes.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/routes/findings.routes.ts) | apps-api | 71 | 2132 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/routes/health.routes.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/routes/health.routes.ts) | apps-api | 12 | 292 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/routes/internal.routes.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/routes/internal.routes.ts) | apps-api | 72 | 2277 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/routes/policies.routes.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/routes/policies.routes.ts) | apps-api | 64 | 1965 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/routes/repositories.routes.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/routes/repositories.routes.ts) | apps-api | 96 | 2829 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/routes/scans.routes.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/routes/scans.routes.ts) | apps-api | 104 | 3078 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/routes/suppressions.routes.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/routes/suppressions.routes.ts) | apps-api | 97 | 3031 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/routes/webhooks.routes.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/routes/webhooks.routes.ts) | apps-api | 108 | 3249 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/server.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/server.ts) | apps-api | 20 | 589 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/src/services/ingestion.service.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/src/services/ingestion.service.ts) | apps-api | 110 | 3611 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/test/api.integration.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/test/api.integration.test.ts) | apps-api | 547 | 21426 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/test/error.middleware.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/test/error.middleware.test.ts) | apps-api | 82 | 2585 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/test/ingestion.service.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/test/ingestion.service.test.ts) | apps-api | 124 | 4182 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/test/models.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/test/models.test.ts) | apps-api | 37 | 1985 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/tsconfig.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/tsconfig.json) | apps-api | 13 | 275 | Hosted platform only (not used | Keep | Clean |
| [`apps/api/tsconfig.tsbuildinfo`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/api/tsconfig.tsbuildinfo) | apps-api | 1 | 75647 | None (build cache) | Exclude | P2: Compiler cache artifact committed to version control despite being in .gitignore. |
| [`apps/cli/package.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/package.json) | apps-cli | 22 | 446 | CLI binary definition | Fix | P2: Declares commander ^12.1.0 while root declares commander ^15.0.0. |
| [`apps/cli/src/commands/cancel.command.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/commands/cancel.command.ts) | apps-cli | 34 | 1161 | Local CLI command execution | Keep | Clean |
| [`apps/cli/src/commands/doctor.command.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/commands/doctor.command.ts) | apps-cli | 99 | 4294 | CLI environment diagnostics | Fix | P2: Recommends pipe-to-shell installer (curl | sh) for Trivy rather than deb/apt installation. |
| [`apps/cli/src/commands/engine.command.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/commands/engine.command.ts) | apps-cli | 250 | 8567 | Engine daemon operational mana | Refactor | P1: Unsafe docker path: executes docker run with string interpolation and mounts host root (/:/host:ro). |
| [`apps/cli/src/commands/fix.command.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/commands/fix.command.ts) | apps-cli | 144 | 5559 | Local CLI command execution | Keep | Clean |
| [`apps/cli/src/commands/init.command.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/commands/init.command.ts) | apps-cli | 106 | 3190 | Local CLI command execution | Keep | Clean |
| [`apps/cli/src/commands/plan.command.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/commands/plan.command.ts) | apps-cli | 178 | 6704 | Local CLI command execution | Keep | Clean |
| [`apps/cli/src/commands/results.command.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/commands/results.command.ts) | apps-cli | 83 | 2942 | Local CLI command execution | Keep | Clean |
| [`apps/cli/src/commands/scan.command.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/commands/scan.command.ts) | apps-cli | 164 | 6265 | Local CLI command execution | Keep | Clean |
| [`apps/cli/src/commands/scans.command.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/commands/scans.command.ts) | apps-cli | 82 | 3241 | Local CLI command execution | Keep | Clean |
| [`apps/cli/src/commands/show.command.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/commands/show.command.ts) | apps-cli | 98 | 3772 | Local CLI command execution | Keep | Clean |
| [`apps/cli/src/commands/status.command.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/commands/status.command.ts) | apps-cli | 68 | 2382 | Local CLI command execution | Keep | Clean |
| [`apps/cli/src/commands/verify.command.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/commands/verify.command.ts) | apps-cli | 114 | 4569 | Local CLI command execution | Keep | Clean |
| [`apps/cli/src/engine-daemon.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/engine-daemon.ts) | apps-cli | 51 | 1292 | Local background engine daemon | Fix | P2: Hardcodes version '1.0.0' in EngineServer configuration. |
| [`apps/cli/src/index.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/index.ts) | apps-cli | 79 | 3083 | Local CLI execution entrypoint | Fix | P2: Hardcodes version '1.0.0' directly in source code instead of loading from package metadata. |
| [`apps/cli/src/presenter/terminal-presenter.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/src/presenter/terminal-presenter.ts) | apps-cli | 160 | 5823 | CLI presentation layer | Fix | P3: Hardcodes 'v1.0.0' in banner string. |
| [`apps/cli/test/cli.e2e.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/test/cli.e2e.test.ts) | apps-cli | 701 | 22342 | Repository execution | Keep | Clean |
| [`apps/cli/tsconfig.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/tsconfig.json) | apps-cli | 14 | 326 | Repository execution | Keep | Clean |
| [`apps/cli/tsconfig.tsbuildinfo`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/cli/tsconfig.tsbuildinfo) | apps-cli | 1 | 51018 | None (build cache) | Exclude | P2: Compiler cache artifact committed to version control despite being in .gitignore. |
| [`apps/web/index.html`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/index.html) | apps-web | 15 | 619 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/package.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/package.json) | apps-web | 22 | 447 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/src/App.tsx`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/src/App.tsx) | apps-web | 94 | 3601 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/src/components/FindingDrawer.tsx`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/src/components/FindingDrawer.tsx) | apps-web | 234 | 9386 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/src/components/ScanStatusBanner.tsx`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/src/components/ScanStatusBanner.tsx) | apps-web | 64 | 1847 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/src/components/SeverityBadge.tsx`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/src/components/SeverityBadge.tsx) | apps-web | 66 | 1640 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/src/index.css`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/src/index.css) | apps-web | 78 | 1724 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/src/main.tsx`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/src/main.tsx) | apps-web | 10 | 236 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/src/pages/PolicySettingsPage.tsx`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/src/pages/PolicySettingsPage.tsx) | apps-web | 111 | 4678 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/src/pages/RepositoriesPage.tsx`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/src/pages/RepositoriesPage.tsx) | apps-web | 119 | 4411 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/src/pages/ScanDetailPage.tsx`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/src/pages/ScanDetailPage.tsx) | apps-web | 208 | 8399 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/src/pages/ScanHistoryPage.tsx`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/src/pages/ScanHistoryPage.tsx) | apps-web | 133 | 4903 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/tsconfig.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/tsconfig.json) | apps-web | 20 | 508 | Hosted platform only (not used | Keep | Clean |
| [`apps/web/vite.config.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/web/vite.config.ts) | apps-web | 12 | 228 | Hosted platform only (not used | Keep | Clean |
| [`apps/worker/package.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/worker/package.json) | apps-worker | 22 | 483 | Hosted platform only (not used | Keep | Clean |
| [`apps/worker/src/scan-job.processor.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/worker/src/scan-job.processor.ts) | apps-worker | 84 | 2264 | Hosted platform only (not used | Keep | Clean |
| [`apps/worker/src/worker.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/worker/src/worker.ts) | apps-worker | 32 | 1026 | Hosted platform only (not used | Keep | Clean |
| [`apps/worker/src/workspace-sandbox.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/worker/src/workspace-sandbox.ts) | apps-worker | 81 | 2004 | Hosted platform only (not used | Keep | Clean |
| [`apps/worker/test/worker.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/worker/test/worker.test.ts) | apps-worker | 137 | 4708 | Hosted platform only (not used | Keep | Clean |
| [`apps/worker/tsconfig.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/worker/tsconfig.json) | apps-worker | 14 | 326 | Hosted platform only (not used | Keep | Clean |
| [`apps/worker/tsconfig.tsbuildinfo`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/apps/worker/tsconfig.tsbuildinfo) | apps-worker | 1 | 69511 | None (build cache) | Exclude | P2: Compiler cache artifact committed to version control despite being in .gitignore. |
| [`docker-compose.yml`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/docker-compose.yml) | root-config | 70 | 1616 | Hosted platform local developm | Fix | P2: Default insecure credentials and HMAC secret keys in compose environment variables. |
| [`docs/02-product-requirements-document.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/docs/02-product-requirements-document.md) | docs | 466 | 27143 | None (documentation) | Keep | Clean |
| [`docs/03-system-design-and-architecture.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/docs/03-system-design-and-architecture.md) | docs | 777 | 36092 | None (documentation) | Keep | Clean |
| [`docs/04-cli-specification.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/docs/04-cli-specification.md) | docs | 919 | 40332 | None (documentation) | Keep | Clean |
| [`docs/05-security-and-threat-model.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/docs/05-security-and-threat-model.md) | docs | 744 | 46652 | None (documentation) | Keep | Clean |
| [`docs/06_data_model_and_api_specification.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/docs/06_data_model_and_api_specification.md) | docs | 1084 | 34854 | None (documentation) | Keep | Clean |
| [`docs/07_scanner_and_remediation_specification.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/docs/07_scanner_and_remediation_specification.md) | docs | 639 | 26231 | None (documentation) | Keep | Clean |
| [`docs/08_testing_strategy_and_quality_gates.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/docs/08_testing_strategy_and_quality_gates.md) | docs | 608 | 25232 | None (documentation) | Keep | Clean |
| [`docs/09_devops_and_deployment_guide.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/docs/09_devops_and_deployment_guide.md) | docs | 244 | 10170 | None (documentation) | Keep | Clean |
| [`docs/10_implementation_plan_and_task_breakdown.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/docs/10_implementation_plan_and_task_breakdown.md) | docs | 135 | 8004 | None (documentation) | Keep | Clean |
| [`docs/11_llm_implementation_master_blueprint.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/docs/11_llm_implementation_master_blueprint.md) | docs | 967 | 51827 | None (documentation) | Keep | Clean |
| [`docs/README (2).md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/docs/README (2).md) | docs | 1968 | 72913 | None (documentation) | Investigate | P3: Filename contains space and parenthesis; duplicate or misplaced master specification. |
| [`fixtures/clean-project/.shipshield.yaml`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/.shipshield.yaml) | fixtures | 13 | 218 | Integration and E2E test verif | Keep | Clean |
| [`fixtures/clean-project/.shipshield/reports/latest.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/.shipshield/reports/latest.json) | fixtures | 214 | 7253 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/clean-project/.shipshield/reports/latest.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/.shipshield/reports/latest.md) | fixtures | 86 | 2375 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/clean-project/.shipshield/reports/scan-2026-10-24T16-26-11-900Z-scan_mvmm26nw2623521e110294ba.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/.shipshield/reports/scan-2026-10-24T16-26-11-900Z-scan_mvmm26nw2623521e110294ba.json) | fixtures | 78 | 1687 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/clean-project/.shipshield/reports/scan-2026-10-24T16-26-11-900Z-scan_mvmm26nw2623521e110294ba.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/.shipshield/reports/scan-2026-10-24T16-26-11-900Z-scan_mvmm26nw2623521e110294ba.md) | fixtures | 32 | 755 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/clean-project/.shipshield/reports/scan-2026-10-24T16-26-19-986Z-scan_mvmm2cwi93764165a52e81df.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/.shipshield/reports/scan-2026-10-24T16-26-19-986Z-scan_mvmm2cwi93764165a52e81df.json) | fixtures | 78 | 1687 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/clean-project/.shipshield/reports/scan-2026-10-24T16-26-19-986Z-scan_mvmm2cwi93764165a52e81df.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/.shipshield/reports/scan-2026-10-24T16-26-19-986Z-scan_mvmm2cwi93764165a52e81df.md) | fixtures | 32 | 755 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/clean-project/.shipshield/reports/scan-2026-10-24T16-56-41-926Z-scan_mvmn5epyd87fb04dd8b44648.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/.shipshield/reports/scan-2026-10-24T16-56-41-926Z-scan_mvmn5epyd87fb04dd8b44648.json) | fixtures | 78 | 1687 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/clean-project/.shipshield/reports/scan-2026-10-24T16-56-41-926Z-scan_mvmn5epyd87fb04dd8b44648.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/.shipshield/reports/scan-2026-10-24T16-56-41-926Z-scan_mvmn5epyd87fb04dd8b44648.md) | fixtures | 32 | 755 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/clean-project/.shipshield/reports/scan-2026-10-25T06-29-34-650Z-scan_mvng6rzu1ac753cd594f99d0.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/.shipshield/reports/scan-2026-10-25T06-29-34-650Z-scan_mvng6rzu1ac753cd594f99d0.json) | fixtures | 51 | 1046 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/clean-project/.shipshield/reports/scan-2026-10-25T06-29-34-650Z-scan_mvng6rzu1ac753cd594f99d0.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/.shipshield/reports/scan-2026-10-25T06-29-34-650Z-scan_mvng6rzu1ac753cd594f99d0.md) | fixtures | 29 | 615 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/clean-project/Dockerfile`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/Dockerfile) | fixtures | 5 | 102 | Integration and E2E test verif | Keep | Clean |
| [`fixtures/clean-project/main.tf`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/main.tf) | fixtures | 12 | 319 | Integration and E2E test verif | Keep | Clean |
| [`fixtures/clean-project/src/index.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/clean-project/src/index.ts) | fixtures | 3 | 70 | Integration and E2E test verif | Keep | Clean |
| [`fixtures/misconfigured-terraform/.shipshield.yaml`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/misconfigured-terraform/.shipshield.yaml) | fixtures | 13 | 228 | Integration and E2E test verif | Keep | Clean |
| [`fixtures/misconfigured-terraform/main.tf`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/misconfigured-terraform/main.tf) | fixtures | 3 | 93 | Integration and E2E test verif | Keep | Clean |
| [`fixtures/seeded-secrets/.shipshield.yaml`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield.yaml) | fixtures | 13 | 219 | Integration and E2E test verif | Keep | Clean |
| [`fixtures/seeded-secrets/.shipshield/reports/latest.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield/reports/latest.json) | fixtures | 125 | 3763 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/seeded-secrets/.shipshield/reports/latest.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield/reports/latest.md) | fixtures | 62 | 1649 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-03-24-158Z-scan_mvnf94737ebe57e7f1ed615d.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-03-24-158Z-scan_mvnf94737ebe57e7f1ed615d.json) | fixtures | 76 | 1598 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-03-24-158Z-scan_mvnf94737ebe57e7f1ed615d.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-03-24-158Z-scan_mvnf94737ebe57e7f1ed615d.md) | fixtures | 32 | 770 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-08-44-640Z-scan_mvnffzhc5a933bef03524718.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-08-44-640Z-scan_mvnffzhc5a933bef03524718.json) | fixtures | 53 | 1157 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-08-44-640Z-scan_mvnffzhc5a933bef03524718.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-08-44-640Z-scan_mvnffzhc5a933bef03524718.md) | fixtures | 29 | 613 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-09-53-104Z-scan_mvnfhgb5f4847c9683383f8f.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-09-53-104Z-scan_mvnfhgb5f4847c9683383f8f.json) | fixtures | 125 | 3763 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-09-53-104Z-scan_mvnfhgb5f4847c9683383f8f.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-09-53-104Z-scan_mvnfhgb5f4847c9683383f8f.md) | fixtures | 62 | 1649 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-29-23-894Z-scan_mvng6jp234f333bbb3ad4b7b.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-29-23-894Z-scan_mvng6jp234f333bbb3ad4b7b.json) | fixtures | 125 | 3763 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-29-23-894Z-scan_mvng6jp234f333bbb3ad4b7b.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-29-23-894Z-scan_mvng6jp234f333bbb3ad4b7b.md) | fixtures | 62 | 1649 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-29-29-606Z-scan_mvng6o3q9b7e6b9620413a17.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-29-29-606Z-scan_mvng6o3q9b7e6b9620413a17.json) | fixtures | 125 | 3763 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-29-29-606Z-scan_mvng6o3q9b7e6b9620413a17.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/.shipshield/reports/scan-2026-10-25T06-29-29-606Z-scan_mvng6o3q9b7e6b9620413a17.md) | fixtures | 62 | 1649 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/seeded-secrets/src/credentials.js`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/seeded-secrets/src/credentials.js) | fixtures | 8 | 244 | Integration and E2E test verif | Keep | Clean: Contains synthetic credentials for testing; verified non-production test keys. |
| [`fixtures/unsafe-docker/.shipshield.yaml`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/unsafe-docker/.shipshield.yaml) | fixtures | 13 | 218 | Integration and E2E test verif | Keep | Clean |
| [`fixtures/unsafe-docker/.shipshield/reports/latest.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/unsafe-docker/.shipshield/reports/latest.json) | fixtures | 119 | 3642 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`fixtures/unsafe-docker/Dockerfile`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/unsafe-docker/Dockerfile) | fixtures | 4 | 81 | Integration and E2E test verif | Keep | Clean |
| [`fixtures/vulnerable-deps/.shipshield.yaml`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/vulnerable-deps/.shipshield.yaml) | fixtures | 13 | 220 | Integration and E2E test verif | Keep | Clean |
| [`fixtures/vulnerable-deps/package.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/fixtures/vulnerable-deps/package.json) | fixtures | 8 | 138 | Integration and E2E test verif | Keep | Clean |
| [`package-lock.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/package-lock.json) | root-config | 6226 | 213593 | Build environment dependency r | Keep | Clean |
| [`package.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/package.json) | root-config | 48 | 1259 | Monorepo build orchestration a | Fix | P1: Version mismatch: root package.json specifies unaligned dependency versions compared to workspaces (e.g. commander ^15.0... |
| [`packages/contracts/package.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/contracts/package.json) | packages-contracts | 23 | 424 | Shared contracts for CLI, scan | Keep | Clean |
| [`packages/contracts/src/api.schema.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/contracts/src/api.schema.ts) | packages-contracts | 76 | 2116 | Shared contracts for CLI, scan | Keep | Clean |
| [`packages/contracts/src/config.schema.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/contracts/src/config.schema.ts) | packages-contracts | 69 | 2405 | Shared contracts for CLI, scan | Keep | Clean |
| [`packages/contracts/src/engine.schema.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/contracts/src/engine.schema.ts) | packages-contracts | 113 | 3362 | Shared contracts for CLI, scan | Keep | Clean |
| [`packages/contracts/src/enums.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/contracts/src/enums.ts) | packages-contracts | 44 | 1038 | Shared contracts for CLI, scan | Keep | Clean |
| [`packages/contracts/src/exit-codes.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/contracts/src/exit-codes.ts) | packages-contracts | 43 | 1045 | Shared contracts for CLI, scan | Keep | Clean |
| [`packages/contracts/src/finding.schema.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/contracts/src/finding.schema.ts) | packages-contracts | 61 | 1943 | Shared contracts for CLI, scan | Keep | Clean |
| [`packages/contracts/src/index.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/contracts/src/index.ts) | packages-contracts | 7 | 239 | Shared contracts for CLI, scan | Keep | Clean |
| [`packages/contracts/src/report.schema.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/contracts/src/report.schema.ts) | packages-contracts | 93 | 2801 | Shared contracts for CLI, scan | Keep | Clean |
| [`packages/contracts/test/schemas.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/contracts/test/schemas.test.ts) | packages-contracts | 234 | 7388 | Shared contracts for CLI, scan | Keep | Clean |
| [`packages/contracts/tsconfig.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/contracts/tsconfig.json) | packages-contracts | 9 | 165 | Shared contracts for CLI, scan | Keep | Clean |
| [`packages/contracts/tsconfig.tsbuildinfo`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/contracts/tsconfig.tsbuildinfo) | packages-contracts | 1 | 41983 | None (build cache) | Exclude | P2: Compiler cache artifact committed to version control despite being in .gitignore. |
| [`packages/scan-core/.shipshield/reports/latest.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/.shipshield/reports/latest.json) | packages-scan-core | 77 | 1636 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`packages/scan-core/.shipshield/reports/latest.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/.shipshield/reports/latest.md) | packages-scan-core | 32 | 766 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`packages/scan-core/.shipshield/reports/scan-2026-10-24T16-57-38-010Z-scan_mvmn6lzvb7d22b4a9e8e44ad.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/.shipshield/reports/scan-2026-10-24T16-57-38-010Z-scan_mvmn6lzvb7d22b4a9e8e44ad.json) | packages-scan-core | 77 | 1636 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`packages/scan-core/.shipshield/reports/scan-2026-10-24T16-57-38-010Z-scan_mvmn6lzvb7d22b4a9e8e44ad.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/.shipshield/reports/scan-2026-10-24T16-57-38-010Z-scan_mvmn6lzvb7d22b4a9e8e44ad.md) | packages-scan-core | 32 | 766 | None (test artifact) | Exclude | P3: Transient scan report artifact committed to version control. |
| [`packages/scan-core/package.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/package.json) | packages-scan-core | 27 | 531 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/adapters/adapter-registry.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/adapters/adapter-registry.ts) | packages-scan-core | 22 | 575 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/adapters/adapter.interface.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/adapters/adapter.interface.ts) | packages-scan-core | 27 | 805 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/config/config-loader.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/config/config-loader.ts) | packages-scan-core | 125 | 4070 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/discovery/file-walker.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/discovery/file-walker.ts) | packages-scan-core | 128 | 3516 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/discovery/project-root.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/discovery/project-root.ts) | packages-scan-core | 78 | 2498 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/engine/engine-client.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/engine/engine-client.ts) | packages-scan-core | 199 | 5800 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/engine/engine-paths.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/engine/engine-paths.ts) | packages-scan-core | 38 | 889 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/engine/engine-server.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/engine/engine-server.ts) | packages-scan-core | 409 | 11965 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/index.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/index.ts) | packages-scan-core | 23 | 1108 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/jobs/job-store.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/jobs/job-store.ts) | packages-scan-core | 381 | 11386 | Local CLI, engine daemon, and  | Fix | P2: Database schema lacks explicit PRAGMA user_version or migration tracking. |
| [`packages/scan-core/src/orchestrator/scan-orchestrator.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/orchestrator/scan-orchestrator.ts) | packages-scan-core | 265 | 8546 | Local CLI, engine daemon, and  | Fix | P2: Hardcodes report tool version '1.0.0'. |
| [`packages/scan-core/src/policy/policy-engine.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/policy/policy-engine.ts) | packages-scan-core | 123 | 3403 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/remediation/fix-registry.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/remediation/fix-registry.ts) | packages-scan-core | 50 | 1511 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/remediation/handlers/dockerfile-non-root.handler.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/remediation/handlers/dockerfile-non-root.handler.ts) | packages-scan-core | 66 | 2051 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/remediation/handlers/terraform-s3-public-access.handler.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/remediation/handlers/terraform-s3-public-access.handler.ts) | packages-scan-core | 55 | 1985 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/remediation/remediation-engine.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/remediation/remediation-engine.ts) | packages-scan-core | 154 | 4663 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/remediation/verification-engine.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/remediation/verification-engine.ts) | packages-scan-core | 75 | 2673 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/reports/json-writer.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/reports/json-writer.ts) | packages-scan-core | 65 | 2097 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/reports/markdown-writer.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/reports/markdown-writer.ts) | packages-scan-core | 139 | 4596 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/reports/report-reader.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/reports/report-reader.ts) | packages-scan-core | 60 | 2109 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/security/fingerprint.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/security/fingerprint.ts) | packages-scan-core | 112 | 3668 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/security/path-validator.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/security/path-validator.ts) | packages-scan-core | 100 | 3760 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/security/process-runner.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/security/process-runner.ts) | packages-scan-core | 189 | 5396 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/src/security/redaction-engine.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/src/security/redaction-engine.ts) | packages-scan-core | 97 | 3260 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/test/discovery-config.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/test/discovery-config.test.ts) | packages-scan-core | 247 | 9678 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/test/engine.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/test/engine.test.ts) | packages-scan-core | 149 | 3970 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/test/job-store.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/test/job-store.test.ts) | packages-scan-core | 109 | 3474 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/test/orchestration-remediation.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/test/orchestration-remediation.test.ts) | packages-scan-core | 425 | 15241 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/test/orchestration.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/test/orchestration.test.ts) | packages-scan-core | 572 | 19571 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/test/reports.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/test/reports.test.ts) | packages-scan-core | 156 | 5610 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/test/security.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/test/security.test.ts) | packages-scan-core | 208 | 7957 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/tsconfig.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/tsconfig.json) | packages-scan-core | 12 | 219 | Local CLI, engine daemon, and  | Keep | Clean |
| [`packages/scan-core/tsconfig.tsbuildinfo`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scan-core/tsconfig.tsbuildinfo) | packages-scan-core | 1 | 57862 | None (build cache) | Exclude | P2: Compiler cache artifact committed to version control despite being in .gitignore. |
| [`packages/scanner-adapters/package.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scanner-adapters/package.json) | packages-scanner-adapters | 25 | 499 | Scanner execution during scan/ | Keep | Clean |
| [`packages/scanner-adapters/src/checkov/checkov.adapter.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scanner-adapters/src/checkov/checkov.adapter.ts) | packages-scanner-adapters | 274 | 8484 | Scanner execution during scan/ | Keep | Clean |
| [`packages/scanner-adapters/src/gitleaks/gitleaks.adapter.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scanner-adapters/src/gitleaks/gitleaks.adapter.ts) | packages-scanner-adapters | 240 | 7117 | Scanner execution during scan/ | Keep | Clean |
| [`packages/scanner-adapters/src/index.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scanner-adapters/src/index.ts) | packages-scanner-adapters | 4 | 202 | Scanner execution during scan/ | Keep | Clean |
| [`packages/scanner-adapters/src/trivy/trivy-containers.adapter.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scanner-adapters/src/trivy/trivy-containers.adapter.ts) | packages-scanner-adapters | 251 | 7463 | Scanner execution during scan/ | Keep | Clean |
| [`packages/scanner-adapters/src/trivy/trivy-dependencies.adapter.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scanner-adapters/src/trivy/trivy-dependencies.adapter.ts) | packages-scanner-adapters | 246 | 7436 | Scanner execution during scan/ | Keep | Clean |
| [`packages/scanner-adapters/test/adapters.test.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scanner-adapters/test/adapters.test.ts) | packages-scanner-adapters | 780 | 27306 | Scanner execution during scan/ | Keep | Clean |
| [`packages/scanner-adapters/tsconfig.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scanner-adapters/tsconfig.json) | packages-scanner-adapters | 13 | 251 | Scanner execution during scan/ | Keep | Clean |
| [`packages/scanner-adapters/tsconfig.tsbuildinfo`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/scanner-adapters/tsconfig.tsbuildinfo) | packages-scanner-adapters | 1 | 46756 | None (build cache) | Exclude | P2: Compiler cache artifact committed to version control despite being in .gitignore. |
| [`packages/schemas/package.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/schemas/package.json) | packages-schemas | 24 | 456 | Type schema resolution | Keep | Clean |
| [`packages/schemas/src/index.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/schemas/src/index.ts) | packages-schemas | 1 | 39 | Type schema resolution | Keep | Clean |
| [`packages/schemas/tsconfig.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/schemas/tsconfig.json) | packages-schemas | 9 | 165 | Type schema resolution | Keep | Clean |
| [`packages/schemas/tsconfig.tsbuildinfo`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packages/schemas/tsconfig.tsbuildinfo) | packages-schemas | 1 | 41605 | None (build cache) | Exclude | P2: Compiler cache artifact committed to version control despite being in .gitignore. |
| [`packaging/build-deb.sh`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packaging/build-deb.sh) | packaging | 72 | 2383 | Package creation | Refactor | P1: Hardcodes package version 1.0.0 (line 8).; Blindly copies entire apps, packages, and node_modules into /usr/lib/shipshie... |
| [`packaging/debian/changelog`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packaging/debian/changelog) | packaging | 8 | 388 | Debian package metadata | Fix | P1: Specifies distribution 'stable' instead of Ubuntu series codename (noble).; Uses placeholder maintainer email 'maintaine... |
| [`packaging/debian/control`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packaging/debian/control) | packaging | 16 | 689 | Package dependency resolution | Fix | P2: Declares Build-Depends and Depends on nodejs (>= 20.11.0), but Ubuntu 24.04 noble official repositories provide nodejs 1... |
| [`packaging/debian/rules`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packaging/debian/rules) | packaging | 14 | 489 | Debian package build execution | Refactor | P0: Attempts to copy host node_modules into package staging; fails in clean Launchpad chroot where host node_modules does no... |
| [`packaging/systemd/shipshield-engine.service`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/packaging/systemd/shipshield-engine.service) | packaging | 15 | 361 | Systemd service lifecycle mana | Keep | Clean |
| [`start_guideline.md`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/start_guideline.md) | root-config | 378 | 10368 | Operator documentation | Fix | P2: Documents CLI commands (plan, show, fix, verify, init) but omits daemon commands (engine start/stop/status/logs, scans, ... |
| [`tsconfig.base.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/tsconfig.base.json) | root-config | 19 | 471 | TypeScript compilation across  | Keep | Clean |
| [`tsconfig.json`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/tsconfig.json) | root-config | 17 | 344 | Root typechecking (npm run typ | Keep | Clean |
| [`vitest.config.ts`](file:////home/kashifhm333/Desktop/Project/shipshield installation /ShipShield/vitest.config.ts) | root-config | 46 | 1564 | Automated test runner and cove | Keep | Clean |

---

## 5. Detailed Inspection of Critical Subsystems

### 5.Packaging (5 files)

#### `packaging/build-deb.sh`
- **Purpose:** Shell script to build standalone binary Debian package (.deb)
- **Dependencies:** None
- **Runtime Impact:** Package creation
- **Packaging Impact:** Packaging utility script
- **Quality Findings:** Hardcodes package version 1.0.0 (line 8).; Blindly copies entire apps, packages, and node_modules into /usr/lib/shipshield (lines 45-48).; Does not build a Debian source package (.dsc / .changes) required for Launchpad PPA.
- **Security Findings:** None
- **Required Action:** Refactor
- **Evidence:** packaging/build-deb.sh:8,45-48

#### `packaging/debian/changelog`
- **Purpose:** Debian package changelog defining package name, version, distribution, and release history
- **Dependencies:** None
- **Runtime Impact:** Debian package metadata
- **Packaging Impact:** Mandatory Debian packaging metadata
- **Quality Findings:** Specifies distribution 'stable' instead of Ubuntu series codename (noble).; Uses placeholder maintainer email 'maintainers@shipshield.dev' rather than real maintainer address.
- **Security Findings:** None
- **Required Action:** Fix
- **Evidence:** packaging/debian/changelog:1, packaging/debian/changelog:8

#### `packaging/debian/control`
- **Purpose:** Debian source and binary package definitions, dependencies, and descriptions
- **Dependencies:** None
- **Runtime Impact:** Package dependency resolution
- **Packaging Impact:** Mandatory Debian packaging metadata
- **Quality Findings:** Declares Build-Depends and Depends on nodejs (>= 20.11.0), but Ubuntu 24.04 noble official repositories provide nodejs 18.19.1.; Recommends packages 'trivy' and 'checkov' which do not exist in official Ubuntu noble archives.; Architecture is set to 'any' for an architecture-independent pure JavaScript/Node.js package without native C/C++ addons.
- **Security Findings:** None
- **Required Action:** Fix
- **Evidence:** packaging/debian/control:5,11, packaging/debian/control:12, packaging/debian/control:10

#### `packaging/debian/rules`
- **Purpose:** Debian build script Makefile invoking dh helpers
- **Dependencies:** None
- **Runtime Impact:** Debian package build execution
- **Packaging Impact:** Mandatory Debian packaging metadata
- **Quality Findings:** Attempts to copy host node_modules into package staging; fails in clean Launchpad chroot where host node_modules does not exist and network is isolated.
- **Security Findings:** None
- **Required Action:** Refactor
- **Evidence:** packaging/debian/rules:12

#### `packaging/systemd/shipshield-engine.service`
- **Purpose:** Systemd user service definition for running the ShipShield background engine daemon (correct per-user service definition)
- **Dependencies:** None
- **Runtime Impact:** Systemd service lifecycle management
- **Packaging Impact:** Installed in /usr/lib/systemd/user/
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

### 5.Apps-cli (19 files)

#### `apps/cli/package.json`
- **Purpose:** Manifest for @shipshield/cli package defining executable binary and dependencies
- **Dependencies:** None
- **Runtime Impact:** CLI binary definition
- **Packaging Impact:** Core installed package component
- **Quality Findings:** Declares commander ^12.1.0 while root declares commander ^15.0.0.
- **Security Findings:** None
- **Required Action:** Fix
- **Evidence:** apps/cli/package.json:17

#### `apps/cli/src/commands/cancel.command.ts`
- **Purpose:** CLI command implementation for cancel.command.ts
- **Dependencies:** @shipshield/contracts, @shipshield/scan-core, commander
- **Runtime Impact:** Local CLI command execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `apps/cli/src/commands/doctor.command.ts`
- **Purpose:** System diagnostics checking Node runtime, engine IPC, SQLite database, and scanners
- **Dependencies:** @shipshield/contracts, commander, node:fs
- **Runtime Impact:** CLI environment diagnostics
- **Packaging Impact:** Installed in CLI bundle
- **Quality Findings:** Recommends pipe-to-shell installer (curl | sh) for Trivy rather than deb/apt installation.
- **Security Findings:** None
- **Required Action:** Fix
- **Evidence:** apps/cli/src/commands/doctor.command.ts:82

#### `apps/cli/src/commands/engine.command.ts`
- **Purpose:** Subcommands for engine lifecycle: start, stop, status, and logs
- **Dependencies:** @shipshield/contracts, commander, node:child_process, node:fs, node:path, node:url
- **Runtime Impact:** Engine daemon operational management
- **Packaging Impact:** Installed in CLI bundle
- **Quality Findings:** None
- **Security Findings:** Unsafe docker path: executes docker run with string interpolation and mounts host root (/:/host:ro).
- **Required Action:** Refactor
- **Evidence:** apps/cli/src/commands/engine.command.ts:62-68

#### `apps/cli/src/commands/fix.command.ts`
- **Purpose:** CLI command implementation for fix.command.ts
- **Dependencies:** ../presenter/terminal-presenter.js, @shipshield/contracts, commander
- **Runtime Impact:** Local CLI command execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `apps/cli/src/commands/init.command.ts`
- **Purpose:** CLI command implementation for init.command.ts
- **Dependencies:** @shipshield/contracts, @shipshield/scan-core, commander, node:crypto, node:fs, node:path
- **Runtime Impact:** Local CLI command execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `apps/cli/src/commands/plan.command.ts`
- **Purpose:** CLI command implementation for plan.command.ts
- **Dependencies:** ../presenter/terminal-presenter.js, commander
- **Runtime Impact:** Local CLI command execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `apps/cli/src/commands/results.command.ts`
- **Purpose:** CLI command implementation for results.command.ts
- **Dependencies:** ../presenter/terminal-presenter.js, @shipshield/contracts, @shipshield/scan-core, commander, node:fs
- **Runtime Impact:** Local CLI command execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `apps/cli/src/commands/scan.command.ts`
- **Purpose:** CLI command implementation for scan.command.ts
- **Dependencies:** ../presenter/terminal-presenter.js, commander, node:path
- **Runtime Impact:** Local CLI command execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `apps/cli/src/commands/scans.command.ts`
- **Purpose:** CLI command implementation for scans.command.ts
- **Dependencies:** @shipshield/contracts, @shipshield/scan-core, commander
- **Runtime Impact:** Local CLI command execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `apps/cli/src/commands/show.command.ts`
- **Purpose:** CLI command implementation for show.command.ts
- **Dependencies:** ../presenter/terminal-presenter.js, @shipshield/contracts, commander
- **Runtime Impact:** Local CLI command execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `apps/cli/src/commands/status.command.ts`
- **Purpose:** CLI command implementation for status.command.ts
- **Dependencies:** @shipshield/contracts, @shipshield/scan-core, commander
- **Runtime Impact:** Local CLI command execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `apps/cli/src/commands/verify.command.ts`
- **Purpose:** CLI command implementation for verify.command.ts
- **Dependencies:** ../presenter/terminal-presenter.js, @shipshield/contracts, commander
- **Runtime Impact:** Local CLI command execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `apps/cli/src/engine-daemon.ts`
- **Purpose:** Dedicated background daemon entry point initializing EngineServer and registering adapters
- **Dependencies:** @shipshield/scan-core, node:fs
- **Runtime Impact:** Local background engine daemon
- **Packaging Impact:** Installed in /usr/lib/shipshield/apps/cli/dist/engine-daemon.js
- **Quality Findings:** Hardcodes version '1.0.0' in EngineServer configuration.
- **Security Findings:** None
- **Required Action:** Fix
- **Evidence:** apps/cli/src/engine-daemon.ts:23

#### `apps/cli/src/index.ts`
- **Purpose:** Main CLI entry point configuring Commander program, global flags, and subcommand registration
- **Dependencies:** ./commands/cancel.command.js, ./commands/doctor.command.js, ./commands/engine.command.js, ./commands/fix.command.js, ./commands/init.command.js, ./commands/plan.command.js, ./commands/results.command.js, ./commands/scan.command.js, ./commands/scans.command.js, ./commands/show.command.js, ./commands/status.command.js, ./commands/verify.command.js, @shipshield/contracts, commander
- **Runtime Impact:** Local CLI execution entrypoint
- **Packaging Impact:** Installed in /usr/lib/shipshield/apps/cli/dist/index.js
- **Quality Findings:** Hardcodes version '1.0.0' directly in source code instead of loading from package metadata.
- **Security Findings:** None
- **Required Action:** Fix
- **Evidence:** apps/cli/src/index.ts:23

#### `apps/cli/src/presenter/terminal-presenter.ts`
- **Purpose:** Terminal output formatting utility with ANSI color badges, unified diff display, and reports
- **Dependencies:** @shipshield/contracts, @shipshield/scan-core
- **Runtime Impact:** CLI presentation layer
- **Packaging Impact:** Installed in CLI bundle
- **Quality Findings:** Hardcodes 'v1.0.0' in banner string.
- **Security Findings:** None
- **Required Action:** Fix
- **Evidence:** apps/cli/src/presenter/terminal-presenter.ts:64

#### `apps/cli/test/cli.e2e.test.ts`
- **Purpose:** Repository component: apps/cli/test/cli.e2e.test.ts
- **Dependencies:** ../src/index.js, ../src/presenter/terminal-presenter.js, @shipshield/contracts, @shipshield/scan-core, node:fs, node:os, node:path, vitest
- **Runtime Impact:** Repository execution
- **Packaging Impact:** Inspect
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `apps/cli/tsconfig.json`
- **Purpose:** Repository component: apps/cli/tsconfig.json
- **Dependencies:** None
- **Runtime Impact:** Repository execution
- **Packaging Impact:** Inspect
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `apps/cli/tsconfig.tsbuildinfo`
- **Purpose:** Incremental TypeScript compiler build cache
- **Dependencies:** None
- **Runtime Impact:** None (build cache)
- **Packaging Impact:** Exclude from binary package and source archive; should not be tracked in git
- **Quality Findings:** Compiler cache artifact committed to version control despite being in .gitignore.
- **Security Findings:** None
- **Required Action:** Exclude
- **Evidence:** apps/cli/tsconfig.tsbuildinfo:1

### 5.Packages-scan-core (38 files)

#### `packages/scan-core/.shipshield/reports/latest.json`
- **Purpose:** Generated scan report artifact from previous test execution
- **Dependencies:** None
- **Runtime Impact:** None (test artifact)
- **Packaging Impact:** Exclude from binary package and clean source archive
- **Quality Findings:** Transient scan report artifact committed to version control.
- **Security Findings:** None
- **Required Action:** Exclude
- **Evidence:** packages/scan-core/.shipshield/reports/latest.json:1

#### `packages/scan-core/.shipshield/reports/latest.md`
- **Purpose:** Generated scan report artifact from previous test execution
- **Dependencies:** None
- **Runtime Impact:** None (test artifact)
- **Packaging Impact:** Exclude from binary package and clean source archive
- **Quality Findings:** Transient scan report artifact committed to version control.
- **Security Findings:** None
- **Required Action:** Exclude
- **Evidence:** packages/scan-core/.shipshield/reports/latest.md:1

#### `packages/scan-core/.shipshield/reports/scan-2026-10-24T16-57-38-010Z-scan_mvmn6lzvb7d22b4a9e8e44ad.json`
- **Purpose:** Generated scan report artifact from previous test execution
- **Dependencies:** None
- **Runtime Impact:** None (test artifact)
- **Packaging Impact:** Exclude from binary package and clean source archive
- **Quality Findings:** Transient scan report artifact committed to version control.
- **Security Findings:** None
- **Required Action:** Exclude
- **Evidence:** packages/scan-core/.shipshield/reports/scan-2026-10-24T16-57-38-010Z-scan_mvmn6lzvb7d22b4a9e8e44ad.json:1

#### `packages/scan-core/.shipshield/reports/scan-2026-10-24T16-57-38-010Z-scan_mvmn6lzvb7d22b4a9e8e44ad.md`
- **Purpose:** Generated scan report artifact from previous test execution
- **Dependencies:** None
- **Runtime Impact:** None (test artifact)
- **Packaging Impact:** Exclude from binary package and clean source archive
- **Quality Findings:** Transient scan report artifact committed to version control.
- **Security Findings:** None
- **Required Action:** Exclude
- **Evidence:** packages/scan-core/.shipshield/reports/scan-2026-10-24T16-57-38-010Z-scan_mvmn6lzvb7d22b4a9e8e44ad.md:1

#### `packages/scan-core/package.json`
- **Purpose:** Scan core orchestration and security engine (package.json)
- **Dependencies:** None
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/adapters/adapter-registry.ts`
- **Purpose:** Scan core orchestration and security engine (adapter-registry.ts)
- **Dependencies:** ./adapter.interface.js, @shipshield/contracts
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/adapters/adapter.interface.ts`
- **Purpose:** Scan core orchestration and security engine (adapter.interface.ts)
- **Dependencies:** @shipshield/contracts
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/config/config-loader.ts`
- **Purpose:** Scan core orchestration and security engine (config-loader.ts)
- **Dependencies:** ../discovery/project-root.js, @shipshield/contracts, node:fs, node:path, yaml
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/discovery/file-walker.ts`
- **Purpose:** Scan core orchestration and security engine (file-walker.ts)
- **Dependencies:** @shipshield/contracts, node:fs, node:path
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/discovery/project-root.ts`
- **Purpose:** Scan core orchestration and security engine (project-root.ts)
- **Dependencies:** node:fs, node:path
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/engine/engine-client.ts`
- **Purpose:** Scan core orchestration and security engine (engine-client.ts)
- **Dependencies:** ./engine-paths.js, node:crypto, node:net
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/engine/engine-paths.ts`
- **Purpose:** Scan core orchestration and security engine (engine-paths.ts)
- **Dependencies:** node:fs, node:os, node:path
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/engine/engine-server.ts`
- **Purpose:** Scan core orchestration and security engine (engine-server.ts)
- **Dependencies:** ../adapters/adapter-registry.js, ../config/config-loader.js, ../jobs/job-store.js, ../orchestrator/scan-orchestrator.js, ./engine-paths.js, node:crypto, node:fs, node:net, node:path
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/index.ts`
- **Purpose:** Scan core orchestration and security engine (index.ts)
- **Dependencies:** ./adapters/adapter-registry.js, ./adapters/adapter.interface.js, ./config/config-loader.js, ./discovery/file-walker.js, ./discovery/project-root.js, ./engine/engine-client.js, ./engine/engine-paths.js, ./engine/engine-server.js, ./jobs/job-store.js, ./orchestrator/scan-orchestrator.js, ./policy/policy-engine.js, ./remediation/fix-registry.js, ./remediation/handlers/dockerfile-non-root.handler.js, ./remediation/handlers/terraform-s3-public-access.handler.js, ./remediation/remediation-engine.js, ./remediation/verification-engine.js, ./reports/json-writer.js, ./reports/markdown-writer.js, ./reports/report-reader.js, ./security/fingerprint.js, ./security/path-validator.js, ./security/process-runner.js, ./security/redaction-engine.js
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/jobs/job-store.ts`
- **Purpose:** Local job persistence store using Node.js sqlite (DatabaseSync) with fallback file storage
- **Dependencies:** @shipshield/contracts, node:fs, node:module, node:path
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** Database schema lacks explicit PRAGMA user_version or migration tracking.
- **Security Findings:** None
- **Required Action:** Fix
- **Evidence:** packages/scan-core/src/jobs/job-store.ts:51

#### `packages/scan-core/src/orchestrator/scan-orchestrator.ts`
- **Purpose:** Scan core orchestration and security engine (scan-orchestrator.ts)
- **Dependencies:** ../adapters/adapter-registry.js, ../adapters/adapter.interface.js, ../discovery/file-walker.js, ../policy/policy-engine.js, ../reports/json-writer.js, ../reports/markdown-writer.js, ../security/process-runner.js, node:crypto, node:fs, node:path
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** Hardcodes report tool version '1.0.0'.
- **Security Findings:** None
- **Required Action:** Fix
- **Evidence:** packages/scan-core/src/orchestrator/scan-orchestrator.ts:197

#### `packages/scan-core/src/policy/policy-engine.ts`
- **Purpose:** Scan core orchestration and security engine (policy-engine.ts)
- **Dependencies:** ../adapters/adapter.interface.js
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/remediation/fix-registry.ts`
- **Purpose:** Scan core orchestration and security engine (fix-registry.ts)
- **Dependencies:** @shipshield/contracts
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/remediation/handlers/dockerfile-non-root.handler.ts`
- **Purpose:** Scan core orchestration and security engine (dockerfile-non-root.handler.ts)
- **Dependencies:** ../fix-registry.js, @shipshield/contracts, diff
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/remediation/handlers/terraform-s3-public-access.handler.ts`
- **Purpose:** Scan core orchestration and security engine (terraform-s3-public-access.handler.ts)
- **Dependencies:** ../fix-registry.js, @shipshield/contracts, diff
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/remediation/remediation-engine.ts`
- **Purpose:** Scan core orchestration and security engine (remediation-engine.ts)
- **Dependencies:** ../security/path-validator.js, ./fix-registry.js, @shipshield/contracts, node:crypto, node:fs, node:path
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/remediation/verification-engine.ts`
- **Purpose:** Scan core orchestration and security engine (verification-engine.ts)
- **Dependencies:** ../orchestrator/scan-orchestrator.js, @shipshield/contracts
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/reports/json-writer.ts`
- **Purpose:** Scan core orchestration and security engine (json-writer.ts)
- **Dependencies:** ../security/path-validator.js, @shipshield/contracts, node:fs, node:path
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/reports/markdown-writer.ts`
- **Purpose:** Scan core orchestration and security engine (markdown-writer.ts)
- **Dependencies:** ../security/path-validator.js, @shipshield/contracts, node:fs, node:path
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/reports/report-reader.ts`
- **Purpose:** Scan core orchestration and security engine (report-reader.ts)
- **Dependencies:** ../security/path-validator.js, @shipshield/contracts, node:fs, node:path
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/security/fingerprint.ts`
- **Purpose:** Scan core orchestration and security engine (fingerprint.ts)
- **Dependencies:** ./redaction-engine.js, @shipshield/contracts, node:crypto, node:path
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/security/path-validator.ts`
- **Purpose:** Scan core orchestration and security engine (path-validator.ts)
- **Dependencies:** node:fs, node:path
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/security/process-runner.ts`
- **Purpose:** Scan core orchestration and security engine (process-runner.ts)
- **Dependencies:** node:child_process
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/src/security/redaction-engine.ts`
- **Purpose:** Scan core orchestration and security engine (redaction-engine.ts)
- **Dependencies:** None
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/test/discovery-config.test.ts`
- **Purpose:** Scan core orchestration and security engine (discovery-config.test.ts)
- **Dependencies:** ../src/config/config-loader.js, ../src/discovery/file-walker.js, ../src/discovery/project-root.js, node:fs, node:os, node:path, vitest
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/test/engine.test.ts`
- **Purpose:** Scan core orchestration and security engine (engine.test.ts)
- **Dependencies:** node:fs, node:os, node:path, vitest
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/test/job-store.test.ts`
- **Purpose:** Scan core orchestration and security engine (job-store.test.ts)
- **Dependencies:** ../src/jobs/job-store.js, node:fs, node:os, node:path, vitest
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/test/orchestration-remediation.test.ts`
- **Purpose:** Scan core orchestration and security engine (orchestration-remediation.test.ts)
- **Dependencies:** ../src/adapters/adapter.interface.js, node:crypto, node:fs, node:os, node:path, vitest
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/test/orchestration.test.ts`
- **Purpose:** Scan core orchestration and security engine (orchestration.test.ts)
- **Dependencies:** node:fs, node:os, node:path, vitest
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/test/reports.test.ts`
- **Purpose:** Scan core orchestration and security engine (reports.test.ts)
- **Dependencies:** ../src/index.js, @shipshield/contracts, node:fs, node:os, node:path, vitest
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/test/security.test.ts`
- **Purpose:** Scan core orchestration and security engine (security.test.ts)
- **Dependencies:** ../src/security/fingerprint.js, ../src/security/path-validator.js, ../src/security/process-runner.js, ../src/security/redaction-engine.js, node:fs, node:os, node:path, vitest
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/tsconfig.json`
- **Purpose:** Scan core orchestration and security engine (tsconfig.json)
- **Dependencies:** None
- **Runtime Impact:** Local CLI, engine daemon, and worker execution
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scan-core/tsconfig.tsbuildinfo`
- **Purpose:** Incremental TypeScript compiler build cache
- **Dependencies:** None
- **Runtime Impact:** None (build cache)
- **Packaging Impact:** Exclude from binary package and source archive; should not be tracked in git
- **Quality Findings:** Compiler cache artifact committed to version control despite being in .gitignore.
- **Security Findings:** None
- **Required Action:** Exclude
- **Evidence:** packages/scan-core/tsconfig.tsbuildinfo:1

### 5.Packages-scanner-adapters (9 files)

#### `packages/scanner-adapters/package.json`
- **Purpose:** Subprocess scanner adapter implementation (package.json)
- **Dependencies:** None
- **Runtime Impact:** Scanner execution during scan/plan/verify
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scanner-adapters/src/checkov/checkov.adapter.ts`
- **Purpose:** Subprocess scanner adapter implementation (checkov.adapter.ts)
- **Dependencies:** @shipshield/contracts, node:fs, node:os, node:path
- **Runtime Impact:** Scanner execution during scan/plan/verify
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scanner-adapters/src/gitleaks/gitleaks.adapter.ts`
- **Purpose:** Subprocess scanner adapter implementation (gitleaks.adapter.ts)
- **Dependencies:** @shipshield/contracts, node:fs, node:os, node:path
- **Runtime Impact:** Scanner execution during scan/plan/verify
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scanner-adapters/src/index.ts`
- **Purpose:** Subprocess scanner adapter implementation (index.ts)
- **Dependencies:** ./checkov/checkov.adapter.js, ./gitleaks/gitleaks.adapter.js, ./trivy/trivy-containers.adapter.js, ./trivy/trivy-dependencies.adapter.js
- **Runtime Impact:** Scanner execution during scan/plan/verify
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scanner-adapters/src/trivy/trivy-containers.adapter.ts`
- **Purpose:** Subprocess scanner adapter implementation (trivy-containers.adapter.ts)
- **Dependencies:** @shipshield/contracts, node:fs, node:os, node:path
- **Runtime Impact:** Scanner execution during scan/plan/verify
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scanner-adapters/src/trivy/trivy-dependencies.adapter.ts`
- **Purpose:** Subprocess scanner adapter implementation (trivy-dependencies.adapter.ts)
- **Dependencies:** @shipshield/contracts, node:fs, node:os, node:path
- **Runtime Impact:** Scanner execution during scan/plan/verify
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scanner-adapters/test/adapters.test.ts`
- **Purpose:** Subprocess scanner adapter implementation (adapters.test.ts)
- **Dependencies:** ../src/checkov/checkov.adapter.js, ../src/gitleaks/gitleaks.adapter.js, ../src/trivy/trivy-containers.adapter.js, ../src/trivy/trivy-dependencies.adapter.js, @shipshield/contracts, @shipshield/scan-core, node:fs, node:path, vitest
- **Runtime Impact:** Scanner execution during scan/plan/verify
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scanner-adapters/tsconfig.json`
- **Purpose:** Subprocess scanner adapter implementation (tsconfig.json)
- **Dependencies:** None
- **Runtime Impact:** Scanner execution during scan/plan/verify
- **Packaging Impact:** Core installed package component
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `packages/scanner-adapters/tsconfig.tsbuildinfo`
- **Purpose:** Incremental TypeScript compiler build cache
- **Dependencies:** None
- **Runtime Impact:** None (build cache)
- **Packaging Impact:** Exclude from binary package and source archive; should not be tracked in git
- **Quality Findings:** Compiler cache artifact committed to version control despite being in .gitignore.
- **Security Findings:** None
- **Required Action:** Exclude
- **Evidence:** packages/scanner-adapters/tsconfig.tsbuildinfo:1

### 5.Root-config (10 files)

#### `.gitignore`
- **Purpose:** Git exclusion patterns for transient build artifacts, dependencies, and environment files
- **Dependencies:** None
- **Runtime Impact:** None (VCS configuration)
- **Packaging Impact:** Exclude from binary package; include in source archive
- **Quality Findings:** Contradiction: *.tsbuildinfo is in .gitignore (line 12), but 7 tsconfig.tsbuildinfo files are tracked in git.; Contradiction: fixtures/**/.shipshield/ is in .gitignore (line 13), but multiple fixture report files are tracked in git.
- **Security Findings:** None
- **Required Action:** Fix
- **Evidence:** .gitignore:12 and tracked *.tsbuildinfo files, .gitignore:13 and tracked fixture report files

#### `.shipshield.yaml`
- **Purpose:** Default repository-level ShipShield scanning and policy gate configuration
- **Dependencies:** None
- **Runtime Impact:** Local CLI, engine, and CI dogfood scans
- **Packaging Impact:** Include in source archive as default configuration template; do not overwrite user configs
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `Dockerfile`
- **Purpose:** Multi-stage Dockerfile for containerized API control plane and worker environments
- **Dependencies:** None
- **Runtime Impact:** Hosted platform / containerized execution
- **Packaging Impact:** Exclude from binary .deb; include in source repository
- **Quality Findings:** Uses --legacy-peer-deps during npm install (lines 22, 39, 80) indicating peer dependency version mismatches.; Uses --break-system-packages for checkov installation in worker stage.
- **Security Findings:** None
- **Required Action:** Investigate
- **Evidence:** Dockerfile:22,39,80, Dockerfile:71

#### `docker-compose.yml`
- **Purpose:** Local orchestration of hosted services: MongoDB 7.0, Redis 7.2, API, and worker
- **Dependencies:** None
- **Runtime Impact:** Hosted platform local development
- **Packaging Impact:** Exclude from binary .deb; not part of local CLI package
- **Quality Findings:** None
- **Security Findings:** Default insecure credentials and HMAC secret keys in compose environment variables.
- **Required Action:** Fix
- **Evidence:** docker-compose.yml:45-47

#### `package-lock.json`
- **Purpose:** Deterministic dependency lockfile for reproducible monorepo builds
- **Dependencies:** None
- **Runtime Impact:** Build environment dependency resolution
- **Packaging Impact:** Source archive dependency reference
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `package.json`
- **Purpose:** Monorepo root package manifest defining workspaces, devDependencies, and monorepo scripts
- **Dependencies:** None
- **Runtime Impact:** Monorepo build orchestration and script definitions
- **Packaging Impact:** Source archive only; installed package must not expose development scripts
- **Quality Findings:** Version mismatch: root package.json specifies unaligned dependency versions compared to workspaces (e.g. commander ^15.0.0 vs apps/cli ^12.1.0; react ^19.3.1 vs apps/web ^18.3.1).; No-op lint script: npm run lint runs echo 'Linting complete' rather than a real static linter.
- **Security Findings:** None
- **Required Action:** Fix
- **Evidence:** package.json:36 vs apps/cli/package.json:17, package.json:19

#### `start_guideline.md`
- **Purpose:** Developer quickstart and operator guide covering CLI commands and full-stack platform
- **Dependencies:** None
- **Runtime Impact:** Operator documentation
- **Packaging Impact:** Documentation; candidate for /usr/share/doc/shipshield/
- **Quality Findings:** Documents CLI commands (plan, show, fix, verify, init) but omits daemon commands (engine start/stop/status/logs, scans, cancel).
- **Security Findings:** None
- **Required Action:** Fix
- **Evidence:** start_guideline.md:89-178

#### `tsconfig.base.json`
- **Purpose:** Base TypeScript configuration with strict compiler options inherited by all workspaces
- **Dependencies:** None
- **Runtime Impact:** TypeScript compilation across all workspaces
- **Packaging Impact:** Build environment only
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `tsconfig.json`
- **Purpose:** Root TypeScript project configuration including all packages and apps
- **Dependencies:** None
- **Runtime Impact:** Root typechecking (npm run typecheck)
- **Packaging Impact:** Build environment only
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep

#### `vitest.config.ts`
- **Purpose:** Vitest test suite configuration with module aliases and coverage thresholds (>=85%)
- **Dependencies:** node:path, vitest/config
- **Runtime Impact:** Automated test runner and coverage validation
- **Packaging Impact:** Build environment / CI gate only
- **Quality Findings:** None
- **Security Findings:** None
- **Required Action:** Keep
