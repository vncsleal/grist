---
"@vncsleal/quillby": patch
---

Release readiness for local mode v0.4.1:

- Fix: DMG creation uses pinned `create-dmg` devDep instead of `npx`
- Fix: Install scripts — remove Python dependency, add curl retry, use grep+sed for JSON tag extraction
- Fix: `install.ps1` — TLS 1.2 fix, PS 5.1 compat via PSObject property enumeration
- Fix: Windows NSIS installer — PS 5.1 compat for config write
- Fix: Site download URLs centralized in constants file
- Fix: README.md — remove dead .dmg link
- Chore: Release pipeline — smoke tests for macOS and Windows binaries, CHANGELOG as release body
