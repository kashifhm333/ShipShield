# 10 — Implementation Plan and Task Breakdown

**Document status:** Production Baseline Specification

**Version:** 1.0

**Product:** ShipShield

**Audience:** Engineering Managers, Tech Leads, Full-Stack Engineers, DevOps Engineers

**Normative Language:** **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** represent strict project management and execution requirements.

## 1. Executive Summary

This document defines the chronological execution roadmap for building the ShipShield platform. It translates the architectural requirements, data models, and scanner specifications into a sequence of actionable engineering phases. 

The implementation strategy adheres to the **"Local-First MVP"** principle: we **MUST** build and harden the core scanning engine and CLI completely before writing the web dashboard, API, or distributed worker queue. This guarantees that the core orchestration logic is stateless, deterministic, and securely decoupled from the HTTP transport layer.

## 2. Project Phasing and Milestones

The project is structured into a 10-week delivery timeline, divided into five core milestones.

### Milestone 1: Core Engine & CLI Skeleton (Weeks 1-2)
**Objective:** Establish the monorepo, define the typed contracts (Zod/JSON Schema), and implement a functional CLI that can parse configuration and discover project files.

*   **Epic 1.1: Repository Scaffolding**
    *   Initialize TypeScript monorepo (`apps/cli`, `packages/scan-core`, `packages/contracts`).
    *   Configure ESLint, Prettier, Vitest, and GitHub Actions CI.
*   **Epic 1.2: Contracts & Schemas**
    *   Implement Zod schemas for `ProjectConfig`, `Finding`, `ScanReport`, and `Policy`.
    *   Generate JSON Schemas for IDE autocomplete.
*   **Epic 1.3: CLI Skeleton & Config Loader**
    *   Implement `Commander.js` setup for `init`, `plan`, `show`, `fix`, `verify`.
    *   Implement `.shipshield.yaml` parser and validation.
    *   Implement file discovery module (respecting `.gitignore` and exclusions).

**Deliverable:** `shipshield init` works. `shipshield plan` runs a dummy scanner and outputs a schema-compliant JSON report.

### Milestone 2: Scanner Adapters & Normalization (Weeks 3-4)
**Objective:** Integrate the actual security tools, parse their outputs, redact secrets, and generate canonical fingerprints.

*   **Epic 2.1: Process Runner & Sandboxing**
    *   Implement child process manager with timeouts, buffer limits, and `SIGTERM`/`SIGKILL` handling.
    *   Sanitize environment variables injected into subprocesses.
*   **Epic 2.2: Scanner Adapters**
    *   Implement **Gitleaks** adapter (Secrets).
    *   Implement **Trivy** adapter (Dependencies & Containers).
    *   Implement **Checkov** adapter (Terraform/IaC).
*   **Epic 2.3: Ingestion Pipeline**
    *   Implement Central Redaction Engine (Regex tokenizers).
    *   Implement deterministic SHA-256 fingerprinting for findings.
    *   Map external severities to ShipShield normalized severities (`critical`, `high`, `medium`, `low`, `info`).

**Deliverable:** `shipshield plan` executes real scanners against a local repository, successfully redacting seeded credentials and writing a `plan.json` report.

### Milestone 3: Policy Engine & Remediation (Weeks 5-6)
**Objective:** Make decisions based on findings and safely apply source code fixes.

*   **Epic 3.1: Policy & Exceptions Engine**
    *   Implement threshold evaluation (`fail_on: ["critical", "high"]`).
    *   Implement suppression evaluation (filtering by fingerprint and expiry).
    *   Map outcomes to strict CLI exit codes (`0`, `1`, `4`, `10`).
*   **Epic 3.2: Formatting & Reporting**
    *   Implement human-readable terminal output (Chalk/Table).
    *   Implement Markdown report generator.
*   **Epic 3.3: Remediation Workflow**
    *   Implement `fix --dry-run` and AST/Regex patch generation.
    *   Implement pre-condition file hash checks (dirty-tree protection).
    *   Implement atomic file writing for `fix --apply`.
    *   Implement `shipshield verify` logic.

