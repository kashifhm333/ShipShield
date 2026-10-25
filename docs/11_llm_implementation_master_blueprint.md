# 11 — LLM Implementation Master Blueprint & Step-by-Step Build Guide

**Document Status:** Master Execution Prompt & Implementation Logic Specification  
**Version:** 1.0  
**Product:** ShipShield  
**Target Consumer:** Autonomous LLM Coding Agents (Claude Code, Cursor, Windsurf, Gemini, Copilot Workspace) & Lead Engineers  
**Normative Language:** **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** represent strict implementation constraints.

---

## 0. System Prompt & Directives for the Implementing LLM

> **INSTRUCTION TO THE AI CODING AGENT:**  
> You are tasked with building **ShipShield**—a production-grade, CLI-first DevSecOps security gate and multi-tenant MERN + BullMQ collaboration platform.  
> Before writing any code, read this entire blueprint. You **MUST** execute the build sequentially from **Phase 1 to Phase 10**. Do **NOT** skip steps, do **NOT** write placeholder/mock stub logic where real algorithms are specified, and do **NOT** advance to the next step until the verification test suite for the current step passes.

### 0.1 The 10 Non-Negotiable Architectural Invariants
If your generated code violates any of the following 10 rules, the build is considered defective:

1. **Zero Shell Interpolation:** Never call `child_process.exec` or `execSync`. Always use `child_process.spawn(executablePath, argsArray, { shell: false })`.
2. **Fail-Closed Execution:** Separate scanner execution status (`completed`, `failed`, `timed_out`, `skipped`, `not_applicable`, `disabled`) from policy outcome (`passed`, `policy_failed`, `incomplete`). If a required scanner binary is missing, crashes, times out, or outputs malformed JSON, the scan outcome **MUST** resolve to `incomplete` (Exit Code `4`), **NEVER** `passed` (Exit Code `0`).
3. **Pre-Storage Central Redaction:** Raw credentials discovered by scanners **MUST** be redacted in-memory immediately after output parsing. Raw secrets **MUST NEVER** appear in `stdout`, `stderr`, JSON/Markdown reports, MongoDB documents, error stack traces, or finding fingerprints.
4. **Read-Only Planning:** `shipshield plan`, `shipshield show`, and `shipshield verify` **MUST NOT** modify any tracked repository source files.
5. **Preview-First Remediation:** `shipshield fix` **MUST** default to `--dry-run`. Source files may only be modified when `--apply` is explicitly passed (`--yes` **MUST NOT** imply `--apply`), after verifying the target file's SHA-256 hash matches the pre-scan state, and using atomic temp-file-and-rename writes.
6. **Verification Over Assertion:** Applying a patch via `shipshield fix --apply` does **NOT** mark a finding as `fixed`. Only a subsequent `shipshield verify` scan that confirms the finding's fingerprint is absent on a completed scan may transition the status to `fixed`.
7. **Core Decoupling:** `packages/scan-core` and `packages/contracts` **MUST NOT** import Express, Mongoose, BullMQ, or CLI terminal formatting libraries (`commander`, `chalk`). Both `apps/cli` and `apps/worker` consume the exact same `scan-core` engine.
8. **Strict Wire Casing:** All persisted JSON reports, `.shipshield.yaml` keys, MongoDB documents, and REST API payloads **MUST** use `snake_case`.
9. **Multi-Tenant Isolation:** Every MongoDB query and mutation in `apps/api` **MUST** be scoped by `{ organization_id: req.auth.organizationId }`. Cross-tenant access attempts **MUST** return `404 RESOURCE_NOT_FOUND`.
10. **No Untrusted Code Execution:** Scanning a repository **MUST NEVER** execute `npm install`, package lifecycle scripts, `Dockerfile` builds, `Makefile` targets, or `terraform apply`.

---

## 1. Reference Architecture & Document Resolution Matrix

This blueprint synthesizes the 10 foundational specification documents in the repository. When cross-referencing, use this table as the single source of truth:

| Doc # | File Name | Authoritative Scope |
| :--- | :--- | :--- |
| **01** | `README.md` | Product vision, high-level workflows, and monorepo overview. |
| **02** | `02-product-requirements-document.md` | Functional requirements (`FR-001` to `FR-055`) and MVP acceptance criteria. |
| **03** | `03-system-design-and-architecture.md` | Component boundaries, domain model, and runtime sequence flows. |
| **04** | `04-cli-specification.md` | **Authoritative** for CLI flags, command syntax, report schema, and Exit Codes (`0, 1, 2, 3, 4, 5, 6, 10`). |
| **05** | `05-security-and-threat-model.md` | **Authoritative** for STRIDE mitigations, path containment, redaction, and sandbox constraints. |
| **06** | `06-data-model-and-api-specification.md` | **Authoritative** for MongoDB schemas, compound indexes, REST `/api/v1` contracts, and BullMQ payloads. |
| **07** | `07-scanner-and-remediation-specification.md` | **Authoritative** for `ScannerAdapter`, `ProcessRunner`, Gitleaks/Trivy/Checkov flags, and `fix` mechanics. |
| **08** | `08-testing-strategy-and-quality-gates.md` | **Authoritative** for the 6-layer test pyramid, synthetic fixtures, and CI coverage gates ($\ge 85\%$). |
| **09** | `09-devops-and-deployment-guide.md` | **Authoritative** for `docker-compose.yml`, GitHub Actions CI/CD, and Terraform IaC modules. |
| **10** | `10-implementation-plan-and-task-breakdown.md` | Chronological milestone sequence and Definition of Done (DoD). |

---

## 2. Target Monorepo Directory Structure

You **MUST** scaffold the repository using npm workspaces (or pnpm workspaces) with the following exact directory layout:

