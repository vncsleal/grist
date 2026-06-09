---
"@vncsleal/quillby": minor
---

Release readiness: binary entrypoint fix, version injection, .dmg pipeline, exact deps.
Feature: macOS .app bundle with ad-hoc signing and create-dmg pipeline for drag-install UX.
Fix: binary `bun build --compile` now compiles `main-local.ts` (was `server.ts`) — binaries actually start the server.
Fix: runtime `fs.readFileSync` of `package.json` replaced with compile-time version injection via `--define`.
Fix: all dependencies pinned to exact versions (`^` → no prefix).
Chore: MCP Registry manifest (`server.json`), CHANGELOG.md, release runbook.
Site: complete landing page redesign with capabilities grid, campaigns, before/after comparison, testimonial, industry badges.
