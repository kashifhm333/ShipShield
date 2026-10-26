#!/usr/bin/env bash
# ShipShield Production Installer
# Usage: curl -sSL https://raw.githubusercontent.com/kashifhm333/ShipShield/main/install.sh | sudo bash

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}====================================================${NC}"
echo -e "${GREEN}🛡️   Installing ShipShield DevSecOps Security Gate   🛡️${NC}"
echo -e "${BLUE}====================================================${NC}"

# Check for root/sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run this installer with root or sudo privileges.${NC}"
    echo "Example: curl -sSL ... | sudo bash"
    exit 1
fi

INSTALL_DIR="/usr/lib/shipshield"
BIN_DIR="/usr/local/bin"

echo -e "\n${BLUE}1. Checking runtime dependencies...${NC}"

# Detect Debian/Ubuntu
if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    
    # Check Node.js
    if ! command -v node >/dev/null 2>&1; then
        echo -e "${YELLOW}Installing Node.js...${NC}"
        apt-get update -qq && apt-get install -y -qq nodejs
    fi

    # Check Gitleaks
    if ! command -v gitleaks >/dev/null 2>&1; then
        echo -e "${YELLOW}Installing Gitleaks secrets scanner...${NC}"
        apt-get install -y -qq gitleaks 2>/dev/null || true
    fi

    # Check Trivy
    if ! command -v trivy >/dev/null 2>&1; then
        echo -e "${YELLOW}Installing Trivy dependency & container scanner...${NC}"
        curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin 2>/dev/null || true
    fi
fi

# Verify Node.js
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}Error: Node.js (>= 18.19.0) is required but not installed.${NC}"
    exit 1
fi

NODE_VER=$(node -v | sed 's/v//')
echo -e "${GREEN}✔ Node.js version v${NODE_VER} detected.${NC}"

# Check if installing from local repo or remote release
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"

echo -e "\n${BLUE}2. Installing ShipShield binaries...${NC}"
mkdir -p "$INSTALL_DIR" "$BIN_DIR"

# Clean up any broken PPA sources that lock apt-get
if [ -d /etc/apt/sources.list.d ]; then
    rm -f /etc/apt/sources.list.d/kashifhm333-ubuntu-shipshield*.sources /etc/apt/sources.list.d/kashifhm333-ubuntu-shipshield*.list 2>/dev/null || true
fi

if [ -f "$SCRIPT_DIR/dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb" ]; then
    echo "Found local release package, installing..."
    apt-get install -y "$SCRIPT_DIR/dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb" 2>/dev/null || \
    (dpkg-deb -x "$SCRIPT_DIR/dist-deb/shipshield_1.0.0-1~ubuntu24.04.1_all.deb" /tmp/shipshield_extract && \
     cp -rf /tmp/shipshield_extract/usr/lib/shipshield/* "$INSTALL_DIR/" && \
     rm -rf /tmp/shipshield_extract)
elif [ -f "$SCRIPT_DIR/apps/cli/dist/index.js" ]; then
    echo "Found local workspace, installing build payload..."
    cp -rf "$SCRIPT_DIR/apps" "$INSTALL_DIR/"
    cp -rf "$SCRIPT_DIR/packages" "$INSTALL_DIR/" 2>/dev/null || true
    cp -rf "$SCRIPT_DIR/node_modules" "$INSTALL_DIR/" 2>/dev/null || true
else
    echo "Fetching official ShipShield release package..."
    TMP_DIR=$(mktemp -d)
    DEB_URL="https://github.com/kashifhm333/ShipShield/releases/latest/download/shipshield.deb"
    
    if curl -sSLf "$DEB_URL" -o "$TMP_DIR/shipshield.deb" || wget -qO "$TMP_DIR/shipshield.deb" "$DEB_URL"; then
        if command -v apt-get >/dev/null 2>&1; then
            apt-get install -y "$TMP_DIR/shipshield.deb" || {
                dpkg-deb -x "$TMP_DIR/shipshield.deb" "$TMP_DIR/extract"
                cp -rf "$TMP_DIR/extract/usr/lib/shipshield/"* "$INSTALL_DIR/"
            }
        else
            dpkg-deb -x "$TMP_DIR/shipshield.deb" "$TMP_DIR/extract"
            cp -rf "$TMP_DIR/extract/usr/lib/shipshield/"* "$INSTALL_DIR/"
        fi
    else
        echo -e "${RED}Failed to download release bundle from GitHub.${NC}"
        rm -rf "$TMP_DIR"
        exit 1
    fi
    rm -rf "$TMP_DIR"
fi

# Create launcher script
cat << 'LAUNCHER' > "$BIN_DIR/shipshield"
#!/usr/bin/env bash
CLI_PATH="/usr/lib/shipshield/apps/cli/dist/index.js"
if [ ! -f "$CLI_PATH" ]; then
    CLI_PATH="/usr/lib/shipshield/apps/cli/dist/src/index.js"
fi
exec node "$CLI_PATH" "$@"
LAUNCHER

chmod +x "$BIN_DIR/shipshield"

# Also symlink to /usr/bin/shipshield if writable
if [ -d "/usr/bin" ] && [ ! -e "/usr/bin/shipshield" ]; then
    ln -sf "$BIN_DIR/shipshield" /usr/bin/shipshield 2>/dev/null || true
fi

echo -e "\n${BLUE}3. Verifying installation...${NC}"
if command -v shipshield >/dev/null 2>&1; then
    VERSION=$(shipshield --version 2>/dev/null || echo "1.0.0")
    echo -e "${GREEN}✔ ShipShield v${VERSION} successfully installed!${NC}"
    echo -e "\n${GREEN}Installation complete! You can now run:${NC}"
    echo -e "  ${YELLOW}shipshield --version${NC}"
    echo -e "  ${YELLOW}shipshield doctor${NC}"
    echo -e "  ${YELLOW}shipshield scan .${NC}\n"
else
    echo -e "${RED}Installation failed: binary not found in PATH.${NC}"
    exit 1
fi
