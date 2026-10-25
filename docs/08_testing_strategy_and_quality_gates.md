# 08 — Testing Strategy and Quality Gates

**Document status:** Production Baseline Specification  
**Version:** 1.0  
**Product:** ShipShield  
**Audience:** QA Engineers, Backend Engineers, Security Engineers, DevOps Engineers, Maintainers  
**Normative Language:** **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** represent strict engineering requirements.

---

## 1. Executive Summary & Verification Principles

This specification defines the authoritative testing architecture, test level definitions, synthetic fixture specifications, security validation suites, and automated CI/CD quality gates for ShipShield.

ShipShield operates at the critical junction between source code development and deployment. Defects in scanner orchestration, normalization, policy evaluation, or remediation can result in either false security assurance (failing to block critical exploits) or production delivery blockage (false positives or corrupted code modifications).

```mermaid
flowchart TD
    subgraph TestPyramid[ShipShield Test Pyramid]
        L1[Unit Tests: Normalization, Fingerprinting, Policies, Redaction]
        L2[Adapter Contract Tests: ProcessRunner, Subprocess Signals, Output Parsing]
        L3[Integration Tests: Express API, MongoDB, Redis/BullMQ, GitHub Webhooks]
        L4[Adversarial Security Tests: Path Traversal, Symlinks, Injection, IDOR]
        L5[Remediation & Mutation Tests: Preconditions, Diffs, Atomic Apply, Verify]
        L6[End-to-End Fixture Runs: Seeded Repositories, Golden Artifact Checks]
    end

    L1 --> Gate1{Lint & Unit Gate}
    L2 --> Gate2{Adapter & Sandbox Gate}
    L3 --> Gate3{Service Integration Gate}
    L4 --> Gate4{Security & Boundary Gate}
    L5 --> Gate5{Remediation Safety Gate}
    L6 --> Gate6{Golden Master Gate}

    Gate1 & Gate2 & Gate3 & Gate4 & Gate5 & Gate6 --> ReleaseCandidate[Release Candidate Promotion]
```

### Invariants Governing This Specification
1. **Zero Real Credentials:** Test fixtures **MUST NOT** include real credentials, private keys, or active cloud tokens under any circumstances. All tests utilize synthetic tokens specifically structured for regex/entropy detection.
2. **Determinism (Hermetic Testing):** Test execution **MUST NOT** rely on unpinned remote endpoints, dynamic vulnerability advisory updates, or live GitHub APIs during CI runs. All external network interactions are mocked or pinned to frozen local database fixtures.
3. **Fail-Closed Verification:** Every test suite validating failure conditions (scanner timeouts, process exits with status code 137, corrupted JSON, missing binaries) **MUST** assert that the outcome resolves to `incomplete` or non-zero exit codes. It **MUST NEVER** resolve to `passed` or exit code `0`.
4. **Filesystem Immutability Invariance:** Read-only operations (`shipshield plan`, `show`, `verify`, and `fix --dry-run`) **MUST** assert before-and-after filesystem SHA-256 tree parity down to the byte.
5. **Pre-Storage Redaction Invariance:** Across all test outputs (stdout, stderr, report JSON files, database records, error logs), synthetic secret literals **MUST NEVER** appear.

---

## 2. Test Pyramid & Scope Matrix

| Test Level | Scope | Primary Tools | Execution Target | Maximum Duration |
| :--- | :--- | :--- | :--- | :--- |
| **Unit** | Schemas, pure policy evaluation, Shannon entropy, HMAC fingerprint calculation, CLI argument parsing. | Vitest / Jest | Every commit / PR | $< 30\text{ seconds}$ |
| **Adapter Contract** | Process runner sandboxing, buffer overflow caps, signal escalation (`SIGTERM` $\rightarrow$ `SIGKILL`), raw scanner JSON translation. | Vitest, Mock Binaries | PR / Merge queue | $< 60\text{ seconds}$ |
| **Integration** | Express REST API endpoints, MongoDB queries/indexes, BullMQ workers, GitHub webhook HMAC verification. | Vitest, Testcontainers, Supertest | PR / Merge queue | $< 3\text{ minutes}$ |
| **Adversarial Security** | Path traversal (`../`), symlink escapes, shell injection vectors, IDOR/BOLA multi-tenant isolation, ANSI escape injection. | Custom harness, Supertest | Nightly / Release Gate | $< 5\text{ minutes}$ |
| **Remediation & Mutation** | Atomic patch applications, dirty state aborts, AST modifications, rollbacks, and verification re-scans. | Vitest, Temp FS Sandbox | PR / Release Gate | $< 2\text{ minutes}$ |
| **End-to-End (E2E)** | Full CLI lifecycle (`init` $\rightarrow$ `plan` $\rightarrow$ `show` $\rightarrow$ `fix` $\rightarrow$ `verify`) on seeded multi-language repositories. | Bats / Vitest, Docker | Release Candidate | $< 10\text{ minutes}$ |