```text
shipshield/
├── package.json
├── tsconfig.base.json
├── vitest.config.ts
├── docker-compose.yml
├── .gitignore
├── .shipshield.yaml
├── packages/
│   ├── contracts/                         # Zero-dependency Zod & JSON Schemas
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── enums.ts
│   │       ├── exit-codes.ts
│   │       ├── config.schema.ts
│   │       ├── finding.schema.ts
│   │       ├── report.schema.ts
│   │       └── api.schema.ts
│   ├── scan-core/                         # Pure TypeScript Security Engine
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── security/
│   │       │   ├── path-validator.ts
│   │       │   ├── redaction-engine.ts
│   │       │   ├── fingerprint.ts
│   │       │   └── process-runner.ts
│   │       ├── discovery/
│   │       │   ├── project-root.ts
│   │       │   └── file-walker.ts
│   │       ├── config/
│   │       │   └── config-loader.ts
│   │       ├── adapters/
│   │       │   ├── adapter.interface.ts
│   │       │   └── adapter-registry.ts
│   │       ├── policy/
│   │       │   └── policy-engine.ts
│   │       ├── reports/
│   │       │   ├── json-writer.ts
│   │       │   ├── markdown-writer.ts
│   │       │   └── report-reader.ts
│   │       ├── remediation/
│   │       │   ├── fix-registry.ts
│   │       │   ├── handlers/
│   │       │   │   ├── dockerfile-non-root.handler.ts
│   │       │   │   └── terraform-s3-public-access.handler.ts
│   │       │   ├── remediation-engine.ts
│   │       │   └── verification-engine.ts
│   │       └── orchestrator/
│   │           └── scan-orchestrator.ts
│   └── scanner-adapters/                  # Concrete External Tool Integrations
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── gitleaks/
│           │   └── gitleaks.adapter.ts
│           ├── trivy/
│           │   ├── trivy-dependencies.adapter.ts
│           │   └── trivy-containers.adapter.ts
│           └── checkov/
│               └── checkov.adapter.ts
├── apps/
│   ├── cli/                               # Local-First CLI Binary
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── presenter/
│   │       │   └── terminal-presenter.ts
│   │       └── commands/
│   │           ├── init.command.ts
│   │           ├── plan.command.ts
│   │           ├── show.command.ts
│   │           ├── fix.command.ts
│   │           └── verify.command.ts
│   ├── api/                               # Express + MongoDB Control Plane
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── app.ts
│   │       ├── server.ts
│   │       ├── config/
│   │       │   └── env.ts
│   │       ├── db/
│   │       │   ├── connection.ts
│   │       │   └── models/
│   │       │       ├── organization.model.ts
│   │       │       ├── user.model.ts
│   │       │       ├── membership.model.ts
│   │       │       ├── installation.model.ts
│   │       │       ├── repository.model.ts
│   │       │       ├── scan.model.ts
│   │       │       ├── finding.model.ts
│   │       │       ├── scan-finding.model.ts
│   │       │       ├── policy.model.ts
│   │       │       ├── suppression.model.ts
│   │       │       ├── audit-event.model.ts
│   │       │       └── webhook-event.model.ts
│   │       ├── middleware/
│   │       │   ├── request-id.middleware.ts
│   │       │   ├── auth.middleware.ts
│   │       │   ├── tenant.middleware.ts
│   │       │   └── error.middleware.ts
│   │       ├── queue/
│   │       │   └── scan-queue.producer.ts
│   │       ├── services/
│   │       │   ├── ingestion.service.ts
│   │       │   └── github-checks.service.ts
│   │       └── routes/
│   │           ├── health.routes.ts
│   │           ├── organizations.routes.ts
│   │           ├── repositories.routes.ts
│   │           ├── scans.routes.ts
│   │           ├── findings.routes.ts
│   │           ├── policies.routes.ts
│   │           ├── suppressions.routes.ts
│   │           ├── webhooks.routes.ts
│   │           └── internal.routes.ts
│   ├── worker/                            # Isolated BullMQ Scan Worker
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── worker.ts
│   │       ├── workspace-sandbox.ts
│   │       └── scan-job.processor.ts
│   └── web/                               # React + Vite + Tailwind Dashboard
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── api/
│           │   └── client.ts
│           ├── pages/
│           │   ├── RepositoriesPage.tsx
│           │   ├── ScanHistoryPage.tsx
│           │   ├── ScanDetailPage.tsx
│           │   └── PolicySettingsPage.tsx
│           └── components/
│               ├── SeverityBadge.tsx
│               ├── ScanStatusBanner.tsx
│               └── FindingDrawer.tsx
└── fixtures/                              # Hermetic Synthetic Test Repositories
    ├── clean-project/
    ├── seeded-secrets/
    ├── vulnerable-deps/
    ├── unsafe-docker/
    └── misconfigured-terraform/
```

---

## 3. Step-by-Step Build Execution Protocol

Execute the following 10 steps in strict chronological order.

---

### STEP 1: Monorepo Scaffolding & Base Configuration

#### 1.1 Files to Create
* `package.json`
* `tsconfig.base.json`
* `vitest.config.ts`

#### 1.2 Implementation Logic
Configure the root `package.json` with workspaces `["packages/*", "apps/*"]` and Node engine `>=20.11.0`. Use strict TypeScript settings in `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

#### 1.3 Step 1 Verification Gate
Run `npm install` and verify workspace symlink resolution succeeds with zero errors.

---

### STEP 2: Shared Contracts, Enums, and Exit Codes (`packages/contracts`)

#### 2.1 Files to Create
* `packages/contracts/src/enums.ts`
* `packages/contracts/src/exit-codes.ts`
* `packages/contracts/src/config.schema.ts`
* `packages/contracts/src/finding.schema.ts`
* `packages/contracts/src/report.schema.ts`
* `packages/contracts/src/api.schema.ts`
* `packages/contracts/src/index.ts`

#### 2.2 Implementation Logic

**A. Authoritative Exit Codes (`exit-codes.ts`):**
Map outcomes deterministically according to `04-cli-specification.md`:

```typescript
export const EXIT_CODES = {
  PASSED: 0,
  POLICY_FAILED: 1,
  USAGE_ERROR: 2,
  CONFIGURATION_ERROR: 3,
  INCOMPLETE: 4,
  REPORT_ERROR: 5,
  FIX_ERROR: 6,
  INTERNAL_ERROR: 10,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export type CanonicalOutcome =
  | 'passed'
  | 'policy_failed'
  | 'incomplete'
  | 'configuration_error'
  | 'usage_error'
  | 'report_error'
  | 'fix_error'
  | 'internal_error';

export function outcomeToExitCode(outcome: CanonicalOutcome): ExitCode {
  switch (outcome) {
    case 'passed':
      return EXIT_CODES.PASSED;
    case 'policy_failed':
      return EXIT_CODES.POLICY_FAILED;
    case 'usage_error':
      return EXIT_CODES.USAGE_ERROR;
    case 'configuration_error':
      return EXIT_CODES.CONFIGURATION_ERROR;
    case 'incomplete':
      return EXIT_CODES.INCOMPLETE;
    case 'report_error':
      return EXIT_CODES.REPORT_ERROR;
    case 'fix_error':
      return EXIT_CODES.FIX_ERROR;
    case 'internal_error':
      return EXIT_CODES.INTERNAL_ERROR;
  }
}
```

**B. Core Enums & Severity Ordering (`enums.ts`):**
```typescript
import { z } from 'zod';

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export const ScannerIdSchema = z.enum(['secrets', 'dependencies', 'containers', 'iac']);
export type ScannerId = z.infer<typeof ScannerIdSchema>;

export const ScannerStatusSchema = z.enum([
  'completed',
  'not_applicable',
  'disabled',
  'skipped',
  'failed',
  'timed_out',
]);
export type ScannerStatus = z.infer<typeof ScannerStatusSchema>;

export const ScanExecutionStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'timed_out',
  'cancelled',
]);

