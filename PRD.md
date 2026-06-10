# PRD: Quillby v1 — Production Readiness

## Product Overview

Quillby is an MCP-based AI content assistant for copywriters. It reads RSS feeds, harvests articles, generates drafts in the user's voice, and manages editorial workflow — all through natural-language conversation with a Claude (or any MCP-compatible) client.

### Deployment Modes

| Mode | Transport | Storage | Auth | Audience |
|------|-----------|---------|------|----------|
| **Local** | stdio | Filesystem (`~/.quillby`) | None (process-owned) | Individual copywriters on personal machines |
| **Self-Hosted** | HTTP | User-supplied libSQL/Turso | better-auth + API keys | Technical users, small teams, agencies |
| **Cloud** | HTTP | Quillby-managed DB | better-auth + API keys + billing | SaaS end-users |

All three modes share the same codebase and MCP tool surface. Only storage backend and transport differ.

---

## Current State Summary

**Working:**
- 52 MCP tools, 3768 LOC in `apps/mcp-server/src/mcp/server.ts`
- Full build pipeline: 12/12 packages, Turbo monorepo, pnpm workspaces
- 350+ unit tests (33 test files, 5920 LOC tests)
- 3 deployment modes implemented
- Docker compose for self-hosted
- GitHub Actions release pipeline (macOS/Windows/Linux binaries)
- Cloud dashboard (Vite+React SPA) with sign-in, workspace management, card curation, draft history, billing scaffold
- 9 active packages (billing, config, content, core, database, providers, storage-db, storage-fs, workspace)

**Fixed gaps:**

| Gap | Status | Resolution |
|-----|--------|------------|
| `.bak-*` auth DB backups not in `.gitignore` | ✅ DONE | `.gitignore` now has `*.bak-*`, `*.bak-*/*` |
| No pre-commit secret scanning | ✅ DONE | `lefthook.yml` runs gitleaks + lint + typecheck pre-commit |
| Source maps disabled | ✅ DONE | `tsconfig.json: sourceMap: true`, `vite.config.ts: build.sourcemap: true` |
| `dangerouslyIgnoreUnhandledErrors: true` in Vitest | ✅ DONE | Removed from config; 355 unit tests pass clean |
| No CI for lint/typecheck/test | ✅ DONE | `.github/workflows/ci.yml` has `ci`, `integration`, `docker-smoke` jobs |
| Git history audit | ✅ DONE | `gitleaks` scanned 76 commits — zero secrets found |
| No Docker image smoke test in CI | ✅ DONE | `docker-smoke` job builds, starts, health-checks, tears down |

**Remaining gaps:**

| Gap | Severity | Location |
|-----|----------|----------|
| No changesets/versioning | **HIGH** | `.changeset/` is empty stub, root version `0.0.0` |
| SPA bundle 523KB, no code splitting | **RESOLVED** | `apps/app` removed — dashboard planned for future cloud tier |
| 52 tools in a single 3768-line handler | **MEDIUM** | `apps/mcp-server/src/mcp/server.ts` |
| 5 stub packages (only README.md) | **MEDIUM** | `packages/{auth,extractors,mcp-kit,observability,ui-contracts}` |
| Rate limiting disabled by default | **MEDIUM** | `.env` → `QUILLBY_ENFORCE_PLAN_LIMITS=false` |
| Auth DB in two locations (root + mcp-server) | **LOW** | `./quillby-auth.db` + `apps/mcp-server/quillby-auth.db` |
| No email provider integration | **MEDIUM** | Password reset, email verification missing |
| Unit test coverage at 45% threshold | **MEDIUM** | `vitest.config.ts` — need >80% for full sign-off |
| No credential management docs | **LOW** | `docs/operations/secrets.md` not yet created |

---

## Production-Ready Definition — v1 Criteria

Quillby is **production ready** when:

1. **Security**: No secrets in git history (gitleaks audit ✅). `.env` in `.gitignore` (confirmed never tracked). `.bak-*` patterns in `.gitignore`. Pre-commit secret scanning active via lefthook + gitleaks. Source maps enabled for debugging. Builds do not leak file paths.

2. **Reliability**: Test suite catches real failures (no `dangerouslyIgnoreUnhandledErrors`). CI runs lint → typecheck → test → build → integration → docker-smoke on every PR and push to main. Coverage thresholds at 45/40/35/45 with path to 80%.

3. **Versioning**: Changesets configured. Every release is versioned, tagged, and has a changelog. Root version is bumped from `0.0.0`.

4. **Observability**: Source maps published. Runtime errors produce stack traces with source references. Crash logs are meaningful.

