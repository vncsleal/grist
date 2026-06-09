# Local Mode Release Plan

## 4 critical issues, 3 minor

---

## P0 — Fix binary builds (S-000060)

### 1a. Fix entrypoint in release.yml
**File:** `.github/workflows/release.yml` lines 29-30, 76, 108
**Change:** `src/mcp/server.ts` → `src/main-local.ts` in all 4 `bun build --compile` commands

```diff
- bun build --compile --target=bun-darwin-arm64 ./apps/mcp-server/src/mcp/server.ts
+ bun build --compile --target=bun-darwin-arm64 ./apps/mcp-server/src/main-local.ts
```

Same for darwin-x64, linux-x64, windows-x64.

### 1b. Fix runtime package.json read
**File:** `apps/mcp-server/src/mcp/shared.ts` lines 11-15
**Fix:** Bundle the version string at compile time instead of reading `package.json` at runtime.

Options:
- Option A: Inline `export const VERSION = "2.0.0"` and update it via CI/release script
- Option B: Use `process.env.npm_package_version` (available when run via npm, but not in binary)
- Option C: Use Bun's built-in `import.meta` or embed the file

**Recommendation:** Option A — write the version as a constant in `shared.ts`, and have the release CI update it before building. Simplest, works in both npm and binary contexts.

### 1c. Update build:binaries npm script
Ensure `package.json` scripts match the release.yml entrypoint. Currently `build:binaries` uses `src/main-local.ts` which is correct, but `release.yml` diverges. After 1a they'll be aligned.

---

## P1 — MCP Registry readiness (S-000061)

### 2a. Create server.json
**New file:** `apps/mcp-server/server.json`

MCP registry manifest with package metadata, transport type, and entrypoint.

### 2b. Add MCP registry publish step to release.yml
After binary build, authenticate with MCP registry (GitHub OIDC) and publish the server listing.

---

## P2 — macOS .dmg pipeline (S-000062)

### 3a. Create .app bundle
Script that wraps the binary in a proper macOS `.app` bundle with:
- `Contents/Info.plist` with bundle metadata
- `Contents/MacOS/quillby-mcp` (the binary)
- `Contents/Resources/icon.icns` (app icon)

### 3b. Add create-dmg step to release.yml
After `.pkg` build, also create a `.dmg`:
```bash
npx create-dmg Quillby.app . --volname "Quillby" --icon-size 128
```

Upload both `.pkg` and `.dmg` as release artifacts.

---

## P3 — Test coverage (S-000063)

### 4a. Add smoke test for main-local.ts
Create `tests/unit/main-local.test.ts` that:
- Imports the entrypoint module
- Verifies no import errors
- Verifies signal handlers are registered

### 4b. Add tests for critical tool handlers
Priority order:
1. `server.ts` (dispatch logic, error handling)
2. `shared.ts` (version, shared utilities)
3. Tool handlers with 0% coverage (briefing, cards, generate)

Target: raise statements from 33% → 50%.

---

## P4 — Package hygiene (S-000064)

### 5a. Fix main field in package.json
`apps/mcp-server/package.json` line 20: `"main": "dist/local/main.js"`

### 5b. Pin exact dependency versions
Replace all `^` with exact versions in `apps/mcp-server/package.json`.

### 5c. Create CHANGELOG.md
Basic changelog file at `apps/mcp-server/CHANGELOG.md`.

---

## Summary

| Phase | What | Files | Risk |
|---|---|---|---|
| P0 | Fix binary builds | `release.yml`, `shared.ts` | 🔴 Critical — current binaries don't start |
| P1 | MCP Registry | `server.json` (new), `release.yml` | 🟢 Low |
| P2 | macOS .dmg | `.app` bundle script, `release.yml` | 🟡 Medium — requires macOS testing |
| P3 | Test coverage | `main-local.test.ts` (new), tool tests | 🟡 Medium — 0% → 50% |
| P4 | Package hygiene | `package.json`, `CHANGELOG.md` (new) | 🟢 Low |
