# GRIST v0.2.1

Guided Research and Insight Synthesis Tool.

GRIST is a pure MCP data layer. It handles file I/O, RSS fetching, and content persistence. Your host AI client (Claude, Cursor, VS Code Copilot) does all reasoning, scoring, and writing — no extra API key required.

## Quick Start

```bash
npm install
npm run build
```

Register with your MCP client using one of the provided config files (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`), then start with the `grist_onboarding` prompt.

## Tools

| Tool | Description |
|---|---|
| `grist_set_context` | Save the user content creator profile |
| `grist_get_context` | Load the saved profile |
| `grist_discover_feeds` | Discover RSS feeds via Google News + Feedly for user topics |
| `grist_add_feeds` | Add RSS feed URLs (deduplicates automatically) |
| `grist_list_feeds` | List all configured feeds |
| `grist_fetch_articles` | Fetch articles from feeds (`slim=true` for headline index) |
| `grist_read_article` | Fetch full text for a single URL via Readability |
| `grist_analyze_articles` | Full pipeline via MCP Sampling: fetch → score → enrich → cards |
| `grist_save_cards` | Persist analyzed structure cards to disk |
| `grist_list_cards` | List cards (`minScore`, `limit` filters) |
| `grist_get_card` | Get full card details by ID |
| `grist_save_draft` | Save a drafted post to disk |

## Resources

| URI | Description |
|---|---|
| `grist://context` | User content creator profile (JSON) |
| `grist://harvest/latest` | Structure cards from latest session (JSON) |
| `grist://feeds` | Configured RSS feed URLs (plain text) |

## Prompts

- `grist_onboarding` — guided setup to collect user profile
- `grist_workflow` — full workflow reference with voice rules and platform guides

## Configuration

- `config/context.json` — user profile (created via `grist_set_context`)
- `config/rss_sources.txt` — feed list (managed via `grist_add_feeds` / `grist_discover_feeds`)

## MCP Config Files

- `.mcp.json`
- `.cursor/mcp.json`
- `.vscode/mcp.json`

See [docs/MCP.md](docs/MCP.md) for tool contracts and client configuration details.

## Project Layout

```
src/
  mcp/server.ts        # MCP server — tools, resources, prompts
  agents/
    onboard.ts         # Profile load/save, onboarding prompt
    discover.ts        # Feed source management
    harvest.ts         # RSS fetch, pre-scoring
    seeds.ts           # Google News + Feedly feed discovery
    compose.ts         # Platform format guides
  extractors/
    rss.ts             # RSS parsing with type-safe field guards
    content.ts         # Mozilla Readability article extraction
  output/
    structures.ts      # Card/draft persistence, seen-URL dedup
config/
  context.json         # User profile
  rss_sources.txt      # Feed list
bin/
  grist-mcp            # Entry point
```

## Development

```bash
npm run build          # tsc compile
npm run typecheck      # type-check only
npm run mcp:dev        # build + run server
```

## License

MIT