5. **Maintainability**: Monorepo extraction complete (all 5 stub packages populated or removed). The 3768-line server.ts is decomposed into domain-grouped tool files.

6. **Deployment**: Self-hosted Docker path is smoke-tested in CI. Docker image is published on release.

7. **Operational security**: Rate limiting enforced by default (opt-out for dev). API key rotation documented. Session management hardened.

8. **SPA performance**: Code splitting enabled. Initial JS payload under 150KB.

---

## Phase Plan

### Phase 0 — Security Audit & Hardening (must do before any other work)

**Goal**: Confirm no secrets leaked into git history. Harden `.gitignore` and add automated secret scanning. This is a hard production blocker.

**Confirmed findings**: `.env` is in `.gitignore` and was never tracked by git. `quillby-auth.db` is in `.gitignore`. `quillby-auth.db.bak-*` files (11 on disk) are untracked but NOT covered by `.gitignore` — they could be accidentally committed and contain auth DB data. No history purge is needed.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-001 | Run automated git history scan (Gitleaks or trufflehog) to confirm no secrets were committed | P1 |
| REQ-002 | Add `*.bak-*` patterns to `.gitignore` | P1 |
| REQ-003 | Configure pre-commit hook (lefthook/husky) with Gitleaks for secret scanning | P1 |
| REQ-004 | Review `.bak-*` files on disk — delete or relocate (they contain auth DB with user data) | P1 |
| REQ-005 | Confirm `.env` is properly gitignored and never entered history (already confirmed, document finding) | P1 |
| REQ-006 | Document credential management: where secrets live, how to rotate, how to generate new secrets | P2 |

**Tasks:**
- T-001: Run `gitleaks` or `trufflehog` on full git history to confirm zero secrets committed
- T-002: Add `*.bak-*` and `*.bak-*/*` patterns to `.gitignore`
- T-003: Install and configure pre-commit hook framework (lefthook) with Gitleaks detector
- T-004: Review `.bak-*` files on disk — migrate sensitive data or delete them
- T-005: Document finding in `docs/operations/secrets.md` (`.env` never in git, credential management guide)

---

### Phase 1 — CI & Test Integrity

**Goal**: CI that enforces code quality. Tests that catch real failures. Reliable feedback loop in <5min.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-010 | Add CI workflow that runs lint → typecheck → test → build on push/PR to main | P1 |
| REQ-011 | Remove `dangerouslyIgnoreUnhandledErrors` from vitest config | P1 |
| REQ-012 | Fix all tests that fail when unhandled errors are surfaced | P1 |
| REQ-013 | Enable source maps in tsconfig | P1 |
| REQ-014 | Add integration test workflow that builds and runs integration tests in CI | P1 |
| REQ-015 | Add self-hosted Docker smoke test to CI | P2 |
| REQ-016 | Achieve >80% code coverage on core domain packages | P2 |

**Tasks:**
- T-010: Create `.github/workflows/ci.yml` — lint, typecheck, test (unit), build
- T-011: Remove `dangerouslyIgnoreUnhandledErrors: true` from vitest.config.ts
- T-012: Audit failing tests, fix source-level issues, add proper error handling where tests reveal gaps
- T-013: Set `sourceMap: true` in `apps/mcp-server/tsconfig.json`
- T-014: Create `.github/workflows/integration.yml` — build + integration tests
- T-015: Create `.github/workflows/docker-smoke.yml` — `docker compose up` → healthcheck → teardown
- T-016: Add coverage thresholds to vitest config

---

### Phase 2 — Versioning & Release

**Goal**: Predictable versioned releases with changelogs. Anyone can determine what version is running.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-020 | Configure `@changesets/cli` with proper access and versioning strategy | P1 |
| REQ-021 | Define version policy — semver, pre-1.0 (0.x) until all phases complete, then 1.0 | P1 |
| REQ-022 | Publish npm package with correct release flow | P1 |
| REQ-023 | Add `server_info` tool returning version + mode + DB status | P2 |
| REQ-024 | Add `--version` flag to CLI binary | P2 |

**Tasks:**
- T-020: `pnpm add -w @changesets/cli` + `.changeset/config.json`
- T-021: Set root version to `0.0.0` → prepare initial changeset → `changeset version`
- T-022: Update `.github/workflows/release.yml` to create GitHub release with changelog
- T-023: Implement `server_info` tool in server.ts or extract to new tool module
- T-024: Add `--version` flag to `bin/quillby-mcp`

---

### Phase 3 — Monorepo Extraction

