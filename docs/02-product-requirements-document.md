# ShipShield — Product Requirements Document (PRD)

**Document status:** Draft  
**Version:** 1.0  
**Last updated:** 2026-10-24  
**Product:** ShipShield  
**Document owner:** ShipShield project team

> **Status note:** This PRD defines the intended product. It is not evidence that any feature has been implemented. Update the status of each requirement as implementation and verification progress.

---

## 1. Executive summary

ShipShield is a developer-focused security gate that helps teams identify risky changes before those changes reach production. It provides a consistent workflow across established security scanners for exposed secrets, vulnerable dependencies, Docker/container risks, and Terraform infrastructure misconfigurations.

The first release should prioritize a dependable local CLI. A developer should be able to run a scan, review actionable findings, receive a project-specific report, and use a CI-friendly exit status. Remediation must be explicit, reviewable, and safe by default.

Later releases may add GitHub pull-request checks, team policy management, scan history, and a web dashboard. These capabilities should build on the same normalized finding model and policy engine rather than create separate scanning logic.

## 2. Problem statement

Developers commonly use multiple tools to identify security problems in source repositories, dependencies, container definitions, and infrastructure-as-code files. These tools often differ in installation, output formats, severity conventions, configuration, and CI integration.

This creates several problems:

- Developers must learn and operate multiple tools independently.
- Results are fragmented across logs and formats, making prioritization harder.
- Teams may miss checks or misinterpret scanner failures as clean results.
- CI policies can be inconsistent between repositories.
- Fixing findings can be risky when suggested changes are applied without review.
- Teams lack a consistent project-level report and a reliable way to compare scan results.

ShipShield aims to reduce this friction by orchestrating established scanners, normalizing their results, applying configurable policies, and producing actionable reports.

## 3. Product vision

Make security checks a repeatable part of everyday development, from a developer's workstation to pull requests and CI pipelines.

### Product principles

1. **Developer-first:** provide clear commands and useful diagnostics.
2. **Secure by default:** scanning must not silently modify project files or expose secrets.
3. **Transparent:** show which checks ran, which were skipped, and why a scan failed or was incomplete.
4. **Actionable:** prioritize findings and provide remediation guidance where supported.
5. **Composable:** use established scanners through adapters instead of rebuilding every scanner.
6. **CI-friendly:** deterministic results and stable exit-code behavior.
7. **Incremental:** deliver a useful local CLI before requiring a hosted service.

## 4. Goals and success criteria

### 4.1 Goals

- Provide a unified CLI for supported security checks.
- Support four initial check categories: secrets, dependency vulnerabilities, Docker/container configuration, and Terraform misconfigurations.
- Normalize findings into a versioned schema.
- Generate human-readable and machine-readable reports.
- Apply configurable severity thresholds and policy rules.
- Distinguish clean, failed, and incomplete scans.
- Make remediation opt-in, previewable, and verifiable.
- Establish a foundation for future GitHub and dashboard integrations.

### 4.2 Non-goals for the initial release

- Guarantee that a repository or release is secure.
- Replace penetration testing, threat modeling, or specialist security review.
- Build proprietary versions of all third-party scanners.
- Automatically repair every class of security issue.
- Execute arbitrary repository scripts or builds by default.
- Provide a hosted multi-tenant dashboard in the first CLI-focused milestone.
- Process payments, deploy user applications, or manage production infrastructure on behalf of users.

### 4.3 Success metrics

Targets below are initial hypotheses. Validate them through pilot usage and revise them with evidence.

| Metric | Initial target | Measurement |
|---|---:|---|
| Setup time | 10 minutes or less for a supported repository | Time from installation to first completed scan |
| Scan status clarity | 100% of terminal outcomes identify success, policy failure, or incomplete/error status | CLI test suite |
| Report reliability | 100% of completed scans produce schema-valid output in requested formats | Automated integration tests |
| Secret redaction | 100% of seeded secret fixtures are redacted from user-facing logs and reports | Security tests |
| Repeatability | Same fixture and tool versions produce equivalent normalized findings | Golden-fixture tests |
| Safe scan behavior | Scan commands do not modify tracked project files | Before/after filesystem tests |
| CI usability | Exit codes behave consistently for documented outcomes | CLI and CI integration tests |

These targets are not claims about current performance. Establish a baseline before using them to evaluate releases.

## 5. Target users and personas

### Persona A — Individual developer

**Needs**
- Run security checks locally without configuring several tools manually.
- Understand what is wrong and where it was detected.
- Generate a report that can be reviewed or shared safely.

