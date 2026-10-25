#!/usr/bin/env bash
# ==============================================================================
# ShipShield Production Packaging Pipeline
# Builds:
#  1. Local Binary Package: shipshield_<version>_all.deb
#  2. Launchpad Source Package:
#     - shipshield_<upstream>.orig.tar.gz
#     - shipshield_<full_version>.debian.tar.xz
#     - shipshield_<full_version>.dsc
#     - shipshield_<full_version>_source.changes
#  3. Cryptographic Checksums: dist-deb/SHA256SUMS
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist-deb"

cd "${ROOT_DIR}"

echo "======================================================================"
echo " ShipShield Ubuntu Packaging Pipeline (Ubuntu 24.04 LTS noble)"
echo "======================================================================"

# 1. Version Reconciliation
if [ ! -f "${ROOT_DIR}/debian/changelog" ]; then
  echo "Error: debian/changelog missing!" >&2
  exit 1
fi

CHANGELOG_PKG="$(head -n 1 debian/changelog | awk '{print $1}')"
CHANGELOG_FULL_VER="$(head -n 1 debian/changelog | sed -E 's/.*\((.*)\).*/\1/')"
CHANGELOG_SERIES="$(head -n 1 debian/changelog | awk '{print $3}' | tr -d ';')"
UPSTREAM_VER="$(echo "${CHANGELOG_FULL_VER}" | cut -d'-' -f1)"

ROOT_VER="$(node -p "require('./package.json').version")"
CLI_VER="$(node -p "require('./apps/cli/package.json').version")"

echo "Package Name:      ${CHANGELOG_PKG}"
echo "Full Version:      ${CHANGELOG_FULL_VER}"
echo "Upstream Version:  ${UPSTREAM_VER}"
echo "Target Series:     ${CHANGELOG_SERIES}"
echo "Root Manifest Ver: ${ROOT_VER}"
echo "CLI Manifest Ver:  ${CLI_VER}"

if [ "${UPSTREAM_VER}" != "${ROOT_VER}" ]; then
  echo "Error: Upstream version mismatch between debian/changelog (${UPSTREAM_VER}) and package.json (${ROOT_VER})!" >&2
  exit 1
fi