**Goal**: The 5 stub packages are either populated with extracted code or removed. Server.ts is decomposed into domain-grouped files under `src/tools/`.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-030 | Extract auth logic from server.ts into `packages/auth` | P1 |
| REQ-031 | Extract content domain logic into `packages/content` (already has some) | P1 |
| REQ-032 | Extract extractor logic into `packages/extractors` | P1 |
| REQ-033 | Extract MCP handler utilities into `packages/mcp-kit` | P2 |
| REQ-034 | Extract observability/telemetry into `packages/observability` | P2 |
| REQ-035 | Define `packages/ui-contracts` types shared between web/app and MCP API | P2 |
| REQ-036 | Decompose `server.ts` into one file per domain group under `src/mcp/tools/` | P1 |

**Tasks:**
- T-030: Move auth-related adapter code (better-auth, API keys, session middleware) from `server.ts` to `packages/auth/src/`
- T-031: Audit `packages/content` — ensure all content extraction, card, and draft code lives there
- T-032: Move `src/extractors/` to `packages/extractors/src/`
- T-033: Extract shared MCP patterns (structured response, error formatting, logging wrapper) into `packages/mcp-kit`
- T-034: Extract telemetry, logging, slog function into `packages/observability`
- T-035: Define shared types in `packages/ui-contracts` (API response shapes, card/draft/memory DTOs)
- T-036: Split `server.ts` into `src/mcp/tools/workspace.ts`, `src/mcp/tools/content.ts`, `src/mcp/tools/auth.ts`, `src/mcp/tools/billing.ts`, `src/mcp/tools/planning.ts`, `src/mcp/tools/media.ts`

---

### Phase 4 — SPA Code Splitting & Performance

**Goal**: The cloud dashboard loads fast. Initial JS payload is under 150KB. Route-based code splitting is in place.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-040 | Enable Vite manual chunks or route-based lazy loading | P1 |
| REQ-041 | Reduce initial bundle to <150KB JS | P1 |
| REQ-042 | Add bundle analysis to CI | P2 |
| REQ-043 | Add loading states for lazy-loaded routes | P2 |

**Tasks:**
- T-040: (RESOLVED) `apps/app` removed — dashboard deferred to cloud tier
- T-041: Configure `vite.config.ts` `build.rollupOptions.output.manualChunks` for vendor/code splitting
- T-042: Add `vite-plugin-visualizer` or `rollup-plugin-visualizer` for bundle analysis
- T-043: Add `<Suspense>` fallback with skeleton/spinner for each lazy chunk

---

### Phase 5 — Operational Hardening

**Goal**: Self-hosted and cloud modes are operationally credible. Rate limiting works. Error handling is robust.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-050 | Enable rate limiting by default (change default `QUILLBY_ENFORCE_PLAN_LIMITS` to `true`) | P1 |
| REQ-051 | Add proper request validation middleware for HTTP mode | P1 |
| REQ-052 | Add email provider integration for password reset + email verification | P2 |
| REQ-053 | Add session timeout and refresh for hosted modes | P2 |
| REQ-054 | Add structured logging with level configuration | P2 |
| REQ-055 | Add Docker healthcheck endpoint | P2 |
| REQ-056 | Document disaster recovery / backup procedures for self-hosted | P2 |
| REQ-057 | Add `--dry-run` flag to destructive operations | P3 |

**Tasks:**
- T-050: Set `QUILLBY_ENFORCE_PLAN_LIMITS=true` as default, `false` for dev environments
- T-051: Add Zod validation middleware for all HTTP API routes
- T-052: Integrate Resend or SendGrid for transactional email
- T-053: Implement session TTL + refresh token rotation
- T-054: Replace `slog()` with structured logging (pino or native -- with serializers)
- T-055: Add `GET /health` returning `{ status: "ok", version, uptime, db: "connected"|"error" }`
- T-056: Write `docs/operations/disaster-recovery.md`
- T-057: Add `dryRun` parameter to `delete_*` and `clear_*` tools

---

### Phase 6 — Documentation & Release

**Goal**: Every deployment path is documented. Release v1.0 is cut with all criteria met.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-060 | Rewrite docs to match final architecture | P1 |
| REQ-061 | Add deployment matrix by client (Claude Desktop, Claude.ai, Cursor, VS Code, ChatGPT) | P1 |
| REQ-062 | Add self-hosted runbook with backup/upgrade/disaster-recovery | P1 |
| REQ-063 | Cut v1.0.0 release | P1 |
| REQ-064 | Update install scripts to pull latest release binary | P1 |

**Tasks:**
- T-060: Reorganize `docs/` into `docs/architecture/`, `docs/operations/`, `docs/clients/`
- T-061: Document each MCP client's connection method with transport/auth matrix
- T-062: Write `docs/operations/deployment.md`, `docs/operations/backups.md`, `docs/operations/upgrades.md`
- T-063: Run `changeset version` → create v1.0.0 release with changelog
- T-064: Update `install.sh` and `install.ps1` to pin to latest release tag