**Pain points**
- Noisy output, fragmented commands, unclear severity, and hard-to-follow remediation.

### Persona B — DevOps / platform engineer

**Needs**
- Add repeatable checks to CI pipelines.
- Enforce policy thresholds across repositories.
- Diagnose failed or incomplete scans reliably.

**Pain points**
- Inconsistent scripts, fragile pipeline behavior, and missing visibility into scanner failures.

### Persona C — Security engineer / technical lead

**Needs**
- Prioritize high-impact findings.
- Review exceptions and policy decisions.
- Trace findings across scans and understand which tools produced them.

**Pain points**
- Findings spread across tools and inconsistent evidence or severity mappings.

### Persona D — Engineering team / repository maintainer

**Needs**
- Give contributors actionable feedback before merge.
- Keep security checks predictable and minimally disruptive.
- Introduce team-wide controls gradually.

**Pain points**
- Late discovery of issues and security checks that are difficult for developers to interpret.

## 6. Scope and release strategy

### MVP — Local CLI

The MVP is complete when a developer can install or build the CLI, scan a supported repository, view normalized findings, produce reports, and receive documented exit statuses.

MVP scope:

- Project-root discovery and configuration validation.
- A versioned finding schema.
- Scanner adapters for the initial supported categories, with explicit detection of missing tools.
- Markdown and JSON reports.
- Severity threshold policy.
- Project-specific report directory.
- Clear exit codes for pass, policy failure, usage/configuration error, and incomplete scan.
- Automated unit, integration, and security tests.
- Documentation for supported platforms, prerequisites, and limitations.

### Release 2 — Safe remediation

- Show suggested fixes where the underlying tool supports them.
- Offer dry-run previews and reviewable diffs.
- Require explicit approval before changing files.
- Re-scan to verify whether findings were resolved.
- Report unsupported, failed, or potentially breaking remediations.

### Release 3 — GitHub integration

- GitHub App installation with least-privilege permissions.
- Pull-request check results and concise comments.
- Webhook signature verification and safe retry handling.
- Redaction of secret values in all GitHub output.
- Clear policy behavior for required checks.

### Release 4 — Team dashboard and history

- Authenticated users and projects.
- Scan history and finding lifecycle.
- Team policies and reviewed exceptions.
- Audit trail, retention controls, monitoring, and operational runbooks.

Do not delay the MVP for dashboard or multi-tenant features unless user research demonstrates that they are necessary for initial adoption.

## 7. Functional requirements

Priority definitions:

- **P0:** required for the MVP.
- **P1:** required for a near-term follow-up release.
- **P2:** later enhancement.

### 7.1 Project discovery and configuration

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-001 | P0 | Detect the project root | Running from the repository root or a nested directory resolves the same root according to documented rules. |
| FR-002 | P0 | Initialize project configuration | `shipshield init` creates a documented starter configuration and does not overwrite an existing configuration without explicit consent. |
| FR-003 | P0 | Validate configuration | Invalid or unsupported settings produce a clear error and non-zero exit status before scanning begins. |
| FR-004 | P0 | Support documented exclusions | Exclusions are explicit, validated, and visible in scan metadata; dangerous broad exclusions are warned about. |
| FR-005 | P1 | Support repository-specific policy | A project can define severity thresholds and enabled scanner categories. |

### 7.2 Scanner orchestration

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-010 | P0 | Scan for secrets | The configured secrets scanner runs when enabled; unavailable tools and execution failures are reported explicitly. |
| FR-011 | P0 | Scan dependencies | Supported dependency manifests and lockfiles are checked using the configured scanner. Unsupported ecosystems are documented rather than silently ignored. |
| FR-012 | P0 | Scan Docker/container configuration | Supported Dockerfiles and configured image checks are processed by the appropriate scanner. |
| FR-013 | P0 | Scan Terraform configuration | Supported Terraform files are checked for configured infrastructure misconfigurations. |
| FR-014 | P0 | Bound scanner execution | Each scanner has configurable or sensible timeout and output limits; timeouts are surfaced as failures or incomplete checks. |
| FR-015 | P0 | Record scan metadata | Reports record start/end time, tool identity/version when available, enabled checks, and status. |
| FR-016 | P0 | Handle partial scans | If a required scanner fails or cannot run, the result is marked incomplete and must not be represented as a clean scan. |
| FR-017 | P1 | Cache safe reusable results | Any cache must have documented invalidation rules and must not leak results between repositories or trust boundaries. |