**Deliverable:** A complete, production-ready local CLI. Developers can scan, view policy violations, dry-run fixes, and verify remediation.

### Milestone 4: Control Plane API & Dashboard (Weeks 7-8)
**Objective:** Build the hosted MERN stack for team collaboration and scan history.

*   **Epic 4.1: Database & API Foundation**
    *   Provision MongoDB and implement Mongoose schemas.
    *   Implement JWT/GitHub OAuth authentication.
    *   Build REST API endpoints (`/api/v1/organizations`, `/repositories`, `/scans`).
*   **Epic 4.2: Web Dashboard**
    *   Scaffold React/Vite/Tailwind SPA.
    *   Implement Organization and Repository selection views.
    *   Implement Finding History and Policy Management UI.

**Deliverable:** A functional web dashboard where users can log in, connect a repository, and view manually uploaded CLI reports.

### Milestone 5: Distributed Workers & CI Integration (Weeks 9-10)
**Objective:** Automate scanning via GitHub Webhooks and isolated worker nodes.

*   **Epic 5.1: Webhooks & Queue**
    *   Implement GitHub Webhook ingress, HMAC signature validation, and deduplication.
    *   Configure Redis and BullMQ.
*   **Epic 5.2: Isolated Worker Service**
    *   Implement Node.js worker process.
    *   Implement secure repository cloning (shallow clone, short-lived tokens).
    *   Execute `packages/scan-core` inside the worker and upload results to S3/MongoDB.
*   **Epic 5.3: GitHub Checks API**
    *   Post scan summaries and PR comments via GitHub Checks API.
    *   Enforce "Fail-Closed" status on Checks.

**Deliverable:** The complete ShipShield platform. Opening a PR in a connected GitHub repository automatically triggers a sandboxed scan, blocks the merge on policy violation, and displays results in the web UI.

## 3. Task Management & Tracking

The implementation **MUST** be tracked using a Kanban or Agile board (e.g., Jira, Linear). Tasks should follow the standard format:

*   **ID:** `SS-101`
*   **Type:** `[Feature | Bug | Chore | Security]`
*   **Title:** `Implement Gitleaks Adapter`
*   **Description:** Context, acceptance criteria, and technical constraints.
*   **Dependency:** `Depends on SS-098 (Process Runner)`
*   **Estimate:** Story Points (1, 2, 3, 5, 8)

### 3.1 Critical Path Dependencies
1.  `packages/contracts` **MUST** be completed before any CLI or API work begins.
2.  `ProcessRunner` **MUST** be completed before integrating Trivy, Gitleaks, or Checkov.
3.  `Central Redaction Engine` **MUST** be completed and security-audited before storing any scan results locally or remotely.

## 4. Definition of Done (DoD)

A task or Epic is not considered complete until the following criteria are met:

1.  **Code Complete:** Logic is implemented according to the PRD and Architectural Specs.
2.  **Test Coverage:** Unit tests (and Integration tests where applicable) are written and pass CI with a minimum coverage threshold of 85%.
3.  **Security Gates Passed:** Code passes SAST (ESLint/SonarQube), Secret Scanning, and Dependency checks.
4.  **No Secret Leakage:** The feature has been tested with synthetic credentials to ensure zero unredacted leaks in logs, reports, or stdout.
5.  **Documentation Updated:** READMEs, API docs (OpenAPI), and CLI help text are updated.
6.  **Peer Review:** Approved by at least one other engineer (or Security Lead for remediation/auth tasks).

## 5. Risk Mitigation & Adjustments

*   **If Scanner Integration takes too long:** De-scope Checkov (IaC) to a post-MVP release. Focus exclusively on Gitleaks (Secrets) and Trivy (Dependencies).
*   **If UI/API is delayed:** Launch ShipShield strictly as a local CLI and CI/CD pipeline tool (GitHub Actions native) before introducing the hosted MERN platform.
*   **If Worker Sandboxing proves too complex for Week 9:** Defer self-hosted workers and provide a GitHub Action that users run in their *own* isolated CI environment, sending JSON reports back to the ShipShield API.