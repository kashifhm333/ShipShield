# ShipShield Security & Threat Model

ShipShield's security model protects developer environments, build nodes, and proprietary source code against unauthorized access, command execution, and token leakage.

---

## 1. Core Security Invariants

1. **No External Network Leaks in Scans:**
   Source code, AST data, and detected secret evidence are never transmitted outside the local machine.
2. **Safe Process Execution:**
   All third-party scanners (`gitleaks`, `trivy`, `checkov`) are invoked via explicit vector arrays (`string[]`). Shell execution (`/bin/sh -c`) is strictly disabled to prevent command injection.
3. **Environment Variable Sanitization:**
   Tokens, AWS keys, GitHub credentials, and authorization headers in the host environment are filtered and stripped before spawning child processes.
4. **Mandatory Redaction:**
   Sensitive credentials (API tokens, private keys, database passwords) discovered in code are automatically redacted with masking (`****`) before display or persistence.
5. **Path Traversal & Symlink Escape Prevention:**
   All scanned targets and report write paths are verified by `PathValidator` to prevent symlink traversal attacks outside the workspace boundary.
6. **Git File Protocol Restriction:**
   Workspace isolation explicitly forces `git -c protocol.file.allow=never` to block git-based LFI and malicious submodule execution.
7. **Non-Destructive Remediation by Default:**
   Remediation proposals run in dry-run mode by default. File modification requires explicit `--apply` authorization with SHA-256 precondition verification.
