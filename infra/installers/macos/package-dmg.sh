#!/usr/bin/env bash
# Usage: package-dmg.sh <path-to-binary> <version>
set -euo pipefail

BINARY="$1"
VERSION="${2:-0.4.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/Quillby.app"
OUT_DIR="$PWD"

# Copy binary into .app bundle
cp "$BINARY" "$APP_DIR/Contents/MacOS/quillby-mcp"
chmod +x "$APP_DIR/Contents/MacOS/quillby-mcp"

# Create symlink so the binary is on PATH
mkdir -p "$APP_DIR/Contents/MacOS/bin"
ln -s /Applications/Quillby.app/Contents/MacOS/quillby-mcp "$APP_DIR/Contents/MacOS/bin/quillby-mcp"

# Update version in Info.plist
plutil -replace CFBundleShortVersionString -string "$VERSION" "$APP_DIR/Contents/Info.plist"
plutil -replace CFBundleVersion -string "$VERSION" "$APP_DIR/Contents/Info.plist"

# Sign the binary (ad-hoc signature)
codesign --force --deep --sign - "$APP_DIR"

# Create DMG in the output directory
DMG_NAME="Quillby-$VERSION.dmg"
pnpm exec create-dmg "$APP_DIR" "$OUT_DIR" \
  --volname "Quillby $VERSION" \
  --icon-size 128 \
  --app-drop-link 380 185 \
  --no-internet-enable 2>&1

# create-dmg names the file after the volname; rename to our standard name
if [ -f "$OUT_DIR/Quillby $VERSION.dmg" ]; then
  mv "$OUT_DIR/Quillby $VERSION.dmg" "$OUT_DIR/$DMG_NAME"
fi

ls -la "$OUT_DIR/$DMG_NAME"
