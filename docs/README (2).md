# ShipShield

> **Plan security changes. Fix safely. Verify before shipping.**

ShipShield is a CLI-first DevSecOps security gate with a web dashboard
for teams. It helps developers detect and remediate common security
problems in source repositories and infrastructure-as-code before
changes reach production.

The product combines established scanners with a consistent workflow for
discovery, findings, policy evaluation, remediation planning,
verification, CI/CD enforcement, and team reporting. It is **not**
intended to replace dedicated security platforms or claim that a scan
proves a system is secure.

> **Documentation status:** This README defines the target architecture
> and implementation contract. Items marked **Planned** or **Future**
> are design goals, not claims that functionality already exists. Update
> the implementation status as the repository evolves.

------------------------------------------------------------------------

## Table of contents

-   [1. Product vision](#1-product-vision)
-   [2. Goals and non-goals](#2-goals-and-non-goals)
-   [3. Core principles](#3-core-principles)
-   [4. Users and use cases](#4-users-and-use-cases)
-   [5. Feature scope](#5-feature-scope)
-   [6. CLI user experience](#6-cli-user-experience)
-   [7. End-to-end workflows](#7-end-to-end-workflows)
-   [8. System architecture](#8-system-architecture)
-   [9. Repository structure](#9-repository-structure)
-   [10. Technology stack](#10-technology-stack)
-   [11. Component responsibilities](#11-component-responsibilities)
-   [12. Scanner integrations](#12-scanner-integrations)
-   [13. Findings and data contracts](#13-findings-and-data-contracts)
-   [14. Data model](#14-data-model)
-   [15. API design](#15-api-design)
-   [16. Configuration](#16-configuration)
-   [17. Remediation design](#17-remediation-design)
-   [18. Policy engine and exit codes](#18-policy-engine-and-exit-codes)
-   [19. GitHub integration](#19-github-integration)
-   [20. Security architecture and threat
    model](#20-security-architecture-and-threat-model)
-   [21. Reliability and failure
    handling](#21-reliability-and-failure-handling)
-   [22. Testing strategy](#22-testing-strategy)
-   [23. CI/CD and release
    engineering](#23-cicd-and-release-engineering)
-   [24. Deployment architecture](#24-deployment-architecture)
-   [25. Observability and operations](#25-observability-and-operations)
-   [26. Performance and scalability](#26-performance-and-scalability)
-   [27. Backup, recovery, and data
    lifecycle](#27-backup-recovery-and-data-lifecycle)
-   [28. Accessibility and user
    experience](#28-accessibility-and-user-experience)
-   [29. Development roadmap](#29-development-roadmap)
-   [30. Definition of done](#30-definition-of-done)
-   [31. Risks and mitigations](#31-risks-and-mitigations)
-   [32. Glossary](#32-glossary)
-   [33. References](#33-references)

------------------------------------------------------------------------

## 1. Product vision

ShipShield gives developers a repeatable way to ask:

1.  What security problems exist in this project?
2.  Which problems matter most and why?
3.  What is the safest available remediation?
4.  What will change if I apply that remediation?
5.  Did the fix actually resolve the finding?
6.  Should this change be allowed through CI/CD policy?

The intended developer experience is inspired by the predictability of
infrastructure planning workflows:

``` text
Discover → Plan → Review → Fix → Verify → Enforce
```

The CLI is the primary local developer interface. The web application
provides shared repository management, team policies, scan history,
auditability, and GitHub integration.

## 2. Goals and non-goals

### Goals

-   Scan source repositories for accidental secrets.
-   Detect known vulnerabilities in supported dependencies and
    artifacts.
-   Identify common Dockerfile and container-image risks.
-   Detect supported Terraform and infrastructure-as-code
    misconfigurations.
-   Normalize scanner output into one consistent finding format.
-   Explain findings in understandable language with actionable
    remediation guidance.
-   Save machine-readable and human-readable reports in a
    project-specific directory.
-   Offer carefully scoped, reviewable fixes for supported findings.
-   Verify remediation by re-running the relevant checks.
-   Integrate with GitHub pull requests and CI pipelines.
-   Support team policies, audit history, and centralized reporting.
-   Operate with least privilege and treat repository content as
    untrusted input.

### Non-goals

The initial release will not:

-   Guarantee that a repository or deployed system is secure.
-   Replace SAST, DAST, penetration testing, cloud security posture
    management, or a full vulnerability management platform.
-   Invent vulnerabilities or fixes using an LLM without evidence and
    validation.
-   Automatically deploy Terraform changes or mutate cloud
    infrastructure.
-   Execute arbitrary repository scripts as part of a default scan.
-   Promise automatic fixes for every finding.
-   Store raw secrets or expose full sensitive scanner output in logs.
-   Require a hosted account for basic local CLI scanning.

## 3. Core principles

1.  **Read-only planning:** `shipshield plan` does not modify project
    source files.
2.  **Explicit remediation:** source changes happen through `fix`, with
    preview and approval by default.
3.  **Verification over assertion:** a fix is not marked resolved until
    a subsequent scan supports that conclusion.
4.  **Fail visibly:** scanner errors, incomplete scans, and policy
    violations are distinct outcomes.
5.  **Least privilege:** GitHub permissions, API roles, cloud
    permissions, and worker capabilities are minimized.
6.  **Untrusted input:** repository files, archives, manifests,
    Dockerfiles, Terraform, and pull-request metadata may be malicious.
7.  **Reproducibility:** record the commit/revision, scanner versions,
    configuration version, and scan timestamps where available.
8.  **Evidence-based findings:** preserve rule IDs and useful file/line
    references while redacting secrets.
9.  **Portable output:** reports should work locally and be usable by CI
    systems and the web dashboard.
10. **Secure defaults:** no privileged container, Docker socket mount,
    unrestricted worker egress, or automatic infrastructure apply.
11. **Clear limitations:** disclose unsupported files, failed scanners,
    partial coverage, and stale results.
12. **Small modules:** scanner adapters, normalization, policy
    evaluation, remediation, and presentation are separate concerns.

## 4. Users and use cases

### Individual developer

-   Run `shipshield init` in a repository.
-   Scan before opening a pull request.
-   Inspect findings and generate reports.
-   Apply a supported fix and verify it locally.

### Repository maintainer

-   Require scans in pull requests.
-   Block merges for policy-defined findings.
-   Review new, recurring, fixed, and suppressed findings.
-   Configure justified exceptions with an expiry date.

### Organization administrator

-   Connect GitHub repositories.
-   Define organization-level policies and membership.
-   Review audit events, scan status, and cross-repository trends.
-   Manage app installation and revoke access.

### CI/CD system

-   Execute a deterministic scan.
-   Consume JSON output and process exit codes.
-   Fail a job when policy is violated or a required scan cannot be
    completed, according to configured policy.

## 5. Feature scope

### MVP

-   TypeScript CLI with `init`, `plan`, `show`, `report`, and `verify`.
-   Gitleaks, Trivy, and Checkov adapters.
-   Project-specific `.shipshield/` configuration and reports.
-   Common finding schema and severity normalization.
-   Policy evaluation and documented exit codes.
-   Basic React dashboard and Express API.
-   MongoDB persistence for hosted scan history.
-   Background worker and queue for hosted scans.
-   Unit, integration, fixture, and end-to-end tests.
-   Docker-based local development.
-   GitHub Actions workflow for ShipShield's own quality checks.

### After the first working MVP

-   `fix --dry-run` and a small set of deterministic fix handlers.
-   GitHub App installation and pull-request checks.
-   Finding suppression with justification and expiry.
-   Organization roles, audit events, and policy management.
-   HTML report output and report comparisons.
-   Signed release artifacts and provenance.
-   Additional scanners and artifact types.

### Future capabilities

-   SBOM generation and policy checks.
-   Container-image scanning.
-   Scheduled scans and notifications.
-   Cloud configuration checks beyond Terraform files.
-   Enterprise identity integration.
-   Additional source-control providers.
-   Optional AI-assisted explanations, strictly separated from
    authoritative scanner evidence and never trusted to apply changes
    without deterministic validation.

------------------------------------------------------------------------

## 6. CLI user experience

### Command reference

  ---------------------------------------------------------------------------------
  Command                        Purpose                      Changes source files?
  ------------------------------ --------------------- ----------------------------
  `shipshield --help`            Show help                                       No

  `shipshield version`           Show CLI and                                    No
                                 component versions    

  `shipshield init`              Detect project and    Creates `.shipshield/` files
                                 create configuration                          only

  `shipshield plan`              Run scans, evaluate                             No
                                 policies, save a plan 

  `shipshield show`              Display latest                                  No
                                 findings              

  `shipshield show SS-001`       Display one finding                             No

  `shipshield report`            Export JSON or                 Writes report files
                                 Markdown report       

  `shipshield fix --dry-run`     Preview supported                               No
                                 changes               

  `shipshield fix SS-001`        Apply a supported,      Yes, only documented files
                                 approved fix          

  `shipshield verify`            Re-scan and verify                              No
                                 remediation           

  `shipshield policy validate`   Validate policy                                 No
                                 configuration         

  `shipshield policy list`       List effective                                  No
                                 policies              

  `shipshield ignore SS-001`     Create a documented           Changes config after
                                 suppression                           confirmation

  `shipshield auth login`        Authenticate to the   Writes credentials to secure
                                 hosted service                       local storage

  `shipshield scan --remote`     Request a hosted scan        No local source edits
  ---------------------------------------------------------------------------------

Exact syntax may evolve. Preserve backward compatibility once a command
is released.

### Example workflow

``` bash
cd MobileMart

# Initialize local configuration
shipshield init

# Scan the current project and generate a plan
shipshield plan

# Review all findings or one finding
shipshield show
shipshield show SS-001

# Preview a supported fix
shipshield fix SS-001 --dry-run

# Apply only after reviewing the preview
shipshield fix SS-001

# Re-scan to verify the result
shipshield verify

# Generate a shareable report
shipshield report --format markdown
```

### Example output (illustrative)

``` text
ShipShield — Security plan
Project: MobileMart
Revision: 2a4d8c1
Coverage: secrets, dependencies, Dockerfile, Terraform

CRITICAL  1
HIGH      2
MEDIUM    3
LOW       1

ID       SEVERITY  CATEGORY       LOCATION
SS-001   CRITICAL  Secret         config/example.env:12
SS-002   HIGH      Dependency     package-lock.json
SS-003   MEDIUM    Docker         Dockerfile:8

Plan: .shipshield/reports/MobileMart/plan.json
Status: POLICY VIOLATIONS FOUND
```

This sample output is illustrative, not a claim about current scan
results.

### Project-local file layout

``` text
project/
├── .shipshield/
│   ├── config.yaml
│   ├── ignore.yaml
│   ├── reports/
│   │   └── <project-name>/
│   │       ├── latest.json
│   │       ├── plan.json
│   │       ├── plan.md
│   │       └── history/
│   └── fixes/
│       └── history.json
└── application files...
```

Requirements:

-   The project root must be resolved deterministically.
-   Prefer an explicit `--project` name when detection is ambiguous.
-   Validate project names before using them in paths.
-   Prevent path traversal and symlink escapes.
-   Keep generated files out of source directories.
-   Avoid storing raw credentials, complete secret values, or
    unnecessary source contents in reports.
-   Add report files to `.gitignore` only according to documented
    defaults; users must be able to choose whether sanitized reports are
    committed.
-   Use atomic writes for report updates and preserve previous valid
    reports if a scan crashes.

------------------------------------------------------------------------

## 7. End-to-end workflows

### 7.1 Local scan and remediation

``` mermaid
flowchart TD
    A[Developer runs shipshield plan] --> B[Resolve project root and config]
    B --> C[Discover supported files]
    C --> D[Validate configuration and tool availability]
    D --> E[Run enabled scanner adapters]
    E --> F[Normalize and redact findings]
    F --> G[Evaluate policy]
    G --> H[Write JSON and Markdown reports]
    H --> I[Display summary and exit code]
    I --> J[Developer reviews a finding]
    J --> K[shipshield fix --dry-run]
    K --> L{Approved and safely supported?}
    L -- No --> M[Explain manual remediation]
    L -- Yes --> N[Apply narrow patch]
    N --> O[Run relevant tests and scanners]
    O --> P{Finding resolved?}
    P -- Yes --> Q[Record verified outcome]
    P -- No --> R[Report unresolved or partial result]
```

### 7.2 Hosted GitHub pull-request scan

``` mermaid
sequenceDiagram
    actor Dev as Developer
    participant GH as GitHub
    participant API as ShipShield API
    participant Q as Job Queue
    participant W as Isolated Worker
    participant DB as MongoDB

    Dev->>GH: Open or update pull request
    GH->>API: Signed webhook event
    API->>API: Verify signature, event, installation and permissions
    API->>DB: Record event and create scan metadata
    API->>Q: Enqueue idempotent scan job
    API-->>GH: Acknowledge webhook promptly
    Q->>W: Deliver job
    W->>W: Fetch exact revision and run scanners
    W->>DB: Persist normalized results
    W->>API: Publish completion status
    API->>GH: Create/update Check Run
    Dev->>GH: Review findings and check status
```

Webhook processing must be idempotent. A repeated event must not create
uncontrolled duplicate scans or duplicate comments. The worker must scan
the intended commit SHA, not whatever happens to be the repository's
latest branch head later.

### 7.3 Scan state machine

``` mermaid
stateDiagram-v2
    [*] --> Queued
    Queued --> Running
    Queued --> Cancelled
    Running --> Completed
    Running --> PolicyFailed
    Running --> Failed
    Running --> TimedOut
    Running --> Cancelled
    Failed --> Queued: Retry if retryable
    TimedOut --> Queued: Retry if retryable
    Completed --> [*]
    PolicyFailed --> [*]
    Failed --> [*]
    TimedOut --> [*]
    Cancelled --> [*]
```

A completed scan can still contain policy violations. `Completed`
describes execution; `PolicyFailed` describes a policy decision after a
successful scan. Keep execution status and policy status separate in the
data model even if the CLI presents a combined summary.

------------------------------------------------------------------------

## 8. System architecture

### 8.1 High-level context diagram

``` mermaid
flowchart LR
    Dev[Developer] --> CLI[ShipShield CLI]
    Maint[Repository Maintainer] --> Web[ShipShield Web UI]
    GH[GitHub] -->|Webhooks and API| API[ShipShield API]
    CLI --> Core[Shared TypeScript Core]
    Web --> API
    API --> Queue[Job Queue]
    Queue --> Worker[Isolated Scan Workers]
    Worker --> Tools[Gitleaks / Trivy / Checkov]
    Core --> Tools
    Core --> Reports[Local JSON / Markdown Reports]
    Worker --> DB[(MongoDB)]
    API --> DB
    API --> GH
```

### 8.2 Hosted deployment components

``` mermaid
flowchart TB
    Internet((Internet)) --> Edge[HTTPS ingress / load balancer]
    Edge --> Web[Static frontend]
    Edge --> API[Express API replicas]
    API --> DB[(Managed MongoDB)]
    API --> Redis[(Redis / queue)]
    Redis --> Workers[Restricted worker pool]
    Workers --> GitHub[GitHub API]
    Workers --> Scanner[Scanner binaries]
    API --> Secrets[Secret manager]
    API --> Telemetry[Logs / metrics / traces]
    Workers --> Telemetry
```

The web application and API are internet-facing only where necessary.
Scanner workers should be isolated from the public ingress path and
should not have broad cloud permissions. The queue and database should
be private network services.

### 8.3 Architectural boundaries

-   **CLI layer:** parses commands, validates options, renders terminal
    output, selects exit codes.
-   **Core layer:** discovers files, invokes adapters, normalizes
    findings, evaluates policies, plans fixes, writes reports.
-   **API layer:** authenticates users, authorizes resources, manages
    integrations, queues remote work, exposes reports.
-   **Worker layer:** performs bounded asynchronous scans in restricted
    execution environments.
-   **Persistence layer:** stores users, organizations, repositories,
    scan metadata, findings, policies, and audit events.
-   **Integration layer:** wraps GitHub and scanner-specific behavior
    behind interfaces.

The core must not depend on Express request/response objects or terminal
formatting. This allows local and hosted execution to share behavior
without coupling.

------------------------------------------------------------------------

## 9. Repository structure

Recommended TypeScript monorepo:

``` text
shipshield/
├── apps/
│   ├── cli/
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   ├── terminal/
│   │   │   ├── config/
│   │   │   └── index.ts
│   │   ├── tests/
│   │   └── package.json
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   ├── services/
│   │   │   ├── repositories/
│   │   │   ├── integrations/github/
│   │   │   └── app.ts
│   │   └── package.json
│   ├── worker/
│   │   ├── src/
│   │   │   ├── jobs/
│   │   │   ├── sandbox/
│   │   │   └── worker.ts
│   │   └── package.json
│   └── web/
│       ├── src/
│       └── package.json
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── discovery/
│   │   │   ├── scanners/
│   │   │   ├── findings/
│   │   │   ├── policies/
│   │   │   ├── remediation/
│   │   │   ├── verification/
│   │   │   └── reports/
│   │   └── package.json
│   ├── schemas/
│   │   ├── src/
│   │   └── package.json
│   └── config/
├── tests/
│   ├── fixtures/
│   │   ├── secrets/
│   │   ├── dependencies/
│   │   ├── docker/
│   │   └── terraform/
│   ├── integration/
│   └── e2e/
├── deploy/
│   ├── docker/
│   ├── terraform/
│   └── kubernetes/
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── threat-model/
│   ├── runbooks/
│   └── api/
├── .github/
│   └── workflows/
├── package.json
├── package-lock.json
├── tsconfig.base.json
└── README.md
```

This is a target structure. Start with the CLI, core, schemas, API, and
web packages that the current milestone needs. Do not create empty
modules just to match the diagram.

### Module dependency rule

``` mermaid
flowchart TD
    CLI[CLI] --> Core[Core]
    Worker[Worker] --> Core
    API[API] --> Schemas[Shared Schemas]
    Core --> Schemas
    Web[Web UI] --> API
    Core -. must not depend on .-> API
    Core -. must not depend on .-> CLI
```

The core and schemas are reusable libraries. CLI terminal output, web UI
components, HTTP routes, and database implementation details stay
outside the core.

------------------------------------------------------------------------

## 10. Technology stack

  -----------------------------------------------------------------------
  Area                    Recommended technology  Reason
  ----------------------- ----------------------- -----------------------
  CLI                     Node.js + TypeScript    Familiar ecosystem and
                                                  shared types

  Command parsing         Commander.js            Subcommands and help
                                                  generation

  Runtime validation      Zod                     Validate configuration
                                                  and cross-boundary data

  Terminal output         Chalk and a table       Readable, color-aware
                          library                 output

  Web frontend            React, Vite, Tailwind   Fast development and
                          CSS                     reusable UI

  API                     Node.js + Express +     REST API and
                          TypeScript              integration endpoints

  Database                MongoDB                 Flexible scan and
                                                  finding documents

  Queue                   Redis + BullMQ          Asynchronous work,
                                                  retries, concurrency
                                                  limits

  Scanners                Gitleaks, Trivy,        Established specialized
                          Checkov                 scanning engines

  GitHub integration      GitHub App and Checks   Installation-scoped
                          API                     permissions and PR
                                                  feedback

  Local services          Docker Compose          Reproducible
                                                  development environment

  Testing                 Vitest plus API and     Unit-to-system
                          browser E2E tests       verification

  CI/CD                   GitHub Actions          Build, test, scan,
                                                  release

  Infrastructure          Terraform               Reproducible cloud
                                                  provisioning

  Deployment              Managed containers      Reduce initial
                          initially; Kubernetes   operational burden
                          when justified          

  Telemetry               Structured logs,        Debugging and
                          metrics, traces         operational insight
  -----------------------------------------------------------------------

Pin and test supported scanner versions. Scanner output formats can
change; adapters must validate output and fail visibly when the format
is unsupported.

------------------------------------------------------------------------

## 11. Component responsibilities

### CLI command handlers

Each command should be thin:

1.  Parse and validate arguments.
2.  Resolve the project root and configuration.
3.  Call core services.
4.  Render the result.
5.  Return the documented exit code.

Command handlers should not contain scanner parsing or remediation
logic.

### Project discovery

-   Detect project roots using explicit path, Git root, or known
    manifests.
-   Support monorepos and nested projects deliberately.
-   Allow users to exclude directories.
-   Avoid following symlinks outside the project root.
-   Never treat a detected language as proof that all relevant files
    were scanned.

### Scanner adapter contract

Each adapter should expose a consistent interface, conceptually:

``` ts
interface ScannerAdapter {
  id: string;
  detect(context: ProjectContext): Promise<DetectionResult>;
  scan(context: ScanContext): Promise<ScannerExecutionResult>;
  parse(
    result: ScannerExecutionResult
  ): Promise<NormalizedFinding[]>;
}
```

The real implementation should use validated shared schemas, typed
errors, cancellation, timeouts, and explicit supported-version checks.
Avoid accepting arbitrary shell command strings from configuration.

### Policy engine

The policy engine receives normalized findings and configuration and
returns a deterministic decision. It must not run scanners or edit
source files.

### Remediation engine

The remediation engine maps a finding/rule to an explicitly registered
fix handler. If no safe handler exists, it returns a manual remediation
recommendation.

### Report writer

-   Emit versioned JSON and readable Markdown.
-   Write atomically.
-   Redact secret values.
-   Include scan coverage, skipped checks, errors, tool versions, and
    policy outcome.
-   Keep stable schemas for CI consumption.

------------------------------------------------------------------------

## 12. Scanner integrations

### Gitleaks --- secret detection

Use Gitleaks to detect likely secrets in supported repository content
and, where configured, Git history.

Requirements:

-   Never print complete matched secret values.
-   Treat a detected credential as potentially compromised until
    investigated.
-   Recommend revocation/rotation and removal from the relevant history
    when applicable.
-   Do not claim deleting a value from the current file revokes it.
-   Clearly document whether the scan covered working files, staged
    files, or Git history.

### Trivy --- vulnerabilities and artifact scanning

Use Trivy for supported dependency manifests, lockfiles, container
images, and other supported artifacts.

Requirements:

-   Report advisory identifiers and installed/fixed versions when
    available.
-   Preserve scanner database timestamps and tool version where
    available.
-   Distinguish no known vulnerabilities from scanner/database failure.
-   Do not blindly upgrade packages across breaking-version boundaries.
-   Use an explicit, opt-in process for image builds; do not execute
    arbitrary project build scripts by default.

### Checkov --- infrastructure-as-code

Use Checkov to identify supported Terraform and other configured IaC
misconfigurations.

Requirements:

-   Report policy/check ID, resource address, file and line where
    available.
-   Explain the security consequence and safe configuration direction.
-   Do not run `terraform apply`.
-   Treat Terraform plan files as potentially sensitive.
-   Avoid collecting cloud credentials; static IaC scanning should not
    need cloud administrator access.

### Dockerfile and container checks

Use established scanner capabilities where suitable, and add narrow
ShipShield rules only where there is a clear gap and tests can prove the
rule. Examples include root-user configuration, unsafe privilege
settings, and risky package/image practices.

### Scanner execution contract

For every scanner:

-   Use a fixed executable path or controlled lookup.
-   Pass arguments as an argument array, never concatenate untrusted
    data into a shell command.
-   Set timeout, memory, CPU, output-size, and concurrency limits.
-   Capture stdout/stderr with bounded buffers.
-   Validate exit status and output schema.
-   Distinguish findings from execution errors.
-   Record scanner name/version and coverage.
-   Terminate child processes on cancellation or timeout.
-   Never assume exit code zero always means a clean scan or non-zero
    always means a scanner crash; implement tool-specific semantics.

------------------------------------------------------------------------

## 13. Findings and data contracts

All scanners should normalize into a common schema. Example TypeScript
model:

``` ts
type Severity = "critical" | "high" | "medium" | "low" | "info";
type FindingStatus =
  | "open"
  | "fixed"
  | "suppressed"
  | "accepted-risk"
  | "false-positive";

interface Finding {
  id: string;                 // Stable ShipShield ID within its defined scope
  fingerprint: string;        // Deduplication identity
  ruleId: string;              // Original scanner/rule identifier
  scanner: string;
  category: "secret" | "dependency" | "docker" | "iac" | "other";
  severity: Severity;
  title: string;
  description: string;
  remediation?: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  packageName?: string;
  installedVersion?: string;
  fixedVersion?: string;
  advisoryIds?: string[];
  evidenceRedacted?: string;
  status: FindingStatus;
}
```

This is illustrative; validate the final schema and add explicit schema
versioning.

### Finding identity

Do not use a database ID alone as a stable finding identity. Use a
deterministic fingerprint derived from carefully chosen attributes such
as scanner/rule ID, normalized path, package/resource identity, and
relevant location. Avoid including secret contents in fingerprints.

Finding identity must balance stability with avoiding accidental merging
of distinct issues. Version the fingerprint strategy and support
migration if it changes.

### Finding lifecycle

``` mermaid
stateDiagram-v2
    [*] --> Open
    Open --> Fixed: Later scan confirms absent
    Open --> Suppressed: Approved exception
    Open --> AcceptedRisk: Authorized risk decision
    Suppressed --> Open: Exception expires or is revoked
    AcceptedRisk --> Open: Risk decision expires or is revoked
    Fixed --> Open: Issue reappears
```

A finding absent from one scan is not necessarily fixed if coverage
changed or the scanner failed. Compare compatible scan scopes and record
the evidence for a state transition.

### Severity and risk

Keep original scanner severity alongside ShipShield's normalized
severity. Severity is not the same as exploitability or business risk.
Future prioritization may consider exposure, asset criticality,
reachability, fix availability, and confidence---but should explain how
any score was derived.

------------------------------------------------------------------------

## 14. Data model

Core hosted entities:

  -------------------------------------------------------------------------------
  Entity                  Purpose                     Important relationships
  ----------------------- --------------------------- ---------------------------
  `User`                  Account and identity        Organization memberships
                          reference                   

  `Organization`          Tenant boundary             Members, repositories,
                                                      policies

  `Membership`            Role within an organization User + organization

  `Repository`            Connected source repository Organization, installation

  `Installation`          GitHub App installation     Organization/repositories
                          metadata                    

  `Scan`                  One execution against a     Repository, findings
                          revision                    

  `Finding`               Normalized security issue   Scan and stable fingerprint

  `Policy`                Configurable blocking rules Organization or repository

  `Suppression`           Time-bounded exception      Finding/rule, actor,
                                                      justification

  `FixOperation`          Remediation attempt and     Finding, scan, actor
                          result                      

  `AuditEvent`            Security-relevant action    Actor and target resource
                          record                      

  `WebhookEvent`          Deduplication/idempotency   Provider event ID
                          record                      
  -------------------------------------------------------------------------------

### Tenant isolation

Every tenant-owned document must carry an organization/tenant scope
where appropriate. Authorization must be enforced server-side on every
read and write. Never rely on a UI filter to isolate tenants.

### Suggested indexes

-   Unique provider repository ID within the provider's identity scope.
-   Unique GitHub installation ID where applicable.
-   `(organizationId, createdAt)` for repository and audit queries.
-   `(repositoryId, createdAt)` for scan history.
-   `(scanId, severity)` for finding lists.
-   `(organizationId, fingerprint)` or an equivalent scoped identity
    index where the lifecycle model requires it.
-   Unique provider webhook event ID for idempotency.
-   TTL indexes only for records whose retention policy explicitly
    permits automatic expiry.

Index design must follow real query patterns and be validated against
expected workload. Avoid indexing every field by default.

### Data minimization

Store only what the product needs. Avoid storing full source code, full
Git diffs, raw credentials, or unrestricted scanner output by default.
Define retention, deletion, export, and tenant offboarding behavior
before production launch.

------------------------------------------------------------------------

## 15. API design

Use versioned routes, consistent errors, input validation,
authentication, and resource-level authorization.

Example endpoints:

  ----------------------------------------------------------------------------------
  Method                  Route                              Purpose
  ----------------------- ---------------------------------- -----------------------
  `GET`                   `/api/v1/health/live`              Process liveness

  `GET`                   `/api/v1/health/ready`             Dependency readiness

  `GET`                   `/api/v1/repositories`             List authorized
                                                             repositories

  `POST`                  `/api/v1/repositories/connect`     Connect/register
                                                             repository

  `GET`                   `/api/v1/repositories/:id/scans`   List repository scans

  `POST`                  `/api/v1/repositories/:id/scans`   Request a scan

  `GET`                   `/api/v1/scans/:id`                Read scan status

  `GET`                   `/api/v1/scans/:id/findings`       List findings

  `GET`                   `/api/v1/findings/:id`             Read a finding

  `PATCH`                 `/api/v1/findings/:id/status`      Change permitted
                                                             workflow status

  `GET`                   `/api/v1/policies`                 List effective policies

  `PUT`                   `/api/v1/policies/:id`             Update authorized
                                                             policy

  `POST`                  `/api/v1/webhooks/github`          Receive GitHub webhooks

  `GET`                   `/api/v1/audit-events`             Read authorized audit
                                                             history
  ----------------------------------------------------------------------------------

### API requirements

-   Validate path parameters, query strings, and request bodies.
-   Enforce request-size limits and rate limits.
-   Use pagination for potentially large collections.
-   Return a correlation/request ID.
-   Use a consistent error envelope without stack traces or secrets.
-   Apply idempotency keys to client-triggered operations where retries
    could create duplicate work.
-   Authenticate webhook requests using the provider's signature
    mechanism and reject invalid signatures.
-   Acknowledge webhooks promptly and perform expensive work
    asynchronously.
-   Document routes with OpenAPI once the API surface stabilizes.
-   Do not expose internal worker endpoints publicly.

------------------------------------------------------------------------

## 16. Configuration

Example `.shipshield/config.yaml`:

``` yaml
version: 1

project:
  name: MobileMart

scan:
  secrets: true
  dependencies: true
  docker: true
  terraform: true
  timeoutSeconds: 300
  maxConcurrency: 2

paths:
  exclude:
    - node_modules/**
    - dist/**
    - coverage/**
    - .git/**

policy:
  failOn:
    - critical
    - high
  failOnIncompleteScan: true

reports:
  directory: .shipshield/reports
  formats:
    - json
    - markdown

remediation:
  requireApproval: true
  allowAutomaticFixes: false
```

The exact schema must be validated and versioned before release. Unknown
keys should produce clear warnings or errors rather than being silently
ignored.

Configuration requirements:

-   Merge built-in defaults, project configuration, explicit CLI flags,
    and organization policy in a documented precedence order.
-   Define which policy settings cannot be weakened by a repository.
-   Never put access tokens or private keys in the project
    configuration.
-   Resolve relative paths against a known project root.
-   Make effective configuration inspectable with a command such as
    `shipshield config show`, redacting sensitive fields.
-   Support schema migration and clear errors for unsupported versions.

------------------------------------------------------------------------

## 17. Remediation design

Remediation is a controlled subsystem, not an arbitrary text-replacement
feature.

### Fix workflow

1.  Load the finding and validate its fingerprint and source revision.
2.  Check whether a registered fix handler supports the rule and file
    type.
3.  Check repository cleanliness and avoid overwriting unrelated
    changes.
4.  Compute a proposed patch.
5.  Display the exact files and diff in dry-run mode.
6.  Obtain explicit approval.
7.  Re-check the preconditions and apply a narrow patch.
8.  Record the operation and resulting file hashes.
9.  Run relevant validation and scanner checks.
10. Report verified, partial, failed, or manual-remediation-required
    status.

### Fix handler contract

A fix handler should declare:

-   Supported rule IDs and versions.
-   Preconditions and expected source state.
-   Files it is allowed to modify.
-   A deterministic patch-generation function.
-   Validation commands or checks, with controlled execution.
-   Rollback or recovery guidance.
-   Known limitations and risk classification.

### Safe initial auto-fix candidates

Prefer low-risk, deterministic changes such as a narrowly scoped
configuration edit with a clear security property and a test. Package
upgrades can introduce breaking changes, so require compatibility checks
and tests. Credential rotation, access-policy redesign, and cloud
resource changes should initially be guidance-only workflows.

### Fix safety rules

-   Dry-run is the default for new or uncertain fix classes.
-   Never execute `terraform apply`.
-   Never run project scripts as root.
-   Do not overwrite user changes or ignore a dirty working tree without
    explicit, informed override.
-   Do not automatically delete files to silence findings.
-   Require a fresh scan or stale-plan check before applying a saved
    plan.
-   Treat fix plans as untrusted input when loaded from disk.
-   Keep an auditable record of what changed without storing secret
    contents.
-   Make rollback instructions clear; do not promise automatic rollback
    where it cannot be guaranteed.

------------------------------------------------------------------------

## 18. Policy engine and exit codes

### Policy evaluation

Policy evaluation must be deterministic and separate from scanner
execution. Inputs include normalized findings, scan coverage, policy
configuration, and any valid suppressions. Output includes a decision,
reasons, and the applicable rules.

Example policy:

-   Fail on critical or high findings.
-   Fail if a required scanner did not run.
-   Allow documented suppressions that have not expired.
-   Never treat scanner errors as a clean scan.
-   Optionally compare against the target branch to block only newly
    introduced findings.

A baseline or "new findings only" mode must not hide existing risk from
the full report. Always preserve visibility into the complete findings
set.

### Suggested CLI exit codes

Document exact numeric values in the CLI package and keep them stable.

    Exit code Meaning
  ----------- ---------------------------------------------
          `0` Command completed and policy passed
          `1` One or more policy violations were found
          `2` Invalid arguments or configuration
          `3` Scanner or execution error
          `4` Required scan incomplete or timed out
          `5` Remediation failed or could not be verified
          `6` Authentication or authorization failure
          `7` Internal/unexpected error

The exact scheme can be adjusted before the first public release. CI
integration must distinguish policy failure from execution failure.

------------------------------------------------------------------------

## 19. GitHub integration

Use a GitHub App for hosted repository integration instead of collecting
personal access tokens wherever possible.

### Permissions

Request the smallest permission set that supports the enabled features.
Repository contents read access may be required to scan source; Checks
write access is needed to publish check runs. Pull-request comment
permissions are only necessary if comments are enabled. Webhook
subscriptions should be limited to events that are actually used.

Reassess permissions whenever a feature is added. Document why each
permission is required.

### Webhook security

-   Verify the signature using the raw request body and configured
    webhook secret.
-   Reject invalid signatures.
-   Validate event type and repository/installation identity.
-   Persist a unique event ID for deduplication.
-   Do not trust webhook payload text as shell arguments or filesystem
    paths.
-   Handle replayed and out-of-order events safely.
-   Enqueue work and return promptly.
-   Re-check installation access before fetching a repository.
-   Handle app uninstall and permission revocation.

### Pull request behavior

-   Scan the exact head commit requested.
-   Publish a Check Run with a summary, status, and relevant
    annotations.
-   Update an existing check for the same commit where appropriate
    instead of spamming comments.
-   Limit annotations and output size.
-   Avoid publishing secret values or sensitive source excerpts.
-   Clearly distinguish a policy failure from a failed/incomplete scan.
-   Support cancellation or superseding of obsolete jobs when a pull
    request receives new commits.

------------------------------------------------------------------------

## 20. Security architecture and threat model

ShipShield handles untrusted source code and sensitive findings. Its own
security must be treated as a primary product feature.

### Assets to protect

-   GitHub App private key and webhook secret.
-   User sessions and authentication tokens.
-   Repository contents and private repository metadata.
-   Detected credentials and evidence snippets.
-   Organization policies and suppression decisions.
-   Scan results and audit events.
-   Cloud deployment credentials and signing keys.
-   Build and release infrastructure.

### Trust boundaries

``` mermaid
flowchart TB
    subgraph Untrusted
      Repo[Repository contents]
      PR[Pull request metadata]
      Archive[Downloaded archives]
    end
    subgraph ControlPlane[ShipShield control plane]
      API[Authenticated API]
      Queue[Validated job queue]
      DB[(Tenant-scoped database)]
    end
    subgraph Restricted[Restricted execution boundary]
      Worker[Unprivileged worker]
      Tools[Scanner processes]
      Temp[Ephemeral workspace]
    end
    Repo --> Worker
    PR --> API
    API --> DB
    API --> Queue
    Queue --> Worker
    Worker --> Temp
    Worker --> Tools
    Worker --> DB
```

### Threats and mitigations

  -----------------------------------------------------------------------
  Threat                              Mitigations
  ----------------------------------- -----------------------------------
  Malicious repository causes code    Do not execute project code by
  execution                           default; isolate scanner workers;
                                      use non-root users, restricted
                                      syscalls/capabilities, resource
                                      limits, and ephemeral workspaces

  Command injection                   Spawn fixed executables with
                                      argument arrays; validate all
                                      options; do not build shell strings
                                      from repository data

  Path traversal or malicious         Normalize paths, reject escapes,
  symlinks                            avoid following unsafe links, and
                                      confine writes to a verified root

  SSRF through repository-controlled  Do not fetch arbitrary URLs from
  URLs                                repository files; restrict egress
                                      and block metadata/private network
                                      destinations where appropriate

  Secret leakage in logs/reports      Redaction, bounded evidence,
                                      structured logging, secret-safe
                                      error handling, and test fixtures
                                      for redaction

  Cross-tenant data access            Tenant scoping, resource-level
                                      authorization, access-control
                                      tests, and careful database queries

  Forged GitHub webhook               HMAC/signature verification, event
                                      deduplication, installation checks

  Compromised worker                  Short-lived jobs, minimal
                                      credentials, no Docker socket, no
                                      broad cloud IAM role, restricted
                                      egress, ephemeral storage

  Denial of service                   Per-tenant quotas, queue limits,
                                      scan timeouts, file-size limits,
                                      concurrency controls, and API rate
                                      limiting

  Malicious fix or stale plan         Exact patch preview, source
                                      revision checks, precondition
                                      validation, approval, narrow file
                                      allowlist, and post-fix
                                      verification

  Dependency or build supply-chain    Lockfiles, dependency review,
  compromise                          pinned actions, image scanning,
                                      signed releases, provenance, and
                                      protected release workflows

  Audit log tampering                 Restrict write access, append-only
                                      application behavior, retention
                                      controls, and stronger external log
                                      storage for production
  -----------------------------------------------------------------------

### Worker isolation requirements

Containers are useful but are not automatically a complete security
boundary. For untrusted code scanning:

-   Run as non-root.
-   Use read-only root filesystems where feasible.
-   Drop unnecessary Linux capabilities.
-   Apply CPU, memory, PID, disk, and wall-clock limits.
-   Use a fresh workspace for every job and remove it afterward.
-   Do not mount the Docker socket or host filesystem.
-   Do not expose cloud instance credentials to workers.
-   Restrict outbound networking to what the job requires.
-   Keep scanner and OS packages patched.
-   Consider stronger sandboxing or separate disposable VMs for
    higher-risk workloads.
-   Separate the worker identity from the control-plane identity.

### Data protection

-   Use TLS for all network traffic.
-   Encrypt database, backup, and object storage at rest.
-   Keep keys and secrets in a managed secret store.
-   Rotate credentials and document incident revocation.
-   Redact findings and telemetry before persistence.
-   Define retention and deletion policies.
-   Record administrative and security-sensitive actions.
-   Avoid logging tokens, cookies, private keys, raw secret matches, or
    full request bodies containing sensitive data.

### Security response

Maintain an incident response procedure covering credential exposure,
worker compromise, cross-tenant access, vulnerable dependencies, and
compromised release artifacts. Include containment, token revocation,
evidence preservation, customer notification decisions, remediation, and
post-incident review.

------------------------------------------------------------------------

## 21. Reliability and failure handling

### Failure categories

-   Configuration invalid.
-   Scanner missing or unsupported version.
-   Scanner returned invalid output.
-   Scanner found policy violations.
-   Scanner timed out or was terminated.
-   Repository could not be fetched.
-   Queue or database unavailable.
-   GitHub rate limit or permission revoked.
-   Worker crashed or ran out of resources.
-   Report write failed.

Each failure should have a stable machine-readable code, human-readable
message, correlation ID where relevant, and retryability classification.

### Retry rules

-   Retry transient network and service failures with bounded
    exponential backoff and jitter.
-   Do not retry invalid configuration or unsupported formats
    indefinitely.
-   Make jobs idempotent.
-   Limit total attempts and define dead-letter handling.
-   Ensure duplicate job delivery cannot corrupt scan state.
-   Preserve partial results while marking coverage incomplete.
-   Never convert a failed required scanner into a pass.

### Graceful degradation

If one optional scanner fails, ShipShield may display partial findings,
but the report must clearly indicate incomplete coverage. Whether CI
fails depends on the explicit policy; secure default behavior should
fail when a required security check did not complete.

------------------------------------------------------------------------

## 22. Testing strategy

### Test layers

  ---------------------------------------------------------------------------------------
  Layer                               What to test
  ----------------------------------- ---------------------------------------------------
  Unit                                Config validation, path resolution, fingerprints,
                                      severity mapping, policy decisions, redaction

  Adapter contract                    Scanner invocation, supported output versions, exit
                                      status interpretation, malformed output

  Integration                         API + database, queue + worker, GitHub event
                                      handling

  Fixture                             Repositories with intentionally seeded secret
                                      patterns, vulnerable dependencies, unsafe
                                      Dockerfiles, and Terraform misconfigurations

  Security                            Path traversal, symlink escapes, command injection,
                                      SSRF, tenant isolation, webhook signature
                                      validation, secret leakage

  End-to-end                          `init → plan → show → fix dry-run → fix → verify`

  Reliability                         Timeouts, cancellation, worker crash, retry,
                                      duplicate event, database outage

  Compatibility                       Supported Node.js versions, Linux/macOS/Windows
                                      behavior where claimed

  Performance                         Large repositories, high finding counts,
                                      concurrency, report generation
  ---------------------------------------------------------------------------------------

### Fixture principles

-   Use fake credentials only; never commit real secrets into test
    fixtures.
-   Pin expected scanner behavior or normalize known version-specific
    differences.
-   Include clean fixtures and intentionally vulnerable fixtures.
-   Test false positives and exclusions.
-   Verify that secrets never appear in console output, reports,
    snapshots, or test failure messages.
-   Test both finding detection and the correct policy/exit-code result.

### Release quality gates

A release candidate should pass:

1.  Formatting, lint, type checking.
2.  Unit and adapter contract tests.
3.  Integration tests.
4.  End-to-end workflow tests.
5.  Dependency and container scanning.
6.  Secret scanning.
7.  Build reproducibility and package-content checks.
8.  Release artifact verification.

------------------------------------------------------------------------

## 23. CI/CD and release engineering

### ShipShield's own pipeline

``` mermaid
flowchart LR
    Push[Push / Pull Request] --> Format[Format, lint, typecheck]
    Format --> Unit[Unit tests]
    Unit --> Integration[Integration tests]
    Integration --> Security[Secret / dependency / IaC scans]
    Security --> Build[Build CLI, API, web and worker]
    Build --> E2E[End-to-end tests]
    E2E --> Gate{All required checks pass?}
    Gate -- No --> Stop[Fail pipeline]
    Gate -- Yes --> Artifact[Create versioned artifacts/images]
    Artifact --> Release[Protected release approval]
    Release --> Publish[Publish signed/provenanced release]
```

### Supply-chain requirements

-   Commit lockfiles and use reproducible installation commands.
-   Pin third-party CI actions to immutable commit SHAs where practical.
-   Use least-privilege CI permissions.
-   Separate pull-request validation from release publishing.
-   Do not expose publishing credentials to untrusted fork workflows.
-   Protect release tags and environments.
-   Generate an SBOM for shipped artifacts when feasible.
-   Sign release artifacts and container images where supported.
-   Publish checksums and provenance.
-   Keep a process for quickly revoking or replacing compromised
    releases.

### CLI distribution

Initial distribution can use an npm package with a documented supported
Node.js version. A later release may publish platform-specific binaries.
Test clean installation and upgrade behavior, verify packaged scanner
dependencies, and document whether scanners are bundled or must be
installed separately.

------------------------------------------------------------------------

## 24. Deployment architecture

### Development environment

Docker Compose can run:

-   API.
-   Web frontend.
-   MongoDB.
-   Redis.
-   Worker.
-   Optional local mail/telemetry services.

Use development-only credentials, non-production data, health checks,
and documented initialization steps. Never reuse local development
secrets in production.

### Production environment

A sensible initial production deployment:

-   HTTPS ingress or load balancer.
-   Static frontend hosting or a web container.
-   Multiple API replicas if needed.
-   Private managed MongoDB service.
-   Private managed Redis/queue.
-   Separate worker pool with restricted permissions.
-   Managed secret storage.
-   Central logs, metrics, and alerts.
-   Automated encrypted backups.
-   Terraform-managed infrastructure.

### Deployment progression

1.  Local Docker Compose.
2.  One small hosted environment with managed services.
3.  Staging environment that mirrors production security boundaries.
4.  Production with monitored API and isolated workers.
5.  Kubernetes only when scaling, scheduling, or isolation requirements
    justify its operational complexity.

### Infrastructure principles

-   Use separate development, staging, and production
    environments/accounts where possible.
-   Prefer private networking for data stores and workers.
-   Use workload identities or short-lived credentials over static keys.
-   Enforce TLS and encryption at rest.
-   Restrict inbound and outbound traffic.
-   Use infrastructure-as-code review and plan checks.
-   Never automatically apply a Terraform plan merely because ShipShield
    finds a recommended fix.
-   Define rollback and recovery procedures for infrastructure changes.

------------------------------------------------------------------------

## 25. Observability and operations

### Logs

Use structured JSON logs with fields such as:

-   timestamp
-   severity
-   service and version
-   environment
-   request/correlation ID
-   scan ID and job ID
-   scanner ID
-   duration and outcome
-   error code

Do not log secret values, access tokens, cookies, full source files, or
unrestricted scanner stdout/stderr.

### Metrics

Track:

-   scan count and outcomes
-   scan duration by scanner
-   queue depth and queue wait time
-   worker concurrency and resource usage
-   scanner timeout/error rate
-   incomplete scan rate
-   API latency and error rate
-   GitHub API rate-limit responses
-   database connection and query health
-   report-generation failures
-   fix attempts and verification outcomes

Avoid high-cardinality labels containing repository URLs, commit SHAs,
user IDs, or finding IDs unless a controlled observability system
specifically requires them.

### Alerts

Create actionable alerts for:

-   sustained queue backlog
-   repeated worker failures
-   elevated API errors or latency
-   database/queue unavailability
-   high incomplete-scan rate
-   authentication anomalies
-   suspected credential leakage
-   backup failures
-   expiring integration credentials or certificates

Write runbooks for each critical alert. Monitoring is incomplete if
nobody knows what action to take.

------------------------------------------------------------------------

## 26. Performance and scalability

-   Run scans asynchronously when they may exceed a short HTTP request.
-   Bound concurrency globally and per organization.
-   Use queue backpressure and per-tenant quotas.
-   Cache scanner binaries and vulnerability databases safely, not
    results without validating their cache key.
-   Key reproducible scan caching by commit, scanner version,
    configuration, and relevant database version.
-   Use pagination and indexes for findings/history.
-   Limit report and annotation sizes.
-   Support cancellation of obsolete scans.
-   Track duration per scanner to identify bottlenecks.
-   Scale workers independently from the API.
-   Consider artifact storage for large reports rather than oversized
    database documents.

Do not add microservices solely for fashion. Begin with clear module
boundaries and a small number of deployable services, then split
components when a measurable operational need appears.

------------------------------------------------------------------------

## 27. Backup, recovery, and data lifecycle

Define:

-   Database backup frequency and retention.
-   Encryption and access restrictions for backups.
-   Recovery point objective (RPO) and recovery time objective (RTO).
-   Regular restore tests.
-   Data deletion when an organization disconnects or leaves.
-   Retention for scans, findings, audit events, and webhook records.
-   Retention of fix history and suppression decisions.
-   Handling of user export and deletion requests.
-   Cleanup of temporary workspaces and expired artifacts.

Do not claim disaster recovery is ready until restoration has been
tested. Set RPO/RTO targets based on product requirements rather than
guessing that a particular backup schedule is sufficient.

------------------------------------------------------------------------

## 28. Accessibility and user experience

### CLI

-   Provide clear help and examples.
-   Support non-interactive CI usage.
-   Do not require color to understand status.
-   Use stable exit codes and JSON output.
-   Explain errors and next steps.
-   Send progress messages to stderr when stdout is reserved for
    machine-readable output.
-   Provide cancellation and timeouts.
-   Keep `--help` and `--version` fast and independent of the network.

### Web dashboard

-   Use clear severity labels and text, not color alone.
-   Support keyboard navigation and visible focus.
-   Make findings searchable and filterable.
-   Show scan coverage, freshness, scanner errors, and policy results.
-   Explain each finding with evidence and remediation.
-   Distinguish a clean scan from an incomplete scan.
-   Provide accessible loading, empty, error, and success states.
-   Avoid a generic "AI-generated" aesthetic; prioritize hierarchy,
    readability, restrained color, and useful density.

------------------------------------------------------------------------

## 29. Development roadmap

The following schedule is an estimate for one developer familiar with
the chosen stack. It is not a commitment and excludes unknown
integration or production-hardening delays.

### Phase 1 --- Foundations

-   [ ] Write requirements and acceptance criteria.
-   [ ] Draw system context, component, sequence, state, and data model
    diagrams.
-   [ ] Set up TypeScript monorepo and shared schemas.
-   [ ] Implement project-root discovery and configuration validation.
-   [ ] Create `shipshield init`.

**Exit criterion:** initialization works safely in a test repository and
creates validated configuration.

### Phase 2 --- Working local scan

-   [ ] Integrate Gitleaks.
-   [ ] Integrate Trivy.
-   [ ] Integrate Checkov.
-   [ ] Normalize findings and redact secrets.
-   [ ] Implement `plan`, `show`, JSON and Markdown reports.
-   [ ] Implement policy evaluation and exit codes.
-   [ ] Add scanner fixtures and adapter tests.

**Exit criterion:** a local repository can be scanned and results are
reproducible, understandable, and correctly classified.

### Phase 3 --- Safe remediation

-   [ ] Add fix-handler registry.
-   [ ] Implement dry-run diff output.
-   [ ] Add source revision and dirty-tree safeguards.
-   [ ] Implement a small number of deterministic fix handlers.
-   [ ] Record fix operations without storing secret values.
-   [ ] Implement `verify`.

**Exit criterion:** supported fixes are previewed, approved, narrowly
applied, and re-scanned.

### Phase 4 --- Hosted service

-   [ ] Implement authentication and organization membership.
-   [ ] Build repository, scan, finding, and policy APIs.
-   [ ] Add MongoDB persistence and indexes.
-   [ ] Add Redis/BullMQ job processing.
-   [ ] Build the React dashboard.
-   [ ] Add tenant isolation and authorization tests.

**Exit criterion:** an authorized user can view a real scan and its
findings in the dashboard.

### Phase 5 --- GitHub and CI/CD

-   [ ] Create a GitHub App and minimal permissions.
-   [ ] Verify and deduplicate webhooks.
-   [ ] Scan exact commit revisions.
-   [ ] Publish GitHub Checks.
-   [ ] Implement CI-friendly JSON and exit behavior.
-   [ ] Handle retries, cancellation, rate limits, and permission
    revocation.

**Exit criterion:** a pull request receives an accurate check status
without leaking sensitive data.

### Phase 6 --- Production readiness

-   [ ] Complete threat modeling and security testing.
-   [ ] Harden and isolate workers.
-   [ ] Add telemetry, alerts, runbooks, and backups.
-   [ ] Provision staging and production with Terraform.
-   [ ] Add protected release workflows and artifact verification.
-   [ ] Run restore, incident, and failure-recovery exercises.
-   [ ] Pilot with trusted repositories before wider adoption.

**Exit criterion:** operational owners can detect failures, respond to
incidents, recover data, and explain the product's coverage and
limitations.

------------------------------------------------------------------------

## 30. Definition of done

A feature is not complete merely because its happy path works.

### Product quality

-   [ ] Documented behavior and acceptance criteria.
-   [ ] Helpful error messages and CLI help.
-   [ ] Accessible UI states where applicable.
-   [ ] Compatibility and migration behavior documented.

### Correctness

-   [ ] Unit and integration tests.
-   [ ] Failure and boundary cases tested.
-   [ ] Deterministic policy behavior.
-   [ ] Correct scanner exit-code interpretation.
-   [ ] Incomplete coverage is visible.

### Security

-   [ ] Authentication and authorization tests where relevant.
-   [ ] No secrets in logs, output, or fixtures.
-   [ ] Input validation and resource limits.
-   [ ] Threat model updated.
-   [ ] Least-privilege permissions.
-   [ ] No unsafe automatic execution or infrastructure changes.

### Operations

-   [ ] Useful structured logs and metrics.
-   [ ] Health checks and failure alerts.
-   [ ] Documented rollback and recovery steps.
-   [ ] Configuration and secrets documented.
-   [ ] Deployment and release process tested.

### Documentation

-   [ ] README and relevant design docs updated.
-   [ ] CLI/API examples tested where practical.
-   [ ] Known limitations and supported versions stated.
-   [ ] Runbooks updated for operational changes.

------------------------------------------------------------------------

## 31. Risks and mitigations

  -----------------------------------------------------------------------
  Risk                                Mitigation
  ----------------------------------- -----------------------------------
  Scope grows beyond a feasible MVP   Ship a useful local CLI first and
                                      add hosted features incrementally

  False positives reduce trust        Preserve scanner evidence, document
                                      confidence, provide reviewed
                                      suppressions, and measure
                                      false-positive rates

  Unsafe auto-fix breaks projects     Start with deterministic fixes,
                                      preview diffs, require approval,
                                      test, and verify

  Scanner output format changes       Pin/test versions, validate output
                                      schemas, and fail visibly

  Malicious repository compromises    Strong isolation, no project
  workers                             execution by default, no broad
                                      credentials, restricted egress

  GitHub rate limits delay scans      Queue work, use backoff,
                                      deduplicate events, and show queue
                                      status

  CI passes despite missing checks    Separate policy and execution
                                      status; fail closed for required
                                      incomplete scans

  Reports leak credentials            Redaction tests, bounded evidence,
                                      minimal retention, secure file
                                      permissions

  Hosted service exposes cross-tenant Tenant-aware data access,
  data                                resource-level authorization,
                                      adversarial integration tests

  Infrastructure becomes              Start with managed services and
  unnecessarily complex               split components only when
                                      justified

  Users misunderstand scan results    Show coverage, limitations,
                                      timestamps, scanner versions, and
                                      clear remediation guidance
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 32. Glossary

-   **Finding:** A normalized security issue reported by a scanner or
    ShipShield rule.
-   **Fingerprint:** A stable identity used to track a finding across
    compatible scans.
-   **Plan:** A read-only scan result and policy evaluation, not a
    guarantee that future remediation is safe.
-   **Remediation:** A recommended or applied action intended to address
    a finding.
-   **Verification:** Re-running relevant checks to determine whether
    the issue remains.
-   **Policy gate:** A deterministic decision about whether a change
    meets configured requirements.
-   **Incomplete scan:** A scan where required checks did not complete
    or coverage is insufficient.
-   **Suppression:** A documented, preferably time-bounded exception
    that hides or excludes a finding from a particular policy decision
    without erasing its history.
-   **SBOM:** Software Bill of Materials, an inventory of software
    components.
-   **Tenant:** An organization or customer boundary in the hosted
    service.
-   **Idempotency:** Repeating an operation does not create unintended
    duplicate effects.
-   **RPO:** Recovery Point Objective; acceptable data loss measured in
    time.
-   **RTO:** Recovery Time Objective; target time to restore a service
    after an incident.

------------------------------------------------------------------------

## 33. References

Use primary documentation when implementing integrations; pin tool
versions and revisit these references during upgrades.

-   [Gitleaks](https://github.com/gitleaks/gitleaks)
-   [Trivy](https://github.com/aquasecurity/trivy)
-   [Checkov](https://github.com/bridgecrewio/checkov)
-   [GitHub Apps documentation](https://docs.github.com/en/apps)
-   [GitHub Checks API](https://docs.github.com/en/rest/checks)
-   [GitHub webhook
    security](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
-   [GitHub Actions documentation](https://docs.github.com/en/actions)
-   [Terraform
    documentation](https://developer.hashicorp.com/terraform/docs)
-   [Docker security](https://docs.docker.com/engine/security/)
-   [OWASP Application Security Verification
    Standard](https://owasp.org/www-project-application-security-verification-standard/)
-   [OWASP Top 10](https://owasp.org/www-project-top-ten/)
-   [NIST Secure Software Development Framework
    (SSDF)](https://csrc.nist.gov/Projects/ssdf)
-   [OpenTelemetry documentation](https://opentelemetry.io/docs/)

------------------------------------------------------------------------

## Final implementation recommendation

Build ShipShield in this order:

1.  **Local CLI:** `init`, `plan`, `show`, reports, scanners, and
    deterministic exit codes.
2.  **Safe fixes:** dry-run diffs, explicit approval, narrow fix
    handlers, and `verify`.
3.  **Shared core:** keep the same schemas and policy engine reusable by
    CLI and hosted worker.
4.  **Hosted platform:** API, database, queue, dashboard, and tenant
    authorization.
5.  **GitHub integration:** verified webhooks, exact-commit scans, and
    check runs.
6.  **Production operations:** worker isolation, CI/CD, Terraform,
    telemetry, backups, and incident readiness.

The first milestone is complete when ShipShield can scan a real local
test repository, save a sanitized report under
`.shipshield/reports/<project-name>/`, explain each finding, and return
the correct exit code---without modifying source files during `plan`.

**ShipShield's trust contract:** report what was checked, show what was
found, explain what is uncertain, preview changes before applying them,
and verify outcomes instead of merely claiming success.
