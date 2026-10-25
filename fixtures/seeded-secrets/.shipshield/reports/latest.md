# ShipShield Security Gate Report

**Scan ID:** `scan_mvnhm4mk78d70496eddec05a`  
**Status:** **POLICY FAILED**  
**Execution Status:** `completed`  
**Started:** `2026-10-25T07:09:30.476Z`  
**Completed:** `2026-10-25T07:09:30.557Z`  

---

## 1. Executive Summary

| Metric | Value |
|:---|:---|
| **Total Findings** | 2 |
| **Critical** | 2 |
| **High** | 0 |
| **Medium** | 0 |
| **Low** | 0 |
| **Info** | 0 |
| **Policy Violations** | 2 |

---

## 2. Scanner Execution Details

| Scanner | Engine | Status | Duration | Findings |
|:---|:---|:---|:---|:---|
| **secrets** | gitleaks v8.18.2 | `completed` | 80ms | 2 |

---

## 3. Policy Violations

- **[aws-access-token]** Severity "critical" violates policy (fail_on: [critical, high]): Exposed Secret: aws-access-token (`SS-SEC-F733EE1B`)
- **[github-pat]** Severity "critical" violates policy (fail_on: [critical, high]): Exposed Secret: github-pat (`SS-SEC-60FB9B05`)

---

## 4. Findings

### [CRITICAL] Exposed Secret: aws-access-token (`SS-SEC-F733EE1B`)
- **Category:** `secrets` | **Scanner:** `gitleaks` | **Rule:** `aws-access-token`
- **Location:** `src/credentials.js:2`
- **Status:** `new`
- **Remediation:** Revoke and rotate the exposed credential immediately. Purge from Git history. (Fix available: No)

**Evidence:**
```
****
```

### [CRITICAL] Exposed Secret: github-pat (`SS-SEC-60FB9B05`)
- **Category:** `secrets` | **Scanner:** `gitleaks` | **Rule:** `github-pat`
- **Location:** `src/credentials.js:3`
- **Status:** `new`
- **Remediation:** Revoke and rotate the exposed credential immediately. Purge from Git history. (Fix available: No)

**Evidence:**
```
****
```
