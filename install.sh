#!/usr/bin/env bash
# ==============================================================================
# ShipShield Production Installer & Manager
# Usage:
#   curl -sSL https://raw.githubusercontent.com/kashifhm333/ShipShield/main/install.sh | sudo bash
#   sudo ./install.sh [--uninstall] [--repair] [--help]
# ==============================================================================

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

INSTALL_DIR="/usr/lib/shipshield"
BIN_DIR="/usr/local/bin"
ACTION="install"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --uninstall)
      ACTION="uninstall"
      shift
      ;;
    --repair)
      ACTION="repair"
      shift
      ;;
    --help|-h)
      echo "ShipShield Installer & Lifecycle Manager"
      echo "Usage: sudo ./install.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --install     Perform full installation (default)"
      echo "  --repair      Reinstall binaries and verify scanner dependencies"
      echo "  --uninstall   Remove ShipShield binaries, symlinks, and runtime libraries"
      echo "  --help, -h    Display this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run './install.sh --help' for usage."
      exit 1
      ;;
  esac
done

# Root privilege check
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Root or sudo privileges required to manage /usr/lib/shipshield and /usr/local/bin.${NC}"
    echo "Please run: sudo bash $0 $*"
    exit 1
fi

if [ "$ACTION" = "uninstall" ]; then
    echo -e "${BLUE}====================================================${NC}"
    echo -e "${YELLOW}🗑️   Uninstalling ShipShield Security Platform   🗑️${NC}"
    echo -e "${BLUE}====================================================${NC}"

    echo "Removing launcher symlinks..."
    rm -f "$BIN_DIR/shipshield" /usr/bin/shipshield 2>/dev/null || true

    echo "Removing runtime libraries..."
    rm -rf "$INSTALL_DIR"

    echo "Removing systemd service..."
    rm -f /usr/lib/systemd/user/shipshield-engine.service /etc/systemd/user/shipshield-engine.service 2>/dev/null || true

    echo -e "${GREEN}✔ ShipShield has been successfully uninstalled.${NC}"
    exit 0
fi

echo -e "${BLUE}====================================================${NC}"
echo -e "${GREEN}🛡️   Installing ShipShield DevSecOps Security Gate   🛡️${NC}"
echo -e "${BLUE}====================================================${NC}"

# 1. System & OS Verification
OS_NAME="$(uname -s)"
ARCH_NAME="$(uname -m)"

if [ "$OS_NAME" != "Linux" ]; then
    echo -e "${RED}Error: ShipShield production packaging currently targets Linux (detected: $OS_NAME).${NC}"
    exit 1
fi

echo -e "\n${BLUE}1. Checking runtime dependencies...${NC}"

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
        echo -e "${YELLOW}Node.js not found. Installing nodejs via apt...${NC}"
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq && apt-get install -y -qq nodejs git
    else
        echo -e "${RED}Error: Node.js (>= 18.19.0) is required but not installed.${NC}"
        exit 1
    fi
fi

# Verify Node.js version
NODE_VERSION="$(node -v | sed 's/^v//')"
NODE_MAJOR="$(echo "$NODE_VERSION" | cut -d'.' -f1)"
NODE_MINOR="$(echo "$NODE_VERSION" | cut -d'.' -f2)"

if [ "$NODE_MAJOR" -lt 18 ] || ([ "$NODE_MAJOR" -eq 18 ] && [ "$NODE_MINOR" -lt 19 ]); then
    echo -e "${RED}Error: Node.js version >= 18.19.0 is required. Found: v${NODE_VERSION}${NC}"
    echo "Please upgrade Node.js and rerun the installer."
    exit 1
fi
echo -e "${GREEN}✔ Node.js v${NODE_VERSION} detected.${NC}"

# Check Git
if ! command -v git >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
        apt-get install -y -qq git
    fi
fi
if command -v git >/dev/null 2>&1; then
    echo -e "${GREEN}✔ Git detected.${NC}"
else
    echo -e "${RED}Error: Git is required for repository analysis.${NC}"
    exit 1
fi

# Scanner engines inspection & optional provisioning
echo -e "\n${BLUE}2. Inspecting security scanning engines...${NC}"

# Gitleaks (Secrets)
if command -v gitleaks >/dev/null 2>&1; then
    GITLEAKS_VER="$(gitleaks version 2>/dev/null || echo 'installed')"
    echo -e "${GREEN}✔ Gitleaks secrets scanner detected (${GITLEAKS_VER}).${NC}"
else
    echo -e "${YELLOW}ℹ Gitleaks not detected.${NC}"
    if command -v apt-get >/dev/null 2>&1; then
        echo "Attempting to install gitleaks via apt..."
        apt-get install -y -qq gitleaks 2>/dev/null || echo "Gitleaks not available in standard apt repository."
    fi
    if ! command -v gitleaks >/dev/null 2>&1; then
        echo "  (To enable secret scanning, download gitleaks from https://github.com/gitleaks/gitleaks/releases)"
    fi
fi

# Trivy (Dependencies & Containers)
if command -v trivy >/dev/null 2>&1; then
    TRIVY_VER="$(trivy --version 2>/dev/null | head -n 1 || echo 'installed')"
    echo -e "${GREEN}✔ Trivy scanner detected (${TRIVY_VER}).${NC}"