export const PolicyOutcomeSchema = z.enum([
  'pending',
  'passed',
  'policy_failed',
  'incomplete',
  'error',
]);
```

**C. Project Configuration Schema (`config.schema.ts`):**
Enforce `.strict()` on all Zod objects so unknown configuration keys in `.shipshield.yaml` are rejected before scanner execution:

```typescript
import { z } from 'zod';
import { SeveritySchema } from './enums.js';

export const ProjectConfigSchema = z
  .object({
    schema_version: z.literal(1),
    project: z
      .object({
        name: z.string().min(1).max(128).default('auto'),
        root: z.string().min(1).default('.'),
      })
      .strict(),
    reports: z
      .object({
        directory: z.string().min(1).default('.shipshield/reports'),
        formats: z.array(z.enum(['json', 'markdown'])).min(1).default(['json', 'markdown']),
        retain: z.number().int().min(1).max(500).default(20),
      })
      .strict(),
    scan: z
      .object({
        secrets: z.object({ enabled: z.boolean().default(true) }).strict(),
        dependencies: z.object({ enabled: z.boolean().default(true) }).strict(),
        containers: z.object({ enabled: z.boolean().default(true) }).strict(),
        iac: z.object({ enabled: z.boolean().default(true) }).strict(),
      })
      .strict(),
    policy: z
      .object({
        fail_on: z.array(SeveritySchema).default(['critical', 'high']),
        fail_on_incomplete: z.boolean().default(true),
      })
      .strict(),
    execution: z
      .object({
        timeout_seconds: z.number().int().min(5).max(3600).default(600),
        max_parallel_scanners: z.number().int().min(1).max(16).default(4),
        network: z.enum(['allow', 'deny']).default('allow'),
        exclude: z
          .array(z.string())
          .default(['.git/**', 'node_modules/**', 'vendor/**', 'dist/**', '.shipshield/**']),
      })
      .strict(),
  })
  .strict();

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
```

**D. Normalized Finding & Scan Report Schemas (`finding.schema.ts` & `report.schema.ts`):**
```typescript
import { z } from 'zod';
import { ScannerIdSchema, ScannerStatusSchema, SeveritySchema } from './enums.js';

export const FindingLocationSchema = z
  .object({
    path: z.string().min(1),
    start_line: z.number().int().min(1).optional(),
    end_line: z.number().int().min(1).optional(),
    resource_address: z.string().optional(),
    package_name: z.string().optional(),
    installed_version: z.string().optional(),
    fixed_version: z.string().optional(),
  })
  .strict();

export const FindingEvidenceSchema = z
  .object({
    redacted: z.literal(true),
    summary: z.string().max(1024),
    line_snippet: z.string().max(512).optional(),
  })
  .strict();

export const FindingRemediationSchema = z
  .object({
    summary: z.string().min(1),
    fix_available: z.boolean(),
    fix_strategy: z.string().nullable().default(null),
  })
  .strict();

export const NormalizedFindingSchema = z
  .object({
    id: z.string().regex(/^SS-(SEC|DEP|CON|IAC)-[A-Z0-9]{4,12}$/),
    fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    type: z.string().min(1),
    category: ScannerIdSchema,
    scanner: z.string().min(1),
    rule_id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    severity: SeveritySchema,
    severity_original: z.string().min(1),
    confidence: z.enum(['high', 'medium', 'low']).default('high'),
    location: FindingLocationSchema,
    evidence: FindingEvidenceSchema,
    remediation: FindingRemediationSchema,
    status: z.enum(['new', 'existing', 'resolved', 'changed', 'accepted', 'suppressed']).default('new'),
    references: z.array(z.string().url()).default([]),
  })
  .strict();

export type NormalizedFinding = z.infer<typeof NormalizedFindingSchema>;

export const ScanReportSchema = z
  .object({
    schema_version: z.literal('1.0'),
    tool: z.object({ name: z.literal('shipshield'), version: z.string() }).strict(),
    scan: z
      .object({
        id: z.string().regex(/^scan_[A-Za-z0-9]{20,32}$/),
        started_at: z.string().datetime(),
        completed_at: z.string().datetime(),
        scope: z
          .object({
            kind: z.enum(['full', 'changed']),
            root: z.string(),
            base_ref: z.string().optional(),
            base_sha: z.string().optional(),
          })
          .strict(),
        execution_status: z.enum(['completed', 'failed', 'timed_out', 'cancelled']),
        policy_outcome: z.enum(['passed', 'policy_failed', 'incomplete']),
      })
      .strict(),
    project: z
      .object({
        name: z.string(),
        vcs: z
          .object({
            type: z.literal('git'),
            commit: z.string().optional(),
            branch: z.string().optional(),
            dirty: z.boolean().optional(),
          })
          .optional(),
      })
      .strict(),
    scanners: z.array(
      z
        .object({
          id: ScannerIdSchema,
          status: ScannerStatusSchema,
          engine: z.string(),
          engine_version: z.string().optional(),
          duration_ms: z.number().int().min(0),
          finding_count: z.number().int().min(0),
          error_message: z.string().nullable().default(null),
        })
        .strict()
    ),
    summary: z
      .object({
        findings_total: z.number().int().min(0),
        by_severity: z
          .object({
            critical: z.number().int().min(0),
            high: z.number().int().min(0),
            medium: z.number().int().min(0),
            low: z.number().int().min(0),
            info: z.number().int().min(0),
          })
          .strict(),
        policy_violations: z.number().int().min(0),
      })
      .strict(),
    findings: z.array(NormalizedFindingSchema),
    policy: z
      .object({
        passed: z.boolean(),
        rules_evaluated: z.number().int().min(0),
        violations: z.array(
          z
            .object({
              rule_id: z.string(),
              finding_id: z.string(),
              finding_fingerprint: z.string(),
              message: z.string(),
            })
            .strict()
        ),
      })
      .strict(),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
  })
  .strict();

