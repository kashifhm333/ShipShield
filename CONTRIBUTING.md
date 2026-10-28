# Contributing to ShipShield

We welcome contributions to ShipShield!

## Development Principles
- **CLI-Only & Local-First:** ShipShield has no web interface or cloud server dependencies. All features must work completely locally and offline.
- **Safety First:** Safe process execution, argument vectors (no shell execution), and strict path validation are mandatory.
- **Strict Testing:** All new rules, commands, and adapters must include unit and integration tests.

## Getting Started
```bash
git clone https://github.com/kashifhm333/ShipShield.git
cd ShipShield
npm ci
npm run build
npm test
```

## Pull Request Checklist
- [ ] Code compiles cleanly (`npm run typecheck`).
- [ ] Linter passes (`npm run lint`).
- [ ] All tests pass (`npm test`).
- [ ] Documentation updated in `docs/` and `README.md`.
