#!/usr/bin/env bash
# Usage: package-dmg.sh <path-to-binary> <version>
set -euo pipefail

BINARY="$1"
VERSION="${2:-0.4.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/Quillby.app"
OUT_DIR="$PWD"
DMG_NAME="Quillby-$VERSION.dmg"
TEMP_DMG="$OUT_DIR/.Quillby-tmp.dmg"
STAGING_DIR="$OUT_DIR/.Quillby-staging"

# Copy binary into .app bundle
mkdir -p "$APP_DIR/Contents/MacOS"
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

# Create DMG using native hdiutil
rm -rf "$STAGING_DIR" "$TEMP_DMG"
mkdir -p "$STAGING_DIR"
ditto "$APP_DIR" "$STAGING_DIR/Quillby.app"
ln -s /Applications "$STAGING_DIR/Applications"

# Create read/write DMG
hdiutil makehybrid -hfs -hfs-volume-name "Quillby $VERSION" \
  -hfs-openfolder "$STAGING_DIR" \
  "$STAGING_DIR" -o "$TEMP_DMG" 2>&1

# Convert to compressed, read-only DMG
hdiutil convert "$TEMP_DMG" -format UDZO -o "$OUT_DIR/$DMG_NAME" 2>&1

# Cleanup
rm -rf "$STAGING_DIR" "$TEMP_DMG"

ls -la "$OUT_DIR/$DMG_NAME"