---

## 8. Product Positioning

### 8.1 Target Customer

| Tier | Customer | Use Case | Fit |
|------|----------|----------|-----|
| **Local (stdio)** | Solo copywriters, freelancers | Daily content briefing + drafting inside Claude Desktop | Strong — fits existing MCP workflow |
| **Self-hosted** | Small content teams, agencies | Shared workspace with editorial workflow, brand management, voice configuration | Good — requires technical setup |
| **Cloud** | Content teams wanting managed SaaS | Same as self-hosted, zero ops overhead | TBD — not built yet |

Explicitly NOT for:
- Enterprise content marketing teams with dedicated CMS platforms (WordPress, Contentful, Sanity) — Quillby is a drafting assistant, not a CMS
- Non-writers (engineers, product managers, executives) — the MCP tool surface assumes content workflow knowledge
- Teams using only ChatGPT/ Gemini (no MCP client support) — requires an MCP-compatible client

### 8.2 Competitive Landscape

| Solution | Approach | MCP-native | Voice cloning | Editorial workflow | Self-hosted |
|----------|----------|------------|---------------|-------------------|-------------|
| Jasper / Copy.ai | Web app | No | No | Yes | No |
| Custom GPTs | One-shot prompt | No | No | No | No |
| Writing raw in Claude | Manual | No | No | No | Yes |
| **Quillby** | **MCP tool** | **Yes** | **Yes (ElevenLabs)** | **Draft → Review → Approve** | **Yes (3 modes)** |

Key differentiators:

- **Lives inside your existing chat client** — not a separate web app, not another tab. Works in Claude Desktop, Cursor, VS Code, any MCP host
- **Voice-optimized content** — ElevenLabs voice cloning for audio content, not just text
- **Workspace-based** — one workspace per project/client/brand, each with its own voice, style rules, and audience profile
- **MCP-first** — the entire product surface is a set of MCP tools, not a traditional SaaS UI

### 8.3 Business Model

| Mode | Pricing | Rationale |
|------|---------|-----------|
| Local (stdio) | Free | Personal use, no infrastructure cost, drives adoption |
| Self-hosted | Free for ≤3 users, paid license above | Mirrors Docker/GitLab model — free for small teams, paid for commercial scale |
| Cloud | SaaS subscription (monthly/yearly) | Managed hosting, zero ops, predictable revenue |

**Key decision:** keep local mode permanently free — it's the adoption driver and marketing channel. Revenue comes from cloud hosting and commercial self-hosted licenses.

### 8.4 Go-to-Market

| Channel | Priority | Approach |
|---------|----------|----------|
| MCP ecosystem | Primary | MCP directory listing, Claude Desktop discoverability, community tutorials |
| Open source community | Primary | GitHub stars, Discord, contributor community |
| Content marketing | Secondary | Blog posts on "setting up an MCP content assistant", comparison guides |
| Paid ads | None | Not a fit for this product category |

**Primary adoption flow:** developer discovers Quillby on MCP directory → installs for personal use (free local mode) → shows to content team → team adopts self-hosted (paid if >3 users)

```
Phase 0 (Security)
   └── Phase 1 (CI & Tests)
         ├── Phase 2 (Versioning)
         │     └── Phase 6 (Release)
         ├── Phase 3 (Monorepo)
         │     └── Phase 5 (Operations)
         └── Phase 4 (SPA)
```

Phases 1, 2, 3, 4 can be worked in parallel after Phase 0 is complete.

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Secrets in git history | ✅ Zero confirmed via gitleaks scan of 76 commits | Zero |
| `.bak-*` in `.gitignore` | ✅ Covered (`*.bak-*`, `*.bak-*/*`) | Covered |
| Pre-commit secret scanning | ✅ Active via lefthook + gitleaks | Active |
| CI workflows | ✅ 3 jobs (ci, integration, docker-smoke) | 3+ |
| Test false negatives | ✅ Zero — `dangerouslyIgnoreUnhandledErrors` removed, 355 tests pass | Zero |
| Source maps | ✅ Enabled (tsconfig + vite) | Enabled |
| Version | `0.0.0` | Semver with changesets |
| Stub packages | 5 (README-only) | 0 (populated or removed) |
| server.ts LOC | 3768 | <1000 per file (decomposed) |
| SPA bundle | 523KB | <150KB initial |
| Rate limiting | Disabled by default | Enabled by default |
| Release | Manual binary builds | Automated changelog + npm + docker |