export type ScanReport = z.infer<typeof ScanReportSchema>;
```

#### 2.3 Step 2 Verification Gate
Write unit tests in `packages/contracts/test/schemas.test.ts` verifying:
1. Valid `ProjectConfig`, `NormalizedFinding`, and `ScanReport` payloads pass validation.
2. Unknown keys in `ProjectConfig` throw a `ZodError`.
3. `FindingEvidenceSchema` rejects `redacted: false`.
4. All 8 canonical outcomes map to exact exit codes (`0, 1, 2, 3, 4, 5, 6, 10`).

---

### STEP 3: Core Security Primitives (`packages/scan-core/src/security`)

#### 3.1 Files to Create
* `packages/scan-core/src/security/path-validator.ts`
* `packages/scan-core/src/security/redaction-engine.ts`
* `packages/scan-core/src/security/fingerprint.ts`
* `packages/scan-core/src/security/process-runner.ts`

#### 3.2 Implementation Logic

**A. Path Containment & Symlink Escape Guard (`path-validator.ts`):**
* Never rely on string prefix (`candidate.startsWith(root)`).
* Resolve canonical paths via `fs.realpathSync.native` (or resolve the nearest existing parent directory when validating a file to be created).
* Use `path.relative(canonicalRoot, canonicalTarget)`. If the relative path starts with `'..'` or `path.isAbsolute(rel)` is `true`, throw a `SecurityBoundaryError` (`SS-SEC-PATH-001`).
* Strip ANSI escape sequences and ASCII control characters (`[\x00-\x1F\x7F-\x9F]`) from any path before terminal display.

**B. Central Redaction Engine (`redaction-engine.ts`):**
Every string leaving a scanner adapter (snippets, error messages, descriptions, stderr) **MUST** pass through `RedactionEngine.redact(input, rawSecretMatch?)`.
1. If `rawSecretMatch` is known (e.g., from Gitleaks `Secret` field), replace all literal occurrences of `rawSecretMatch` with `****` (preserving only a non-sensitive key name prefix like `API_KEY=****` if present).
2. Apply regex tokenizers for common patterns:
   * AWS Access Keys (`/(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g`)
   * GitHub Tokens (`/gh[pousr]_[A-Za-z0-9_]{36,255}/g`)
   * GitLab Tokens (`/glpat-[A-Za-z0-9\-=_]{20,}/g`)
   * Slack Tokens (`/xox[baprs]-[0-9a-zA-Z-]{10,48}/g`)
   * Private Key Blocks (`/-----BEGIN [A-Z0-9 ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]+ PRIVATE KEY-----/g`)
   * JWT Bearer Tokens (`/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g`)
   * Generic assignment values (`/(password|secret|token|api_key|apikey|private_key|client_secret)\s*[:=]\s*['"]?([^\s'"]{6,})['"]?/gi`)
3. **Shannon Entropy Filter:** For any contiguous non-whitespace token of length $\ge 20$ matching Base64/Hex alphabets, compute Shannon entropy:
   $$H(X) = -\sum_{i=1}^{n} P(x_i) \log_2 P(x_i)$$
   If $H(X) > 4.5$, mask the token as `****************`.

**C. Deterministic SHA-256 Fingerprinting (`fingerprint.ts`):**
Normalize file paths to POSIX forward slashes (`path.posix.normalize`) relative to project root. Compute category-specific hashes without line numbers (so line shifts above a finding do not create duplicate findings):

* **Secrets:**
  $$\text{fingerprint} = \text{"sha256:"} \parallel \text{SHA256}\left(\text{"secret"} \parallel \text{rule\_id} \parallel \text{posix\_relative\_path} \parallel \text{HMAC\_SHA256}(\text{local\_key}, \text{secret\_value})\right)$$
  *(Note: Never pass raw secret without HMAC, and never persist the raw secret).*
* **Dependencies:**
  $$\text{fingerprint} = \text{"sha256:"} \parallel \text{SHA256}\left(\text{"dependency"} \parallel \text{posix\_relative\_path} \parallel \text{package\_name} \parallel \text{installed\_version} \parallel \text{rule\_id}\right)$$
* **Containers:**
  $$\text{fingerprint} = \text{"sha256:"} \parallel \text{SHA256}\left(\text{"container"} \parallel \text{posix\_relative\_path} \parallel \text{normalized\_instruction} \parallel \text{rule\_id}\right)$$
* **IaC:**
  $$\text{fingerprint} = \text{"sha256:"} \parallel \text{SHA256}\left(\text{"iac"} \parallel \text{posix\_relative\_path} \parallel \text{resource\_address} \parallel \text{rule\_id}\right)$$

Also generate a deterministic short public ID from the fingerprint:
`SS-${CATEGORY_PREFIX}-${fingerprint.slice(7, 13).toUpperCase()}` where `CATEGORY_PREFIX` is `SEC`, `DEP`, `CON`, or `IAC`.

**D. Sandboxed Process Runner (`process-runner.ts`):**
```typescript
export interface ProcessRunnerOptions {
  executable: string;
  args: string[];
  cwd: string;
  envAllowlist?: Record<string, string>;
  timeoutMs: number;
  maxOutputBufferBytes?: number; // Default: 20 * 1024 * 1024 (20MB)
}

export interface ProcessRunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  bufferOverflowed: boolean;
}
```
* **Environment Scrubbing:** Construct child `env` containing **ONLY** universal safe keys (`PATH`, `TMPDIR`, `TEMP`, `TMP`, `HOME`, `USER`, `LANG`, `LC_ALL`, `SYSTEMROOT`) plus explicit `options.envAllowlist`. Strip `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, `MONGODB_URI`, `JWT_SECRET`, etc.
* **Subprocess Spawn:** Call `spawn(executable, args, { cwd, env: sanitizedEnv, shell: false, detached: process.platform !== 'win32' })`.
* **Buffer Cap:** Track accumulated `stdout` and `stderr` bytes. If either exceeds `maxOutputBufferBytes`, set `bufferOverflowed = true` and kill the process group immediately.
* **Timeout Escalation:** Set a timer for `timeoutMs`. On trigger, send `SIGTERM` to the process group (`process.kill(-child.pid, 'SIGTERM')` on POSIX). Start a 5,000ms grace timer; if the child is still alive after 5,000ms, send `SIGKILL` (`-9`) and resolve with `timedOut: true, exitCode: null`.

#### 3.3 Step 3 Verification Gate
Write unit tests in `packages/scan-core/test/security.test.ts` verifying:
1. `PathValidator` blocks `../../etc/passwd`, absolute external paths, and symlinks pointing outside the workspace root.
2. `RedactionEngine` scrubs AWS keys, GitHub tokens, PEM private keys, and high-entropy strings ($H > 4.5$) with 0% leakage.
3. `ProcessRunner` strips secret environment variables, enforces buffer limits, and escalates `SIGTERM` $\rightarrow$ `SIGKILL` on hung processes.

