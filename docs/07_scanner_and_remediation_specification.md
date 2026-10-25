# 07 — Scanner and Remediation Specification

**Document status:** Production Baseline Specification  
**Version:** 1.0  
**Product:** ShipShield  
**Audience:** Security Engineers, Backend Engineers, CLI Maintainers, QA Engineers  
**Normative Language:** **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** represent strict engineering requirements.

---

## 1. Executive Summary and Architecture Overview

This specification establishes the technical implementation contracts for ShipShield's detection, policy evaluation, and remediation subsystems across both the standalone CLI and hosted worker sandboxes. 

ShipShield does not implement proprietary scanner analysis kernels; instead, it coordinates three core engine adapters:
* **Gitleaks** (Secret Detection)
* **Trivy** (Vulnerable Dependencies, Containerfiles, and Artifacts)
* **Checkov** (Infrastructure as Code / Terraform Misconfigurations)

```mermaid
flowchart TD
    subgraph ExecutionSandbox[Isolated Workspace Sandbox]
        Files[Target Repository Files] --> ProcRunner[Secure Process Runner]
        ProcRunner -->|Exec Array| GL[Gitleaks CLI]
        ProcRunner -->|Exec Array| TV[Trivy CLI]
        ProcRunner -->|Exec Array| CK[Checkov CLI]
    end
    
    subgraph NormalizationPipeline[Ingestion & Normalization Engine]
        GL -->|Raw JSON / stdout| AdaGL[Gitleaks Adapter]
        TV -->|Raw JSON / stdout| AdaTV[Trivy Adapter]
        CK -->|Raw JSON / stdout| AdaCK[Checkov Adapter]
        
        AdaGL --> Redact[Central Redaction Service]
        AdaTV --> Redact
        AdaCK --> Redact
        
        Redact --> Hash[Canonical Fingerprint Engine]
        Hash --> Findings[Normalized Finding Set]
    end
    
    subgraph Governance[Policy & Remediation Lifecycle]
        Findings --> PolEng[Deterministic Policy Engine]
        PolEng --> Decision[Pass / Policy_Failed / Incomplete]
        
        Findings --> RemRegistry{Fix Handler Registered?}
        RemRegistry -- Yes --> DiffGen[Patch Diff Generator]
        DiffGen --> PreCheck[Precondition Validation]
        PreCheck --> Stage[Staged Preview / Dry Run]
        Stage -->|Explicit --apply| Apply[Atomic File Modification]
        Apply --> Verify[Verification Re-scan]
    end
```

### Invariants Governing This Specification
1. **Zero Shell Interpolation:** Scanner processes **MUST** be invoked using typed argument vectors (`string[]`). Shell execution (`/bin/sh`, `bash`, `cmd.exe`) is strictly prohibited.
2. **Fail-Closed Execution:** An unhandled error code, process crash, buffer overflow, or timeout **MUST** produce an `incomplete` scanner status and transition the scan outcome to non-passing. It **MUST NOT** be interpreted as zero findings.
3. **Pre-Storage Redaction:** Redaction occurs in-memory immediately after output parsing. Raw credential values **MUST NOT** reach the fingerprint generator, the policy engine, log sinks, or report serializers.
4. **Non-Destructive Planning:** The `plan` command is completely read-only. Source alterations **MUST** execute exclusively through `fix` under explicit flags (`--apply`) and after passing content-hash precondition checks.
5. **No Verification by Assertion:** Applying a patch does not mark a finding resolved. A finding transitions to `fixed` only when a subsequent verification scan confirms its absence.

---

## 2. Core Scanner Adapter Architecture

Every security tool integration implements the `ScannerAdapter` contract. Adapters are isolated from HTTP APIs, CLI presentation layers, and database drivers.

### 2.1 Interface Definition