### 7.3 Finding normalization and policy

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-020 | P0 | Normalize scanner findings | Findings conform to a versioned schema with source tool, rule ID, severity, location/resource, message, and available remediation. |
| FR-021 | P0 | Deduplicate results | Equivalent results from the same scan are deduplicated using documented logic; source attribution is retained. |
| FR-022 | P0 | Assign stable identifiers | Findings have stable IDs or fingerprints when sufficient identifying data exists. Changes to fingerprint logic are versioned or documented. |
| FR-023 | P0 | Apply severity thresholds | Configured thresholds determine policy outcome consistently. |
| FR-024 | P0 | Preserve original severity | Original scanner severity and mapped ShipShield severity are both retained where available. |
| FR-025 | P1 | Manage exceptions | Exceptions have a reason, scope, owner or author where available, and optional expiry. |
| FR-026 | P1 | Compare scan history | When history storage exists, users can identify new, resolved, and persistent findings. |

### 7.4 Reports and CLI

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-030 | P0 | Generate a terminal summary | Summary includes counts by severity, scan status, failed/skipped checks, and the report location. |
| FR-031 | P0 | Generate Markdown report | Report is readable, includes actionable locations and rule identifiers, and redacts secrets. |
| FR-032 | P0 | Generate JSON report | JSON validates against the documented schema and is suitable for automation. |
| FR-033 | P0 | Use project-specific report storage | Reports are written under the configured project directory, with path validation preventing writes outside it. |
| FR-034 | P0 | Provide stable exit codes | Each documented outcome maps to a stable exit code and is covered by automated tests. |
| FR-035 | P0 | Avoid modifying source files during scans | Scan commands do not alter project files, apart from explicitly requested ShipShield report/config outputs. |
| FR-036 | P0 | Support non-interactive CI | Commands work without interactive prompts when all required options are supplied. |
| FR-037 | P1 | Output formats and retention | Users can configure report formats and retention without deleting files outside the report directory. |

### 7.5 Remediation

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-040 | P1 | List supported fixes | Every offered fix identifies the finding and files or resources it may affect. |
| FR-041 | P1 | Provide dry-run | Dry-run shows intended changes and makes no source-file modifications. |
| FR-042 | P1 | Require explicit approval | Applying changes requires an explicit apply action or confirmation according to documented CLI rules. |
| FR-043 | P1 | Protect user changes | The tool detects relevant working-tree changes and avoids overwriting unrelated user work. |
| FR-044 | P1 | Verify remediation | A subsequent scan reports whether the finding remains, is resolved, or could not be verified. |
| FR-045 | P1 | Report remediation failures | Partial failures identify which actions succeeded or failed without claiming the entire operation succeeded. |

### 7.6 GitHub and hosted features

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-050 | P1 | Publish pull-request results | A configured GitHub App publishes a check result linked to the report or finding details. |
| FR-051 | P1 | Verify webhooks | Invalid webhook signatures are rejected and recorded without processing the event. |
| FR-052 | P1 | Minimize GitHub permissions | Installation requests only permissions needed for enabled features. |
| FR-053 | P2 | Store scan history | Authorized users can query scan history for permitted projects. |
| FR-054 | P2 | Provide a dashboard | Users can review projects, scan status, findings, and history through an authenticated web interface. |
| FR-055 | P2 | Audit administrative actions | Policy changes, exception changes, and sensitive actions are recorded with appropriate access controls. |

## 8. CLI product contract

The following command names are proposed and must be finalized in the separate CLI specification.

| Command | Purpose | Expected behavior |
|---|---|---|
| `shipshield init` | Initialize configuration | Create starter configuration without silently replacing existing files. |
| `shipshield plan` | Scan the project | Run enabled checks, apply policy, and write reports. |
| `shipshield show` | Inspect findings | Display findings from a selected or latest report. |
| `shipshield fix --dry-run` | Preview remediation | Show proposed changes without modifying source files. |
| `shipshield fix --apply` | Apply selected fixes | Apply only supported, explicitly approved changes. |
| `shipshield verify` | Verify current state | Re-run relevant checks and report the outcome. |

### Exit-status requirements

The final numeric values must be specified in `docs/cli/specification.md`. At minimum, distinguish:

- Scan passed and policy satisfied.
- Scan completed but policy threshold was exceeded.
- Usage or configuration error.
- Required scanner unavailable, failed, or scan incomplete.
- Internal/unexpected error.

Exit-code design must account for CI behavior and must not conflate scanner failure with a successful clean scan.

## 9. User journeys