---

## 3. Seeded Fixture Repositories

To guarantee repeatable assertions across all supported scanner categories, the repository maintains a dedicated set of static test fixtures under `tests/fixtures/`.

```
tests/fixtures/
├── clean-project/
│   ├── src/index.ts
│   ├── package.json
│   ├── Dockerfile
│   └── infra/main.tf
├── seeded-vulnerabilities/
│   ├── secrets/
│   │   ├── config.env
│   │   └── certs/private.key
│   ├── dependencies/
│   │   ├── package.json
│   │   └── package-lock.json
│   ├── containers/
│   │   └── Dockerfile
│   └── iac/
│       ├── main.tf
│       └── variables.tf
└── malicious-payloads/
    ├── traversal-symlinks/
    ├── shell-operators/
    └── deep-nesting-bomb/
```

### 3.1 Synthetic Secret Fixture Specifications
Fixtures targeting secret detection **MUST** use deterministically generated tokens matching established regular expressions:

```env
# tests/fixtures/seeded-vulnerabilities/secrets/config.env
# Synthetic GitHub Personal Access Token (Deterministic Mock)
GITHUB_PAT=ghp_000000000000000000000000000000000000
# Synthetic AWS Access Key ID
AWS_ACCESS_KEY_ID=AKIA0000000000000000
# High-Entropy Hex String (Entropy > 4.5)
DATABASE_ENCRYPTION_KEY=a8f5c3d2e1b4a7f9e0c2d3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4
```

### 3.2 Known Dependency Vulnerability Fixtures
Fixtures targeting Trivy dependency scanning **MUST** pin package manifests to versions with publicly assigned, unfixable or fixed CVEs:

```json
{
  "name": "fixture-vulnerable-deps",
  "version": "1.0.0",
  "dependencies": {
    "lodash": "4.17.20",
    "axios": "0.21.1"
  }
}
```
* **Expected Identifiers:** `CVE-2021-23337` (Lodash), `CVE-2020-28168` (Axios).
* **Expected Severity:** `HIGH` / `CRITICAL`.

### 3.3 Container Misconfiguration Fixtures
Fixtures targeting Dockerfile misconfigurations **MUST** trigger root execution and missing health check directives:

```dockerfile
# tests/fixtures/seeded-vulnerabilities/containers/Dockerfile
FROM alpine:3.18.0
# Violation 1: Implicit root user (Checkov: CKV_DOCKER_4 / Trivy: DS002)
# Violation 2: Missing HEALTHCHECK instruction (Checkov: CKV_DOCKER_2)
RUN apk add --no-cache curl
ENTRYPOINT ["curl"]
```

### 3.4 Infrastructure as Code (Terraform) Fixtures
Fixtures targeting Checkov IaC evaluation **MUST** declare non-compliant cloud configurations without remote state or encryption:

```hcl
# tests/fixtures/seeded-vulnerabilities/iac/main.tf
resource "aws_s3_bucket" "insecure_data" {
  bucket = "shipshield-unencrypted-test-bucket"
  # Violation: Missing server-side encryption configuration (CKV_AWS_19)
  # Violation: Missing public access block configuration (CKV_AWS_53)
}
```

---

## 4. Subprocess Sandboxing & Adapter Contract Testing

Scanner adapters execute external binaries (`gitleaks`, `trivy`, `checkov`). Contract tests assert that ShipShield handles scanner anomalies predictably without throwing unhandled exceptions.

