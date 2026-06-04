---
"@vncsleal/quillby": minor
---

Tool consolidation: 60 flat MCP tools → 11 domain-grouped tools with discriminated union schemas.
LOCAL mode: clean entrypoint, zero cloud dependencies, storage-agnostic server.ts, three-tier build targets.
Type safety: FullStorage type eliminates 12 scattered type casts. 2 remaining at documented boundaries.
Architecture: hexagonal decoupling — server.ts is storage-agnostic, entrypoints inject their own storage.
CLI: binary dispatches to correct mode by environment, standalone binaries via Bun compile.