---

### STEP 4: Project Discovery & Configuration Loader (`packages/scan-core`)

#### 4.1 Files to Create
* `packages/scan-core/src/discovery/project-root.ts`
* `packages/scan-core/src/discovery/file-walker.ts`
* `packages/scan-core/src/config/config-loader.ts`

#### 4.2 Implementation Logic
1. **Project Root Resolution (`project-root.ts`):**
   * If `--project-dir` is explicitly provided, resolve via `fs.realpathSync.native` and verify it is a directory.
   * Otherwise, check if `cwd` or an ancestor contains `.shipshield.yaml` or `.git`.
   * If both `.shipshield.yaml` and `.shipshield.yml` exist in the same root, fail immediately with a `ConfigurationError` (`SS-CFG-AMBIGUOUS`, Exit Code `3`).
2. **Configuration Loader (`config-loader.ts`):**
   * Parse `.shipshield.yaml` using the `yaml` package with `maxAliasCount: 10` (prevent YAML billion-laughs bomb) and max file size 1MB.
   * Validate the parsed object against `ProjectConfigSchema`. Format any `ZodError` with exact key paths and exit with `CONFIGURATION_ERROR` (`3`).
   * Enforce precedence: Built-in Defaults $\rightarrow$ `.shipshield.yaml` $\rightarrow$ `--config` override $\rightarrow$ CLI flags (note: if `execution.network === 'deny'` in config, CLI flags cannot weaken it to `'allow'`).
3. **File Discovery (`file-walker.ts`):**
   * Walk the project root without following symlinks (`lstatSync` $\rightarrow$ skip if `isSymbolicLink()`).
   * Apply glob exclusions from `config.execution.exclude` and `.gitignore`.
   * Categorize discovered files so adapters know applicability:
     * `secrets`: Applicable if $\ge 1$ file exists.
     * `dependencies`: Applicable if any lockfile/manifest exists (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `requirements.txt`, `poetry.lock`, `go.mod`, `Cargo.lock`, `pom.xml`).
     * `containers`: Applicable if any `Dockerfile`, `*.dockerfile`, or `Containerfile` exists.
     * `iac`: Applicable if any `*.tf` or `*.tf.json` file exists.

#### 4.3 Step 4 Verification Gate
Write tests proving that `ConfigLoader` rejects malformed YAML, duplicate config files, and unknown keys, and that `FileWalker` ignores symlinks and `node_modules/**`.

---

### STEP 5: Scanner Adapters (`packages/scanner-adapters`)

#### 5.1 Files to Create
* `packages/scan-core/src/adapters/adapter.interface.ts`
* `packages/scanner-adapters/src/gitleaks/gitleaks.adapter.ts`
* `packages/scanner-adapters/src/trivy/trivy-dependencies.adapter.ts`
* `packages/scanner-adapters/src/trivy/trivy-containers.adapter.ts`
* `packages/scanner-adapters/src/checkov/checkov.adapter.ts`

#### 5.2 Implementation Logic

All adapters implement `ScannerAdapter` from `07-scanner-and-remediation-specification.md`.

| Adapter ID | Binary | Version Check | Invocation Argument Array (`args: string[]`) | Exit Code Semantics |
| :--- | :--- | :--- | :--- | :--- |
| `secrets` | `gitleaks` | `gitleaks version` ($\ge 8.18.0$) | `['dir', workspacePath, '--report-format', 'json', '--report-path', tmpReportFile, '--no-banner', '--exit-code', '1']` | `0`: Clean (0 findings)<br>`1`: Findings present (parse JSON)<br>`>1`: Crash/Error $\rightarrow$ status `'failed'` |
| `dependencies` | `trivy` | `trivy --version` ($\ge 0.50.0$) | `['fs', '--scanners', 'vuln', '--format', 'json', '--output', tmpReportFile, '--quiet', '--exit-code', '1', ...(offline ? ['--offline-scan', '--skip-db-update'] : []), workspacePath]` | `0`: Clean<br>`1`: Findings present<br>`>1`: Crash/Error $\rightarrow$ status `'failed'` |
| `containers` | `trivy` | `trivy --version` ($\ge 0.50.0$) | `['config', '--format', 'json', '--output', tmpReportFile, '--quiet', '--exit-code', '1', workspacePath]` | `0`: Clean<br>`1`: Misconfigurations present<br>`>1`: Crash/Error $\rightarrow$ status `'failed'` |
| `iac` | `checkov` | `checkov --version` ($\ge 3.2.0$) | `['--directory', workspacePath, '--framework', 'terraform', '--output', 'json', '--output-file-path', tmpDir, '--quiet', '--compact']` | `0`: Clean<br>`1`: Failed checks present<br>`>1`: Crash/Error $\rightarrow$ status `'failed'` |

**Critical Adapter Parsing Rules:**
1. **Isolated Temp Output:** Write tool JSON output to an isolated temporary directory (`fs.mkdtempSync(path.join(os.tmpdir(), 'shipshield-scan-'))`) and delete it in a `finally` block.
2. **Gitleaks Parser:** Read the JSON array. For each item, extract `RuleID`, `Description`, `File`, `StartLine`, `EndLine`, `Match`, and `Secret`. Immediately pass `Match` and `Secret` to `RedactionEngine.redact(item.Match, item.Secret)` and compute the keyed fingerprint before discarding `item.Secret`. Normalize Gitleaks severity to `'critical'` (or `'high'` for generic entropy rules).
3. **Trivy Dependencies Parser:** Iterate `Results[].Vulnerabilities[]`. Map `VulnerabilityID` $\rightarrow$ `rule_id`, `PkgName` $\rightarrow$ `location.package_name`, `InstalledVersion` $\rightarrow$ `location.installed_version`, `FixedVersion` $\rightarrow$ `location.fixed_version`. Map `Severity` (`CRITICAL` $\rightarrow$ `'critical'`, `HIGH` $\rightarrow$ `'high'`, `MEDIUM` $\rightarrow$ `'medium'`, `LOW` $\rightarrow$ `'low'`, `UNKNOWN` $\rightarrow$ `'info'`). Set `remediation.fix_available = Boolean(FixedVersion)`.
4. **Trivy Containers Parser:** Iterate `Results[].Misconfigurations[]`. Map `ID` (e.g., `DS002`) $\rightarrow$ `rule_id`, `CauseMetadata.StartLine` $\rightarrow$ `location.start_line`. If `ID === 'DS002'` (root user in Dockerfile), mark `remediation.fix_available = true, fix_strategy = 'dockerfile-non-root'`.
5. **Checkov Parser:** Parse `results.failed_checks[]`. Map `check_id` (e.g., `CKV_AWS_20` / `CKV_AWS_53`) $\rightarrow$ `rule_id`, `resource` $\rightarrow$ `location.resource_address`, `file_path` $\rightarrow$ `location.path`, `file_line_range[0]` $\rightarrow$ `location.start_line`. Map Checkov severity (defaulting to `'high'` for public access/encryption rules, `'medium'` otherwise).
6. **Fail-Closed Validation:** If the subprocess exits with `0` or `1` but the expected JSON output file does not exist or throws a `SyntaxError` on `JSON.parse`, the adapter **MUST** mark the scanner run status as `'failed'` with a descriptive `error_message`.

