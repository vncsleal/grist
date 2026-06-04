# Tech Stack — Rationale

## 1. Why Astro for `apps/site` and not React?

**Chosen: Astro + MDX**

Astro ships **zero JavaScript by default**. A marketing site, docs, and blog don't need client-side interactivity — they need fast page loads, good SEO, and readable content. Astro delivers all three.

- Pages are rendered to static HTML at build time. No JS runtime needed.
- MDX support means blog posts and docs are written in markdown with embedded components.
- Island architecture means you can drop in React components where needed (pricing table, interactive demo) without shipping a full SPA bundle.
- Already in use (`apps/web`), so no new framework to learn.

**Rejected: Next.js, Remix**
- These are app routers, not content sites. They'd require a Node.js server for pages that don't need one.
- Next.js would work, but it's more complex to deploy (Node server vs static files) and slower to build for content-heavy sites.
- Astro is the industry standard for documentation sites (see: Vite docs, Turbo docs, Astro's own docs).

---

## 2. Why Hono for `apps/api` and not Express, Fastify, or NestJS?

**Chosen: Hono**

| Framework | Bundle | Speed | TypeScript | Middleware | Runtime |
|-----------|--------|-------|------------|------------|---------|
| Express | 572KB | Slow | Poor | Rich | Node only |
| Fastify | ~200KB | Fast | Good | Rich | Node only |
| NestJS | ~1MB+ | Moderate | Great | Opinionated | Node only |
| **Hono** | **14KB** | **Fastest** | **Great** | **Built-in** | **Any (Node, Bun, CF Workers)** |

Hono is the fastest web framework for JavaScript, is built on Web Standards, and has first-class TypeScript support with Zod integration.

**Key reasons:**

- **14KB bundle.** Express is 572KB minified. Hono is 14KB. For an API server that may run in resource-constrained Docker containers, this matters.
- **TypeScript-native.** Hono's router infers path parameters as literal types. When you define `GET /workspaces/:id`, the handler receives `{ id: string }` typed automatically — no manual annotations.
- **Zod integration.** Hono has built-in `zodValidator` middleware that validates request bodies, query params, and headers against Zod schemas. Exactly the pattern we already use in `apps/mcp`.
- **Multi-runtime.** Hono runs on Node, Bun, Cloudflare Workers. If we ever want to move the API to the edge, we can without changing the framework.
- **Simple router.** Hono doesn't impose an opinionated structure (unlike NestJS). Routes are functions, not classes with decorators. This keeps the codebase flat and easy to navigate.

**Rejected alternatives:**

- **Express:** Too heavy, too much legacy middleware, poor TypeScript support, callback-based error handling. The industry is moving away from Express for new projects.
- **Fastify:** Good, but heavier than Hono and its plugin model adds complexity. Fastify's TypeScript support is also less integrated than Hono's.
- **NestJS:** Too opinionated. Controllers, providers, modules, decorators, DI — all of this is unnecessary complexity for an API server with ~20 routes. NestJS also has a large bundle size and slow startup time.

---

## 3. Why React + Vite + shadcn/ui for `apps/cloud` and not Next.js, Remix, or Solid?

**Chosen: React + Vite + shadcn/ui + Tailwind + React Router**

**React** stays because:
- The team knows it. The existing 26K-line `apps/app` is React.
- The MCP ecosystem has best-in-class React support (MCP Apps extension).
- React 19's server components and actions don't benefit an authenticated SPA — there's no SEO concern here.

**Vite** stays because:
- Fastest dev server (HMR in milliseconds).
- Simple build: `vite build` produces static files → deploy to CDN.
- No Node.js server needed for the dashboard — it's all client-side after auth.

**Tailwind + shadcn/ui** replaces HeroUI because:
- The old `apps/app` used HeroUI and was 26K lines. HeroUI is a heavy npm dependency with an opinionated theme system that fights customization.
- shadcn/ui is not a dependency — it's copy-pasted code. `npx shadcn add button` lands a `Button.tsx` in your repo that you own and modify.
- Built on Radix UI primitives (accessible, headless) with Tailwind classes you control.
- No theme provider, no CSS-in-JS, no fighting the framework. Every component is just Tailwind utility classes.
- A dashboard needs ~15 components (Button, Input, Dialog, Table, Form, Card). shadcn covers all of them. The same components are shared between `apps/cloud` and `apps/portal` via a workspace package.

**React Router** over Next.js because:
- Next.js is an app router + server. We don't need a server. The dashboard is a client-side SPA that calls `apps/api`.
- React Router v7 is stable, supports file-based routing, and produces a static SPA output.
- Deploying a Next.js app to serve a dashboard that could be static files is wasteful.

**Rejected: Solid, Svelte, Vue**
- No advantage for this project. React is what the team knows. The bundle size difference between React and Solid is negligible for a dashboard app.
- Framework switching costs are high. The MCP SDK's React integrations wouldn't work with Solid/Svelte.

---

## 4. Why the same stack for `apps/portal`?

**Chosen: Same stack as cloud, intentionally smaller**

- Same stack means shared utility components (buttons, forms, layouts).
- Portal has 5 pages, not 15. Building it separately from cloud keeps both apps focused.
- Portal is bundled into the api Docker image as static files. No separate deployment.
- A React SPA without a build step is just HTML + JS files. Very easy to embed.

**Why not a single app with role-based views:**
- Cloud users should never see admin UI. Separate apps prevent accidental exposure.
- Self-hosted admins are technical users who need system logs, backup controls, and user management — none of which belong in the cloud dashboard.
- Bundle size: portal users don't need card curation UI. Cloud users don't need system logs.

---

## 5. Why NOT a monolith (one app doing everything)?

The current architecture already proves this is wrong:
- `apps/mcp` was serving HTTP routes, auth middleware, and MCP tools in one process. Removing HTTP routes from mcp was the right decision.
- `apps/app` (26K lines) tried to be both a cloud dashboard and an admin panel. It was neither well.
- MCP tools speak JSON-RPC. REST speaks HTTP verbs. JSON-RPC over HTTP is possible but confusing — better to separate.

**Three separate concerns, three separate apps:**

| Concern | App | Protocol | Client |
|---------|-----|----------|--------|
| Content tools | `apps/mcp` | MCP (JSON-RPC) | AI clients |
| Business logic + auth | `apps/api` | REST (HTTP) | Web apps, CLI |
| User interface | `apps/cloud` / `apps/portal` | Browser | Humans |

Each can be developed, tested, deployed, and scaled independently. No single app needs to know about the others' internals.