```typescript
export type ScannerCategory = 'secrets' | 'dependencies' | 'containers' | 'iac';

export type ScannerExecutionStatus = 
  | 'completed' 
  | 'not_applicable' 
  | 'disabled' 
  | 'skipped' 
  | 'failed' 
  | 'timed_out';

export interface ScannerMetadata {
  readonly id: string;
  readonly name: string;
  readonly category: ScannerCategory;
  readonly binaryName: string;
  readonly supportedVersionRange: string; // SemVer range (e.g., ">=8.18.0 <9.0.0")
}

export interface ScannerInvocation {
  readonly executablePath: string;
  readonly args: string[];
  readonly env: Record<string, string>;
  readonly cwd: string;
  readonly timeoutMs: number;
}

export interface RawScannerOutput {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
}

export interface ScannerAdapter {
  readonly metadata: ScannerMetadata;
  
  /**
   * Evaluates if workspace contains artifacts relevant to this scanner.
   */
  isApplicable(workspacePath: string): Promise<boolean>;
  
  /**
   * Asserts engine executable exists and conforms to supported version constraints.
   */
  validatePrerequisites(): Promise<{ available: boolean; version?: string; error?: string }>;
  
  /**
   * Synthesizes isolated argument vectors and minimal environment.
   */
  buildInvocation(workspacePath: string, options: ScanExecutionOptions): Promise<ScannerInvocation>;
  
  /**
   * Parses raw stdout/stderr into unified intermediate representation.
   */
  parseOutput(output: RawScannerOutput, workspacePath: string): Promise<IntermediateFinding[]>;
}
```

---

## 3. Sandboxed Process Runner

Direct invocation of `child_process.exec` or dynamic command string interpolation is strictly prohibited. All scanner subprocesses are managed through a dedicated `ProcessRunner` that enforces memory limits, execution deadlines, signal handling, and environment isolation.

```typescript
// Subprocess execution configuration invariant
export interface ProcessRunnerOptions {
  cwd: string;
  args: string[];
  envAllowlist: string[];
  timeoutMs: number;
  maxOutputBufferBytes: number; // Default: 20MB (20 * 1024 * 1024)
}
```