else
    echo -e "${YELLOW}ℹ Trivy not detected.${NC}"
    if command -v apt-get >/dev/null 2>&1; then
        echo "Attempting to install Trivy..."
        # Install trivy via apt if repository exists or download official binary
        if curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh -o /tmp/trivy_install.sh; then
            sh /tmp/trivy_install.sh -b /usr/local/bin 2>/dev/null || true
            rm -f /tmp/trivy_install.sh
        fi
    fi
    if ! command -v trivy >/dev/null 2>&1; then
        echo "  (To enable dependency scanning, install Trivy from https://aquasecurity.github.io/trivy/)"
    fi
fi

# Checkov (IaC)
if command -v checkov >/dev/null 2>&1; then
    CHECKOV_VER="$(checkov --version 2>/dev/null | head -n 1 || echo 'installed')"
    echo -e "${GREEN}✔ Checkov IaC scanner detected (${CHECKOV_VER}).${NC}"
else
    echo -e "${YELLOW}ℹ Checkov not detected (optional for Infrastructure-as-Code scanning).${NC}"
fi

# Pre-seed Trivy vulnerability database if internet is available
if command -v trivy >/dev/null 2>&1; then
    echo -e "\n${BLUE}3. Pre-seeding vulnerability intelligence database for offline scanning...${NC}"
    echo "Downloading latest vulnerability database cache..."
    if trivy image --download-db-only --quiet 2>/dev/null; then
        echo -e "${GREEN}✔ Vulnerability database successfully cached for offline use.${NC}"
    else
        echo -e "${YELLOW}ℹ Database pre-seeding skipped or failed (offline installation mode). Run 'shipshield update-db' when online.${NC}"
    fi
fi

# 4. Installing ShipShield Application
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
mkdir -p "$INSTALL_DIR" "$BIN_DIR"

echo -e "\n${BLUE}4. Installing ShipShield runtime files...${NC}"

if [ -f "$SCRIPT_DIR/dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb" ]; then
    echo "Installing from local Debian release artifact..."
    if command -v dpkg >/dev/null 2>&1; then
        dpkg -i "$SCRIPT_DIR/dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb" 2>/dev/null || {
            dpkg-deb -x "$SCRIPT_DIR/dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb" /tmp/shipshield_extract
            cp -rf /tmp/shipshield_extract/usr/lib/shipshield/* "$INSTALL_DIR/"
            rm -rf /tmp/shipshield_extract
        }
    fi
elif [ -f "$SCRIPT_DIR/apps/cli/dist/index.js" ]; then
    echo "Installing from local monorepo build payload..."
    cp -rf "$SCRIPT_DIR/apps" "$INSTALL_DIR/"
    cp -rf "$SCRIPT_DIR/packages" "$INSTALL_DIR/"
    if [ -d "$SCRIPT_DIR/node_modules" ]; then
        cp -rf "$SCRIPT_DIR/node_modules" "$INSTALL_DIR/"
    fi
    cp -f "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"
else
    echo "Downloading official ShipShield release package..."
    TMP_DIR="$(mktemp -d)"
    DEB_URL="https://github.com/kashifhm333/ShipShield/releases/latest/download/shipshield.deb"
    if curl -sSLf "$DEB_URL" -o "$TMP_DIR/shipshield.deb" 2>/dev/null; then
        dpkg-deb -x "$TMP_DIR/shipshield.deb" "$TMP_DIR/extract"
        cp -rf "$TMP_DIR/extract/usr/lib/shipshield/"* "$INSTALL_DIR/"
        rm -rf "$TMP_DIR"
    else
        echo -e "${RED}Error: Failed to obtain ShipShield release package.${NC}"
        rm -rf "$TMP_DIR"
        exit 1
    fi
fi

# 5. Create /usr/local/bin/shipshield launcher
cat << 'LAUNCHER' > "$BIN_DIR/shipshield"
#!/usr/bin/env bash
CLI_PATH="/usr/lib/shipshield/apps/cli/dist/index.js"
if [ ! -f "$CLI_PATH" ]; then
    CLI_PATH="/usr/lib/shipshield/apps/cli/dist/src/index.js"
fi
exec node "$CLI_PATH" "$@"
LAUNCHER

chmod 0755 "$BIN_DIR/shipshield"

if [ -d "/usr/bin" ] && [ ! -e "/usr/bin/shipshield" ]; then
    ln -sf "$BIN_DIR/shipshield" /usr/bin/shipshield 2>/dev/null || true
fi

echo -e "\n${BLUE}5. Verifying installation & running offline readiness diagnostics...${NC}"
if command -v shipshield >/dev/null 2>&1; then
    VERSION="$(shipshield --version 2>/dev/null || echo '1.0.0')"
    echo -e "${GREEN}✔ ShipShield v${VERSION} successfully installed!${NC}"
    echo ""
    shipshield doctor || true
    echo ""
    echo -e "${GREEN}Installation complete! Quick Start Commands:${NC}"
    echo -e "  ${YELLOW}shipshield doctor${NC}                Inspect scanner engines & database readiness"
    echo -e "  ${YELLOW}shipshield doctor --json${NC}         Generate machine-readable readiness assessment"
    echo -e "  ${YELLOW}shipshield update-db${NC}             Safely download and stage fresh vulnerability intelligence"
    echo -e "  ${YELLOW}shipshield scan --offline${NC}        Execute full security audit without internet access"
    echo -e "  ${YELLOW}shipshield scan --show-db-status${NC} View database age and freshness during scans"
    echo -e "  ${YELLOW}sudo ./install.sh --uninstall${NC}    Remove ShipShield cleanly"
    echo ""
else
    echo -e "${RED}Installation failed: 'shipshield' executable could not be resolved.${NC}"
    exit 1
fi
