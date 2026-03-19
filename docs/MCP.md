# Quillby MCP Setup

How to connect Quillby to your AI client. Quillby runs locally over stdio — no account, no API key, no cloud service required.

## Prerequisites

- [Node.js 20+](https://nodejs.org)
- A built copy of Quillby:

```bash
cd /path/to/quillby
npm install
npm run build
```

`./bin/quillby-mcp` is the canonical entrypoint after building.

## Tools

**For Claude Desktop user setup, see [README.md](../README.md).**

### Onboarding & Profile

| Tool | Parameters | Returns |
|---|---|---|
| `quillby_onboard` | *(MCP Elicitation — no params)* | Inline questions → profile saved |
| `quillby_list_workspaces` | — | Workspace list |
| `quillby_create_workspace` | `name`, `workspaceId?`, `description?`, `makeCurrent?` | Created workspace |
| `quillby_select_workspace` | `workspaceId` | Active workspace |
| `quillby_get_workspace` | `workspaceId?` | Workspace metadata + active state |
| `quillby_set_context` | `context` object (required) | Confirmation |
| `quillby_get_context` | — | Profile JSON |

### Feed Management

| Tool | Parameters | Returns |
|---|---|---|
| `quillby_discover_feeds` | `topics[]` (optional override) | Suggested feed URLs |
| `quillby_add_feeds` | `urls[]` (required) | Added / skipped counts |
| `quillby_list_feeds` | — | Feed URL list |

### Fetch & Research

| Tool | Parameters | Returns |
|---|---|---|
| `quillby_fetch_articles` | `sources[]` (optional), `slim` (bool) | Article array |
| `quillby_read_article` | `url` (required) | Full article text |

### Analysis *(requires MCP Sampling)*

| Tool | Parameters | Returns |
|---|---|---|
| `quillby_daily_brief` | `topN` (number, default 15) | Full brief with scored cards |
| `quillby_analyze_articles` | `sources[]`, `topN` | Cards from full pipeline |

### Cards & Drafts

| Tool | Parameters | Returns |
|---|---|---|
| `quillby_save_cards` | `cards[]` (CardInput array, required) | Save path |
| `quillby_list_cards` | `limit`, `minScore` | Card summaries |
| `quillby_get_card` | `cardId` (number, required) | Full card object |
| `quillby_generate_post` | `cardId`, `platform` | Post text. Requires Sampling. |
| `quillby_save_draft` | `content`, `platform`, `cardId`, `addToVoiceExamples` | Save path |

### Voice Memory

| Tool | Parameters | Returns |
|---|---|---|
| `quillby_remember` | `entries[]`, `memoryType?` | Confirmation |
| `quillby_get_memory` | `memoryType?` | Typed memory |

## Resources

| URI | MIME | Description |
|---|---|---|
| `quillby://workspace/current` | `application/json` | Active workspace metadata |
| `quillby://context` | `application/json` | User content creator profile |
| `quillby://memory` | `application/json` | Typed memory for the active workspace |
| `quillby://harvest/latest` | `application/json` | Cards from the latest session |
| `quillby://feeds` | `text/plain` | Configured RSS feed URLs |

## Prompts

| Prompt | Description |
|---|---|
| `quillby_onboarding` | Guided setup |
| `quillby_workflow` | Full workflow reference with platform guides |
| `quillby_projects_playbook` | Claude Projects playbook |

## Environment

For standard MVP usage, no Quillby API key is required.

## Do I Need To Deploy?

No, for personal/local use you do not deploy anything.

Use local stdio MCP:
- your client starts `node dist/mcp/server.js`
- tools are available locally in your client

You only deploy a remote HTTP MCP server if you need:
- team/shared hosted access
- OpenAI ChatGPT app/deep research remote integration
- centralized auth and policy enforcement

## Example Client Configs

### Claude Code (CLI)

Add Quillby with explicit stdio command:

```bash
claude mcp add --transport stdio --scope project grist -- \
  /path/to/quillby/bin/quillby-mcp
```

Notes:
- `--scope project` writes a team-shareable `.mcp.json` in project root.
- Rebuild with `tsc` after code changes so `dist/mcp/server.js` stays current.

### Claude Desktop

Add to Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "quillby": {
      "type": "stdio",
      "command": "/path/to/quillby/bin/quillby-mcp",
      "args": []
    }
  }
}
```

### VS Code (`.vscode/mcp.json`)

```json
{
  "servers": {
    "quillby": {
      "type": "stdio",
      "command": "${workspaceFolder}/bin/quillby-mcp",
      "args": []
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "quillby": {
      "type": "stdio",
      "command": "${workspaceFolder}/bin/quillby-mcp",
      "args": []
    }
  }
}
```

### OpenAI (remote MCP style)

OpenAI docs emphasize remote MCP for ChatGPT Apps / deep research / API tools:

- host MCP server behind `https://.../mcp`
- use OAuth/authn for enterprise/shared deployments
- register tool server in ChatGPT or pass as `tools: [{ type: "mcp", server_url: ... }]` in API flows

Quillby today is local stdio only. If you want OpenAI-native remote deployment, next step is adding HTTP transport wrapper and auth.

### Gemini and other clients

Gemini tooling emphasizes function/tool use. For MCP-capable clients, use the same stdio config shape above (`type`, `command`, `args`).

### Generic MCP config template

```json
{
  "mcpServers": {
    "quillby": {
      "type": "stdio",
      "command": "/absolute/path/to/quillby/bin/quillby-mcp",
      "args": []
    }
  }
}
```

## Notes

- Quillby suppresses normal CLI stdout while tools execute so MCP JSON-RPC output is not corrupted.
- `quillby_daily_brief` and `quillby_analyze_articles` require MCP Sampling support in the host client (Claude Desktop supports this).
- Saved cards and drafts are written under `~/.quillby/workspaces/<workspace-id>/output/<timestamp>/`.
- Typed memory is written under `~/.quillby/workspaces/<workspace-id>/memory/typed-memory.json`.

## Practical Recommendation

For acceptance and familiarity:

1. Keep local stdio support (already implemented).
2. Use config-file-driven setup (`.mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`) with explicit `command`/`args`.
3. Use repo-local executable wrapper `./bin/quillby-mcp` for consistent client wiring.
4. Add remote HTTP transport + auth only if you want hosted/team-scale connectors.