#### 5.3 Step 5 Verification Gate
Write contract tests in `packages/scanner-adapters/test/adapters.test.ts` using recorded JSON outputs and mock binaries for Gitleaks, Trivy, and Checkov:
1. Verify valid outputs normalize into schema-compliant `NormalizedFinding[]` with `evidence.redacted === true`.
2. Verify missing binaries return `{ status: 'skipped', error_message: 'Binary not found' }`.
3. Verify corrupted JSON output returns `{ status: 'failed' }`.

---

### STEP 6: Scan Orchestrator, Policy Engine & Report Writers (`packages/scan-core`)

#### 6.1 Files to Create
* `packages/scan-core/src/policy/policy-engine.ts`
* `packages/scan-core/src/reports/json-writer.ts`
* `packages/scan-core/src/reports/markdown-writer.ts`
* `packages/scan-core/src/reports/report-reader.ts`
* `packages/scan-core/src/orchestrator/scan-orchestrator.ts`

#### 6.2 Implementation Logic

**A. Deterministic Policy Engine (`policy-engine.ts`):**
Given `findings: NormalizedFinding[]`, `scannerRuns: ScannerRunResult[]`, `config: ProjectConfig`, and optional `suppressions: ActiveSuppression[]`:
1. Filter out findings that match an active suppression where `new Date(suppression.expires_at) > new Date()`. Mark those findings with `status = 'suppressed'`. (Expired suppressions **MUST** be ignored and keep finding `status = 'new'`).
2. Check if any enabled scanner has status `'failed'`, `'timed_out'`, or `'skipped'`.
   * If `true` and `config.policy.fail_on_incomplete === true`, the scan outcome **MUST** be `'incomplete'`.
3. For all unsuppressed findings, check if `config.policy.fail_on.includes(finding.severity)`.
   * Record each match in `policy.violations[]`.
4. Determine final outcome precedence:
   * If any required scanner failed/timed_out/skipped $\rightarrow$ `policy_outcome = 'incomplete'`, `passed = false`.
   * Else if `violations.length > 0` $\rightarrow$ `policy_outcome = 'policy_failed'`, `passed = false`.
   * Else $\rightarrow$ `policy_outcome = 'passed'`, `passed = true`.

**B. Atomic Report Writers (`json-writer.ts` & `markdown-writer.ts`):**
* Validate target directory is inside the project root via `PathValidator`.
* Validate the report payload against `ScanReportSchema` before serializing.
* Write to `<reportDir>/.tmp-scan-<scanId>.json` with file mode `0o600`, call `fs.fsyncSync`, and atomically rename (`fs.renameSync`) to `scan-<UTC_TIMESTAMP>-<scanId>.json`.
* Also write an atomic copy to `<reportDir>/latest.json` and `<reportDir>/latest.md`.

**C. Scan Orchestrator (`scan-orchestrator.ts`):**
* Generate `scan_id` (`scan_${ulid()}`).
* Execute enabled adapters concurrently up to `config.execution.max_parallel_scanners`.
* Deduplicate findings by `fingerprint` and sort deterministically by `(SEVERITY_WEIGHT[severity] DESC, location.path ASC, location.start_line ASC)`.

#### 6.3 Step 6 Verification Gate
Write unit and integration tests verifying:
1. Policy Engine returns `'incomplete'` when a required scanner fails, even if 0 findings were found.
2. Policy Engine returns `'policy_failed'` when a `high` finding is present and `fail_on: ['critical', 'high']`.
3. Expired suppressions do not prevent a policy failure.
4. Reports are written atomically and validate against `ScanReportSchema`.

---

### STEP 7: Remediation & Verification Engine (`packages/scan-core/src/remediation`)

#### 7.1 Files to Create
* `packages/scan-core/src/remediation/fix-registry.ts`
* `packages/scan-core/src/remediation/handlers/dockerfile-non-root.handler.ts`
* `packages/scan-core/src/remediation/handlers/terraform-s3-public-access.handler.ts`
* `packages/scan-core/src/remediation/remediation-engine.ts`
* `packages/scan-core/src/remediation/verification-engine.ts`

#### 7.2 Implementation Logic

**A. Fix Handler Contract (`fix-registry.ts`):**
```typescript
export interface FixProposal {
  findingId: string;
  fingerprint: string;
  targetRelativePath: string;
  originalFileSha256: string;
  originalContent: string;
  patchedContent: string;
  unifiedDiff: string;
  description: string;
}

export interface FixHandler {
  readonly strategyId: string;
  readonly supportedRuleIds: string[];
  readonly category: 'containers' | 'iac' | 'dependencies'; // NEVER 'secrets'
  planFix(finding: NormalizedFinding, fileContent: string, fileSha256: string): Promise<FixProposal | null>;
}
```
* **Secret Remediation Prohibition:** `FixRegistry` **MUST NEVER** register an automated source-edit handler for `'secrets'` findings. Secret findings must always return `fix_available: false` with guidance to revoke/rotate the credential and purge Git history.

**B. Precondition & Atomic Apply Engine (`remediation-engine.ts`):**
1. Validate `targetRelativePath` via `PathValidator` (reject symlinks and out-of-root paths).
2. Read the current file and compute its SHA-256 hash.
3. If `dryRun === true` (the default when `--apply` is not explicitly passed), generate and return the `FixProposal` with its `unifiedDiff` without touching the filesystem.
4. If `apply === true`:
   * Re-read the target file immediately before writing and verify its SHA-256 matches `proposal.originalFileSha256`, and verify `git status --porcelain <file>` is clean (unless explicitly overridden). If the file was modified since planning, abort with `FIX_ERROR` (`Exit Code 6`).
   * Reject overlapping patches affecting the same file in a single batch.
   * Write `patchedContent` to a sibling temp file `<dir>/.shipshield-fix-<uuid>.tmp` preserving original file mode, `fsync`, and `renameSync` over the target file.

