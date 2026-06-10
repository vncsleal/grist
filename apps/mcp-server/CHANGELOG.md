# @vncsleal/quillby

## 0.4.1

- Release readiness: binary entrypoint fix, version injection, .dmg pipeline, exact deps.
- Tool consolidation: 60 flat MCP tools → 11 domain-grouped tools with discriminated union schemas.
- LOCAL mode: clean entrypoint, zero cloud dependencies, storage-agnostic server.ts, three-tier build targets.
- Architecture: hexagonal decoupling — server.ts is storage-agnostic, entrypoints inject their own storage.
- Codebase cleanup: ARD comments → proper HACK annotations, sharp dep removed, version resolution hardened.
- Binary: bun build --compile now compiles main-local.ts — binaries actually start the server.
- Fix: runtime fs.readFileSync of package.json replaced with compile-time version injection via --define.
- Fix: all dependencies pinned to exact versions.
- Site: complete landing page redesign with capabilities grid, campaigns, comparisons.
- Fix: DMG creation uses pinned `create-dmg` devDep instead of `npx`
- Fix: Install scripts — remove Python dep, add curl retry, use grep+sed for JSON
- Fix: `install.ps1` — TLS 1.2 fix, PS 5.1 compat via PSObject property enumeration
- Fix: Windows NSIS installer — PS 5.1 compat for config write
- Fix: Site download URLs centralized in constants file
- Fix: README.md — remove dead .dmg link
- Fix: Release pipeline — single release job, smoke tests for macOS/Windows, CHANGELOG as body
- Chore: Remove changesets (config incompatible with monorepo structure)

## 0.4.0

- Initial pre-release. Local mode production-ready.
- 11 domain-grouped MCP tools (workspace, feeds, briefing, cards, drafts, memory, campaign, planning, generate, session, server)
- Multi-workspace support with per-workspace memory, sources, and voice profiles
- Content campaign system with blueprints, dependency graphs, and auto-execution
- Content planning with task board, calendar, and today queue
- Media generation via MCP Sampling and direct API keys (OpenAI, ElevenLabs, Replicate, BFL Flux, MiniMax, Veo, Kling, Google AI, fal.ai)
- Voice and avatar cloning (ElevenLabs, OmniHuman)
- RSS feed discovery and management
- Daily briefing pipeline with headline scoring and deep-read
- Platform post generation (LinkedIn, Twitter, blog, newsletter)
- Persistent typed memory per workspace
- macOS .pkg and .dmg installers, Windows .exe installer, npm package