```mermaid
sequenceDiagram
    autonumber
    participant Harness as Test Harness
    participant Runner as ProcessRunner
    participant Mock as Mock Scanner Script

    Harness->>Runner: execute(["--timeout", "1000"])
    Runner->>Mock: spawn("mock-scanner.sh")
    Mock-->>Mock: sleep(3000)
    Note over Runner: Timeout exceeded (1000ms)
    Runner->>Mock: emit SIGTERM
    Note over Runner: Grace period (500ms)
    Runner->>Mock: emit SIGKILL (-9)
    Runner-->>Harness: RawScannerOutput(timedOut=true, exitCode=null)
    Harness->>Harness: Assert status === "timed_out"
```

### 4.1 Mock Binary Harness Architecture
Adapter tests execute against controlled mock scripts rather than live third-party binaries to test edge cases deterministically:

```bash
#!/usr/bin/env bash
# tests/mocks/bin/mock-gitleaks.sh
case "$MOCK_SCENARIO" in
  "CLEAN")
    echo "[]"
    exit 0
    ;;
  "LEAKS_DETECTED")
    cat <<EOF
[{"Description":"Synthetic PAT","StartLine":3,"EndLine":3,"Match":"ghp_000000000000000000000000000000000000","Secret":"ghp_000000000000000000000000000000000000","File":"config.env","RuleID":"github-pat"}]
EOF
    exit 1
    ;;
  "OOM_CRASH")
    echo "Fatal: Out of memory" >&2
    exit 137
    ;;
  "CORRUPT_JSON")
    echo "{\"partial\": [invalid_json"
    exit 1
    ;;
  "HANG")
    sleep 30
    exit 0
    ;;
  *)
    echo "Unknown scenario: $MOCK_SCENARIO" >&2
    exit 2
    ;;
esac
```

### 4.2 Adapter Contract Test Matrix

```typescript
describe('Scanner Adapter Contract Suites', () => {
  it('enforces memory buffer bounds on oversized stdout', async () => {
    // Configured maxOutputBufferBytes = 1MB
    const runner = new ProcessRunner({ maxOutputBufferBytes: 1024 * 1024 });
    const result = await runner.execute('cat', ['/dev/zero'], { timeoutMs: 2000 });
    
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Buffer limit exceeded');
  });

  it('guarantees process termination via SIGKILL on hung subprocess', async () => {
    const runner = new ProcessRunner({ timeoutMs: 500 });
    const start = Date.now();
    const result = await runner.execute('sh', ['-c', 'trap "" TERM; sleep 10'], {});
    const duration = Date.now() - start;

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(duration).toBeLessThan(6000); // 500ms timeout + 5000ms grace period
  });

  it('maps unexpected non-zero exit code to failed status', async () => {
    const adapter = new GitleaksAdapter();
    const rawOutput: RawScannerOutput = {
      exitCode: 137,
      stdout: '',
      stderr: 'Out of memory',
      durationMs: 120,
      timedOut: false
    };

    const parsed = await adapter.parseOutput(rawOutput, '/workspace');
    expect(parsed.status).toBe('failed');
    expect(parsed.findings).toHaveLength(0);
  });
});
```

---

## 5. Security & Adversarial Test Suites

ShipShield parses untrusted user files and third-party inputs. The security test suite executes adversarial attacks against path canonicalizers, argument serializers, and API access filters.

### 5.1 Command Injection and Shell Interpolation
Verify that input strings containing shell operators passed as filenames, rule IDs, or CLI arguments are treated strictly as data literals:

```typescript
describe('Security: Shell Injection Resistance', () => {
  const maliciousPaths = [
    'file; rm -rf / ;.env',
    'file$(whoami).env',
    'file`id`.env',
    'file | cat /etc/passwd #.env',
    '--checkpoint=1'
  ];

  it.each(maliciousPaths)('prevents shell execution for path: %s', async (maliciousPath) => {
    const runner = new ProcessRunner();
    const spy = vi.spyOn(child_process, 'spawn');

    await runner.execute('/bin/ls', [maliciousPath]);

    expect(spy).toHaveBeenCalledWith(
      '/bin/ls',
      [maliciousPath],
      expect.objectContaining({ shell: false })
    );
  });
});
```

### 5.2 Path Traversal & Symlink Escapes
Verify that report writers, configuration loaders, and remediation engines refuse to read from or write to locations outside the resolved workspace root:

