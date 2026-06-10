# Release Plan: Local Mode v0.4.1

> ⚠️ Read this entire document before executing any step. Each step depends on the previous.

## Current State

| Artifact | Version | Status |
|----------|---------|--------|
| `package.json` (all packages) | `0.4.1` | Correct — already bumped during cleanup session |
| npm published (`@vncsleal/quillby`) | `0.3.3` | **Broken** — `npx @vncsleal/quillby quillby-mcp` crashes with `MODULE_NOT_FOUND` because the published `dist/` structure is flat (`dist/mcp/server.js`) but `bin/quillby-mcp` resolves `dist/local/main.js` which doesn't exist in 0.3.3 |
| GitHub release | `v0.4.0` | No `.dmg`, no release body, 3 parallel uploads race each other |
| Git tag `v0.4.1` | — | **Stale** — exists on remote from a previous failed attempt, points to wrong commit |
| Current branch | `main` | Has revert commit `40fa519` that undoes `f72ec7a` |

## Prerequisites (check before starting)

- [ ] `NPM_TOKEN` secret set in GitHub repository settings → `https://github.com/vncsleal/quillby/settings/secrets/actions`
- [ ] npm OIDC identity provider configured for `@vncsleal/quillby` (required for `--provenance`) → [npm provenance docs](https://docs.npmjs.com/generating-provenance-statements)
- [ ] `GITHUB_TOKEN` permission includes `contents: write` (already set in `release.yml`)
- [ ] Access to push tags to the repository
- [ ] No pending changeset references in any workflow: `grep -rn 'changeset\|\.changeset' .github/ lefthook.yml` should return nothing
- [ ] `pnpm build && pnpm typecheck && pnpm lint` passes on current HEAD
- [ ] `apps/mcp-server/CHANGELOG.md` has 0.4.1 section with accurate entries
- [ ] `apps/mcp-server/server.json` version is 0.4.1 (already correct)

## Part 1: Environment Reset

### 1.1 Switch to main and pull the revert
```shell
git switch main
git pull origin main
```
Expected: local is at `40fa519` (the revert commit).

### 1.2 Delete the stale v0.4.1 tag
```shell
git push origin :refs/tags/v0.4.1
```
Why: Tag exists from a previous failed attempt. `release.yml` triggers on `v*` tags — if the old tag points to the wrong commit, it builds the wrong code.

### 1.3 Verify clean state
```shell
git status                     # should show clean working tree
git log --oneline -3           # should show 40fa519 (revert) as HEAD
git ls-remote --tags origin    # should NOT show v0.4.1
```

---

## Part 2: Remove Changesets (root cause of CI failure)

### 2.1 Delete `.changeset/` directory
```shell
rm -rf .changeset/
```
Why: The changeset config cannot handle this monorepo structure (one public package depends on many private packages). `changeset version` errors with `"depends on the skipped package"` on every run. We don't use changesets for version management — we bump versions manually and tag via the version workflow.

### 2.2 Update `package.json` — remove changeset scripts
**File**: `package.json`
**Before** (lines 17-18):
```json
"changeset": "changeset",
"version": "changeset version",
```
**After**: Remove both lines.

### 2.3 Rewrite `version.yml` — replace changesets/action with direct version detection

**File**: `.github/workflows/version.yml`

**Before** (full file, 40 lines):
```yaml
name: Version Packages
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
concurrency:
  group: version-${{ github.ref }}
  cancel-in-progress: true
jobs:
  version:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Create or update Version Packages PR
        id: changesets
        uses: changesets/action@v1
        with:
          version: pnpm run version
          commit: "chore: version packages"
          title: "Version Packages"
          createGithubReleases: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Tag release if version changed
        run: |
          VERSION=$(node -p "require('./apps/mcp-server/package.json').version")
          if git rev-parse "v$VERSION" >/dev/null 2>&1; then
            echo "Tag v$VERSION already exists"
          else
            git tag "v$VERSION"
            git push origin "v$VERSION"
          fi
```

**After**:
```yaml
name: Auto-tag on version change
on:
  push:
    branches: [main]
permissions:
  contents: write
concurrency:
  group: tag-${{ github.ref }}
  cancel-in-progress: true
jobs:
  tag:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Tag release if version changed
        run: |
          VERSION=$(node -p "require('./apps/mcp-server/package.json').version")
          if git rev-parse "v$VERSION" >/dev/null 2>&1; then
            echo "Tag v$VERSION already exists — no version change"
          else
            git tag "v$VERSION"
            git push origin "v$VERSION"
            echo "Created and pushed tag v$VERSION"
          fi
```
Changes from before:
- Removed `pnpm/action-setup`, `pnpm install`, `pull-requests` permission (not needed)
- Removed `changesets/action@v1` entirely (was the root cause of CI failure)
- Simplified to just check version and tag if new
- Added clearer log messages

---

## Part 3: Re-apply All Verified Changes

All 8 changes below were reviewed, built, and tested (565 tests, 13/13 build, 23/23 typecheck) in the reverted commit `f72ec7a`. Re-apply them EXACTLY as shown — no changeset file this time.

### 3.1 Add `create-dmg` devDependency

**File**: `package.json` — add to `devDependencies`:
```json
"create-dmg": "^8.1.0",
```

Then install to update lockfile:
```shell
pnpm install
```

Why: `create-dmg` was called via `npx` which is a one-off network download at build time. Pinning it as a devDep caches it in pnpm store, version is controlled, no network dependency at build time.

### 3.2 Fix `package-dmg.sh` — use local binary

**File**: `infra/installers/macos/package-dmg.sh`

**Line 28 — before**:
```bash
npx create-dmg "$APP_DIR" "$OUT_DIR" \
```
**Line 28 — after**:
```bash
pnpm exec create-dmg "$APP_DIR" "$OUT_DIR" \
```

Why: `pnpm create-dmg` is not valid pnpm syntax. `pnpm exec create-dmg` explicitly runs the binary from `node_modules/.bin/create-dmg` which exists because `create-dmg` is a devDependency.

### 3.3 Fix `install.sh` — remove Python dependency

**File**: `install.sh`

**Lines 51-52 — before**:
```bash
RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")
TAG=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['tag_name'])" "$RELEASE_JSON")
```
**Lines 51-52 — after**:
```bash
TAG=$(curl -fsSL --retry 3 "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep -o '"tag_name":"[^"]*"' | sed 's/"tag_name":"//;s/"//')
```

Why: `python3 -c "import json..."` fails if Python 3 is not installed (e.g., minimal Linux, macOS without Xcode). `grep -o` + `sed` is POSIX, no dependencies. Pattern `"tag_name":"v0.4.1"` extracted to `v0.4.1`.

**Line 64 — before**:
```bash
curl -fsSL "$DOWNLOAD_URL" -o "$BINARY_PATH"
```
**Line 64 — after**:
```bash
curl -fsSL --retry 3 "$DOWNLOAD_URL" -o "$BINARY_PATH"
```

Why: GitHub API rate limits or transient network failures. `--retry 3` retries on transient errors with exponential backoff.

**Lines 79-94 — before**:
```bash
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
```
**Lines 79-94 — after**:
```bash
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
  # Fallback: write a minimal config (existing MCP servers are lost)
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
```

Why: Python is replaced by `node -e` (more commonly available on developer machines). Falls back to writing a minimal config with shell heredoc if neither Node nor Python is available. The fallback loses any existing MCP server config but still makes Quillby work.

### 3.4 Fix `install.ps1` — TLS 1.2 + PS 5.1 compat

**File**: `install.ps1`

**Line 3 — before**:
```powershell
$ErrorActionPreference = "Stop"
```
**Line 3 — after**:
```powershell
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
```

Why: On older Windows 10 builds, .NET Framework defaults to TLS 1.0. GitHub API requires TLS 1.2+. Without this, the API call fails with "Could not create SSL/TLS secure channel".

**Lines 38-39 — before**:
```powershell
$downloadUrl = "https://github.com/vncsleal/quillby/releases/download/$tag/$asset"
Invoke-WebRequest -Uri $downloadUrl -OutFile $binaryPath -UseBasicParsing
```
**Lines 38-39 — after**:
```powershell
$downloadUrl = "https://github.com/vncsleal/quillby/releases/download/$tag/$asset"
$retryCount = 0
$maxRetries = 3
while ($retryCount -lt $maxRetries) {
    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $binaryPath -UseBasicParsing
        break
    } catch {
        $retryCount++
        if ($retryCount -ge $maxRetries) { throw }
        Start-Sleep -Seconds 2
    }
}
```

Why: Transient network failures. GitHub downloads can timeout under load. Retry 3 times with 2s backoff. Last error is thrown.

**Line 55 — before**:
```powershell
$config = Get-Content $configFile -Raw | ConvertFrom-Json -AsHashtable
```
**Line 55 — after**:
```powershell
$raw = Get-Content $configFile -Raw | ConvertFrom-Json
$raw.PSObject.Properties | ForEach-Object { $config[$_.Name] = $_.Value }
```

Why: `-AsHashtable` was introduced in PowerShell Core 6.0. Windows 10 ships Windows PowerShell 5.1 by default. PSObject property enumeration works on all versions.

### 3.5 Fix `installer.nsi` — PS 5.1 compat

**File**: `infra/installers/windows/installer.nsi`

**Line 25 — before**:
```powershell
if (Test-Path $configFile) { try { $config = Get-Content $configFile -Raw | ConvertFrom-Json -AsHashtable } catch {} };
```
**Line 25 — after** (compact to fit NSIS string limits):
```powershell
if (Test-Path $configFile) { try { $raw = Get-Content $configFile -Raw | ConvertFrom-Json; $raw.PSObject.Properties | ForEach-Object { $config[$_.Name] = $_.Value } } catch {} };
```

Why: Same PS 5.1 compat issue as `install.ps1`. NSIS inline PowerShell has string length limits (~1024 chars), so keep the replacement compact. Total line is ~220 chars, well within limits.

### 3.6 Create site constants and update components

**New file**: `apps/site/src/constants.ts`
```typescript
const GITHUB_RELEASES = "https://github.com/vncsleal/quillby/releases/latest/download";

export const DOWNLOAD_URLS = {
  macosPkg: `${GITHUB_RELEASES}/quillby-macos.pkg`,
  macosDmg: `${GITHUB_RELEASES}/quillby-macos.dmg`,
  windowsExe: `${GITHUB_RELEASES}/quillby-windows.exe`,
  releasesPage: "https://github.com/vncsleal/quillby/releases",
} as const;
```

Why: Single source of truth. `releases/latest/download/` URLs are GitHub redirects — always point to the latest release's assets. No API calls needed, no version pinning required. `macosDmg` is kept for when the DMG pipeline is confirmed working.

**File**: `apps/site/src/components/Install.astro`

Line 5 — add import:
```typescript
import { DOWNLOAD_URLS } from '../constants';
```

Line 24 — before:
```astro
<a href="https://github.com/vncsleal/quillby/releases/latest/download/quillby-macos.pkg" class="btn btn-primary">
```
Line 24 — after:
```astro
<a href={DOWNLOAD_URLS.macosPkg} class="btn btn-primary">
```

Line 31 — before:
```astro
<a href="https://github.com/vncsleal/quillby/releases/latest/download/quillby-windows.exe" class="btn btn-primary">
```
Line 31 — after:
```astro
<a href={DOWNLOAD_URLS.windowsExe} class="btn btn-primary">
```

**File**: `apps/site/src/components/Cta.astro`

Line 5 — add import:
```typescript
import { DOWNLOAD_URLS } from '../constants';
```

Line 15 — before:
```astro
href="https://github.com/vncsleal/quillby/releases/latest/download/quillby-macos.pkg"
```
Line 15 — after:
```astro
href={DOWNLOAD_URLS.macosPkg}
```

**File**: `apps/site/src/i18n/ui.ts`

Line 157 — before:
```typescript
'install.macos-note': 'Drag to Applications. Also available as <a href="https://github.com/vncsleal/quillby/releases">.pkg installer</a>.',
```
Line 157 — after:
```typescript
'install.macos-note': 'Classic package installer — double-click and follow the prompts.',
```

Line 387 — before (Portuguese):
```typescript
'install.macos-note': 'Arraste para Applications. Também disponível como <a href="https://github.com/vncsleal/quillby/releases">instalador .pkg</a>.',
```
Line 387 — after:
```typescript
'install.macos-note': 'Instalador .pkg — clique duas vezes e siga as instruções.',
```

### 3.7 Fix README.md — remove dead .dmg link

**File**: `README.md`

**Before** (lines 22-24):
```markdown
### macOS

[**Download the .dmg**](https://github.com/vncsleal/quillby/releases/latest/download/quillby-macos.dmg) — drag to Applications, double-click. No terminal.

Or [download the .pkg installer](https://github.com/vncsleal/quillby/releases/latest/download/quillby-macos.pkg) — classic package, double-click and follow the prompts.
```
**After**:
```markdown
### macOS

[**Download the .pkg installer**](https://github.com/vncsleal/quillby/releases/latest/download/quillby-macos.pkg) — double-click and follow the prompts.
```

Why: `quillby-macos.dmg` has never shipped in any release. The URL returns 404.

### 3.8 Harden release pipeline

**File**: `.github/workflows/release.yml` — replace entire file with:

```yaml
name: Release Binaries

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  # macOS: universal .pkg installer + .dmg + raw arch binaries
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: oven-sh/setup-bun@v2
      - run: pnpm install --frozen-lockfile

      - name: Build arch binaries
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          bun build --compile --target=bun-darwin-arm64 --define:process.env.QUILLBY_VERSION="\"$VERSION\"" ./apps/mcp-server/src/main-local.ts --outfile quillby-mcp-macos-arm64
          bun build --compile --target=bun-darwin-x64  --define:process.env.QUILLBY_VERSION="\"$VERSION\"" ./apps/mcp-server/src/main-local.ts --outfile quillby-mcp-macos-x64

      - name: Smoke test ARM64 binary
        run: |
          node -e "
            const cp = require('child_process');
            const p = cp.spawn('./quillby-mcp-macos-arm64', { stdio: ['pipe', 'pipe', 'inherit'] });
            p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'smoke',version:'0.0.1'}}}) + '\n');
            let output = '';
            p.stdout.on('data', d => output += d.toString());
            setTimeout(() => { p.kill(); if (!output.includes('jsonrpc')) { console.error('Smoke test failed'); process.exit(1); } console.log('ARM64 smoke test passed'); }, 8000);
          "

      - name: Create universal binary via lipo
        run: lipo -create -output quillby-mcp quillby-mcp-macos-arm64 quillby-mcp-macos-x64

      - name: Build .pkg installer
        run: |
          mkdir -p pkg-root/usr/local/bin
          cp quillby-mcp pkg-root/usr/local/bin/quillby-mcp
          chmod +x pkg-root/usr/local/bin/quillby-mcp
          mkdir -p pkg-scripts
          cp infra/installers/macos/postinstall pkg-scripts/postinstall
          chmod +x pkg-scripts/postinstall
          pkgbuild \
            --root pkg-root \
            --install-location / \
            --scripts pkg-scripts \
            --identifier com.quillby.mcp \
            --version "${GITHUB_REF_NAME#v}" \
            quillby-macos.pkg

      - name: Build .dmg installer
        run: |
          bash infra/installers/macos/package-dmg.sh quillby-mcp "${GITHUB_REF_NAME#v}"
          cp Quillby-*.dmg quillby-macos.dmg

      - name: Upload macOS artifacts
        uses: actions/upload-artifact@v4
        with:
          name: macos-binaries
          path: |
            quillby-macos.pkg
            quillby-macos.dmg
            Quillby-*.dmg
            quillby-mcp-macos-arm64
            quillby-mcp-macos-x64

  # Windows: NSIS .exe installer
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: oven-sh/setup-bun@v2
      - run: pnpm install --frozen-lockfile

      - name: Build binary
        env:
          QUILLBY_BUILD_VERSION: ${{ github.ref_name }}
        run: |
          $VERSION = "$env:QUILLBY_BUILD_VERSION" -replace "^v", ""
          bun build --compile "--define:process.env.QUILLBY_VERSION=`"$VERSION`"" --target=bun-windows-x64 ./apps/mcp-server/src/main-local.ts --outfile quillby-mcp-windows-x64.exe

      - name: Smoke test binary
        shell: pwsh
        run: |
          $size = (Get-Item "quillby-mcp-windows-x64.exe").Length
          if ($size -lt 1MB) { throw "Binary too small: $size bytes" }
          Write-Host "Binary OK ($([math]::Round($size/1MB, 1)) MB)"

      - name: Install NSIS and build installer
        run: |
          choco install nsis --no-progress -y
          $env:PATH = "C:\Program Files (x86)\NSIS;" + $env:PATH
          copy quillby-mcp-windows-x64.exe infra\installers\windows\quillby-mcp-windows-x64.exe
          makensis infra\installers\windows\installer.nsi
        shell: pwsh

      - name: Upload Windows artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-binaries
          path: |
            quillby-windows.exe
            quillby-mcp-windows-x64.exe

  # Linux: raw binary (install.sh handles config)
  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: oven-sh/setup-bun@v2
      - run: pnpm install --frozen-lockfile

      - name: Build binary
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          bun build --compile --target=bun-linux-x64 --define:process.env.QUILLBY_VERSION="\"$VERSION\"" ./apps/mcp-server/src/main-local.ts --outfile quillby-mcp-linux-x64

      - name: Smoke test binary
        run: |
          echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.1"}}}' | timeout 10 ./quillby-mcp-linux-x64 | head -1 | grep -q '"jsonrpc":"2.0"'
          echo "Binary smoke test passed"

      - name: Upload Linux artifacts
        uses: actions/upload-artifact@v4
        with:
          name: linux-binaries
          path: quillby-mcp-linux-x64

  # Release: aggregate all artifacts and create the GitHub release
  create-release:
    needs: [build-macos, build-windows, build-linux]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: release-artifacts

      - name: Extract release body from CHANGELOG
        run: |
          node -e "
            const fs = require('fs');
            const changelog = fs.readFileSync('apps/mcp-server/CHANGELOG.md', 'utf8');
            const version = process.env.GITHUB_REF_NAME.replace(/^v/, '');
            const section = changelog.match(new RegExp('## ' + version.replace(/\./g, '\\.') + '[\\\\s\\\\S]*?(?=\\\\n## |\\\\n\\$|\\$)'));
            fs.writeFileSync('/tmp/release-body.md', section ? section[0].trim() : changelog.split('\\n\\n## ')[0] + '\\n');
          "

      - name: Create release
        uses: softprops/action-gh-release@v2
        with:
          body_path: /tmp/release-body.md
          files: release-artifacts/**/*

      - name: Verify uploaded assets
        run: |
          gh release view "${GITHUB_REF_NAME}" --json assets --jq '.assets[].name'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # npm: publish package to npm registry
  publish-npm:
    needs: [create-release]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: "https://registry.npmjs.org"
      - run: pnpm install --frozen-lockfile

      - name: Verify dist structure
        run: |
          pnpm --filter @vncsleal/quillby build
          test -f apps/mcp-server/dist/local/main.js || { echo "dist/local/main.js missing"; exit 1; }
          echo "dist structure verified"

      - name: Publish to npm
        run: pnpm --filter @vncsleal/quillby publish --access public --no-git-checks --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Key changes from before:
- **macOS smoke test**: JSON-RPC initialize via `node -e` child process. Tests the binary starts and responds. Timeout after 8 seconds. Kills the process when done.
- **Windows smoke test**: File size check (must be >1MB). Full JSON-RPC piping is unreliable on Windows PS. Size check catches truncated/corrupt binaries.
- **Linux smoke test**: Unchanged from before (works).
- **Artifact aggregation**: `actions/upload-artifact@v4` → single `create-release` job → `actions/download-artifact@v4` → `softprops/action-gh-release@v2` with body. Fixes the race condition where 3 parallel uploads overwrite each other's body.
- **Release body**: Extracted from CHANGELOG.md via `node -e` regex. Matches the version section (e.g., `## 0.4.1` through to `## ` or end of file).
- **Asset verification**: `gh release view` lists uploaded assets.
- **npm publish**: Verify `dist/local/main.js` exists before publishing. Add `--provenance` for supply chain security (requires OIDC + `id-token: write`).
- **Dependency chain**: `publish-npm` depends on `create-release` (not the build jobs directly). Ensures the GitHub release is created before npm publishes.

---

### 3.9 Update CHANGELOG.md

**File**: `apps/mcp-server/CHANGELOG.md`

The current 0.4.1 section only has the earlier cleanup session. It must include the release changes from this plan. **Append** to the existing 0.4.1 section:

```markdown
- Fix: DMG creation uses pinned `create-dmg` devDep instead of `npx`
- Fix: Install scripts — remove Python dep, add curl retry, use grep+sed for JSON
- Fix: `install.ps1` — TLS 1.2 fix, PS 5.1 compat via PSObject property enumeration
- Fix: Windows NSIS installer — PS 5.1 compat for config write
- Fix: Site download URLs centralized in constants file
- Fix: README.md — remove dead .dmg link
- Fix: Release pipeline — single release job, smoke tests for macOS/Windows, CHANGELOG as body
- Chore: Remove changesets (config incompatible with monorepo structure)
```

Why: The changelog is used as the release body in `release.yml`. Without these entries, the GitHub release won't document what actually changed in 0.4.1.

### 3.10 Verify supporting files

**Check `server.json` version** — should already be 0.4.1:
```shell
grep '"version"' apps/mcp-server/server.json
```
Expected: two lines, both showing `"0.4.1"`. Already correct from the earlier cleanup session.

**Check there are no stale changeset references** in workflows:
```shell
grep -rn 'changeset\|\.changeset' .github/ lefthook.yml 2>/dev/null || echo "No stale references found"
```
Expected: "No stale references found" (the only `changesets/action@v1` reference was in `version.yml` which is being replaced).

**Clean up runtime artifacts** (not tracked by git, but good practice):
```shell
rm -f apps/mcp-server/quillby-auth.db        # runtime auth DB, regenerated on use
rm -f infra/docker/.env                        # commit secret placeholder removed
```

---

## Part 4: Build and Test

### 4.1 Build all packages
```shell
pnpm build
```
Expected: 13/13 tasks successful.

### 4.2 Run typecheck
```shell
pnpm typecheck
```
Expected: 23/23 tasks successful.

### 4.3 Run unit tests
```shell
pnpm --filter @vncsleal/quillby test:unit
```
Expected: 565 tests, 45 test files, all passing.

### 4.4 Verify dist structure
```shell
ls apps/mcp-server/dist/local/main.js
```
Expected: file exists (confirms `bin/quillby-mcp` resolves correctly).

### 4.5 Build site
```shell
pnpm --filter @quillby/web build
```
Expected: 8 pages built, 0 errors.

### 4.6 Run lint
```shell
pnpm lint
```
Expected: 13/13 tasks, no errors.

---

## Part 5: Commit and Release

### 5.1 Commit all changes
```shell
git add -A
git status          # verify: no .changeset/, no unintended files
git commit -m "feat: local mode v0.4.1 release readiness"
```

### 5.2 Push to main
```shell
git push origin main
```
Expected: CI workflow triggers on push. Wait for it to pass (lint → typecheck → test → build → smoke test).

### 5.3 Create and push tag
```shell
git tag v0.4.1
git push origin v0.4.1
```
Expected: `release.yml` triggers. Monitor at: `https://github.com/vncsleal/quillby/actions`

---

## Part 6: Verify Release

### 6.1 Verify GitHub release
```shell
gh release view v0.4.1 --json assets,body
```
Expected: All expected assets present. Body matches CHANGELOG.

### 6.2 Verify npm package
```shell
npm view @vncsleal/quillby version
# should show: 0.4.1
npm pack @vncsleal/quillby --dry-run
# verify: dist/local/main.js is in the tarball
```

### 6.3 Verify binary works
```shell
npx @vncsleal/quillby quillby-mcp
# or download from GitHub release and run:
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.1"}}}' | ./quillby-mcp
```
Expected: Binary starts and responds with JSON-RPC initialize result.

### 6.4 Verify site
Visit `https://quillby.vercel.app/en/` — download buttons should point to GitHub releases. Click "Download for Mac" — should download `.pkg` (not 404).

---

## Rollback Plan

If something goes wrong during release:

| Scenario | Action |
|----------|--------|
| CI fails | Fix the issue, push a new commit (no need to revert tag — tag is pushed after CI) |
| Release pipeline fails | Fix the issue, delete the tag (`git push origin :refs/tags/v0.4.1`), fix, re-push tag |
| npm publish fails but binaries are uploaded | Fix npm config, manually publish: `pnpm --filter @vncsleal/quillby publish --access public` |
| Binaries fail smoke test | Fix the build issue, bump to 0.4.2, release that instead |
| Site deploy fails | Vercel auto-deploys on main push. If it fails, check Vercel dashboard for build logs |

---

## Appendix: Files Changed (Summary)

| File | Change type | Summary |
|------|-------------|---------|
| `.changeset/` (entire directory) | **Delete** | Remove changesets — config incompatible with monorepo structure |
| `.github/workflows/version.yml` | **Rewrite** | Remove changesets/action, direct version detection (no package install needed) |
| `.github/workflows/release.yml` | **Rewrite** | Single release job, smoke tests, CHANGELOG body, artifact aggregation |
| `package.json` | **Edit** | Remove changeset scripts, add create-dmg devDep |
| `apps/site/src/constants.ts` | **New** | Centralized download URLs |
| `apps/site/src/components/Install.astro` | **Edit** | Use DOWNLOAD_URLS constants |
| `apps/site/src/components/Cta.astro` | **Edit** | Use DOWNLOAD_URLS constants |
| `apps/site/src/i18n/ui.ts` | **Edit** | Fix macOS note (no .dmg reference) |
| `README.md` | **Edit** | Remove dead .dmg link |
| `infra/installers/macos/package-dmg.sh` | **Edit** | `pnpm exec create-dmg` instead of `npx` |
| `infra/installers/windows/installer.nsi` | **Edit** | Remove `-AsHashtable` (PS 5.1 compat) |
| `install.sh` | **Edit** | Remove Python dep, add `--retry 3`, `grep`+`sed` for JSON |
| `install.ps1` | **Edit** | TLS 1.2, PS 5.1 compat, retry loop |
| `apps/mcp-server/CHANGELOG.md` | **Edit** | Append new release entries (install scripts, DMG, pipeline, etc.) |
| `pnpm-lock.yaml` | **Auto** | Updated by `pnpm install` for create-dmg |
