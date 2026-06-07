---
title: Clientes
description: Configure o Quillby no Claude Desktop, VS Code, Cursor e Claude Code
order: 2
---

## Claude Desktop

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "quillby": {
      "command": "quillby-mcp"
    }
  }
}
```

## VS Code

Create `.vscode/mcp.json` in your project root:
```json
{
  "servers": {
    "quillby": {
      "command": "quillby-mcp"
    }
  }
}
```

## Cursor

Create `.cursor/mcp.json` in your project root:
```json
{
  "mcpServers": {
    "quillby": {
      "command": "quillby-mcp"
    }
  }
}
```

## Claude Code

```bash
claude mcp add --transport stdio --scope project quillby -- quillby-mcp
```