**C. Verification Engine (`verification-engine.ts`):**
1. Load the baseline report (`--before` or latest report prior to verification).
2. Assert compatibility: `baseline.project.name === current.project.name` and `current.scan.scope.kind` is at least as broad as `baseline.scan.scope.kind` (e.g., a `changed` scan cannot verify a `full` baseline).
3. Run a fresh scan via `ScanOrchestrator`.
4. Compare fingerprints:
   * A baseline finding is marked `resolved` **ONLY IF** the scanner responsible for its category has `status === 'completed'` in the new scan **AND** its `fingerprint` is absent from the new findings list.
   * If the scanner failed or was skipped, mark the finding comparison as `unverified` and return `INCOMPLETE` (`Exit Code 4`).

#### 7.3 Step 7 Verification Gate
Write mutation safety tests in `packages/scan-core/test/remediation.test.ts` verifying:
1. `fix` without `--apply` leaves the filesystem 100% byte-identical before and after.
2. Modifying a target file between `plan` and `fix --apply` triggers a SHA-256 precondition mismatch and aborts with `Exit Code 6`.
3. `verify` accurately transitions fixed findings to `resolved` and refuses to mark findings `resolved` if the scanner failed.

---

### STEP 8: ShipShield CLI (`apps/cli`)

#### 8.1 Files to Create
* `apps/cli/src/presenter/terminal-presenter.ts`
* `apps/cli/src/commands/init.command.ts`
* `apps/cli/src/commands/plan.command.ts`
* `apps/cli/src/commands/show.command.ts`
* `apps/cli/src/commands/fix.command.ts`
* `apps/cli/src/commands/verify.command.ts`
* `apps/cli/src/index.ts`

#### 8.2 Implementation Logic
Use `commander` to wire the exact CLI contract from `04-cli-specification.md`:
* **Global Options:** `--project-dir <path>`, `--config <path>`, `--report-dir <path>`, `--format <text|json>`, `--no-color`, `--quiet`, `--verbose`, `--debug`, `--non-interactive`.
* **Stdout / Stderr Separation:** When `--format json` is passed, `stdout` **MUST** contain **only** one valid UTF-8 JSON document. All progress spinners, warnings, and diagnostics **MUST** be written to `stderr`.
* **Commands:**
  1. `shipshield init [--force] [--minimal] [--yes]`: Creates `.shipshield.yaml` and `.shipshield/reports/`. Refuses to overwrite existing `.shipshield.yaml` unless both `--force` and `--yes` (or interactive prompt confirmation) are provided.
  2. `shipshield plan [--scanner <name>...] [--severity <level>] [--changed-only] [--base <git-ref>] [--offline] [--timeout <sec>] [--jobs <count>] [--fail-on <level>] [--report <path>] [--no-report] [--list-scanners]`: Runs `ScanOrchestrator`, writes reports, renders summary, and exits with `outcomeToExitCode(outcome)`.
  3. `shipshield show [<scan-id-or-path>] [--latest] [--severity <level>] [--scanner <name>] [--status <status>] [--format <text|json>] [--limit <count>]`: Reads existing report via `ReportReader` without invoking any scanners.
  4. `shipshield fix [<finding-id>...] [--all] [--dry-run] [--apply] [--scanner <name>] [--report <path>] [--yes]`: Enforces mutual exclusion between `--dry-run` and `--apply`. Defaults to `--dry-run`. Never allows `--yes` to substitute for `--apply`.
  5. `shipshield verify [--before <id-or-path>] [--after <id-or-path>] [--scanner <name>...] [--full]`: Runs `VerificationEngine` and exits with the new scan's exit code.

#### 8.3 Step 8 Verification Gate
Run end-to-end CLI tests across the 5 fixture repositories (`fixtures/clean-project`, `fixtures/seeded-secrets`, `fixtures/vulnerable-deps`, `fixtures/unsafe-docker`, `fixtures/misconfigured-terraform`):
1. Assert exit codes `0, 1, 2, 3, 4, 5, 6, 10` match every scenario in `04-cli-specification.md` Section 9.3.
2. Assert `shipshield plan --format json | jq .` parses cleanly with zero extra terminal lines.

---

### STEP 9: Control Plane REST API & MongoDB Persistence (`apps/api`)

#### 9.1 Files to Create
* `apps/api/src/db/models/*.model.ts` (All 11 Mongoose models from `06-data-model-and-api-specification.md` Section 3)
* `apps/api/src/middleware/auth.middleware.ts`
* `apps/api/src/middleware/tenant.middleware.ts`
* `apps/api/src/middleware/error.middleware.ts`
* `apps/api/src/services/ingestion.service.ts`
* `apps/api/src/routes/*.routes.ts` (All routes from `06-data-model-and-api-specification.md` Section 5)
* `apps/api/src/app.ts` & `server.ts`

#### 9.2 Implementation Logic

1. **Mongoose Schemas & Compound Indexes:**
   Implement the 11 collections (`organizations`, `users`, `memberships`, `installations`, `repositories`, `scans`, `findings`, `scan_findings`, `policies`, `suppressions`, `audit_events`, `webhook_events`) with exact `snake_case` fields and compound indexes from `06-data-model-and-api-specification.md`:
   * `findings`: Unique index on `{ organization_id: 1, repository_id: 1, fingerprint: 1 }` and `{ public_id: 1 }`.
   * `scan_findings`: Unique index on `{ scan_id: 1, finding_id: 1 }`.
   * `suppressions`: TTL index on `{ expires_at: 1 }, { expireAfterSeconds: 0 }`.
   * `webhook_events`: Unique index on `{ provider: 1, delivery_id: 1 }` and 7-day TTL index `{ received_at: 1 }, { expireAfterSeconds: 604800 }`.

2. **Webhook HMAC Verification & Atomic Deduplication (`webhooks.routes.ts`):**
   * Capture raw request buffer (`express.raw({ type: 'application/json' })`).
   * Verify `X-Hub-Signature-256` using `crypto.createHmac('sha256', webhookSecret)` and `crypto.timingSafeEqual`. Return `401 UNAUTHORIZED` on mismatch.
   * Perform atomic upsert on `webhook_events` keyed by `{ provider: 'github', delivery_id: req.header('X-GitHub-Delivery') }`. If `matchedCount > 0`, return `200 OK` immediately without enqueuing a duplicate BullMQ job.

