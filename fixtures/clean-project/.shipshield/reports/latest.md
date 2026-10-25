# ShipShield Security Gate Report

**Scan ID:** `scan_mvnhj38l038940a47f935231`  
**Status:** **INCOMPLETE**  
**Execution Status:** `failed`  
**Started:** `2026-10-25T07:07:08.709Z`  
**Completed:** `2026-10-25T07:07:12.394Z`  

---

## 1. Executive Summary

| Metric | Value |
|:---|:---|
| **Total Findings** | 4 |
| **Critical** | 0 |
| **High** | 1 |
| **Medium** | 1 |
| **Low** | 2 |
| **Info** | 0 |
| **Policy Violations** | 1 |

---

## 2. Scanner Execution Details

| Scanner | Engine | Status | Duration | Findings |
|:---|:---|:---|:---|:---|
| **dependencies** | trivy | `not_applicable` | 0ms | 0 |
| **iac** | checkov | `skipped` | 2ms | 0 |
| **secrets** | gitleaks v8.18.2 | `completed` | 78ms | 0 |
| **containers** | trivy vVersion: 0.76.1 | `completed` | 3681ms | 4 |

---

## 3. Policy Violations

- **[AWS-0132]** Severity "high" violates policy (fail_on: [critical, high]): S3 encryption should use Customer Managed Keys (`SS-CON-71092848`)

---

## 4. Findings

### [HIGH] S3 encryption should use Customer Managed Keys (`SS-CON-71092848`)
- **Category:** `containers` | **Scanner:** `trivy` | **Rule:** `AWS-0132`
- **Location:** `main.tf:1`
- **Status:** `new`
- **Remediation:** Use SSE-KMS with a customer managed key (CMK) (Fix available: No)

**Evidence:**
```
Bucket does not encrypt data with a customer managed key.
```

### [MEDIUM] S3 Data should be versioned (`SS-CON-9C445606`)
- **Category:** `containers` | **Scanner:** `trivy` | **Rule:** `AWS-0090`
- **Location:** `main.tf:1`
- **Status:** `new`
- **Remediation:** Enable versioning to protect against accidental/malicious removal or modification (Fix available: No)

**Evidence:**
```
Bucket does not have versioning enabled
```

### [LOW] No HEALTHCHECK defined (`SS-CON-6D58CB90`)
- **Category:** `containers` | **Scanner:** `trivy` | **Rule:** `DS-0026`
- **Location:** `Dockerfile`
- **Status:** `new`
- **Remediation:** Add HEALTHCHECK instruction in Dockerfile (Fix available: No)

**Evidence:**
```
Add HEALTHCHECK instruction in your Dockerfile
```

### [LOW] S3 Bucket Logging (`SS-CON-C921BE25`)
- **Category:** `containers` | **Scanner:** `trivy` | **Rule:** `AWS-0089`
- **Location:** `main.tf:1`
- **Status:** `new`
- **Remediation:** Add a logging block to the resource to enable access logging (Fix available: No)

**Evidence:**
```
Bucket has logging disabled
```