# Ensure packaging/debian is kept 100% in sync with canonical debian/
mkdir -p "${ROOT_DIR}/packaging/debian"
cp -r "${ROOT_DIR}/debian"/* "${ROOT_DIR}/packaging/debian/"

# 2. Rebuild Monorepo Artifacts
echo ""
echo "--> Compiling TypeScript monorepo packages in dependency order..."
npm run build

# 3. Clean and prepare dist directory
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

# 4. Stage Local Binary Package
STAGE_DIR="${DIST_DIR}/binary-stage"
PKG_DIR="${STAGE_DIR}/usr/lib/shipshield"

echo ""
echo "--> Staging isolated production runtime tree in ${STAGE_DIR}..."
rm -rf "${STAGE_DIR}"
mkdir -p "${PKG_DIR}"
mkdir -p "${PKG_DIR}/packages"
mkdir -p "${PKG_DIR}/apps"
mkdir -p "${PKG_DIR}/node_modules/@shipshield"
mkdir -p "${STAGE_DIR}/usr/bin"
mkdir -p "${STAGE_DIR}/usr/lib/systemd/user"
mkdir -p "${STAGE_DIR}/usr/share/man/man1"
mkdir -p "${STAGE_DIR}/usr/share/doc/shipshield"
mkdir -p "${STAGE_DIR}/DEBIAN"

# Copy root manifest
cp "${ROOT_DIR}/package.json" "${PKG_DIR}/"

# Copy required production packages (dist + package.json)
for pkg in contracts schemas scan-core scanner-adapters; do
  mkdir -p "${PKG_DIR}/packages/${pkg}"
  cp "${ROOT_DIR}/packages/${pkg}/package.json" "${PKG_DIR}/packages/${pkg}/"
  cp -r "${ROOT_DIR}/packages/${pkg}/dist" "${PKG_DIR}/packages/${pkg}/"
  ln -s "../../packages/${pkg}" "${PKG_DIR}/node_modules/@shipshield/${pkg}"
done

# Copy CLI app (dist + package.json)
mkdir -p "${PKG_DIR}/apps/cli"
cp "${ROOT_DIR}/apps/cli/package.json" "${PKG_DIR}/apps/cli/"
cp -r "${ROOT_DIR}/apps/cli/dist" "${PKG_DIR}/apps/cli/"

# Copy production runtime dependencies
for dep in commander zod diff yaml; do
  if [ -d "${ROOT_DIR}/node_modules/${dep}" ]; then
    cp -r "${ROOT_DIR}/node_modules/${dep}" "${PKG_DIR}/node_modules/"
  else
    echo "Error: Required runtime dependency node_modules/${dep} not found!" >&2
    exit 1
  fi
done

# Install CLI launcher
cp "${ROOT_DIR}/debian/shipshield.launcher" "${STAGE_DIR}/usr/bin/shipshield"
chmod 0755 "${STAGE_DIR}/usr/bin/shipshield"

# Install systemd user service
cp "${ROOT_DIR}/debian/shipshield-engine.service" "${STAGE_DIR}/usr/lib/systemd/user/shipshield-engine.service"

# Install manual page (compressed with gzip -9n)
gzip -9n -c "${ROOT_DIR}/debian/shipshield.1" > "${STAGE_DIR}/usr/share/man/man1/shipshield.1.gz"

# Install documentation
cp "${ROOT_DIR}/debian/copyright" "${STAGE_DIR}/usr/share/doc/shipshield/copyright"
gzip -9n -c "${ROOT_DIR}/debian/changelog" > "${STAGE_DIR}/usr/share/doc/shipshield/changelog.Debian.gz"

# Generate binary DEBIAN/control file
cat << EOF > "${STAGE_DIR}/DEBIAN/control"
Package: ${CHANGELOG_PKG}
Version: ${CHANGELOG_FULL_VER}
Section: utils
Priority: optional
Architecture: all
Maintainer: Kashif Hussain <memonkashif0001@gmail.com>
Depends: nodejs (>= 18.19.0), git
Recommends: gitleaks
Suggests: trivy, checkov
Description: Production-grade local-first DevSecOps security gate platform
 ShipShield provides a developer-first security gate and local-first background
 engine that detects secrets, vulnerable dependencies, container
 misconfigurations, and infrastructure-as-code risks before they ship.
EOF

# Copy maintainer scripts
cp "${ROOT_DIR}/debian/postinst" "${STAGE_DIR}/DEBIAN/postinst"
cp "${ROOT_DIR}/debian/prerm" "${STAGE_DIR}/DEBIAN/prerm"
cp "${ROOT_DIR}/debian/postrm" "${STAGE_DIR}/DEBIAN/postrm"
chmod 0755 "${STAGE_DIR}/DEBIAN/postinst" "${STAGE_DIR}/DEBIAN/prerm" "${STAGE_DIR}/DEBIAN/postrm"

# Build Binary .deb
DEB_FILE="${DIST_DIR}/${CHANGELOG_PKG}_${CHANGELOG_FULL_VER}_all.deb"
echo ""
echo "--> Building binary Debian package: ${DEB_FILE}..."
dpkg-deb --build --root-owner-group "${STAGE_DIR}" "${DEB_FILE}"
rm -rf "${STAGE_DIR}"

# 5. Build Debian Source Package for Launchpad PPA
echo ""
echo "--> Assembling Launchpad Debian Source Package..."
SRC_DIR="${DIST_DIR}/source-stage"
SRC_TREE="${SRC_DIR}/${CHANGELOG_PKG}-${UPSTREAM_VER}"
ORIG_TAR="${SRC_DIR}/${CHANGELOG_PKG}_${UPSTREAM_VER}.orig.tar.gz"

rm -rf "${SRC_DIR}"
mkdir -p "${SRC_TREE}"

# Populate source tree for orig archive
cp "${ROOT_DIR}/package.json" "${SRC_TREE}/"
cp "${ROOT_DIR}/package-lock.json" "${SRC_TREE}/"
cp "${ROOT_DIR}/LICENSE" "${SRC_TREE}/"
cp "${ROOT_DIR}/README.md" "${SRC_TREE}/"
cp "${ROOT_DIR}/tsconfig.json" "${SRC_TREE}/"

# Copy packages and cli (with compiled dist and source)
mkdir -p "${SRC_TREE}/packages"
mkdir -p "${SRC_TREE}/apps"
for pkg in contracts schemas scan-core scanner-adapters; do
  cp -r "${ROOT_DIR}/packages/${pkg}" "${SRC_TREE}/packages/"
done
cp -r "${ROOT_DIR}/apps/cli" "${SRC_TREE}/apps/"

# Copy production node_modules
mkdir -p "${SRC_TREE}/node_modules/@shipshield"
for pkg in contracts schemas scan-core scanner-adapters; do
  ln -s "../../packages/${pkg}" "${SRC_TREE}/node_modules/@shipshield/${pkg}"
done
for dep in commander zod diff yaml; do
  cp -r "${ROOT_DIR}/node_modules/${dep}" "${SRC_TREE}/node_modules/"
done

# Copy documentation and fixtures
cp -r "${ROOT_DIR}/docs" "${SRC_TREE}/"
cp -r "${ROOT_DIR}/fixtures" "${SRC_TREE}/"

# Create .orig.tar.gz
echo "--> Creating upstream source archive: ${ORIG_TAR}..."
tar --exclude-vcs \
    --exclude="*.log" \
    --exclude=".env*" \
    --owner=0 --group=0 --numeric-owner \
    -czf "${ORIG_TAR}" -C "${SRC_DIR}" "${CHANGELOG_PKG}-${UPSTREAM_VER}"

# Add canonical debian metadata to source tree
cp -r "${ROOT_DIR}/debian" "${SRC_TREE}/debian"

# Build source package files (.dsc, .debian.tar.xz)
echo "--> Running dpkg-source -b to build .dsc and .debian.tar.xz..."
cd "${SRC_DIR}"
dpkg-source -b "${CHANGELOG_PKG}-${UPSTREAM_VER}"

# Generate source .changes file
echo "--> Generating source .changes file..."
cd "${SRC_TREE}"
dpkg-genchanges -S -sa -O"${DIST_DIR}/${CHANGELOG_PKG}_${CHANGELOG_FULL_VER}_source.changes"

# Move generated source files to dist-deb
mv "${SRC_DIR}/${CHANGELOG_PKG}_${UPSTREAM_VER}.orig.tar.gz" "${DIST_DIR}/"
mv "${SRC_DIR}/${CHANGELOG_PKG}_${CHANGELOG_FULL_VER}.dsc" "${DIST_DIR}/"
mv "${SRC_DIR}/${CHANGELOG_PKG}_${CHANGELOG_FULL_VER}.debian.tar.xz" "${DIST_DIR}/"
rm -rf "${SRC_DIR}"

# 6. Generate Cryptographic Checksums
echo ""
echo "--> Generating SHA-256 Checksums for release artifacts..."
cd "${DIST_DIR}"
sha256sum "${CHANGELOG_PKG}_${CHANGELOG_FULL_VER}_all.deb" \
          "${CHANGELOG_PKG}_${UPSTREAM_VER}.orig.tar.gz" \
          "${CHANGELOG_PKG}_${CHANGELOG_FULL_VER}.debian.tar.xz" \
          "${CHANGELOG_PKG}_${CHANGELOG_FULL_VER}.dsc" \
          "${CHANGELOG_PKG}_${CHANGELOG_FULL_VER}_source.changes" > SHA256SUMS

echo ""
echo "======================================================================"
echo "✔ ShipShield Packaging Pipeline Completed Successfully!"
echo "======================================================================"
echo "Generated Release Artifacts in ${DIST_DIR}:"
ls -lh "${DIST_DIR}"
echo ""
echo "SHA-256 Checksums:"
cat "${DIST_DIR}/SHA256SUMS"
echo ""
echo "Next Steps for Maintainer:"
echo " 1. Run debsign on the changes file:"
echo "    debsign -k <YOUR_GPG_KEY_ID> ${DIST_DIR}/${CHANGELOG_PKG}_${CHANGELOG_FULL_VER}_source.changes"
echo " 2. Upload source package to Launchpad PPA:"
echo "    dput ppa:<YOUR_LAUNCHPAD_USER>/<PPA_NAME> ${DIST_DIR}/${CHANGELOG_PKG}_${CHANGELOG_FULL_VER}_source.changes"
echo "======================================================================"