```mermaid
flowchart LR
    Root[Workspace Root: /workspace] --> Inside[Safe Target: /workspace/Dockerfile]
    Root -. Attempt Escape .-> Symlink[Symlink: /workspace/escape.env]
    Symlink --> Outside[Prohibited Host Target: /etc/shadow]
    
    Inside --> Permitted[Action: Allow Read/Write]
    Outside --> Rejected[Action: Throw OUT_OF_BOUNDS Security Error]
```

```typescript
describe('Security: Filesystem Boundary Enforcement', () => {
  it('aborts patch generation if target path resolves outside workspace root', async () => {
    const sandboxDir = await createTempDir();
    const outsideFile = path.resolve(sandboxDir, '../outside.txt');
    await fs.writeFile(outsideFile, 'CRITICAL_HOST_DATA');

    const remediationEngine = new RemediationEngine(sandboxDir);
    
    await expect(
      remediationEngine.generatePatch({
        workspaceRoot: sandboxDir,
        targetPath: '../outside.txt',
        finding: mockFinding
      })
    ).rejects.toThrowError(/Access denied: Target path escapes workspace root/);
  });

  it('rejects traversal across symlinks pointing outside the project', async () => {
    const sandboxDir = await createTempDir();
    const externalTarget = path.resolve(sandboxDir, '../host-target.env');
    await fs.writeFile(externalTarget, 'TARGET_SECRET=123');

    const symlinkPath = path.join(sandboxDir, 'link.env');
    await fs.symlink(externalTarget, symlinkPath);

    const pathValidator = new PathSecurityValidator(sandboxDir);
    expect(() => pathValidator.assertSafePath(symlinkPath)).toThrowError(
      /Symlink escape detected/
    );
  });
});
```

### 5.3 Broken Object Level Authorization (BOLA / IDOR)
Verify multi-tenant database constraints to guarantee zero cross-tenant leakage:

```typescript
describe('Security: Multi-Tenant Authorization Enforcement', () => {
  it('returns 404 when querying an existing scan from another organization', async () => {
    const orgAId = new mongoose.Types.ObjectId();
    const orgBId = new mongoose.Types.ObjectId();
    
    // Seed scan belonging to Org B
    const scanOrgB = await ScanModel.create({
      scan_id: 'scan_01JTEST000000000000000000',
      organization_id: orgBId,
      repository_id: new mongoose.Types.ObjectId(),
      execution_status: 'completed'
    });

    // Make request authenticated as User from Org A
    const response = await supertest(app)
      .get(`/api/v1/scans/${scanOrgB.scan_id}`)
      .set('Authorization', `Bearer ${generateToken({ orgId: orgAId })}`)
      .expect(404);

    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(response.body.data).toBeUndefined();
  });
});
```

---

## 6. Remediation Safety & Mutation Testing

Remediation modifications directly mutate user source code. Tests must prove that no unverified or destructive state transition can occur.

```typescript
describe('Remediation Subsystem Safety Invariants', () => {
  it('aborts atomic patch application when file content hash changes (Dirty State Guard)', async () => {
    const tempDir = await createTempDir();
    const targetFile = path.join(tempDir, 'Dockerfile');
    await fs.writeFile(targetFile, 'FROM alpine:3.18\nUSER root\n');

    // 1. Generate patch based on original state
    const originalHash = crypto.createHash('sha256').update(await fs.readFile(targetFile)).digest('hex');
    const proposedPatch: ProposedPatch = {
      findingId: 'SS-DOCKER-1',
      targetPath: 'Dockerfile',
      originalContentHash: originalHash,
      diff: '--- Dockerfile\n+++ Dockerfile\n@@ -1,2 +1,3 @@\n FROM alpine:3.18\n+USER appuser\n',
      applyTransformation: (src) => src.replace('USER root', 'USER appuser')
    };

    // 2. Concurrently mutate the file before patch apply (simulating uncommitted developer work)
    await fs.appendFile(targetFile, '# Concurrent developer edit\n');

    // 3. Attempt apply
    const applier = new PatchApplier(tempDir);
    const result = await applier.applyAtomicPatch(proposedPatch);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('STALE_WORKSPACE');
    
    // Assert target file remained untouched after collision detection
    const currentContent = await fs.readFile(targetFile, 'utf8');
    expect(currentContent).toBe('FROM alpine:3.18\nUSER root\n# Concurrent developer edit\n');
  });

  it('guarantees that dry-run invocations do not modify target mtime or hash', async () => {
    const tempDir = await createTempDir();
    const targetFile = path.join(tempDir, 'main.tf');
    await fs.writeFile(targetFile, 'resource "aws_s3_bucket" "test" {}\n');

    const hashBefore = crypto.createHash('sha256').update(await fs.readFile(targetFile)).digest('hex');
    const statBefore = await fs.stat(targetFile);

    const cli = new ShipShieldCLI(tempDir);
    const exitCode = await cli.run(['fix', 'SS-IAC-1', '--dry-run']);

    const hashAfter = crypto.createHash('sha256').update(await fs.readFile(targetFile)).digest('hex');
    const statAfter = await fs.stat(targetFile);

    expect(exitCode).toBe(0);
    expect(hashBefore).toBe(hashAfter);
    expect(statBefore.mtimeMs).toBe(statAfter.mtimeMs);
  });
});
```

