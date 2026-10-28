# ShipShield System Architecture

ShipShield is an architectural refactor into a **production-grade, CLI-only, local-first DevSecOps security gate platform**. It runs completely offline or online-assisted on developer workstations, build agents, and air-gapped CI/CD environments without requiring any web server, web dashboard, external database (MongoDB/PostgreSQL), Redis queue, or cloud telemetry.

---

## 1. Architectural Layers & Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                       CLI Interface                         │
│   apps/cli (Commander.js, TerminalPresenter, Exit Codes)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ Invokes / Submits
┌──────────────────────────────▼──────────────────────────────┐
│                    Scan Orchestration                       │
│    packages/scan-core/src/orchestrator/scan-orchestrator.ts │
├──────────────────────────────┬──────────────────────────────┤
│    Native Policy Engine      │   Vulnerability Intelligence │
│ (native-policy-registry.ts)  │   (intelligence-manager.ts)  │
├──────────────────────────────┼──────────────────────────────┤
│     Reporting Pipeline       │      Remediation Engine      │
│ (json, markdown, sarif 2.1)  │  (remediation-engine.ts)     │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │ ProcessRunner                │ Safe Patching
┌──────────────▼───────────────┐┌─────────────▼───────────────┐
│     Scanner Adapters         ││    Workspace Sandbox        │
│   (Gitleaks, Trivy, Checkov) ││  (git isolation, containment│
└──────────────────────────────┘└─────────────────────────────┘
```

### 1.1 CLI Interface (`apps/cli`)
The CLI provides a predictable command-line interface. It:
- Parses flags, arguments, and environment variables with strict validation.
- Enforces the documented exit code contract (`0` passed, `1` policy_failed, `2` usage_error, `3` config_error, `4` incomplete, `7` required_scanner_unavailable, `8` database_error, etc.).
- Formats output for terminal interaction (with ANSI color highlighting) or machine consumption (`json`, `sarif`).
- Connects optionally to the user's background daemon via Unix domain socket (`/run/user/<uid>/shipshield/engine.sock`) for sub-second execution, or executes directly as an in-process standalone runner.

### 1.2 Core Scanning Engine (`packages/scan-core`)
The orchestrator coordinates the scan lifecycle:
1. Resolves project workspace root via containment verification.
2. Loads `.shipshield.yaml` configuration with schema validation and CLI overrides.
3. Discovers files while respecting exclusions (`.git`, `node_modules`, `dist`, `.tmp`).
4. Executes native in-memory security policies across all discovered workspace files.
5. Invokes external security scanners (`gitleaks`, `trivy`, `checkov`) via bounded, non-shell child process execution.
6. Evaluates results against the configurable policy gate (`fail_on`, `fail_on_missing_db`, `fail_on_stale_db`, `required_scanners`).
7. Emits structured JSON, Markdown, and SARIF v2.1.0 reports.

### 1.3 Native Security Policy Engine (`packages/scan-core/src/policy`)
ShipShield embeds native static analysis rules that execute without external third-party binaries or network access:
- **Secrets:** High-entropy string detection (Shannon entropy calculation) and regex signatures for private keys, AWS tokens, GitHub PATs, and DB URIs.
- **Containers:** Dockerfile inspection for root execution (`USER` instruction), mutable tags (`:latest`), secret leakage in `COPY`/`ADD`, and Docker socket mounts (`/var/run/docker.sock`).
- **IaC & Kubernetes:** Misconfiguration detection for open S3 buckets, unrestricted CIDRs (`0.0.0.0/0`), and privileged Kubernetes pods (`privileged: true`).
- **CI/CD:** GitHub Actions workflow analysis for untrusted pull request interpolation and overly broad permissions (`write-all`).
- **Supply Chain:** Plaintext HTTP package registries and dangerous network piping in package lifecycle scripts (`curl | bash`).
- **Application Security:** Insecure TLS verification overrides and wildcard CORS with credential exposure.

### 1.4 Intelligence & Database Management (`packages/scan-core/src/intelligence`)
Manages local vulnerability intelligence databases:
- **Freshness thresholds:** Evaluates database age (`fresh`, `stale`, `expired`, `missing`).
- **Atomic updates:** Downloads updates into isolated staging directories, validates structural integrity and cryptographic checksums, and atomically replaces active cache databases.
- **Rollback safety:** Never destroys existing working databases upon failed update downloads.

### 1.5 Safe Process Execution & Filesystem Sandbox
- **ProcessRunner:** Executes scanner binaries with argument vectors (`string[]`) and shell interpolation disabled. Enforces timeouts, memory bounds, and filtered environment variables to prevent token leakage.
- **PathValidator & WorkspaceSandbox:** Enforces containment within workspace root, rejects symlink traversal attacks, disables dangerous git file protocol execution (`protocol.file.allow=never`), and restricts writes strictly to explicitly requested operations.

---

## 2. Decoupling from Web Application

The previous architecture contained web dashboards, HTTP API endpoints (`apps/api`), MongoDB schemas, BullMQ Redis workers (`apps/worker`), and multi-tenant authentication layers. These have been completely eliminated:
- **Zero Web Dependencies:** No Express, Helmet, Cors, Mongoose, or Redis runtime dependencies.
- **Local Persistence Only:** Local scan history is stored in an embedded SQLite database (`~/.shipshield/shipshield.db`) and localized JSON/SARIF report files (`.shipshield/reports/`).
- **Pure Node.js + CLI Distribution:** Distributed as a Debian package (`.deb`) and standalone executable requiring only standard Linux libraries.
