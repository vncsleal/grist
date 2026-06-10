# GitHub Onboarding

If you just cloned this repository, run:

```bash
<install dependencies with your package manager>
pnpm --filter @quillby/mcp build
./apps/mcp-server/bin/quillby-mcp
```

Create local config files if they do not exist:

- `apps/mcp-server/config/context.md`
- `apps/mcp-server/config/rss_sources.txt`

Then start a conversation with Quillby in your MCP host client. Available tools include `onboard`, `daily_brief`, `discover_feeds`, `save_cards`, `generate_post`, and more — run `list_workspaces` to see the full list.

### Runtime Model

Default MVP mode is host-model-first and keyless:

- Quillby runs deterministic local MCP tools.
- Your MCP host client model (Claude/Cursor/VS Code/OpenAI) performs reasoning and writing.
- No Quillby-specific API key is required for normal operation.
