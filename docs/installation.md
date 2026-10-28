# ShipShield Installation & Deployment Guide

ShipShield supports multiple production-ready installation methods for Ubuntu, Debian, Linux servers, air-gapped systems, and local development environments.

---

## Method 1: Automated Production Installer (Recommended for Ubuntu & Debian)

Run the automated installer script:
```bash
sudo ./install.sh
```

Or via direct download:
```bash
curl -sSL https://raw.githubusercontent.com/kashifhm333/ShipShield/main/install.sh | sudo bash
```

### Non-Root User Installation:
To install ShipShield into your home directory without root privileges:
```bash
./install.sh --prefix "$HOME/.local"
```
Ensure `$HOME/.local/bin` is in your `PATH`.

### Preflight Diagnostics (Dry-Run):
To check prerequisites and scanner availability without making system changes:
```bash
./install.sh --check
```

---

## Method 2: Debian Package Installation (`.deb`)

ShipShield provides pre-built `.deb` binary packages for Ubuntu 24.04 LTS (noble) and Debian systems:

```bash
# Build the Debian package locally
./packaging/build-deb.sh

# Install using apt to automatically resolve system dependencies
sudo apt-get update
sudo apt-get install -y ./dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb
```

Verify installation:
```bash
shipshield --version
shipshield doctor
```

---

## Method 3: Development Installation from Source

For contributors and developers:

```bash
git clone https://github.com/kashifhm333/ShipShield.git
cd ShipShield

# Install dependencies deterministically
npm ci

# Build monorepo packages
npm run build

# Run test suite
npm test

# Link CLI globally for development
npm link --workspace=@shipshield/cli
```

---

## Uninstallation

To remove ShipShield cleanly:
```bash
sudo ./install.sh --uninstall
```
Or if installed via Debian package:
```bash
sudo apt-get remove -y shipshield
```
This removes the binary symlinks and runtime libraries while preserving user report directories and local databases unless explicitly purged.
