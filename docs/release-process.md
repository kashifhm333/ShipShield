# ShipShield Release Process

How ShipShield is built, verified, cryptographically signed, and released.

---

## 1. Versioning Standard

ShipShield adheres strictly to Semantic Versioning (SemVer 2.0.0). All package manifests (`package.json`, `apps/cli/package.json`, `packages/*/package.json`) and `debian/changelog` must be synchronized.

---

## 2. Release Build & Packaging Pipeline

Run the automated packaging pipeline:
```bash
./packaging/build-deb.sh
```

This pipeline generates:
1. **Binary Debian Package:** `dist-deb/shipshield_<version>_all.deb`
2. **Launchpad Source Package:**
   - `shipshield_<version>.orig.tar.gz`
   - `shipshield_<version>.debian.tar.xz`
   - `shipshield_<version>.dsc`
   - `shipshield_<version>_source.changes`
3. **Cryptographic Checksums:** `dist-deb/SHA256SUMS`

---

## 3. Verification

Before publishing any release:
```bash
# Verify checksums
cd dist-deb && sha256sum -c SHA256SUMS

# Verify package installation in isolated container
docker run -v $(pwd):/dist ubuntu:24.04 bash -c "
  apt-get update && apt-get install -y /dist/dist-deb/shipshield_*_all.deb &&
  shipshield --version && shipshield doctor
"
```
