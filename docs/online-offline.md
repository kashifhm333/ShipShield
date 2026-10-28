# Online and Offline Scanning Modes in ShipShield

Offline resiliency is a foundational engineering guarantee of ShipShield. DevSecOps tools should never leak proprietary source code over the internet or fail silently when network access is restricted or unavailable.

---

## 1. Mode Definitions

### Online Mode (`shipshield scan . --mode online`)
In Online Mode, ShipShield may utilize network access to:
- Check for upstream vulnerability updates and package advisories.
- Download fresh intelligence databases via `shipshield db update`.
- Resolve remote dependencies or container base image manifests when third-party scanners request them.
- Verify scanner availability and version compatibility.

Online mode **never** uploads source code, secret evidence, or project telemetry to external servers. All static analysis, AST traversal, entropy scoring, and finding normalization occur locally.

### Offline Mode (`shipshield scan . --mode offline`)
In Offline Mode:
- **Zero Outbound Network Traffic:** No DNS resolution, HTTP requests, or external telemetry are initiated.
- **Local Native Rule Execution:** All 17+ native static analysis rules (`SS-SECRET-*`, `SS-DOCKER-*`, `SS-IAC-*`, `SS-CICD-*`, `SS-SUPPLY-*`, `SS-APP-*`) execute using in-memory tokenization and regex matching.
- **Cached Vulnerability Intelligence:** If vulnerability databases were previously seeded (e.g. via `shipshield db update` or pre-packaged bundles), dependency scanners read local cache directories (`~/.cache/trivy/db/trivy.db`).
- **Honest Completeness Reporting:** If a third-party scanner binary is missing or a vulnerability database is missing/expired, ShipShield explicitly marks that scanner as `unavailable` or `skipped`. It **never** fabricates clean results or ignores missing checks.

---

## 2. Parity Between Modes

| Capability | Online Mode | Offline Mode |
|---|---|---|
| Hardcoded Secrets Detection | Full (Gitleaks + Native Rules) | Full (Gitleaks + Native Rules) |
| Container Dockerfile Rules | Full (Trivy + Native Rules) | Full (Trivy + Native Rules) |
| Infrastructure-as-Code (Terraform/K8s) | Full (Checkov + Native Rules) | Full (Checkov + Native Rules) |
| CI/CD & Pipeline Misconfigurations | Full (Native Static Analysis) | Full (Native Static Analysis) |
| Dependency CVE Intelligence | Live & Cached Advisories | Cached Local Database Only |
| Cryptographic Integrity Verification | Full | Full |
| Report Formats (JSON, SARIF 2.1.0, Markdown) | Full | Full |
| Network Requests | Permitted for updates | Strictly Forbidden |

---

## 3. Air-Gapped Installation & Operation

For high-security, air-gapped environments without internet access:

1. **Host Prerequisites:**
   - Linux kernel (x86_64 or aarch64)
   - Node.js runtime (`>= 18.19.0`)
   - Standard POSIX utilities

2. **Debian Package Installation:**
   Transfer the pre-built `.deb` package (`dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb`) via secure media and install with `dpkg`:
   ```bash
   sudo dpkg -i shipshield_1.0.0-1~ubuntu24.04.1_all.deb
   ```

3. **Pre-Seeding Vulnerability Databases:**
   Transfer the cached Trivy vulnerability database (`trivy.db` and `metadata.json`) into `~/.cache/trivy/db/` or `/var/lib/trivy/db/`.
   Verify integrity locally:
   ```bash
   shipshield db verify
   ```

4. **Verify Offline Readiness:**
   ```bash
   shipshield check --mode offline
   ```
   If all scanners and local databases are detected, the command exits with code `0` (`PASSED`).