3. **Data Ingestion & Normalization Pipeline (`ingestion.service.ts`):**
   When `/api/v1/internal/scans/:id/complete` receives worker results (verified via internal HMAC signature):
   * Run inside a MongoDB session transaction.
   * Pass all incoming finding evidence through `RedactionEngine` as a defense-in-depth boundary check.
   * Upsert canonical records in `findings` by `{ organization_id, repository_id, fingerprint }`, bumping `last_seen_at` and `last_detected_scan_id`.
   * Insert immutable per-scan link records into `scan_findings`.
   * Evaluate organization and repository policies via `PolicyEngine` from `packages/scan-core`.
   * Update the `scans` document with `execution_status`, `policy_outcome`, `summary`, and `policy_decision`.
   * Trigger `GitHubChecksService` to publish the Check Run conclusion (`success` only if `policy_outcome === 'passed'`; `failure` for `'policy_failed'` or `'incomplete'`).

4. **RFC 7807 Error Envelope (`error.middleware.ts`):**
   Format all HTTP errors using the exact structure from `06-data-model-and-api-specification.md` Section 4.3 (`INVALID_ARGUMENT`, `UNAUTHENTICATED`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `RESOURCE_CONFLICT`, `POLICY_VIOLATION`, `RATE_LIMITED`, `INTERNAL_ERROR`).

#### 9.3 Step 9 Verification Gate
Write integration tests in `apps/api/test/api.integration.test.ts` (using `mongodb-memory-server` and `ioredis-mock`):
1. **IDOR / Tenant Isolation Test:** Prove that a valid JWT for `Org A` querying or mutating `Org B`'s repository, scan, finding, or policy receives `404 RESOURCE_NOT_FOUND`.
2. **Webhook Replay Test:** Send the same `X-GitHub-Delivery` payload twice and assert only 1 scan job is enqueued.
3. **HMAC Tamper Test:** Modify 1 byte of the webhook body and assert `401 UNAUTHORIZED`.

---

### STEP 10: Isolated Scan Worker, React Dashboard & DevOps (`apps/worker`, `apps/web`, `infra`)

#### 10.1 Files to Create
* `apps/worker/src/workspace-sandbox.ts`
* `apps/worker/src/scan-job.processor.ts`
* `apps/worker/src/worker.ts`
* `apps/web/src/App.tsx` & pages/components
* `docker-compose.yml` & `Dockerfile`
* `.github/workflows/ci.yml`

#### 10.2 Implementation Logic

1. **Isolated Worker Service (`apps/worker`):**
   * Connect to Redis `scan_jobs` queue via BullMQ.
   * For each job (`scan_id`, `repository_id`, `commit_sha`, `installation_id`):
     1. Create an ephemeral workspace directory under `/tmp/shipshield-work-<scan_id>` with `0o700` permissions.
     2. Mint a short-lived GitHub App installation token and perform a shallow fetch of the exact `commit_sha` (`git init`, `git remote add`, `git fetch --depth 1 origin <commit_sha>`, `git checkout FETCH_HEAD`) using `ProcessRunner` (`shell: false`, `--config protocol.file.allow=never`, `--no-recurse-submodules`).
     3. Immediately revoke/discard the installation token from memory before running scanners.
     4. Execute `ScanOrchestrator` from `packages/scan-core`.
     5. Sign the normalized result payload with `WORKER_INTERNAL_HMAC_SECRET` and `POST` to `/api/v1/internal/scans/:id/complete`.
     6. Tear down `/tmp/shipshield-work-<scan_id>` via `fs.rmSync(workspaceDir, { recursive: true, force: true })` inside a `finally` block.

2. **Web Dashboard (`apps/web`):**
   * Build with React 18, Vite, and Tailwind CSS.
   * Implement 4 core views:
     * `RepositoriesPage`: Connect GitHub repositories and view latest gate status (`PASSED`, `POLICY FAILED`, `INCOMPLETE`).
     * `ScanHistoryPage`: Chronological scan table showing commit SHA, branch, duration, scanner completion badges, and severity breakdown.
     * `ScanDetailPage`: Filterable findings table with accessible severity badges (text + icon + color), redacted evidence viewer, remediation instructions, and time-bounded suppression modal (requiring justification and expiry date).
     * `PolicySettingsPage`: Configure `fail_on_severities` and `fail_on_incomplete`.

3. **Docker & CI/CD (`docker-compose.yml` & `.github/workflows/ci.yml`):**
   * Configure multi-stage `Dockerfile` where the `worker` target installs pinned versions of `gitleaks`, `trivy`, and `checkov`, sets `USER node` (non-root), and configures a read-only root filesystem with `/tmp` mounted as `tmpfs`.
   * Configure `.github/workflows/ci.yml` to run ESLint, `tsc --noEmit`, `vitest run --coverage` (enforcing $\ge 85\%$ coverage), and dogfood `shipshield plan` on the repository itself.

---

## 4. Master Verification & Release Gate Checklist for the LLM

Before declaring the implementation complete, the AI coding agent **MUST** execute and pass all of the following verification commands:

```bash
# 1. Typecheck all packages and applications across the monorepo
npm run typecheck

# 2. Run linter with zero warnings allowed
npm run lint

# 3. Run unit, contract, security, and integration test suites with coverage gate (>= 85%)
npm run test:coverage

# 4. Build all packages and apps
npm run build

# 5. Verify CLI help and version run cleanly outside any project without creating files
node apps/cli/dist/index.js --version
node apps/cli/dist/index.js --help

# 6. Run Golden Fixture Verification Suite
# 6a. Clean fixture -> MUST exit with code 0
node apps/cli/dist/index.js --project-dir ./fixtures/clean-project plan

# 6b. Seeded synthetic secrets -> MUST exit with code 1 AND contain 0% raw secret literals in report
node apps/cli/dist/index.js --project-dir ./fixtures/seeded-secrets plan
! grep -rn "AKIAIOSFODNN7EXAMPLE" ./fixtures/seeded-secrets/.shipshield/reports/

# 6c. Dry-run remediation -> MUST NOT mutate target files (SHA-256 parity check)
sha256sum ./fixtures/unsafe-docker/Dockerfile > /tmp/before.sha
node apps/cli/dist/index.js --project-dir ./fixtures/unsafe-docker fix --all --dry-run
sha256sum -c /tmp/before.sha
```

### Final Self-Audit Questions for the Implementing Agent
1. Did any adapter or utility import `exec` or set `shell: true`? *(Must be No)*
2. Can a missing scanner binary or corrupted JSON output ever return Exit Code `0`? *(Must be No — always returns Exit Code `4` / `incomplete`)*
3. Can a raw credential ever reach `JSON.stringify`, `console.log`, or MongoDB? *(Must be No — `RedactionEngine` runs prior to fingerprinting and serialization)*
4. Can `shipshield fix` modify a file without `--apply`? *(Must be No)*
5. Does every API query include `organization_id` from the authenticated session context? *(Must be Yes)*