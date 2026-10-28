# ShipShield Developer Guide

Guidelines for developing, testing, and contributing to ShipShield.

---

## 1. Monorepo Structure

- `apps/cli`: Commander.js CLI application, command handlers, terminal presenter.
- `packages/contracts`: Zod schemas, TypeScript types, exit code constants, interfaces.
- `packages/scan-core`: Core orchestration, native security policy engine, remediation, intelligence manager, process runner, reporting.
- `packages/scanner-adapters`: Adapters for Gitleaks, Trivy, and Checkov.
- `packages/schemas`: JSON schemas for report artifacts.
- `packaging/`: Debian packaging scripts (`build-deb.sh`) and metadata.

---

## 2. Development Workflow

```bash
# Clean build across all packages
npm run build

# TypeScript compilation and typecheck
npm run typecheck

# Code formatting and lint check
npm run lint

# Run entire Vitest unit, integration, and E2E test suite
npm test

# Run tests with code coverage reporting
npm run test:coverage
```

---

## 3. Adding a Native Security Policy

1. Define the rule in `packages/scan-core/src/policy/native-rules.ts`.
2. Assign a unique, stable rule ID (e.g. `SS-SECRET-005` or `SS-DOCKER-005`).
3. Specify category, severity (`critical`, `high`, `medium`, `low`, `info`), confidence (`high`, `medium`, `low`), remediation summary, and relevant standards (CWE, OWASP).
4. Implement the `check(ctx: PolicyExecutionContext): PolicyFindingResult[]` method.
5. Add unit and regression test cases in `packages/scan-core/test/native-policy.test.ts`.
