# @quillby/mcp

AI copywriting assistant MCP server. Scans the internet, delivers a daily briefing, and writes drafts in your voice.

[![npm version](https://img.shields.io/npm/v/@quillby/mcp?style=flat-square)](https://www.npmjs.com/package/@quillby/mcp)
[![License](https://img.shields.io/npm/l/@quillby/mcp?style=flat-square)](LICENSE)

## Quick Start

### Prerequisites

- [Claude Desktop](https://claude.ai/download) (free)
- [Node.js 22.12+](https://nodejs.org)

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "quillby": {
      "command": "npx",
      "args": ["-y", "@quillby/mcp", "quillby-mcp"]
    }
  }
}
```

Config locations:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Fully quit Claude Desktop** (right-click Dock/tray → Quit), reopen, and chat:

> Set me up with Quillby

### Binary Installers

Non-technical users can download installers from the [GitHub releases page](https://github.com/vncsleal/quillby/releases):

- **macOS:** `.pkg` installer (double-click)
- **Windows:** `.exe` installer (Next → Next → Finish)

## Features

- **Daily Briefing** — RSS feeds → relevant articles → content ideas in your voice
- **Voice System** — Learns your style from examples and editorial rules
- **Multi-Workspace** — Separate workspaces per client, brand, or campaign
- **Memory** — Persistent editorial rules, style guides, do-not-say rules
- **Local-First** — Everything runs on your machine. No accounts, no API keys

## Usage

| Prompt | Action |
|--------|--------|
| "Give me my Quillby daily brief" | Scan feeds, generate content ideas |
| "Write a LinkedIn post from idea 3" | Draft a post in your voice |
| "Add this post to my voice examples" | Train Quillby's voice model |
| "Remember: short paragraphs, no consultant tone" | Set a style rule |
| "Create a workspace for my B2B brand" | New workspace |

## Client Configuration

<details>
<summary><b>VS Code</b> (<code>.vscode/mcp.json</code>)</summary>

```json
{
  "servers": {
    "quillby": {
      "command": "npx",
      "args": ["-y", "@quillby/mcp", "quillby-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add --transport stdio --scope project quillby -- npx -y @quillby/mcp quillby-mcp
```
</details>

## Data

All data stored locally: `~/.quillby/workspaces/<id>/`

## License

MIT
