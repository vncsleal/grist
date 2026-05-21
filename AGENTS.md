# AGENTS.md — Quillby Monorepo

> **Global rules apply:** `~/.config/opencode/AGENTS.md` — hardening principles (strong typing, no workarounds, no bypasses, fail loud, no fallback chains) and architecture mandate (hexagonal / ports-and-adapters, domain-grouped packages).

Quillby is an MCP-based AI content assistant for daily briefings. Workspace-based: one workspace per project/client/brand.

## Architecture

**Monorepo**: pnpm workspaces + Turbo
- `apps/`: mcp-server (main), web (Astro), app (React/Vite)
- `packages/`: core, database, auth, billing, storage-*, providers, workspace, etc.

**Entrypoints**
- MCP server: `apps/mcp-server/src/mcp/server.ts` → built to `dist/mcp/server.js`
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
pnpm mcp:http:dev         # HTTP mode dev
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
- **Integration**: `pnpm run build && vitest run tests/integration`
- **All**: `pnpm run build && vitest run`

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

- **local** (default stdio): Personal use, no auth, filesystem storage
- **self-hosted** (HTTP): Your own infra, DB-backed, API key auth
- **cloud**: Managed SaaS with billing

Self-hosted quick start:
```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
# Server at http://localhost:3000/mcp
```

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

**VS Code**: `.vscode/mcp.json` with `${workspaceFolder}/apps/mcp-server/bin/quillby-mcp`

**Cursor**: `.cursor/mcp.json` same pattern

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
2. **Binary changes need rebuild** — Clients use `bin/quillby-mcp` which runs `dist/mcp/server.js`
3. **MCP sampling required** — `quillby_daily_brief` and `quillby_analyze_articles` need client support
4. **HTTP mode needs `BETTER_AUTH_SECRET`** — Generate with `openssl rand -base64 32`
5. **Vitest false positives** — `dangerouslyIgnoreUnhandledErrors: true` set due to sourcemap issues

## File Locations

- Data: `~/.quillby/workspaces/<id>/`
- Output: `~/.quillby/workspaces/<id>/output/<timestamp>/`
- Memory: `~/.quillby/workspaces/<id>/memory/typed-memory.json`
- Local auth DB: `./quillby-auth.db` (file-based libSQL)

## Documentation

- `README.md`: User-facing setup and usage
- `docs/MCP.md`: Full MCP protocol, tools, environment reference
- `docs/ROADMAP.md`: Implementation roadmap
- `CONTRIBUTING.md`: PR guidelines (references GRIST — old name, same process)
