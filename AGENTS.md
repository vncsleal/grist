# AGENTS.md — Quillby Monorepo

> **Global rules apply:** `~/.config/opencode/AGENTS.md` — hardening principles (strong typing, no workarounds, no bypasses, fail loud, no fallback chains) and architecture mandate (hexagonal / ports-and-adapters, domain-grouped packages).

Quillby is an MCP-based AI content assistant for daily briefings. Workspace-based: one workspace per project/client/brand.

## Architecture

**Monorepo**: pnpm workspaces + Turbo
- `apps/mcp-server`: Main MCP server (published as `@vncsleal/quillby`)
- `apps/site`: Astro marketing site (Vercel-deployed)
- `apps/api`: REST API server (Hono)
- `packages/`: core, database, auth, billing, storage-*, providers, workspace, etc.

**Core → Shell rule**: The shell imports the core. Core never imports shell. Framework types are shell types. Domain types are core types. Map at the boundary.

**Entrypoints**
- MCP server: `apps/mcp-server/src/main.ts` → dispatches to mode-specific entrypoint
- Local mode: `apps/mcp-server/src/main-local.ts` — stdio + filesystem storage, no auth
- Cloud mode: `apps/mcp-server/src/main-cloud.ts` — HTTP + DB storage + auth (future)
- Self-hosted mode: `apps/mcp-server/src/main-selfhosted.ts` — HTTP + DB storage + auth (future)
- Binary wrapper: `apps/mcp-server/bin/quillby-mcp` (used by clients)
- Core lib: `packages/core/src/index.ts`

## Development Commands

**Root-level (run from repo root)**
```bash
pnpm install          # Install deps
pnpm build            # Turbo build all packages (respects dependency graph)
pnpm dev              # Turbo dev mode (parallel, persistent)
pnpm lint             # Lint all packages
pnpm typecheck        # TypeScript check all
pnpm test             # Run all tests
pnpm clean            # Clean all build artifacts
```

**Single package**
```bash
pnpm --filter @vncsleal/quillby build
pnpm --filter @vncsleal/quillby test
pnpm --filter @vncsleal/quillby test:unit        # Unit only
pnpm --filter @vncsleal/quillby test:integration # Requires build first
```

**MCP server specific**
```bash
cd apps/mcp-server
pnpm mcp:dev              # Dev mode with tsx
pnpm build:binaries       # Bun compile for all platforms

# Database (Drizzle)
pnpm db:push              # Push schema
pnpm db:generate          # Generate migrations
pnpm db:migrate           # Run migrations

# Utilities
pnpm keys                 # Manage API keys (hosted mode)
pnpm migrate              # Migrate local to hosted
```

## Build Order

Turbo handles this, but manually: `core` → `config` → `workspace` → `database` → `billing` → `storage-*` → `providers` → `mcp-server`

## Testing

- **Unit**: `vitest run tests/unit` — fast, no build required
- **Integration**: `pnpm run build && vitest run tests/integration/mcp-protocol.test.ts tests/integration/mcp-v2-smoke.test.ts`
- **All**: `pnpm run test:unit && pnpm run test:integration`

Test config in `apps/mcp-server/vitest.config.ts`. Uses Node environment.

## Key Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `QUILLBY_HOME` | `~/.quillby` | Data directory |
| `QUILLBY_TRANSPORT` | `stdio` | `stdio` (local) or `http` (hosted) |
| `QUILLBY_DEPLOYMENT_MODE` | `local`/`self-hosted` | `local`, `self-hosted`, `cloud` |
| `QUILLBY_AUTH_DB_URL` | `file:./quillby-auth.db` | libSQL connection |
| `BETTER_AUTH_SECRET` | - | Required for HTTP mode |
| `PORT` | `3000` | HTTP server port |

Copy `.env.example` to `.env` and fill in.

## Deployment Modes

- **local** (default stdio, implemented): Personal use, no auth, filesystem storage
- **self-hosted** (HTTP, planned): Your own infra, DB-backed, API key auth
- **cloud** (planned): Managed SaaS with billing

## MCP Client Config

**Claude Desktop** (stdio):
```json
{
  "mcpServers": {
    "quillby": {
      "command": "/path/to/quillby/apps/mcp-server/bin/quillby-mcp"
    }
  }
}
```

**Claude Code**:
```bash
claude mcp add --transport stdio --scope project quillby -- \
  /path/to/quillby/apps/mcp-server/bin/quillby-mcp
```

**All MCP-compatible editors**: The root `.mcp.json` is auto-detected by VS Code, Cursor, Windsurf, and other MCP-aware IDEs.

## CI/CD

GitHub Actions builds release binaries on version tags (`v*`):
- macOS: Universal binary + `.pkg` installer
- Windows: `.exe` installer via NSIS
- Linux: Raw binary

Uses Bun for cross-compilation (`bun build --compile`).

## Repo Conventions

- **Node**: >=22.12.0 required
- **Package manager**: pnpm 10.7.1 (specified in `packageManager`)
- **TypeScript**: ESM only (`"type": "module"`)
- **Lint**: ESLint flat config (`eslint.config.mjs`)
- **DB**: Drizzle ORM + libSQL (local) or Turso (remote)

## Gotchas

1. **Must build before integration tests** — Integration tests use compiled JS
2. **Binary changes need rebuild** — Clients use `bin/quillby-mcp` which runs `dist/local/main.js`
3. **MCP sampling required** — `daily_brief` and `analyze_articles` need client support
4. **HTTP mode needs `BETTER_AUTH_SECRET`** — Generate with `openssl rand -base64 32`

## File Locations

- Data: `~/.quillby/workspaces/<id>/`
- Output: `~/.quillby/workspaces/<id>/output/<timestamp>/`
- Memory: `~/.quillby/workspaces/<id>/memory/typed-memory.json`
- Local auth DB: `./quillby-auth.db` (file-based libSQL)

## Documentation

- `README.md`: User-facing setup and usage
- `docs/MCP.md`: Full MCP protocol, tools, environment reference
- `docs/ROADMAP.md`: Implementation roadmap
- `CONTRIBUTING.md`: PR guidelines
