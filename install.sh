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
RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")
TAG=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['tag_name'])" "$RELEASE_JSON")

if [[ -z "$TAG" ]]; then
  echo -e "${RED}✗  Could not determine latest release.${RESET}"
  exit 1
fi

echo "→  Downloading Quillby ${TAG}..."

# ── 3. Download binary ────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
curl -fsSL "$DOWNLOAD_URL" -o "$BINARY_PATH"
chmod +x "$BINARY_PATH"

echo -e "${GREEN}✓${RESET}  Quillby downloaded"

# ── 4. Find Claude Desktop config path ───────────────────────────────────────
if [[ "$OS" == "Darwin" ]]; then
  CONFIG_DIR="$HOME/Library/Application Support/Claude"
else
  CONFIG_DIR="$HOME/.config/Claude"
fi

CONFIG_FILE="${CONFIG_DIR}/claude_desktop_config.json"

# ── 5. Write Claude Desktop config via Python ────────────────────────────────
python3 -c "
import json, os, sys
config_file, binary_path = sys.argv[1], sys.argv[2]
config = {}
if os.path.exists(config_file):
    try:
        with open(config_file) as f:
            config = json.load(f)
    except Exception:
        pass
config.setdefault('mcpServers', {})['quillby'] = {'command': binary_path}
os.makedirs(os.path.dirname(config_file), exist_ok=True)
with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
" "$CONFIG_FILE" "$BINARY_PATH"

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
