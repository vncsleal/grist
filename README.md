# Quillby MCP Server

AI copywriting assistant for Claude Desktop. Scans the internet, delivers a daily briefing, and writes drafts in your voice.

[![npm version](https://img.shields.io/npm/v/@quillby/mcp?style=flat-square)](https://www.npmjs.com/package/@quillby/mcp)
[![License](https://img.shields.io/npm/l/@quillby/mcp?style=flat-square)](LICENSE)

---

## Features

- **Daily Briefing** — Scans RSS feeds across your topics, finds relevant articles, and generates ready-to-use content ideas
- **Voice System** — Learns your writing style from examples and editorial rules
- **Multi-Workspace** — Separate workspaces per client, brand, campaign, or Claude Project
- **Content Campaigns** — Plan, draft, and execute multi-post campaigns with dependency graphs
- **Memory** — Persistent editorial memory, style rules, and do-not-say rules
- **Offline-First** — Everything runs locally on your machine. No accounts, no API keys, no cloud dependency

---

## Quickstart

### Prerequisites

- [Claude Desktop](https://claude.ai/download) (free tier works)
- [Node.js 22.12+](https://nodejs.org)

### Install

**macOS** — [Download .pkg installer](https://github.com/vncsleal/quillby/releases/latest/download/quillby-macos.pkg)

**Windows** — [Download .exe installer](https://github.com/vncsleal/quillby/releases/latest/download/quillby-windows.exe)

**Via npx (any platform):**

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

After installing, **fully quit Claude Desktop** (right-click Dock/tray icon → Quit), reopen it, and start a new chat with:

> Set me up with Quillby

Claude will guide you through setting up your profile, topics, and voice.

---

## Usage

### Daily Briefing

> Give me my Quillby daily brief

Claude scans today's articles across your topics and returns ready-to-use content ideas with specific angles and hooks.

### Writing

> Write a LinkedIn post from idea 3

> Draft this as a 150-word newsletter entry

### Voice Training

> Add this post to my Quillby voice examples

> Remember this as a style rule: short paragraphs, no consultant tone

> Remember this as a do-not-say rule: never say "unlock growth"

### Workspaces

> Create a Quillby workspace for my B2B SaaS brand

> Switch Quillby to my newsletter workspace

---

## Client Configuration

<details>
<summary><b>Claude Desktop</b> (<code>claude_desktop_config.json</code>)</summary>

**With installer (recommended):** the installer writes the config automatically.

**Manual npx install:**
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

**Binary install** (after running installer or extracting binary):
```json
{
  "mcpServers": {
    "quillby": {
      "command": "quillby-mcp"
    }
  }
}
```

Config file location:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`
</details>

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

Or install from VS Code: `Ctrl+Shift+P` → "Add MCP Server" → enter `npx -y @quillby/mcp quillby-mcp`
</details>

<details>
<summary><b>Cursor</b> (<code>.cursor/mcp.json</code>)</summary>

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
</details>

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add --transport stdio --scope project quillby -- npx -y @quillby/mcp quillby-mcp
```
</details>

<details>
<summary><b>Windsurf</b> (<code>~/.codeium/windsurf/mcp_config.json</code>)</summary>

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
</details>

---

## How It Works

1. **Workspace** — Each workspace has its own profile (topics, audience, voice examples, memory)
2. **Harvest** — On demand, Quillby fetches recent articles from your configured RSS feeds
3. **Brief** — Claude analyzes the articles against your profile and generates content ideas
4. **Draft** — Each idea can be expanded into a full post in your voice
5. **Campaign** — Multi-post campaigns with dependency graphs and auto-execution

---

## Data Storage

Everything stays on your machine:

```
~/.quillby/
├── workspaces/
│   ├── <workspace-id>/
│   │   ├── memory/
│   │   │   └── typed-memory.json
│   │   ├── output/
│   │   │   └── <timestamp>/
│   │   └── config.json
│   └── ...
└── config.json
```

No data is sent to any external service beyond the AI client you choose (Claude).

---

## For Developers

### Repository Structure

```
apps/
  mcp-server/     # MCP server (published as @quillby/mcp)
  site/            # Astro marketing site
  api/             # REST API (Hono)
packages/
  core/            # Domain logic
  config/          # Configuration
  workspace/       # Workspace management
  storage-fs/      # Filesystem storage adapter
  storage-db/      # Database storage adapter
  providers/       # AI provider adapters
  auth/            # Authentication
  billing/         # Billing
  database/        # Database schema and migrations
  content/         # Content processing
```

### Local Development

```bash
pnpm install
pnpm build
pnpm --filter @quillby/mcp dev
```

### More Docs

- [Full MCP Tool Reference](docs/MCP.md)
- [Architecture & Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)

---

## Self-Hosted

For cross-device or team access:

```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
```

Then point your MCP client to `http://localhost:3000/mcp` with `QUILLBY_DEPLOYMENT_MODE=self-hosted`.

---

## License

MIT
