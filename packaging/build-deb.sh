#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

PKG_NAME="shipshield"
PKG_VERSION="1.0.0"
ARCH="$(dpkg --print-architecture 2>/dev/null || echo "amd64")"
BUILD_DIR="${ROOT_DIR}/dist-deb/${PKG_NAME}_${PKG_VERSION}_${ARCH}"

echo "Building ShipShield Debian Package (${PKG_NAME}_${PKG_VERSION}_${ARCH}.deb)..."

# Ensure monorepo is built
cd "${ROOT_DIR}"
npm run build

# Prepare staging directories
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}/DEBIAN"
mkdir -p "${BUILD_DIR}/usr/lib/shipshield"
mkdir -p "${BUILD_DIR}/usr/bin"
mkdir -p "${BUILD_DIR}/usr/lib/systemd/user"

# Generate binary DEBIAN/control file
cat << EOF > "${BUILD_DIR}/DEBIAN/control"
Package: ${PKG_NAME}
Version: ${PKG_VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Maintainer: ShipShield Team <maintainers@shipshield.dev>
Depends: nodejs (>= 20.11.0), git
Recommends: gitleaks, trivy, checkov
Description: Production-grade local-first DevSecOps security gate platform
 ShipShield provides a developer-first security gate and local-first background
 engine that detects secrets, vulnerable dependencies, container
 misconfigurations, and infrastructure-as-code risks before they ship.
EOF

# Copy systemd user service
cp "${ROOT_DIR}/packaging/systemd/shipshield-engine.service" "${BUILD_DIR}/usr/lib/systemd/user/"

# Copy runtime files
cp -r "${ROOT_DIR}/package.json" "${BUILD_DIR}/usr/lib/shipshield/"
cp -r "${ROOT_DIR}/packages" "${BUILD_DIR}/usr/lib/shipshield/"
cp -r "${ROOT_DIR}/apps" "${BUILD_DIR}/usr/lib/shipshield/"
cp -r "${ROOT_DIR}/node_modules" "${BUILD_DIR}/usr/lib/shipshield/"

# Create binary launcher script
cat << 'EOF' > "${BUILD_DIR}/usr/bin/shipshield"
#!/usr/bin/env bash
exec /usr/bin/node /usr/lib/shipshield/apps/cli/dist/index.js "$@"
EOF
chmod 755 "${BUILD_DIR}/usr/bin/shipshield"

# Postinst script
cat << 'EOF' > "${BUILD_DIR}/DEBIAN/postinst"
#!/usr/bin/env bash
set -e
if [ "$1" = "configure" ]; then
  chmod 755 /usr/bin/shipshield
fi
exit 0
EOF
chmod 755 "${BUILD_DIR}/DEBIAN/postinst"

# Build .deb archive
mkdir -p "${ROOT_DIR}/dist-deb"
dpkg-deb --build --root-owner-group "${BUILD_DIR}" "${ROOT_DIR}/dist-deb/${PKG_NAME}_${PKG_VERSION}_${ARCH}.deb"

echo "✔ Debian package built successfully: ${ROOT_DIR}/dist-deb/${PKG_NAME}_${PKG_VERSION}_${ARCH}.deb"
