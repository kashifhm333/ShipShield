# Changelog

All notable changes to ShipShield will be documented in this file.

## [1.0.0] - 2026-10-28

### Architecture & Engine Transformation
- **CLI-Only Architecture:** Completely removed legacy web application, HTTP API servers, frontend UI, MongoDB models, BullMQ Redis queues, and Docker Compose configurations.
- **Native Static Analysis Policy Engine:** Introduced 17+ native security rules spanning Secrets, Containers, Infrastructure as Code, Kubernetes, CI/CD pipelines, Supply Chain integrity, and Application Security.
- **Genuine Offline Mode:** Guaranteed zero outbound network calls during offline scans (`shipshield scan . --mode offline`), with full local rule execution and cached vulnerability database fallback.
- **SARIF v2.1.0 Support:** Added full SARIF report generation format (`--format sarif`) compatible with GitHub Advanced Security code scanning.
- **New CLI Commands:** Added `check`, `policy` (`list`, `show`, `validate`), `db` (`status`, `update`, `verify`), `config` (`validate`), and `report`.
- **Packaging Pipeline:** Automated Debian package builds (`dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb`), Launchpad source packaging, and cryptographic SHA-256 verification.
- **Comprehensive Test Suite:** 15 test files with 170 unit, integration, and E2E tests covering offline scans, policy validation, and command execution.
