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

# ── 1. Node.js check ─────────────────────────────────────────────────────────
# curl|bash runs a non-interactive shell — nvm / Homebrew paths may not be set.
# Try to load nvm if present, then extend PATH with common install locations.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh" --no-use 2>/dev/null || true
[[ -s "$HOME/.nvm/nvm.sh" ]] && source "$HOME/.nvm/nvm.sh" --no-use 2>/dev/null || true

export PATH="/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
# Pick up the active nvm version if any
if [[ -d "$NVM_DIR/versions/node" ]]; then
  LATEST_NVM_NODE=$(ls -t "$NVM_DIR/versions/node" 2>/dev/null | head -1)
  [[ -n "$LATEST_NVM_NODE" ]] && export PATH="$NVM_DIR/versions/node/$LATEST_NVM_NODE/bin:$PATH"
fi

if ! command -v node &>/dev/null; then
  echo "   Node.js not found — installing it now..."
  echo ""

  if [[ "$(uname)" == "Darwin" ]]; then
    # macOS: try Homebrew first, otherwise download the official pkg
    if command -v brew &>/dev/null; then
      echo "   Using Homebrew..."
      brew install node --quiet
      export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
    else
      echo "   Downloading Node.js LTS installer..."
      NODE_PKG="/tmp/node-lts.pkg"
      # Fetch the latest LTS download URL from the Node.js release feed
      NODE_LTS_URL=$(curl -fsSL https://nodejs.org/dist/index.json \
        | grep -o '"lts":"[^"]*"' | head -1 \
        | grep -v 'false' \
        | head -1 \
        | sed 's/.*"lts":"\([^"]*\)".*/\1/' || true)
      # Fallback to a known-good LTS version if parsing failed
      if [[ -z "$NODE_LTS_URL" ]]; then
        NODE_PKG_URL="https://nodejs.org/dist/v22.14.0/node-v22.14.0.pkg"
      else
        NODE_VER=$(curl -fsSL https://nodejs.org/dist/index.json \
          | python3 -c "import sys,json; data=json.load(sys.stdin); lts=[d for d in data if d['lts']]; print(lts[0]['version'])" 2>/dev/null || echo "v22.14.0")
        ARCH=$(uname -m)
        if [[ "$ARCH" == "arm64" ]]; then
          NODE_PKG_URL="https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-darwin-arm64.tar.gz"
        else
          NODE_PKG_URL="https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-pkg"
        fi
        NODE_PKG_URL="https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}.pkg"
      fi
      curl -fsSL "$NODE_PKG_URL" -o "$NODE_PKG"
      echo "   Running installer (may ask for your password)..."
      sudo installer -pkg "$NODE_PKG" -target / -quiet
      rm -f "$NODE_PKG"
      export PATH="/usr/local/bin:$PATH"
    fi
  elif [[ "$(uname)" == "Linux" ]]; then
    if command -v apt-get &>/dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - 2>/dev/null
      sudo apt-get install -y nodejs 2>/dev/null
    elif command -v dnf &>/dev/null; then
      curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash - 2>/dev/null
      sudo dnf install -y nodejs 2>/dev/null
    else
      echo -e "${RED}✗  Could not auto-install Node.js on this system.${RESET}"
      echo "   Please install it from https://nodejs.org and re-run:"
      echo "   curl -fsSL https://raw.githubusercontent.com/vncsleal/quillby/main/install.sh | bash"
      exit 1
    fi
  fi

  # Re-check after installation attempt
  if ! command -v node &>/dev/null; then
    echo -e "${RED}✗  Node.js installation failed.${RESET}"
    echo "   Please install it manually from https://nodejs.org and re-run:"
    echo "   curl -fsSL https://raw.githubusercontent.com/vncsleal/quillby/main/install.sh | bash"
    exit 1
  fi
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✓${RESET}  Node.js ${NODE_VERSION}"

# ── 2. Install quillby globally ───────────────────────────────────────────────
echo "→  Installing Quillby (npm install -g @vncsleal/quillby)..."
npm install -g @vncsleal/quillby --silent
echo -e "${GREEN}✓${RESET}  Quillby installed"

# ── 3. Resolve absolute paths ─────────────────────────────────────────────────
NODE_BIN=$(node -e "process.stdout.write(process.execPath)")
NPM_GLOBAL_ROOT=$(npm root -g)
SERVER_JS="${NPM_GLOBAL_ROOT}/@vncsleal/quillby/dist/mcp/server.js"

if [[ ! -f "$SERVER_JS" ]]; then
  echo -e "${RED}✗  Could not find ${SERVER_JS}${RESET}"
  echo "   Try running: npm install -g @vncsleal/quillby"
  exit 1
fi

# ── 4. Find Claude Desktop config path ───────────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  CONFIG_DIR="$HOME/Library/Application Support/Claude"
elif [[ -n "${APPDATA:-}" ]]; then
  CONFIG_DIR="$APPDATA/Claude"
else
  CONFIG_DIR="$HOME/.config/Claude"
fi

CONFIG_FILE="${CONFIG_DIR}/claude_desktop_config.json"

# ── 5. Create or merge config ─────────────────────────────────────────────────
mkdir -p "${CONFIG_DIR}"

node -e "
const fs = require('fs');
const configPath = process.argv[1];
const nodeBin = process.argv[2];
const serverJs = process.argv[3];

let config = {};
if (fs.existsSync(configPath)) {
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
}
config.mcpServers = config.mcpServers || {};
config.mcpServers.quillby = { command: nodeBin, args: [serverJs] };
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
" -- "$CONFIG_FILE" "$NODE_BIN" "$SERVER_JS"

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
