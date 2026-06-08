---
title: Installation
description: Install Quillby on macOS, Windows, or Linux
order: 1
---

Quillby runs on your machine and connects to Claude Desktop with one click. Choose your platform below.

## macOS

### Drag-and-drop (recommended)

[Download the .dmg](https://github.com/vncsleal/quillby/releases/latest/download/quillby-macos.dmg), open it, and drag Quillby to your Applications folder. Double-click Quillby once — it sets everything up automatically.

Also available as a [.pkg installer](https://github.com/vncsleal/quillby/releases/latest/download/quillby-macos.pkg) if you prefer the classic package format.

### One-liner script

Open Terminal and paste:

```bash
curl -fsSL https://raw.githubusercontent.com/vncsleal/quillby/main/install.sh | bash
```

The script detects whether you have Apple Silicon or Intel, downloads the right binary, and wires Quillby into Claude Desktop.

## Windows

### Installer (recommended)

[Download the .exe installer](https://github.com/vncsleal/quillby/releases/latest/download/quillby-windows.exe) and run it. The installer sets up Quillby, registers it in Add/Remove Programs, and connects it to Claude Desktop — no manual steps required.

### One-liner script

Open PowerShell and paste:

```powershell
irm https://raw.githubusercontent.com/vncsleal/quillby/main/install.ps1 | iex
```

## Linux

Claude Desktop is not available on Linux, but you can use Quillby with any MCP-compatible client like Cursor, VS Code, or Claude Code:

```bash
npx -y @vncsleal/quillby quillby-mcp
```

## Any platform (npm)

If you have Node.js installed, you can install Quillby as a global package:

```bash
npm install -g @vncsleal/quillby
```

Then add it to your AI client's configuration:

```json
{
  "mcpServers": {
    "quillby": {
      "command": "quillby-mcp"
    }
  }
}
```

## Next steps

Once installed:

1. **Fully quit Claude Desktop** (right-click the icon → Quit)
2. **Open Claude Desktop again**
3. In a new chat, say: `Set me up with Quillby`

Claude will ask a few questions about your work and who you write for. Answer naturally — that teaches Quillby your voice. You'll have your first brief in under five minutes.
