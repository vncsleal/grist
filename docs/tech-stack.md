# Quillby — Tech Stack Proposal

## Overview

Five apps, one monorepo. Each app uses the best tool for its job.
Shared packages provide domain logic. TypeScript end-to-end.

```
apps/
  site/     Astro + MDX        → static site (docs, blog, pricing)
  mcp/      TypeScript + Zod    → MCP protocol server
  api/      Hono + Drizzle      → REST API (auth, billing, webhooks)
  cloud/    React + Vite        → cloud dashboard SPA
  portal/   React + Vite (min)  → self-hosted admin (bundled in api)

packages/
  core/         domain types (zod)           → every app
  config/       env vars, paths              → mcp, api
  content/      content pipeline             → mcp, api
  workspace/    workspace domain             → mcp, api, cloud
  storage-fs/   filesystem storage           → mcp (LOCAL)
  storage-db/   libSQL/Drizzle storage       → mcp (CLOUD), api
  database/     Drizzle schema + migrations  → api
  auth/         better-auth wrapper          → api
  billing/      Stripe integration           → api
  providers/    provider router (gen)        → mcp
```

---

## 1. `apps/site` — Marketing + Docs

**Stack:** Astro + MDX + Tailwind

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | Astro | Zero JS by default. Best-in-class markdown/MDX support. Fast builds. Already in use. |
| Content | MDX | Write docs and blog posts in markdown with embedded components. |
| Styling | Tailwind | Already in use. Consistent with cloud/portal apps. |
| Search | Pagefind | Static search index. No backend needed. Zero-cost. |
| Hosting | Cloudflare Pages | Free, global CDN, automatic deploys from GitHub. |
| Domain | `quillby.ai` | Or whatever the marketing domain is. |

**Does NOT need:**
- A database
- Authentication
- JavaScript runtime (static export)

**Route structure:**
```
/                 landing page
/docs/*           documentation
/blog/*           blog posts
/pricing          pricing page
/changelog        release notes
```

---

## 2. `apps/mcp` — MCP Server

**Stack:** TypeScript + MCP SDK + Zod

Already built. No changes needed. The current architecture is correct:

- `tsconfig.local.json` → stdio + storage-fs
- `tsconfig.cloud.json` → HTTP + storage-db
- `tsconfig.selfhosted.json` → HTTP + storage-db

The 11 tools are shared across all three tiers. Only storage and transport change.

**Deploy:**
- LOCAL: standalone binary (Bun compile)
- CLOUD: Docker container
- SELF: Docker container

---

## 3. `apps/api` — REST API

**Stack:** Hono + Drizzle + better-auth + Stripe

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | Hono | Fast, TypeScript-native, lightweight (14KB). Better than Express (too heavy) and Fastify (too complex). Works on Node + Bun. |
| Validation | Zod | Already used everywhere. Hono has built-in Zod validator middleware. |
| Database | Drizzle ORM | Already in use. Type-safe SQL. Better than Prisma for our use case (no hidden queries, no heavy client). |
| Auth | better-auth | Already in use. Session management, API keys, email verification. |
| Billing | Stripe | Already integrated. Webhooks handled here, not in MCP server. |
| Runtime | Node.js 22+ | Matches the monorepo. Hono's Node adapter is mature. |
| Deploy | Docker | Behind reverse proxy. Can scale horizontally. |
| Tests | Vitest | Already in use across the monorepo. |

**What `apps/api` handles:**
- `POST /api/auth/*` — better-auth routes (sign-up, sign-in, password reset)
- `GET /api/workspaces` — list/create/select workspaces
- `GET /api/cards` — card curation list
- `POST /api/cards/curate` — approve/skip cards
- `GET /api/drafts` — draft history
- `GET /api/plan` — current plan + limits
- `POST /api/billing/upgrade|downgrade|portal` — Stripe checkout
- `POST /api/billing/stripe/webhook` — Stripe event webhook
- `GET /api/admin/*` — self-hosted admin (team management)

