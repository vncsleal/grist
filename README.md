# Quillby

Quillby gives Claude a daily content briefing. It scans articles across your topics, finds what's relevant to your audience, and helps you write posts that sound like you — not generic AI.

No extra accounts. No API keys. Everything runs on your computer, inside Claude.

---

## What you need

- **[Claude Desktop](https://claude.ai/download)** — the free desktop app from Anthropic (free tier works)
- **[Node.js](https://nodejs.org)** — a free one-time install (click the large **LTS** button on their site)

---

## Installation

This is a one-time setup. It takes about 10 minutes.

### 1. Download Quillby

At the top of this page, click **Code → Download ZIP**. Unzip it. Move the `grist` folder somewhere you'll remember — your **Documents** folder works well.

### 2. Open a terminal

**Mac:** Press `Cmd + Space`, type `Terminal`, press Enter.

**Windows:** Press `Win + R`, type `cmd`, press Enter.

### 3. Go to the quillby folder

Type `cd ` (with a space after it), then drag the `grist` folder from Finder (Mac) or File Explorer (Windows) directly into the terminal window. Press Enter.

### 4. Run the setup commands

Copy and paste each line and press Enter after each one. Wait for the cursor to stop blinking before running the next.

```
npm install
```

*Downloads what Quillby needs to run. Takes about a minute.*

```
npm run build
```

*Compiles Quillby. Done in a few seconds.*

### 5. Find your Quillby path

Still in the terminal, run this:

**Mac:**
```
echo "$PWD/bin/quillby-mcp"
```

**Windows:**
```
echo %CD%\bin\quillby-mcp
```

It will print a path like `/Users/yourname/Documents/quillby/bin/quillby-mcp`. **Copy the entire line.**

### 6. Connect Quillby to Claude Desktop

Open Claude Desktop. Go to **Settings → Developer → Edit Config**.

This opens a file. Replace everything in it with the text below, swapping in the path you just copied:

```json
{
  "mcpServers": {
    "quillby": {
      "command": "/Users/yourname/Documents/quillby/bin/quillby-mcp"
    }
  }
}
```

Save the file. Then **fully quit Claude Desktop** — right-click the icon in the Dock (Mac) or taskbar (Windows) and choose Quit — then reopen it.

> **Already have other tools?** If the config file has content already, don't replace everything. Add the `"quillby": { ... }` block inside the existing `"mcpServers"` section.

### 7. Tell Quillby about yourself

In a new Claude conversation, type exactly:

> Run the quillby_onboarding prompt

Claude will ask a few questions about your work, your audience, and what you publish. Answer naturally — that's how Quillby learns your voice.

---

## Every day

Once set up, just talk to Claude like normal.

**Get today's content ideas:**

> "Give me my Quillby daily brief"

Claude scans today's articles across your topics, picks the most relevant ones for your audience, and gives you a set of ready-to-use ideas — each with a specific angle and hook.

**Write a post from any idea:**

> "Write a LinkedIn post from idea 3"

Claude writes it in your voice, based on your profile.

**Save it:**

> "Save this draft"

Quillby stores it in the `output/` folder inside your grist directory.

---

## Teaching Quillby your voice

The more examples Quillby has, the more accurately it writes like you.

When Claude writes a post you're happy with, say:

> "Add this post to my Quillby voice examples"

Quillby saves it. Every future post draws on those examples.

To check what Quillby knows about your style:

> "Show me my Quillby voice memory"

---

## Tips

**Updating your focus:**
> "Update my Quillby profile — I'm focusing on [topic] now"

**Adding sources:**
> "Find good news sources for my Quillby topics and add them"

**Being specific gets better results.** "Write a 150-word conversational LinkedIn post from idea 2" works much better than "write a post."

**Your content stays on your computer.** Your profile, voice examples, drafts, and content ideas are saved locally in your `grist/` folder. Nothing is sent to any external service.

---

## Troubleshooting

**Quillby doesn't appear in Claude** — Make sure you fully quit and reopened Claude Desktop after saving the config. Check the path in the config matches exactly what the terminal printed (no extra spaces or missing characters).

**"No context saved" error** — Run the onboarding first: *"Run the quillby_onboarding prompt"*

**"No feeds configured" error** — Ask Claude to find sources: *"Find RSS feeds for my topics and add them to Quillby"*

---

## For developers

HTTP transport, environment variables, scheduled harvest, the full tool reference, and integration configs for VS Code and Cursor: see [docs/MCP.md](docs/MCP.md).

---

## License

MIT
