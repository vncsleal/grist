# Implementation Roadmap: Quillby MCP Server

## Overview

Three deployment tiers, implemented sequentially. Each tier inherits the
previous one's infrastructure. No breaking changes between tiers.

```
LOCAL (current) ──→ CLOUD (next) ──→ SELF-HOSTED (last)
     │                    │                    │
     │ stdio              │ HTTP               │ HTTP
     │ filesystem         │ DB (Turso)         │ DB (libSQL)
     │ user's providers   │ managed providers  │ self-managed providers
     │ no auth            │ better-auth + keys │ better-auth + teams
     └── no billing ──────┴── Stripe ──────────┴── optional billing
```

---

## Tier 1: LOCAL — ✅ COMPLETE

**Tag:** `local-v1.0`

**Entrypoint:** `main-local.ts` → `dist/local/main.js`

**Architecture:**
- Transport: stdio (MCP `StdioServerTransport`)
- Storage: `@quillby/storage-fs` (filesystem at `~/.quillby/`)
- Auth: none (process-owned)
- AI Generation: MCP Sampling (tier 1) + user-configured direct providers (tier 3)
- Billing: none (tools return "not available in local mode")

**What ships:**
- 11 consolidated MCP tools
- 8 resources, 6 prompts
- RSS feed discovery + article extraction
- Full content pipeline: feeds → brief → cards → drafts → posts
- Campaigns with stage tracking
- Content planning + calendar
- Image/audio/video generation via provider adapters
- Voice cloning (ElevenLabs)
- Typed memory system

**Build:**
```bash
pnpm build:local          # → dist/local/
pnpm build:binaries       # → standalone binaries (main-local.ts compiled)
```

**Ship checklist:**
- [x] 11 tools registered and working
- [x] Zero cloud dependencies in LOCAL import chain
- [x] Resources + prompts registered
- [x] Natural language output (no raw JSON blobs)
- [x] Configurable log level (`QUILLBY_LOG_LEVEL`)
- [x] 549/549 tests passing
- [ ] Binary distribution (GitHub release)
- [ ] MCP registry listing
- [ ] Install docs for Claude Desktop, VS Code, Cursor

---

## Tier 2: CLOUD — ⏳ NEXT

**Tag:** `cloud-v1.0`

**Entrypoint:** `main-cloud.ts` → `dist/cloud/main.js`

**Architecture differences from LOCAL:**

| Layer | LOCAL | CLOUD |
|-------|-------|-------|
| Transport | stdio | HTTP (`StreamableHTTPServerTransport`) |
| Storage | `storage-fs` | `storage-db` (Turso/libSQL) |
| Auth | none | better-auth + API keys |
| AI Gen | Sampling + direct | managed providers (tier 2) |
| Billing | none | Stripe subscription |
| Persistence | per-process | cross-session, account-bound |

**Components to build:**

### 2.1 HTTP Server
- Extract from old `server.ts` HTTP block into `src/http/server.ts`
- Express/Hono-based with CORS, rate limiting, security headers
- MCP session management (streamable HTTP)
- Health check endpoint (`GET /health`)

### 2.2 Auth (better-auth)
- Sign-up, sign-in, password reset
- Email verification
- API key management (create, list, revoke)
- Session management with refresh tokens
- OAuth provider integration (optional)

### 2.3 DB Storage
- Implement cloud entrypoint with `@quillby/storage-db`
- Multi-tenant workspace isolation (one workspace per user, shareable)
- Data migration from filesystem to DB
- `storage.ts` barrel will need to be mode-aware

### 2.4 Managed Providers
- Implement `ProviderRouter.tier2` (cloud-managed adapters)
- Fal.ai, Replicate, or other managed media generation
- Provider usage tracking for billing

### 2.5 Billing (Stripe)
- Free tier (limited credits/month)
- Pro tier (unlimited)
- Stripe webhook integration for subscription lifecycle
- Rate limiting based on plan
- Credit enforcement for generation

### 2.6 Cloud Dashboard (existing `apps/app`)
- React SPA already exists
- Connect to cloud MCP server HTTP API
- Workspace management UI
- Card curation UI
- Draft history
- Billing portal

### 2.7 Build target
```bash
pnpm build:cloud     # → dist/cloud/
```

---

## Tier 3: SELF-HOSTED — 📋 LATER

**Tag:** `selfhosted-v1.0`

**Entrypoint:** `main-selfhosted.ts` → `dist/selfhosted/main.js`

**Architecture differences from CLOUD:**

| Layer | CLOUD | SELF-HOSTED |
|-------|-------|-------------|
| DB | Turso (managed) | libSQL (self-hosted) |
| Billing | Stripe (mandatory) | None (or optional license) |
| Auth | better-auth (cloud-managed) | better-auth (local DB) |
| Providers | managed (tier 2) | self-configured (tier 3) |
| Dashboard | Quillby-hosted SPA | bundled SPA served by server |

**Components:**

- Shared CLOUD infrastructure (HTTP, auth, DB storage)
- Docker Compose setup (`docker compose up`)
- Admin API key management
- Team/workspace sharing
- Bundled SPA for admin dashboard
- Backup/restore procedures
- Prometheus metrics endpoint (optional)

**Build target:**
```bash
pnpm build:selfhosted   # → dist/selfhosted/
```

---

## Dependency Graph

```
LOCAL ─────────────────────────────────────────────── (no deps)
  │
  └── CLOUD
       ├── @quillby/storage-db
       ├── @quillby/auth (better-auth)
       ├── @quillby/billing (Stripe)
       └── @quillby/database (Drizzle schema)
            │
            └── SELF-HOSTED
                 └── (inherits all CLOUD deps)
```

Each tier's `tsconfig.{mode}.json` includes/excludes source files
accordingly. The shared `mcp/` directory is mode-agnostic — all three
modes compile the same `mcp/server.ts`, `mcp/tools/*.ts`, etc.

---

## Risk Matrix

| Risk | Tier | Likelihood | Mitigation |
|------|------|-----------|------------|
| HTTP transport breaks MCP tool semantics | CLOUD | Medium | Already have streamable HTTP SDK; test with MCP Inspector |
| DB migration from filesystem loses user data | CLOUD | Low | Implement migration CLI (`pnpm migrate`) |
| Stripe integration complex to test | CLOUD | Medium | Use Stripe test mode + webhook forwarding |
| Self-hosted users have no billing portal | SELF-HOSTED | Low | Stripe is optional; disable billing when no Stripe keys |
| Auth adds latency to every tool call | CLOUD | Low | Session tokens avoid re-auth per call |