**What `apps/api` does NOT handle:**
- MCP protocol (that's `apps/mcp`)
- Static file serving (that's `apps/site` or a CDN)
- Media generation (that's `apps/mcp` via ProviderRouter)

**Route design principle:**
```
apps/mcp speaks JSON-RPC  (tools/call, resources/read)
apps/api speaks REST       (GET/POST/PUT/DELETE /api/*)
```

The MCP server and API server talk to the same database in CLOUD/SELF-HOSTED modes, but serve different clients (AI clients vs web browsers).

---

## 4. `apps/cloud` — Cloud Dashboard

**Stack:** React + Vite + shadcn/ui + Tailwind + React Router

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | React + Vite | Fast dev server, fast builds, mature ecosystem. Already in use. |
| Styling | Tailwind | Utility-first, consistent with site. No HeroUI — too heavy. |
| Routing | React Router v7 | Standard. File-based or config-based. |
| Auth | better-auth client | Built-in React hooks for session management. |
| API calls | fetch + generated types | Hono's RPC mode generates typed clients from API routes. |
| Hosting | Cloudflare Pages | Same as site. SPA with client-side routing. |
| Deploy | `pnpm build` → static files → CDN | No SSR needed (authenticated dashboard). |

**Pages:**
```
/              redirect to /workspaces
/login         sign in
/signup        create account
/workspaces    workspace list + create
/workspace/:id cards, drafts, settings
/billing       plan + payment history
/settings      profile, password, API keys
```

**NOT ported from the old `apps/app`:**
- HeroUI component library (replaced with minimal Tailwind + Radix where needed)
- Admin pages (moved to `apps/portal`)
- Server-side logic (moved to `apps/api`)
- MCP-related UI (belongs in the AI client, not the dashboard)

---

## 5. `apps/portal` — Self-Hosted Admin

**Stack:** React + Vite + Tailwind (minimal)

Same stack as `apps/cloud`, but intentionally smaller. Only admin functions.

**Delivery:** Built as a Vite project that produces static files. These files are copied into the `apps/api` Docker image and served at `/admin/*`. No separate deployment.

**Pages:**
```
/admin/login       admin auth
/admin/users       user list + invite
/admin/workspaces  workspace overview
/admin/settings    system config
/admin/backups     backup/restore
/admin/logs        system logs
```

**Why not just extend `apps/cloud`:**
- Self-hosted admins are a different audience (technical, ops-focused)
- Cloud users should never see admin UI
- Separate bundle keeps cloud dashboard smaller
- Portal is bundled into api binary — no separate deployment

---

## Shared Packages — Current State

| Package | Status | Used by |
|---------|--------|---------|
| `@quillby/core` | ✅ Stable | All |
| `@quillby/config` | ✅ Stable | mcp, api |
| `@quillby/workspace` | ✅ Stable | mcp, api, cloud |
| `@quillby/content` | ✅ Stable | mcp, api |
| `@quillby/providers` | ✅ Stable | mcp |
| `@quillby/storage-fs` | ✅ Stable | mcp (LOCAL) |
| `@quillby/storage-db` | ✅ Stable | mcp (CLOUD), api |
| `@quillby/database` | ✅ Stable | api |
| `@quillby/auth` | ✅ Stable | api |
| `@quillby/billing` | ✅ Stable | api |

No new packages needed. The existing 10 packages cover all concerns.

---

## What Happens to the Old `apps/app`

The current `apps/app` (26K-line React SPA with HeroUI) is replaced by:
- `apps/cloud` — cloud dashboard (new, focused, Tailwind)
- `apps/portal` — self-hosted admin (new, minimal)

Old `apps/app` is deleted once the new apps are functional. No migration needed — it was never deployed to production.

---

## Summary Decision Table

| App | Stack | Deploy | Build | New or Existing |
|-----|-------|--------|-------|-----------------|
| `apps/site` | Astro + MDX + Tailwind | Cloudflare Pages (static) | `pnpm build` | Existing, needs polish |
| `apps/mcp` | TypeScript + MCP SDK + Zod | Binary / Docker | `pnpm build:*` | ✅ Done |
| `apps/api` | Hono + Drizzle + better-auth | Docker | `pnpm build` | **New** |
| `apps/cloud` | React + Vite + Tailwind | Cloudflare Pages (SPA) | `pnpm build` | **New** |
| `apps/portal` | React + Vite + Tailwind | Bundled in api Docker | `pnpm build` | **New** |
