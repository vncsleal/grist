#!/usr/bin/env bash
set -euo pipefail

BOLD='\033[1m'
VIOLET='\033[0;35m'
GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

echo ""
echo -e "${VIOLET}${BOLD}  Quillby Installer${RESET}"
echo ""

REPO="vncsleal/quillby"
INSTALL_DIR="$HOME/.quillby"
BINARY_PATH="$INSTALL_DIR/quillby-mcp"

# ── 1. Detect platform ────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  ASSET="quillby-mcp-macos-arm64" ;;
      x86_64) ASSET="quillby-mcp-macos-x64" ;;
      *)
        echo -e "${RED}✗  Unsupported architecture: $ARCH${RESET}"
        exit 1
        ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      x86_64) ASSET="quillby-mcp-linux-x64" ;;
      *)
        echo -e "${RED}✗  Unsupported architecture: $ARCH${RESET}"
        exit 1
        ;;
    esac
    ;;
  *)
    echo -e "${RED}✗  Unsupported OS: $OS${RESET}"
    echo "   Windows users: run install.ps1 instead."
    exit 1
    ;;
esac

# ── 2. Fetch latest release tag ───────────────────────────────────────────────
echo "→  Checking latest release..."
TAG=$(curl -fsSL --retry 3 "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep -o '"tag_name":"[^"]*"' | sed 's/"tag_name":"//;s/"//')

if [[ -z "$TAG" ]]; then
  echo -e "${RED}✗  Could not determine latest release.${RESET}"
  exit 1
fi

echo "→  Downloading Quillby ${TAG}..."

# ── 3. Download binary ────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
curl -fsSL --retry 3 "$DOWNLOAD_URL" -o "$BINARY_PATH"
chmod +x "$BINARY_PATH"

echo -e "${GREEN}✓${RESET}  Quillby downloaded"

# ── 4. Find Claude Desktop config path ───────────────────────────────────────
if [[ "$OS" == "Darwin" ]]; then
  CONFIG_DIR="$HOME/Library/Application Support/Claude"
else
  CONFIG_DIR="$HOME/.config/Claude"
fi

CONFIG_FILE="${CONFIG_DIR}/claude_desktop_config.json"

# ── 5. Write Claude Desktop config ──────────────────────────────────────────
mkdir -p "$CONFIG_DIR"
if command -v node >/dev/null 2>&1; then
  node -e "
    const fs = require('fs');
    const configFile = '$CONFIG_FILE';
    const binaryPath = '$BINARY_PATH';
    let config = {};
    try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch {}
    config.mcpServers = config.mcpServers || {};
    config.mcpServers.quillby = { command: binaryPath };
    fs.mkdirSync(require('path').dirname(configFile), { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
  "
else
  # Fallback: write a minimal config (no existing MCP servers merged)
  cat > "$CONFIG_FILE" <<-JSON
{
  "mcpServers": {
    "quillby": {
      "command": "$BINARY_PATH"
    }
  }
}
JSON
fi

echo -e "${GREEN}✓${RESET}  Claude Desktop config updated"
echo -e "   ${CONFIG_FILE}"

# ── 6. Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}✅  Done!${RESET}"
echo ""
echo "   1. Fully quit Claude Desktop (right-click the Dock icon → Quit)."
echo "   2. Reopen Claude Desktop."
echo "   3. In a new chat, type:"
echo ""
echo -e "      ${VIOLET}${BOLD}\"Set me up with Quillby\"${RESET}"
echo ""