---

## 7. Golden Master & Deterministic Report Assertions

To guarantee cross-platform report consistency, complete CLI execution plans run against frozen fixture repositories and validate against static golden JSON master files.

### Golden Schema Parity Check
* **Path:** `tests/golden/scan-report.golden.json`
* **Invariant:** Every key in the golden master must exist, match type, and adhere to formatting rules. Dynamic values (timestamps, scan IDs, durations) are passed through a deterministic normalization filter before diffing:

$$\text{Normalize}(R) = R[\text{timestamp} \mapsto \text{"[FROZEN\_TIMESTAMP]"}, \text{scan\_id} \mapsto \text{"[FROZEN\_SCAN\_ID]"},\text{duration\_ms} \mapsto 0]$$

```typescript
describe('Golden Master Parity', () => {
  it('matches canonical JSON report structure exactly', async () => {
    const fixtureDir = path.resolve('tests/fixtures/seeded-vulnerabilities');
    const reportPath = path.resolve(fixtureDir, '.shipshield/reports/latest.json');
    const goldenReportPath = path.resolve('tests/golden/scan-report.golden.json');

    const cli = new ShipShieldCLI(fixtureDir);
    await cli.run(['plan', '--no-color']);

    const generatedRaw = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    const goldenRaw = JSON.parse(await fs.readFile(goldenReportPath, 'utf8'));

    expect(normalizeDynamicReportFields(generatedRaw)).toEqual(
      normalizeDynamicReportFields(goldenRaw)
    );
  });
});
```

---

## 8. Continuous Integration & Quality Gate Matrix

The ShipShield continuous integration pipeline blocks branch merges and release tags through an orchestrated multi-stage gate architecture.

```mermaid
flowchart LR
    Commit[Git Commit] --> Stage1[Stage 1: Static Quality]
    Stage1 --> Stage2[Stage 2: Contracts & Tests]
    Stage2 --> Stage3[Stage 3: Integration & Sandboxes]
    Stage3 --> Stage4[Stage 4: Adversarial Security Suites]
    Stage4 --> GatePassed[Quality Gate Satisfied]
    
    subgraph S1Metrics[Stage 1 Gates]
        Lint[ESLint Strict]
        Type[TypeScript Strict Typecheck]
        Dep[Audit Lockfile]
    end
    
    subgraph S2Metrics[Stage 2 Gates]
        Cov[Line Coverage >= 90%]
        BranchCov[Branch Coverage >= 85%]
        Signal[Adapter Signal Harness]
    end

    subgraph S3Metrics[Stage 3 Gates]
        DB[Testcontainers Mongo/Redis]
        API[OpenAPI / Contract Validation]
        Bull[Idempotent Queue Delivery]
    end

    subgraph S4Metrics[Stage 4 Gates]
        Redact[Synthetic Secret Leakage: 0%]
        Escapes[Traversal Escapes: 0%]
        IDOR[BOLA Authorization: 100%]
    end
```

### 8.1 Metric Thresholds and Merge Blockers