### Journey A — First local scan

1. Developer installs ShipShield using the documented installation method.
2. Developer runs `shipshield init`.
3. ShipShield detects the project and validates configuration.
4. Developer runs `shipshield plan`.
5. CLI reports checks run, findings by severity, and any incomplete scanners.
6. Developer opens the Markdown or JSON report and reviews the findings.

**Success:** the developer can understand scan status and locate the report without reading raw scanner logs.

### Journey B — CI security gate

1. A repository maintainer adds ShipShield to a CI workflow.
2. CI installs pinned or verified scanner versions.
3. The CLI scans the checked-out commit.
4. The CLI writes reports and exits according to the configured policy.
5. CI marks the job successful, failed by policy, or failed/incomplete.

**Success:** a required check cannot pass silently when a required scan did not complete.

### Journey C — Remediate a finding

1. Developer selects a finding with a supported fix.
2. ShipShield displays the proposed change and affected files.
3. Developer runs a dry-run and reviews the diff.
4. Developer explicitly approves application of the fix.
5. ShipShield applies the change only if safety checks pass.
6. Developer runs verification and reviews the updated report.

**Success:** changes are reviewable, user work is protected, and verification does not overstate resolution.

### Journey D — Pull-request feedback (later release)

1. A pull request triggers the configured GitHub integration.
2. ShipShield scans the proposed changes using the documented trust model.
3. The integration publishes a concise check and finding summary.
4. Sensitive evidence is redacted.
5. The required check follows repository policy.

**Success:** contributors receive actionable feedback without exposing credentials or granting unnecessary repository access.

## 10. Data and finding requirements

The normalized finding contract should support at least:

- `schema_version`
- `finding_id` and/or `fingerprint`
- `scanner` and `scanner_version` when available
- `rule_id`
- `category`
- `title` and `description`
- `severity_original` and `severity_normalized`
- `status` (for example, open, resolved, accepted risk, or suppressed where supported)
- `location` (file and line range, or infrastructure resource)
- `evidence` with sensitive values redacted
- `remediation` and references where available
- `first_seen` and `last_seen` when history is available

The scan report should additionally include project identity, commit/revision when available, scan timestamps, scanner execution states, policy result, and report schema version.

The schema must distinguish missing data from an empty value and preserve scanner provenance. Final field types and required/optional rules belong in `docs/scanning/finding-schema.md`.

## 11. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-001 | Security | Treat repository files, scanner output, and pull-request content as untrusted input. |
| NFR-002 | Confidentiality | Never intentionally print raw detected secrets in terminal output, reports, API responses, or comments. |
| NFR-003 | Isolation | Avoid executing repository-controlled scripts by default; isolate features that must execute untrusted code. |
| NFR-004 | Reliability | Scanner timeouts, crashes, malformed output, and missing binaries must be surfaced explicitly. |
| NFR-005 | Performance | Set and document resource limits; establish scan-time baselines using representative repositories before setting hard performance promises. |
| NFR-006 | Portability | Document supported operating systems, CPU architectures, runtime requirements, and scanner dependencies. |
| NFR-007 | Maintainability | Keep scanner adapters independent and validate normalized results against a versioned schema. |
| NFR-008 | Usability | Every failure should explain what failed and offer a practical next step when known. |
| NFR-009 | Compatibility | Document CLI compatibility and versioning rules for configuration and report schemas. |
| NFR-010 | Privacy | Collect only data needed for explicitly enabled functionality and document retention and deletion behavior. |
| NFR-011 | Auditability | Record relevant scan and policy outcomes without storing secret material. |
| NFR-012 | Accessibility | Dashboard features, when introduced, should follow accessible interaction and contrast practices. |

## 12. Security, privacy, and trust boundaries

ShipShield is itself a security-sensitive product. A scanner orchestrator can create risk if it executes untrusted code, leaks credentials, or writes files to unsafe locations.

Required safeguards include:

- Least-privilege filesystem, process, and network access.
- Path canonicalization and validation for report and remediation targets.
- Process timeouts and bounded memory/output where practical.
- Redaction before logs or reports are persisted.
- No secrets in telemetry, diagnostic output, test snapshots, or pull-request comments.
- Explicit user approval for source-file modifications.
- Webhook signature validation and authenticated API access for hosted features.
- Project and tenant authorization checks for any stored reports.
- Documented retention, deletion, and backup policies for hosted scan data.
- Clear handling of scanner failures, partial results, and unsupported file types.

