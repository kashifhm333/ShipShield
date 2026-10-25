# ShipShield — Quickstart & Operator Guidelines

Welcome to **ShipShield**, a production-grade, local-first DevSecOps platform and security gate designed to stop secrets, vulnerable dependencies, container misconfigurations, and infrastructure-as-code risks before they ship.

This document provides a comprehensive, step-by-step operational guide covering:
1. **Architecture & Prerequisites**
2. **Local CLI Quickstart (Developer Workflow)**
3. **Full-Stack Platform (API, Worker, Web Dashboard & Docker Compose)**
4. **Configuration Reference (`.shipshield.yaml`)**
5. **CLI Exit Code Contracts & Automation in CI/CD**
6. **Development, Testing & Diagnostics**

---

## 1. Architecture & Prerequisites

ShipShield is organized as a high-performance TypeScript monorepo with strict package boundaries:

```
ShipShield/
├── apps/
│   ├── cli/             # ShipShield CLI binary (`shipshield`)
│   ├── api/             # Control Plane REST API (Express + MongoDB)
│   ├── web/             # Modern Security Dashboard (React + Vite)
│   └── worker/          # Isolated scan queue runner (BullMQ + Redis)
├── packages/
│   ├── contracts/       # Canonical schemas, exit codes, and finding interfaces
│   ├── scan-core/       # Pure orchestration, policy engine, redaction, and diffing
│   ├── scanner-adapters/# Subprocess sandboxed adapters (Gitleaks, Trivy, Checkov)
│   └── schemas/         # Shared data and configuration schemas
└── docs/                # Architectural, threat model, and API specifications
```

### System Prerequisites

- **Node.js**: `v20.11.0` or higher (LTS recommended)
- **Package Manager**: `npm` (v10+)
- **Git**: `v2.30+` installed and available on `PATH`
- **Container Engine** *(for full-stack/services)*: Docker and Docker Compose v2+

### Optional Local Scanner Binaries *(for local CLI execution)*