| Quality Gate | Metric / Criteria | Enforcement Threshold | CI Action on Failure |
| :--- | :--- | :--- | :--- |
| **Line Coverage** | Total executable statement coverage across `packages/core` and `packages/scan-core`. | $\ge 90.0\%$ | Hard failure (`exit 1`) |
| **Branch Coverage** | Conditional branch execution paths across policy and parsing modules. | $\ge 85.0\%$ | Hard failure (`exit 1`) |
| **Secret Leakage** | Occurrences of unmasked synthetic tokens in test stdout/reports. | $0\text{ occurrences}$ | Immediate job termination & security alert |
| **Flakiness Policy** | Retries permitted for unit, contract, and security suites. | $0\text{ retries allowed}$ | Any flaky run marks PR non-mergeable |
| **Lint & Typecheck** | Zero ESLint warnings, TypeScript `strict: true` compliance. | $0\text{ errors / } 0\text{ warnings}$ | Hard failure (`exit 1`) |

### 8.2 GitHub Actions Quality Gate Configuration (`ci.yml`)

```yaml
name: Production Quality Gate
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read
  checks: write
  pull-requests: write

jobs:
  static-quality:
    name: Stage 1 — Static Analysis & Typing
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  adapter-and-unit-tests:
    name: Stage 2 — Unit & Adapter Contracts
    needs: static-quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - name: Enforce Strict Coverage Gate
        run: |
          npx nyc check-coverage --lines 90 --branches 85 --functions 90 --statements 90

  adversarial-and-integration:
    name: Stage 3 — Security & Sandbox Integration
    needs: adapter-and-unit-tests
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017
      redis:
        image: redis:7.2-alpine
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:security
      - run: npm run test:integration

  golden-master-and-e2e:
    name: Stage 4 — Golden Master & E2E Verification
    needs: adversarial-and-integration
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - name: Verify Golden Fixture Parity
        run: npm run test:golden
      - name: Assert No Unredacted Synthetic Tokens
        run: |
          if grep -rq "ghp_000000000000000000000000000000000000" .shipshield/reports/; then
            echo "CRITICAL: Synthetic credential leaked into report store!"
            exit 1
          fi
```

---

## 9. Failure Modes & Recovery Verification Matrix

The test framework validates system behavior under degraded infrastructure and environment failures:

| Component | Injected Failure State | Expected Handling | Verified Exit / Status |
| :--- | :--- | :--- | :--- |
| **Worker Sandbox** | Out-of-memory (Linux OOM killer invokes `SIGKILL -9` on engine). | Process runner intercepts non-zero exit; records diagnostic message; marks scanner `failed`. | Overall scan: `incomplete` (Exit `4`) |
| **Filesystem** | Disk exhaustion during JSON report writing (`ENOSPC`). | Atomic swap fails; temporary file unlinked; original target preserved; safe error emitted. | CLI exit `10` (`internal_error`) |
| **MongoDB** | Replica set failover during scan completion transaction. | Client triggers bounded exponential backoff retry; if unrecovered, marks job retryable in Redis. | BullMQ job retried with backoff |
| **Redis / Queue** | Worker loses job lease while scan executes. | Redundant worker attempting to claim job asserts lease lock expiration before running duplicate scan. | Zero duplicate finding entries |
| **Process Runner** | Scanner engine hangs indefinitely (infinite loop in parser). | Process group receives `SIGTERM`; escalating after 5,000ms grace period to `SIGKILL`. | Scanner: `timed_out`, Scan: `incomplete` |

---

## 10. Acceptance & Release Blocker Checklist

A release candidate cannot be deployed to production or published to package registries until this sign-off checklist is satisfied:

- [ ] **100% Synthetic Secrets Policy:** Codebase, git history, and all fixture files verified to contain zero live or historical credentials.
- [ ] **Zero False-Pass Scenarios:** All tests asserting missing engines, timeouts, and crashed processes confirm that policy outcome cannot evaluate to `passed`.
- [ ] **Deterministic Exit Code Contract:** Automated tests on Linux (Ubuntu), macOS, and Windows prove exit codes strictly adhere to `04-cli-specification.md` (`0`, `1`, `2`, `3`, `4`, `5`, `6`, `10`).
- [ ] **Immutability of Planning Phase:** Validated via filesystem SHA-256 checks that `shipshield plan` leaves the repository filesystem byte-for-byte unchanged.
- [ ] **Cross-Tenant Authorization Suites:** Multi-tenant test matrix verifies 100% rejection rate for cross-organization resource queries across all API endpoints.
- [ ] **Coverage Invariants Satisfied:** Line coverage meets or exceeds $90.0\%$, and branch coverage meets or exceeds $85.0\%$.