### 3.1 Environment Sanitization
Scanner subprocesses inherit only explicit, allowlisted environment variables. Credentials present in the host environment (`AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, `MONGODB_URI`, etc.) **MUST** be stripped:

* **Universal Allowed Keys:** `PATH`, `TMPDIR`, `TEMP`, `USER`, `HOME`, `LC_ALL`, `LANG`, `SYSTEMROOT`.
* **Tool-Specific Keys:**
  * Gitleaks: None.
  * Trivy: `TRIVY_CACHE_DIR`, `TRIVY_OFFLINE_SCAN`, `TRIVY_SKIP_DB_UPDATE`.
  * Checkov: `BC_CACHE_DIR`, `CHECKOV_ENABLE_SHALLOW_SCAN`.

### 3.2 Termination Semantics
1. If execution exceeds `timeoutMs`, the runner emits `SIGTERM` to the process group.
2. A grace period of 5,000 milliseconds is observed.
3. If the subprocess fails to terminate, the runner emits `SIGKILL` (`-9`).
4. The output record marks `timedOut = true`, sets `exitCode = null`, and flags the status as `timed_out`.

---

## 4. Engine Integrations and Parsers

### 4.1 Gitleaks (Secret Detection)

#### 4.1.1 Engine Constraints
* **Binary Name:** `gitleaks`
* **Supported Version:** `^8.18.0`
* **Applicability Rule:** Evaluated on all targets.

#### 4.1.2 Invocation Strategy
```bash
# Executed via argument array:
gitleaks dir \
  --path=<WORKSPACE_ROOT> \
  --report-format=json \
  --report-path=<ISOLATED_TMP_FILE> \
  --redact=false \
  --no-banner \
  --exit-code=1
```
*Note: `--redact=false` is passed to Gitleaks so ShipShield's centralized redaction engine receives structural length and pattern context before calculating the deterministic HMAC digest and generating a uniform masked snippet.*

#### 4.1.3 Output & Exit Code Translation
* `0`: Clean execution, zero leaks discovered.
* `1`: Leaks detected; parses generated JSON report file.
* `>1`: Configuration syntax error, invalid permissions, or crash. Evaluated as `failed`.

#### 4.1.4 Output Parsing Contract
```typescript
interface GitleaksFinding {
  Description: string;
  StartLine: number;
  EndLine: number;
  StartColumn: number;
  EndColumn: number;
  Match: string;
  Secret: string;
  File: string;
  SymlinkFile: string;
  Commit: string;
  Entropy: number;
  Author: string;
  Email: string;
  Date: string;
  Message: string;
  Tags: string[];
  RuleID: string;
  Fingerprint: string;
}
```
* **Mapping Transformations:**
  * `category` $\rightarrow$ `'secrets'`
  * `severity_normalized` $\rightarrow$ `'critical'` (All confirmed credentials default to critical; customizable via rule map)
  * `title` $\rightarrow$ `"Exposed " + finding.Description`
  * `location.path` $\rightarrow$ `path.relative(workspacePath, finding.File)`
  * `location.start_line` $\rightarrow$ `finding.StartLine`
  * `location.end_line` $\rightarrow$ `finding.EndLine`
  * `evidence.summary` $\rightarrow$ `RedactionEngine.mask(finding.Secret)`

---

### 4.2 Trivy (Dependency Vulnerabilities & Containerfiles)

#### 4.2.1 Engine Constraints
* **Binary Name:** `trivy`
* **Supported Version:** `^0.50.0`
* **Applicability Rule:** Workspace contains supported package lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `go.sum`, `Cargo.lock`, `requirements.txt`, `Pipfile.lock`, `pom.xml`, etc.) OR `Dockerfile` / `Containerfile`.

#### 4.2.2 Invocation Strategy
```bash
# Executed via argument array:
trivy fs \
  --format=json \
  --scanners=vuln,misconfig \
  --quiet \
  --timeout=10m \
  <WORKSPACE_ROOT>
```

#### 4.2.3 Output & Exit Code Translation
* `0`: Success (even when vulnerabilities are discovered, unless configured with `--exit-code`).
* Non-zero: Scanner runtime failure (engine failure, corrupt DB cache, out-of-memory). Evaluated as `failed`.

#### 4.2.4 Output Parsing Contract
Trivy outputs a structured JSON root containing a `Results[]` schema array:

```typescript
interface TrivyResult {
  Target: string;
  Class: 'lang-pkgs' | 'config';
  Type: string;
  Vulnerabilities?: Array<{
    VulnerabilityID: string;
    PkgName: string;
    InstalledVersion: string;
    FixedVersion?: string;
    PrimaryURL?: string;
    Title?: string;
    Description?: string;
    Severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
    CweIDs?: string[];
  }>;
  Misconfigurations?: Array<{
    ID: string;
    Title: string;
    Description: string;
    Message: string;
    Severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    PrimaryURL?: string;
    IacDescription?: {
      Resolution: string;
    };
    CauseMetadata: {
      StartLine: number;
      EndLine: number;
    };
  }>;
}
```

* **Vulnerability Mapping Transformations:**
  * `category` $\rightarrow$ `'dependencies'`
  * `rule_id` $\rightarrow$ `vuln.VulnerabilityID` (e.g., `"CVE-2024-21538"`)
  * `severity_normalized` $\rightarrow$ Downcased `vuln.Severity` (`'UNKNOWN'` maps to `'info'`)
  * `location.path` $\rightarrow$ `path.relative(workspacePath, result.Target)`
  * `remediation.fix_available` $\rightarrow$ `Boolean(vuln.FixedVersion)`
  * `remediation.summary` $\rightarrow$ `"Upgrade " + vuln.PkgName + " to version " + vuln.FixedVersion`

* **Container Misconfiguration Transformations:**
  * `category` $\rightarrow$ `'containers'`
  * `rule_id` $\rightarrow$ `misconfig.ID` (e.g., `"DS002"`)
  * `location.start_line` $\rightarrow$ `misconfig.CauseMetadata.StartLine`
  * `remediation.summary` $\rightarrow$ `misconfig.IacDescription?.Resolution || misconfig.Message`

---

### 4.3 Checkov (Infrastructure as Code)

#### 4.3.1 Engine Constraints
* **Binary Name:** `checkov`
* **Supported Version:** `^3.2.0`
* **Applicability Rule:** Workspace contains `*.tf`, `*.tfvars`, `*.yaml` (Kubernetes manifests), or CloudFormation templates.

#### 4.3.2 Invocation Strategy
```bash
# Executed via argument array:
checkov \
  --directory=<WORKSPACE_ROOT> \
  --output=json \
  --framework=terraform,cloudformation,kubernetes \
  --compact \
  --quiet \
  --soft-fail
```

#### 4.3.3 Output & Exit Code Translation
* `0`: Success (due to `--soft-fail`). JSON output on stdout is parsed.
* Non-zero: Checkov parsing or execution failure. Evaluated as `failed`.

#### 4.3.4 Output Parsing Contract
```typescript
interface CheckovFinding {
  check_id: string; // e.g., "CKV_AWS_144"
  check_name: string;
  check_result: {
    result: 'PASSED' | 'FAILED' | 'SKIPPED';
  };
  file_path: string; // e.g., "/main.tf"
  file_line_range: [number, number];
  resource: string; // e.g., "aws_s3_bucket.financial_records"
  guideline?: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description?: string;
}
```

* **Mapping Transformations:**
  * Evaluates only items where `check_result.result === 'FAILED'`.
  * `category` $\rightarrow$ `'iac'`
  * `rule_id` $\rightarrow$ `finding.check_id`
  * `severity_normalized` $\rightarrow$ Downcased `finding.severity || 'medium'`
  * `location.path` $\rightarrow$ Normalizes leading slash relative to workspace root.
  * `location.start_line` $\rightarrow$ `finding.file_line_range[0]`
  * `location.end_line` $\rightarrow$ `finding.file_line_range[1]`
  * `remediation.summary` $\rightarrow$ `"Refer to policy guideline: " + finding.guideline`

---

## 5. Central Redaction and Fingerprinting Engine

### 5.1 Redaction Pipeline Requirements

```mermaid
flowchart LR
    Input[Raw Extracted String] --> RuleCheck{Matches Token Signatures?}
    RuleCheck -- Yes --> TokenMask[Apply Masking by Type]
    RuleCheck -- No --> EntropyCheck{Shannon Entropy > 4.5?}
    EntropyCheck -- Yes --> EntropyMask[Obfuscate Variable Segment]
    EntropyCheck -- No --> Retain[Preserve Safe String]
    TokenMask --> Output[Normalized Redacted Evidence]
    EntropyMask --> Output
```

#### 5.1.1 Targeted Token Patterns
The redactor evaluates the following signatures across all output lines, metadata descriptions, and error strings:

```typescript
export const REDACTION_PATTERNS: Array<{ name: string; pattern: RegExp; mask: string }> = [
  { name: 'GitHub Token', pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}/g, mask: 'ghp_****' },
  { name: 'AWS Access Key', pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/g, mask: 'AKIA****' },
  { name: 'Private Key Block', pattern: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[^-]+-----END [A-Z ]+ PRIVATE KEY-----/gs, mask: '-----BEGIN PRIVATE KEY-----\n[REDACTED PRIVATE KEY]\n-----END PRIVATE KEY-----' },
  { name: 'Generic Password / Secret Assignment', pattern: /(?<=(?:password|secret|key|token|api_key)\s*[:=]\s*["'])([^"']{4,})(?=["'])/gi, mask: '****' }
];
```

#### 5.1.2 Shannon Entropy Evaluation
For unmatched sequences over 16 characters in length, the engine calculates Shannon entropy:
$$H(X) = -\sum_{i=1}^{n} P(x_i) \log_2 P(x_i)$$
If $H(X) > 4.5$, the engine replaces the characters after the first 3 prefix bytes with a uniform 8-character mask (`****`).

---

### 5.2 Deterministic Finding Fingerprints

Finding identity across historical commits **MUST NOT** rely on mutable line numbers or auto-incrementing database identifiers. A SHA-256 fingerprint is constructed using canonical delimiter joins (`|`):

$$\text{Fingerprint} = \text{"sha256:"} + \text{Hex}(\text{SHA-256}(\text{Canonical String}))$$

```typescript
export function computeFingerprint(input: {
  category: ScannerCategory;
  ruleId: string;
  normalizedPath: string;
  contextIdentity: string;
}): string {
  const normalizedPath = path.normalize(input.normalizedPath).replace(/\\/g, '/').replace(/^\//, '');
  const canonicalString = [
    input.category,
    input.ruleId.trim(),
    normalizedPath,
    input.contextIdentity.trim()
  ].join('|');

  return 'sha256:' + crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}
```

#### Context Identity Rules by Category:
* **Secrets:** Keyed HMAC digest of the normalized enclosing structural block (the variable declaration line, omitting raw secret literals):  
  $$\text{contextIdentity} = \text{HMAC-SHA-256}_{K_{\text{ephem}}}(\text{sanitized\_declaration\_line})$$
* **Dependencies:**  
  $$\text{contextIdentity} = \text{packageName} + "@" + \text{installedVersion}$$
* **Containers:**  
  $$\text{contextIdentity} = \text{dockerfileInstruction} + ":" + \text{instructionArgumentSummary}$$
* **IaC / Terraform:**  
  $$\text{contextIdentity} = \text{resourceAddress} \quad (\text{e.g., } \texttt{"aws\_s3\_bucket.secure\_data"})$$

---

## 6. Deterministic Policy Engine

The policy engine evaluates whether a completed scan satisfies deployment gates. The engine is a pure, side-effect-free function:

$$\text{PolicyDecision} = f(\text{Findings}, \text{ScannerStatuses}, \text{PolicyConfig}, \text{ActiveSuppressions})$$

```typescript
export interface PolicyRuleSet {
  failOnSeverities: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
  failOnIncomplete: boolean;
  blockOnUnresolvedSecrets: boolean;
  allowedLicenses?: string[];
}

export interface PolicyDecision {
  passed: boolean;
  outcome: 'passed' | 'policy_failed' | 'incomplete';
  rulesEvaluated: number;
  violations: Array<{
    ruleId: string;
    findingFingerprint?: string;
    reason: string;
  }>;
  incompleteChecks: Array<{
    scannerId: string;
    reason: string;
  }>;
}
```

### 6.1 Evaluation Order & Priority

```mermaid
flowchart TD
    Start[Evaluate Scan] --> IncompCheck{Any Required Scanner Incomplete / Timed Out?}
    IncompCheck -- Yes (failOnIncomplete = true) --> RetIncomplete[Outcome: incomplete]
    IncompCheck -- No / Override --> SecCheck{Unsuppressed Secrets Present?}
    SecCheck -- Yes (blockOnSecrets = true) --> RetFailed[Outcome: policy_failed]
    SecCheck -- No --> SevCheck{Finding Severity in failOnSeverities?}
    SevCheck -- Yes --> RetFailed
    SevCheck -- No --> RetPassed[Outcome: passed]
```

1. **Completeness Verification:**  
   If any enabled scanner has a status of `'failed'`, `'timed_out'`, or `'skipped'` without an applicability exemption, and `failOnIncomplete === true`, the decision immediately yields `outcome: 'incomplete'`, `passed: false`.
2. **Hard-Gate Secrets:**  
   If `blockOnUnresolvedSecrets === true` and unsuppressed findings with `category === 'secrets'` exist, the decision yields `outcome: 'policy_failed'`, `passed: false`.
3. **Severity Thresholding:**  
   Any finding matching `failOnSeverities` that lacks an active, unexpired suppression creates an entry in `violations[]`.
4. **Suppression Application:**  
   A suppression matches if:
   * `suppression.status === 'active'`
   * `suppression.expires_at > currentTime`
   * `suppression.finding_fingerprint === finding.fingerprint` OR (`suppression.scope === 'rule'` AND `suppression.rule_id === finding.rule_id`).

---

## 7. Remediation Subsystem

Remediation is governed by a fail-safe execution protocol. ShipShield permits code mutations **only** through registered, deterministic transformation handlers.

### 7.1 Remediation Safety Constraints
* **No Dynamic Script Execution:** ShipShield **MUST NOT** execute package manager commands (`npm audit fix`, `pip-audit --fix`, `terraform apply`) on the host system without sandboxed container isolation.
* **Strict Dry-Run Default:** Invocations of `shipshield fix` without the explicit `--apply` flag **MUST** operate strictly in preview/dry-run mode.
* **Stale Workspace Guard:** Before touching any target file on disk, ShipShield compares the target file's current SHA-256 hash with the hash recorded during the scan planning phase. If the hash diverges, the patch is rejected.

---

### 7.2 Fix Handler Contract

```typescript
export interface FixContext {
  workspaceRoot: string;
  finding: IntermediateFinding;
  targetPath: string;
}

export interface ProposedPatch {
  findingId: string;
  targetPath: string;
  originalContentHash: string;
  diff: string; // Unified Diff format
  applyTransformation: (originalContent: string) => string;
}

export interface FixHandler {
  readonly id: string;
  readonly supportedRuleIds: string[];
  
  canFix(finding: IntermediateFinding, targetPath: string): Promise<boolean>;
  
  generatePatch(context: FixContext): Promise<ProposedPatch>;
}
```

---

### 7.3 Reference Fix Handlers

#### 7.3.1 Handler: `docker-root-user` (Rule: `DS002`)
* **Trigger:** Trivy flags `Dockerfile` running as implicit root.
* **Transformation Logic:** Inspects AST or line tokens of the `Dockerfile`. Appends a non-root group and user creation block immediately before the runtime entrypoint or at the end of the file:
  ```dockerfile
  RUN addgroup -S appgroup && adduser -S appuser -G appgroup
  USER appuser
  ```
* **Precondition:** Verifies `USER` directive is not present in the subsequent instructions of the target build stage.

#### 7.3.2 Handler: `terraform-s3-public-access` (Rule: `CKV_AWS_53`)
* **Trigger:** S3 bucket resource declared without a public access block.
* **Transformation Logic:** Uses an HCL/AST line-aware parser. Generates an accompanying `aws_s3_bucket_public_access_block` resource block:
  ```hcl
  resource "aws_s3_bucket_public_access_block" "remediation_block" {
    bucket                  = aws_s3_bucket.<RESOURCE_NAME>.id
    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
  }
  ```

---

### 7.4 Atomic Patch Execution Pipeline

When the user supplies `shipshield fix --apply`, the execution engine proceeds through the following state machine:

```mermaid
sequenceDiagram
    autonumber
    participant CLI as Remediation Engine
    participant FS as File System
    participant V as Verification Engine

    CLI->>FS: 1. Read Current Target File
    CLI->>CLI: 2. Assert SHA-256(Current Content) == originalContentHash
    alt Hash Mismatch (Dirty State)
        CLI-->>CLI: ABORT: Target modified since last scan
    else Hash Valid
        CLI->>FS: 3. Write Atomic Temporary File (.shipshield-tmp-xxxx)
        CLI->>CLI: 4. Transform Content in Memory
        CLI->>FS: 5. Flush Transformed Content to Temp File
        CLI->>FS: 6. Atomic Rename / Swap Temp to Target
        CLI->>V: 7. Trigger shipshield verify Workflow
        V->>V: 8. Execute Targeted Category Scanner
        alt Finding No Longer Detected
            V-->>CLI: STATUS: Verified Resolved
        else Finding Still Present
            V-->>CLI: STATUS: Partial / Unverified (Retain Rollback Guidance)
        end
    end
```

---

## 8. CLI Command Contract for Remediation

### 8.1 Command Interface: `shipshield fix`
```text
Usage: shipshield fix [finding-ids...] [options]

Options:
  --all                     Target all fixable findings detected in latest plan
  --dry-run                 Preview proposed unified diffs without modifying disk (Default)
  --apply                   Explicitly commit modifications to project files
  --yes, -y                 Bypass interactive confirmation prompts (Requires --apply)
  --report <path>           Source report path (Defaults to .shipshield/reports/latest.json)
```

### 8.2 Execution Safety Matrix

| Invocations | Source Modified? | Terminal Display | Exit Code |
| :--- | :---: | :--- | :---: |
| `shipshield fix SS-DOCKER-1` | **No** | Unified Diff Preview | `0` |
| `shipshield fix SS-DOCKER-1 --dry-run` | **No** | Unified Diff Preview | `0` |
| `shipshield fix SS-DOCKER-1 --apply` | **Yes** | Shows Diff + Applies file change | `0` (or `6` on error) |
| `shipshield fix SS-DOCKER-1 --yes` | **No** | Refuses execution: `--yes` without `--apply` is invalid | `2` (`usage_error`) |
| `shipshield fix --all` | **No** | Unified Diff Preview of all fixable items | `0` |

---

## 9. Verification Subsystem: `shipshield verify`

The `verify` subsystem closes the remediation loop by confirming that an applied change eliminated the target security finding without introducing parser regressions or collateral errors.

```text
shipshield verify [--before <report-path>] [--scanner <name>] [--full]
```

### 9.1 Verification Evaluation Algorithm
1. **Load Baseline State:** Resolves the reference report (defaults to `.shipshield/reports/latest.json`). Extracts the targeted finding's stable `fingerprint`.
2. **Execute Targeted Scan:** Initiates an isolated scan limited to the scanner category associated with the remediated finding (or full workspace if `--full` is specified).
3. **Compare Results:**
   * If the targeted `fingerprint` is **absent** from the new scan findings, and the scanner executed with `status === 'completed'`, the finding is marked **`resolved`**.
   * If the `fingerprint` remains **present**, the outcome is **`unresolved`**.
   * If the scanner crashed or encountered errors, the verification outcome is **`unverified`** and returns exit code `4` (`incomplete`).
4. **Emit Verification Record:** Serializes the outcome to `.shipshield/reports/verification-<timestamp>.json`.

---

## 10. Automated Testing and Verification Matrix

Any implementation of this specification must pass the following automated test suites before deployment:

### 10.1 Subprocess & Adapter Tests
- [ ] **Argument Vector Isolation:** Injected shell operators (`"; rm -rf /"`, `"| cat"`, `"`$(whoami)`"`) passed as file names to adapters are treated strictly as literal character arrays and do not trigger command execution.
- [ ] **Subprocess Timeout Enforcement:** A mock scanner adapter that sleeps for $t > \text{timeoutMs}$ is reliably killed via `SIGTERM` $\rightarrow$ `SIGKILL` and yields `timed_out`.
- [ ] **Non-Zero Crash Handling:** A scanner that exits with status code `137` (OOM) or `1` with invalid JSON records an execution status of `'failed'` and propagates an overall outcome of `'incomplete'`.

### 10.2 Redaction & Fingerprint Tests
- [ ] **Redaction Invariance:** Synthetic API tokens (`ghp_...`, `AKIA...`) placed in scanned file contents do not appear in any `IntermediateFinding.evidence.summary`, report file, or standard error string.
- [ ] **Fingerprint Stability:** Inserting 5 blank lines at the top of a file containing a Terraform misconfiguration does not alter the generated SHA-256 fingerprint for that resource finding.

### 10.3 Remediation Safety Tests
- [ ] **Preview-Only Default:** Executing `shipshield fix` without `--apply` asserts that file system mtimes and SHA-256 checksums of the target repository remain 100% identical.
- [ ] **Dirty State Abort:** Modifying a target file after a scan causes `shipshield fix --apply` to abort with error code `6` (`fix_error`), leaving the file untouched.
- [ ] **Verification Integrity:** An intentionally broken fix that does not eliminate the scanner finding asserts an `unresolved` state during `verify`.