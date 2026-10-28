# ShipShield Native Security Policies & Detection Engine

ShipShield integrates a built-in static analysis policy engine containing 17+ detection rules. Each rule features stable identifiers, confidence scoring, evidence redaction, and standards mapping (CWE, OWASP Top 10, CIS Benchmarks).

---

## Implemented Security Policy Catalog

### Category A: Secrets & Credentials
| Policy ID | Title | Severity | Confidence | Standards |
|---|---|---|---|---|
| `SS-SECRET-001` | Hardcoded Private Cryptographic Key | CRITICAL | HIGH | CWE-798, OWASP-A02:2021, NIST-SP-800-53 |
| `SS-SECRET-002` | Exposed AWS Access Key Credential | CRITICAL | HIGH | CWE-798, CIS-AWS-1.4 |
| `SS-SECRET-003` | Exposed SaaS & Developer Platform Token | HIGH | HIGH | CWE-798, OWASP-A07:2021 |
| `SS-SECRET-004` | Database Connection String with Plaintext Password | HIGH | MEDIUM | CWE-256, OWASP-A02:2021 |

### Category B: Containers & Docker
| Policy ID | Title | Severity | Confidence | Standards |
|---|---|---|---|---|
| `SS-DOCKER-001` | Container Running as Root User | HIGH | HIGH | CIS-Docker-4.1, CWE-250, NIST-SP-800-190 |
| `SS-DOCKER-002` | Mutable or Unpinned Base Image Tag | MEDIUM | HIGH | CIS-Docker-4.2, OWASP-A06:2021 |
| `SS-DOCKER-003` | Sensitive Credential File Copied into Container Image | CRITICAL | HIGH | CWE-798, CIS-Docker-4.3 |
| `SS-DOCKER-004` | Docker Daemon Socket Mounted Inside Container | CRITICAL | HIGH | CWE-250, CIS-Docker-2.1 |

### Category C: Infrastructure as Code & Kubernetes
| Policy ID | Title | Severity | Confidence | Standards |
|---|---|---|---|---|
| `SS-IAC-001` | Publicly Accessible Cloud Storage Bucket | CRITICAL | HIGH | CIS-AWS-2.1.5, CWE-284, OWASP-A01:2021 |
| `SS-IAC-002` | Overly Permissive Ingress Security Group (0.0.0.0/0 on Port 22) | HIGH | HIGH | CIS-AWS-4.1, CWE-284 |
| `SS-K8S-001` | Kubernetes Container Running with Privileged SecurityContext | CRITICAL | HIGH | CIS-K8s-5.2.1, CWE-250 |

### Category D: CI/CD & GitHub Actions Security
| Policy ID | Title | Severity | Confidence | Standards |
|---|---|---|---|---|
| `SS-CICD-001` | Untrusted Pull Request Context in GitHub Actions Script | CRITICAL | HIGH | CWE-78, OWASP-CICD-SEC-01 |
| `SS-CICD-002` | Overly Permissive Workflow Permissions (write-all) | HIGH | HIGH | CWE-250, OWASP-CICD-SEC-04 |

### Category E: Supply Chain & Dependencies
| Policy ID | Title | Severity | Confidence | Standards |
|---|---|---|---|---|
| `SS-SUPPLY-001` | Insecure Plaintext HTTP Package Registry Configured | HIGH | HIGH | CWE-319, OWASP-A02:2021 |
| `SS-SUPPLY-002` | Dangerous Remote Shell Execution in Package Lifecycle Script | CRITICAL | HIGH | CWE-78, OWASP-A08:2021 |

### Category F: Application & General Security
| Policy ID | Title | Severity | Confidence | Standards |
|---|---|---|---|---|
| `SS-APP-001` | TLS Certificate Verification Disabled | HIGH | HIGH | CWE-295, OWASP-A02:2021 |
| `SS-APP-002` | Wildcard CORS Header with Credential Sharing Allowed | MEDIUM | MEDIUM | CWE-346, OWASP-A07:2021 |

---

## Evidence Redaction Guarantee

Discovered credentials, API tokens, and private keys are **automatically redacted** by `RedactionEngine` before being displayed on terminal stdout or persisted to JSON/SARIF reports.

Example Evidence Redaction:
```
Original:  AKIAIOSFODNN7EXAMPLE
Redacted:  AKIA****************
Original:  postgres://user:P@ssword123@db:5432/db
Redacted:  postgres://user:****************@db:5432/db
```
Raw secrets are never exposed in logs or unencrypted report files.