When running CLI scans directly on your host machine without Docker, install the relevant scanner engines:
- **Secrets**: [Gitleaks](https://github.com/gitleaks/gitleaks) (`gitleaks`)
- **Dependencies & Containers**: [Trivy](https://github.com/aquasecurity/trivy) (`trivy`)
- **Infrastructure as Code (IaC)**: [Checkov](https://github.com/bridgecrewio/checkov) (`checkov`)

To verify local engine availability at any time, run:
```bash
npx shipshield plan --list-scanners
```

---

## 2. Local CLI Quickstart (Developer Workflow)

### Step 1: Install Dependencies & Build

Clone the repository and build all packages across the monorepo:

```bash
# Clone the repository
git clone https://github.com/your-org/ShipShield.git
cd ShipShield

# Install dependencies across all workspaces
npm install

# Build all TypeScript packages and applications
npm run build
```

### Step 2: Link the CLI Globally (Optional)

You can link the ShipShield CLI globally to your system PATH:

```bash
cd apps/cli
npm link
cd ../..
```

Now `shipshield` is accessible from any terminal. Alternatively, you can run the built executable directly:
```bash
node apps/cli/dist/index.js <command>
```

---

### Step 3: Core CLI Commands

#### 1. `shipshield init` — Initialize Project Configuration
Prepares your workspace by creating `.shipshield.yaml` and `.shipshield/reports/`:

```bash
shipshield init

# Create minimal configuration
shipshield init --minimal

# Overwrite existing config
shipshield init --force --yes
```

#### 2. `shipshield plan` — Run Scans & Evaluate Policy
Executes applicable security scanners, evaluates policy gates, and generates JSON/Markdown reports:

```bash
# Run full scan across all enabled scanners
shipshield plan

# Target specific scanners only
shipshield plan --scanner secrets dependencies

# Fail only on specific severity thresholds
shipshield plan --fail-on critical high

# Output clean, pipeable JSON for scripting
shipshield plan --format json > report.json

# Run dependency scanning in offline mode
shipshield plan --offline

# Execute with concurrency and timeout overrides
shipshield plan --jobs 4 --timeout 120
```

#### 3. `shipshield show` — Inspect Findings Without Re-scanning
Reads and formats findings from existing scan reports:

```bash
# Display latest report
shipshield show --latest

# Filter findings by severity and category
shipshield show --severity critical --scanner secrets

# Limit number of displayed items
shipshield show --limit 5

# Inspect a specific report file
shipshield show .shipshield/reports/scan_0123456789.json
```

#### 4. `shipshield fix` — Automated Remediation
Plans and applies safe, unified diff-based file modifications:

```bash
# Preview proposed fixes as unified diffs (dry-run preview by default)
shipshield fix --all

# Preview a specific finding ID
shipshield fix SS-CON-A1B2C3

# Explicitly apply patches to source code
shipshield fix --all --apply

# Non-interactive CI apply (requires explicit --yes)
shipshield fix --all --apply --yes
```

> **Safety Contract**:
> - Running `shipshield fix` defaults to `--dry-run` (read-only).
> - File modifications require explicit `--apply`.
> - Target files are validated against scan-time SHA-256 hashes to prevent stale or conflicting writes.

#### 5. `shipshield verify` — Re-Scan & Verify Fix Efficacy
Validates whether applied fixes successfully removed the targeted vulnerabilities:

```bash
# Run fresh verification scan and compare against baseline report
shipshield verify

# Restrict verification scan to a specific scanner category
shipshield verify --scanner containers
```

---

## 3. Full-Stack Platform Deployment

ShipShield includes a multi-tenant Control Plane REST API, an asynchronous BullMQ worker with sandbox isolation, and a modern React dashboard.

### Option A: Complete Docker Compose Stack (Recommended)

Start MongoDB, Redis, the REST API, and the sandboxed worker in one command:

```bash
docker-compose up -d
```

Verify service statuses:
```bash
docker-compose ps
```

The stack exposes:
- **Control Plane API**: `http://localhost:3000`
- **MongoDB**: `localhost:27017`
- **Redis**: `localhost:6379`

To view container logs:
```bash
docker-compose logs -f api worker
```

To stop the services:
```bash
docker-compose down
```

---

### Option B: Local Service Development

If developing locally without containerizing Node processes:

#### 1. Start Supporting Databases
```bash
docker run -d --name shipshield-mongo -p 27017:27017 mongo:7.0
docker run -d --name shipshield-redis -p 6379:6379 redis:7.2-alpine
```

#### 2. Start the REST API Control Plane (`apps/api`)
```bash
# Start API server in development mode
npm run start --workspace=@shipshield/api
```
Health Check:
```bash
curl http://localhost:3000/api/v1/health
# {"status":"healthy","timestamp":"2026-10-24T...","uptime":...}
```

#### 3. Start the Background Scan Worker (`apps/worker`)
```bash
# Start BullMQ scan queue consumer
npm run start --workspace=@shipshield/worker
```

#### 4. Start the Web Dashboard (`apps/web`)
```bash
# Launch Vite dev server
npm run dev --workspace=@shipshield/web
```
Open your browser to: **`http://localhost:5173`** to access the interactive security dashboard.

---

## 4. Configuration Reference (`.shipshield.yaml`)

Place `.shipshield.yaml` in your project root to configure scanner behaviors and policy thresholds:

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
  fail_on:
    - "critical"
    - "high"
  fail_on_incomplete: true

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

## 5. CLI Exit Code Contract & CI/CD Pipelines

ShipShield adheres strictly to canonical exit code semantics defined in `docs/04-cli-specification.md`:

| Exit Code | Canonical Status | CI Interpretation | Action Required |
|:---:|---|---|---|
| **`0`** | `passed` | **Success** | Pipeline proceeds cleanly. |
| **`1`** | `policy_failed` | **Block Pipeline** | Findings exceed policy (e.g. Critical/High detected). |
| **`2`** | `usage_error` | **Invocation Error** | Fix CLI syntax, flags, or invalid arguments. |
| **`3`** | `configuration_error` | **Config Error** | Fix syntax or schema issues in `.shipshield.yaml`. |
| **`4`** | `incomplete` | **Fail Closed** | A scanner crashed, timed out, or was missing. |
| **`5`** | `report_error` | **Artifact Error** | Report file missing, corrupted, or unreadable. |
| **`6`** | `fix_error` | **Remediation Conflict**| Target file modified concurrently or patch failed. |
| **`10`** | `internal_error` | **Crash** | Internal unexpected exception. |

### Example GitHub Actions CI Workflow

Add `.github/workflows/security-gate.yml`:

```yaml
name: Security Gate

on:
  push:
    branches: [main]
  pull_request:

jobs:
  shipshield:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Source
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install ShipShield
        run: npm ci && npm run build

      - name: Run ShipShield Security Gate
        run: node apps/cli/dist/index.js plan --fail-on critical high

      - name: Upload Scan Reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: shipshield-reports
          path: .shipshield/reports/
```

---

## 6. Testing, Quality Gates & Diagnostics

ShipShield includes a comprehensive, automated test suite:

```bash
# Run all unit, integration, and security tests
npm test

# Run test coverage analysis (Quality Gate: >90% coverage)
npm run test:coverage

# Perform static type checking across all workspaces
npm run typecheck

# Execute linter
npm run lint
```

---

## 7. Need Help or Troubleshooting?

- Run `shipshield --help` or `shipshield <command> --help` for instant documentation on any subcommand.
- Use `--debug` or `--verbose` for detailed execution logging (secrets remain strictly redacted).
- For complete specifications, consult the detailed architectural specs in `docs/` (`01` through `11`).