A detailed threat model and secure remediation design must be completed before accepting untrusted pull requests or enabling automated remediation in CI.

## 13. Dependencies and assumptions

### Dependencies

- External scanner tools and their licenses, release cadence, and output formats.
- Supported dependency manifests and lockfile formats.
- GitHub App configuration and API availability for the integration release.
- CI provider behavior and artifact retention settings.
- A selected database and deployment model if persistent history is introduced.

### Assumptions to validate

- Developers value a local-first CLI before a hosted dashboard.
- A normalized finding model meaningfully reduces the effort of using multiple scanners.
- Users prefer proposed, reviewable fixes over unreviewed automatic changes.
- Initial scanner coverage can be narrow and explicitly documented.
- Teams can configure policies without hiding important findings through broad exclusions.

## 14. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| False positives or noisy results | Users ignore findings | Preserve source evidence, provide context, support reviewed exceptions, and measure precision during pilots. |
| False negatives | Risky changes may pass | Clearly document scanner coverage and limitations; never claim complete security. |
| Scanner unavailable or crashes | Incomplete coverage | Track per-scanner status and fail required checks according to policy. |
| Secrets leak through output | Credential exposure | Redact before persistence and test using seeded fake credentials. |
| Remediation breaks builds | Developer disruption | Start with narrow supported fixes, dry-run, diffs, approval, and verification. |
| Untrusted code execution | Host compromise | Do not run repository scripts by default; isolate required execution. |
| Breaking CLI/schema changes | Pipeline failures | Version contracts, document changes, and add compatibility tests. |
| Overly broad MVP | Slow delivery | Deliver local CLI first and defer dashboard/history until core quality is demonstrated. |
| Third-party license or supply-chain issue | Legal/security exposure | Review scanner licenses, pin versions where practical, and maintain dependency update processes. |

## 15. Acceptance criteria for the MVP

The MVP is ready for a release candidate only when all of the following are verified:

- [ ] Installation and prerequisites are documented for supported platforms.
- [ ] `init` creates a valid starter configuration and protects existing configuration.
- [ ] Project discovery works from the root and supported nested directories.
- [ ] Each enabled scanner reports success, findings, skipped status, or failure explicitly.
- [ ] Missing tools and incomplete scans cannot be mistaken for a clean result.
- [ ] Findings conform to the versioned schema.
- [ ] Markdown and JSON reports are generated and validated.
- [ ] Reports are written inside the intended project directory.
- [ ] Secrets are redacted in terminal output, reports, and logs.
- [ ] Policy thresholds produce deterministic outcomes.
- [ ] Exit codes are documented and tested.
- [ ] Scan commands do not modify source files.
- [ ] Unit, adapter, integration, and security tests pass in CI.
- [ ] Known limitations, supported file types, and scanner versions are documented.
- [ ] No critical or high-severity release-blocking defects remain open without an explicitly approved risk decision.

## 16. Open decisions

Resolve these in architecture decision records or the relevant detailed specification before implementation depends on them.

1. Which language and packaging approach will be used for the CLI?
2. Which exact scanner tools and versions will be supported for each category?
3. Which operating systems and CPU architectures are in the first supported release?
4. How will the project root be detected when multiple configuration files or monorepo packages exist?
5. What exact exit-code values and precedence rules will CI use?
6. Which finding fields are required, and how will fingerprints remain stable?
7. Will reports be ignored by default in Git, or can repositories opt into committing them?
8. Which database and hosting model, if any, will support team history?
9. What data is sent to a hosted service, and what are its retention defaults?
10. Which remediation types are safe enough to support first?

## 17. Related documents

The following documents should define the detailed contracts referenced by this PRD:

- `README.md` — project overview, quick start, and supported capabilities.
- `docs/architecture/system-design.md` — components, boundaries, and data flow.
- `docs/cli/specification.md` — commands, flags, exit codes, and report directory rules.
- `docs/scanning/finding-schema.md` — normalized finding and report schemas.
- `docs/scanning/scanner-adapters.md` — scanner selection, invocation, and output parsing.
- `docs/scanning/policy-engine.md` — severity mapping and policy evaluation.
- `docs/security/threat-model.md` — assets, trust boundaries, threats, and mitigations.
- `docs/security/remediation-safety.md` — safe change application and rollback behavior.
- `docs/testing/test-plan.md` — test layers, fixtures, and release gates.
- `docs/project/implementation-plan.md` — milestones, tasks, dependencies, and definition of done.

---

## Change history

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-24 | Initial PRD draft for the ShipShield product vision and MVP. |
