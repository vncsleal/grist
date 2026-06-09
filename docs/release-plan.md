# Quillby v1 — Release & Operations Implementation Plan

## 1. Versioning (Changesets)

Industry standard: [Semantic Versioning 2.0](https://semver.org/) + [Changesets](https://github.com/changesets/changesets) for monorepo.

**Current state:** `.changeset/config.json` exists with `baseBranch: main`, `access: public`. Empty.

**What's needed:**

| Step | Detail |
|------|--------|
| Create initial changeset | `pnpm changeset` — describe all work done so far as a "minor" bump |
| Configure release workflow | GitHub Action that runs `pnpm changeset version` + `pnpm publish` on push to main |
| Add `mcpName` field | Required for MCP Registry: `"mcpName": "io.github.quillby/mcp-server"` in `package.json` |
| Set initial version | Current is `0.0.0` → `0.1.0` (pre-1.0, public beta) |

## 2. CI/CD Pipeline

Industry standard: GitHub Actions + Turbo's remote caching + pnpm.

```yaml
# .github/workflows/ci.yml
on: [pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm build:local
      - run: pnpm test:unit
```

```yaml
# .github/workflows/release.yml
on:
  push:
    branches: [main]
jobs:
  release:
    if: github.repository == 'vncsleal/quillby'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm build:local
      - run: pnpm test:unit
      - name: Create Release Pull Request
        uses: changesets/action@v1
        with:
          publish: pnpm publish
          version: pnpm changeset version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## 3. Binary Distribution

Industry standard: [Bun `--compile`](https://bun.sh/docs/bundler/executables) for platform-specific binaries, [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github) for distribution.

**Current state:** `pnpm build:binaries` exists but compiles `main-local.ts`. No CI automation.

**What's needed:**

| Matrix | Target | Arch |
|--------|--------|------|
| macOS | darwin | arm64 + x64 |
| Linux | linux | x64 |
| Windows | windows | x64 |

```yaml
# In release.yml
jobs:
  build-binaries:
    strategy:
      matrix:
        include:
          - target: bun-darwin-arm64
            suffix: macos-arm64
          - target: bun-darwin-x64
            suffix: macos-x64
          - target: bun-linux-x64
            suffix: linux-x64
          - target: bun-windows-x64
            suffix: windows-x64.exe
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun build --compile --target=${{ matrix.target }} ./src/main-local.ts --outfile quillby-mcp-${{ matrix.suffix }}
      - uses: actions/upload-artifact@v4
        with:
          name: quillby-mcp-${{ matrix.suffix }}
          path: quillby-mcp-${{ matrix.suffix }}
```

### Installer Packaging

Bare binaries are not user-friendly for non-technical users.
Each platform needs a proper installer that validates prerequisites (Claude Desktop),
writes `claude_desktop_config.json`, and provides post-install feedback.

| Platform | Format | Tool | Owner |
|----------|--------|------|-------|
| macOS | `.dmg` (target) / `.pkg` (current) | `pkgbuild` + `productbuild` for `.pkg` today; target is `create-dmg` wrapping a native `.app` bundle | ✅ `.pkg` is built in CI today. **Target UX is `.dmg` drag-and-drop** with a native setup assistant on first launch — no wizard, just drag to Applications and go. |
| Windows | `.exe` (Inno Setup) | [Inno Setup](https://jrsoftware.org/isinfo.php) or [NSIS](https://nsis.sourceforge.io/) | **Planned.** Wizard-based installer with Add/Remove Programs support. |
| Linux | skip | Claude Desktop does not exist on Linux. No Linux package needed. |
| Universal (any OS) | `npx` | `npx @vncsleal/quillby` | Zero install, works on any platform with Node.js. No CI matrix, no packaging. |

**Build workflow (post-binary):**

```yaml
      # Current: builds .pkg from the binary
      - name: Package macOS .pkg
        if: matrix.suffix == 'macos-arm64'
        run: |
          ./scripts/package-macos.sh quillby-mcp-${{ matrix.suffix }} quillby-${{ matrix.suffix }}.pkg
      # TODO: replace with .dmg (create-dmg + .app bundle) for drag-and-drop UX
      - name: Package Windows .exe
        if: matrix.suffix == 'windows-x64'
        run: |
          # Uses iscc (Inno Setup CLI) via wine on ubuntu-latest
          wine iscc scripts/quillby-installer.iss /DMyAppBinary=quillby-mcp-${{ matrix.suffix }}
```

All installers are uploaded as release artifacts alongside the bare binaries.

## 4. MCP Registry Publishing

Industry standard: [MCP Registry](https://registry.modelcontextprotocol.io/) via `mcp-publisher` CLI.

**What's needed:**

| Item | Detail |
|------|--------|
| `mcpName` in `package.json` | `"mcpName": "io.github.quillby/quillby-mcp"` |
| `server.json` | Server metadata file (generate with `mcp-publisher init`) |
| GitHub OIDC auth | No secrets needed — uses `id-token: write` |
| npm publish | Required as underlying package before MCP Registry |
| GH Action step | Authenticate + publish after binary build |

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.sjon",
  "name": "io.github.quillby/quillby-mcp",
  "description": "AI copywriting assistant — RSS feeds, content briefs, campaigns, and media generation.",
  "repository": { "url": "https://github.com/vncsleal/quillby", "source": "github" },
  "version": "0.1.0",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@vncsleal/quillby",
      "version": "0.1.0",
      "transport": { "type": "stdio" }
    }
  ]
}
```

## 5. Client Installation Guides

Industry standard: One config snippet per client, tested end-to-end.

```json
// Claude Desktop — claude_desktop_config.json
{
  "mcpServers": {
    "quillby": {
      "command": "/path/to/quillby-mcp"
    }
  }
}
```

```bash
# Claude Code
claude mcp add --transport stdio --scope project quillby -- /path/to/quillby-mcp
```

```json
// VS Code — .vscode/mcp.json
{
  "servers": {
    "quillby": {
      "command": "/path/to/quillby-mcp"
    }
  }
}
```

```json
// Cursor — .cursor/mcp.json
{
  "mcpServers": {
    "quillby": {
      "command": "/path/to/quillby-mcp"
    }
  }
}
```

## 6. Feature Flags & Hot Swap

Industry standard: Environment variables at process start. No runtime feature flags needed for v1.

**Current state:** `QUILLBY_*` env vars already control:
- `QUILLBY_DEPLOYMENT_MODE` — `local` | `cloud` | `self-hosted`
- `QUILLBY_HOME` — data directory
- `QUILLBY_LOG_LEVEL` — `info` | `warn` | `error` | `fatal`
- `QUILLBY_SCHEDULE` — automatic harvest schedule

**No additional flags needed for v1.** The mode dispatch IS the feature flag — each entrypoint loads only its own dependencies. Adding a new feature means adding it to the correct entrypoint file; LOCAL mode is never affected by CLOUD features.

## 7. Release Cadence

Industry standard: [CalVer](https://calver.org/) for pre-1.0, SemVer after.

| Phase | Version | Cadence | Trigger |
|-------|---------|---------|---------|
| Beta | 0.x | Weekly | Changeset on main |
| v1.0 | 1.0 | Stable | All tiers complete |
| Post-1.0 | 1.x | Semver | Breaking = major, features = minor, fixes = patch |

## 8. OpenPlan State Tree

```
S-000008 (LOCAL — production ship)
├── S-000029  Changesets initial release
├── S-000030  CI pipeline (lint + typecheck + test + build)
├── S-000031  Binary release workflow (macOS/Linux/Windows)
├── S-000032  MCP Registry listing
├── S-000033  Client config guides (Claude, VS Code, Cursor)
└── S-000034  Documentation site (README + install guide)
```
