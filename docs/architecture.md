# Quillby — Three-Tier Architecture

## Deployment Model

```
                    LOCAL                          CLOUD                         SELF-HOSTED
               ┌──────────────┐              ┌──────────────┐               ┌──────────────┐
    User       │  Claude etc  │              │  Claude etc  │               │  Claude etc  │
               └──────┬───────┘              └──────┬───────┘               └──────┬───────┘
                      │ stdio                      │ streamable HTTP              │ streamable HTTP
               ┌──────┴───────┐              ┌──────┴───────┐               ┌──────┴───────┐
    Apps       │    apps/mcp  │              │    apps/mcp   │               │   apps/mcp    │
               │  (standalone)│              └──────┬───────┘               └──────┬───────┘
               │              │                     │ HTTP (internal)              │ HTTP (internal)
               └──────────────┘              ┌──────┴───────┐               ┌──────┴───────┐
                                             │   apps/api   │               │   apps/api    │
                                             │              │               │               │
               ┌──────────────┐              │ + apps/cloud │               │ + apps/portal │
               │  no data     │              └──────────────┘               └──────────────┘
               │  no auth     │                                                 │
               │  filesystem  │              ┌──────────────┐               ┌──┴────────────┐
               └──────────────┘              │  Turso DB    │               │  libSQL (your │
                                             │  (managed)   │               │     infra)    │
                                             └──────────────┘               └───────────────┘
```

## App Boundaries

### 1. `apps/mcp` — MCP Protocol Server

**Responsibility:** Expose Quillby's capabilities as MCP tools, resources, and prompts.

**Transport:** stdio (LOCAL, self-hosted) OR streamable HTTP (cloud, self-hosted).

**What it does NOT do:**
- ❌ Serve REST API endpoints
- ❌ Handle auth (auth happens at the HTTP transport level via API keys)
- ❌ Serve web pages

**Imports:**
```
LOCAL:  storage-fs providers config core workspace content
CLOUD:  storage-db providers config core workspace content  ← same tools, different storage
SELF:   storage-db providers config core workspace content
```

The 11 MCP tools are the same across all three tiers. Only the storage backend and transport differ. The tools check `ctx.deploymentMode` for tier-specific behavior (e.g., billing returns "cloud only").

**Build targets (already done):**
```
pnpm build:local        → dist/local/
pnpm build:cloud        → dist/cloud/
pnpm build:selfhosted   → dist/selfhosted/
```

### 2. `apps/api` — REST API (NEW)

**Responsibility:** User-facing REST API for cloud and self-hosted. Handles auth, billing, workspace sharing, and webhook endpoints.

**Framework:** Hono or Fastify. Not Express — too heavy.

**Only exists in:** CLOUD + SELF-HOSTED modes. LOCAL mode doesn't need it.

**Endpoints:**

| Group | Endpoints | Auth |
|-------|-----------|------|
| Auth | `POST /api/auth/*` (better-auth routes) | None (public) |
| Workspaces | `GET/POST /api/workspaces` | Bearer token |
| Profile | `GET/PUT /api/profile` | Bearer token |
| Memory | `GET/POST /api/memory` | Bearer token |
| Billing | `GET /api/plan`, `POST /api/billing/*`, Stripe webhook | Bearer + webhook secret |
| Admin (self-hosted) | `GET /api/users`, `POST /api/invite` | Admin key |

**Why separate from mcp-server:**
- MCP protocol uses JSON-RPC 2.0. REST uses HTTP verbs. Mixing them in one server creates confusion.
- MCP server might be stdio (LOCAL) while API server is always HTTP.
- The API server can be deployed behind a reverse proxy, scaled independently.
- Stripe webhooks and auth callbacks don't belong in an MCP tool handler.

**Package structure:**
```
apps/api/
  src/
    main.ts              ← entrypoint (creates HTTP server)
    routes/
      auth.ts
      workspaces.ts
      profile.ts
      memory.ts
      billing.ts
      admin.ts           ← self-hosted only
    middleware/
      auth.ts
      rate-limit.ts
    db.ts                ← shared DB connection
```

### 3. `apps/cloud` — Cloud Dashboard (REBUILD)

**Current state:** `apps/app` exists but is tangled with early iterations, 26K lines of HeroUI React.

**New approach:** Build a focused cloud dashboard from scratch. Smaller, purpose-built.

**Features:**
- Plans/pricing page (public)
- Sign up / sign in
- Workspace list + CRUD
- Card curation (approve/skip/list)
- Draft history
- Generation job history
- Provider config (cloud-managed, no API keys for users)
- Billing portal
- Team management (self-hosted)

**Tech:** React + Vite + Tailwind CSS. No HeroUI — too heavy. Keep it lean.

**Does NOT need to exist for LOCAL mode.** Only for CLOUD.

### 4. `apps/portal` — Bundled Admin UI (MINIMAL)

**When:** The api serves a small React SPA for self-hosted admin.

**Features:**
- User management (invite, remove)
- Workspace management
- System health dashboard
- Backup/restore controls
- Provider config (admin sets org-wide defaults)

**Delivery:** Bundled into the api binary. No separate deployment.

## Data Flow

### LOCAL (read → write)

```
Claude → mcp-server (stdio) → storage-fs (filesystem)
                                    ↓
                              ~/.quillby/workspaces/<id>/
                                  ├── context.json
                                  ├── typed-memory.json
                                  ├── sources.txt
                                  ├── harvests/*.json
                                  ├── drafts/*.json
                                  └── jobs/*.json
```

### CLOUD (read → write)

```
Claude → mcp-server (HTTP) ─→ storage-db (libSQL/Turso)
                                    ↓
                              api ─→ cloud (React SPA)
                                    ↓
                              Stripe (billing)
```

### SELF-HOSTED

```
Claude → mcp-server (HTTP) ─→ storage-db (libSQL)
                              api (serves admin UI)
                              Stripe (optional, disabled when no keys)
```

## Package Dependency Graph

```
                    apps/mcp
                   /    |    |    \
          storage-fs  storage-db  providers  config
               |           |         |         |
               +-----+-----+         |         |
                     |               |         |
               @quillby/workspace   @quillby/core
                     |               |
               @quillby/content      |
                     |               |
               @quillby/workspace  (zod)

apps/api
  ├── @quillby/auth (better-auth)
  ├── @quillby/billing (Stripe)
  ├── @quillby/database (Drizzle + libSQL)
  └── @quillby/storage-db

apps/cloud
  └── (calls api via fetch — no direct package dep)
```

## Implementation Order

| Step | App | Depends On | Effort |
|------|-----|-----------|--------|
| 1. Scaffold `api` | `apps/api` | Nothing | 2 days |
| 2. Move auth routes from old server.ts | `apps/api` | Step 1 | 1 day |
| 3. Move billing + Stripe webhooks | `apps/api` | Step 1 | 1 day |
| 4. Build cloud MCP entrypoint (`main-cloud.ts`) | `apps/mcp` | Nothing | 1 day |
| 5. Build `cloud` from scratch | `apps/cloud` | Step 1 | 2 weeks |
| 6. Wire cloud MCP → `storage-db` | `apps/mcp` | Step 4 | 1 day |
| 7. Docker Compose for self-hosted | `infra/docker` | Step 1-6 | 1 day |
| 8. Self-hosted admin UI | `apps/api` (bundled) | Step 7 | 1 day |
