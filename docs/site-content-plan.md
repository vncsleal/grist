# Site Content Update Plan (v3)

## Core truth
Quillby is a free, local MCP server for Claude Desktop. It turns busy professionals into AI-assisted content agents. No trial, no signup, no cloud. Install it, it lives inside Claude, and it does: scan → brief → draft in your voice.

Target: marketing professionals, copywriters, freelancers, business owners, niche specialists. Non-technical. Tone: professional, not technical.

## Research findings on media generation

**Claude Desktop does NOT generate images or audio.** Confirmed:
- Claude has no native image/audio/video generation. It can *analyze* images but not produce them.
- MCP Sampling (the protocol feature) defines image/audio content types, but Claude Desktop never implemented actual generation for them.
- MCP Sampling is **deprecated** (SEP-2577, Final status, June 2026). It's being removed from the protocol.

**What Quillby's codebase does have for media generation:**
- 9 provider adapters (OpenAI, ElevenLabs, Replicate, BFL Flux, MiniMax, Veo, Kling, Google AI, fal.ai)
- They require the user to configure their own API keys via environment variables, the MCP `set_provider` tool, or macOS Keychain
- This is a **power-user feature**. Not for the primary target audience.
- The user configures a key, then says "generate an image of..." and Quillby calls that external API.

**Positioning for the site:**
- Media generation is NOT a headline feature. It's an optional power-user capability.
- The core product is: content research → daily brief → drafts in your voice.
- Mention media generation only in FAQ as: "Yes, if you configure an API key for services like OpenAI or ElevenLabs."
- No mention of "9 providers," "MCP Sampling," or "Claude-native generation."

## What's currently true and should stay

| Feature | Status | Site action |
|---|---|---|
| Feed scanning + discovery | Works, core feature | Already prominent |
| Daily brief + content cards | Works, core feature | Already prominent |
| Draft generation in your voice | Works, core feature | Already prominent |
| Voice learning (style memory) | Works | Add to Capabilities Grid |
| Campaigns (multi-stage + blueprints) | Works in local mode | Add as new section |
| Content planning (board, calendar, queue) | Works in local mode | Add as new section |
| Media generation (via external API keys) | Works, power-user only | FAQ only |
| Open source (MIT) | True | Add trust banner |
| Free / local / no account | True | Keep prominent |

## Section map (final)
Hero → Strip → Problem → How It Works (3 steps) → **Capabilities Grid** → **Campaigns & Planning** → Who It's For → **Open Source Trust** (replaces privacy callout) → Install → FAQ (expanded) → Final CTA

## 3 new sections (not 4, not 7)

| Section | Content | Key message |
|---|---|---|
| Capabilities Grid | 5 domains in grid: Monitor, Draft, Plan, Learn, Organize | "Quillby does more than just briefs and drafts." |
| Campaigns & Planning | Campaign system, task board, calendar | "Beyond one-off posts. Plan a whole content series." |
| Open Source Trust | MIT, auditable, runs locally, no data leaves | "Open source. Your machine. Your data." |

**Removed from earlier plan:** Media Gen & Voice (demoted to FAQ only).

## FAQ changes
**Keep:** 1 (coding), 2 (any niche), 3 (multiple clients), 5 (free), 6 (Claude Desktop)
**Update:** 4 (data safety — keep existing, it's accurate for local mode)
**Add:**
- "Can it generate images or audio?" → Yes, if you configure an external API key. FAQ-level only. Explain briefly.
- "Can I plan content ahead of time?" → Campaigns, task board, calendar — all inside Claude.
- "Does it learn my writing style?" → Yes. Saves voice examples per workspace.
- "Is it open source?" → Yes, MIT license. Link to GitHub.

## Copy direction
- Keep current hero: "You read the brief. It writes the post." — still the strongest positioning
- New capabilities are additive: "It also plans campaigns, learns your voice, and keeps your content calendar on schedule."
- Media generation is an FAQ footnote, not a headline.
- No cloud hype, no tech specs, no provider names, no dev-forward language.
- Professional, warm, short sentences. Same tone as current page.

## Implementation phases

| Phase | Duration | What |
|---|---|---|
| P0 Infrastructure | 1 session | Extract components from monolithic index.astro |
| P1 Capabilities | 1 session | Add Capabilities Grid, Campaigns & Planning sections |
| P2 Trust & Polish | 1 session | Open Source trust section, expanded FAQ, responsive check, link audit |

## Files to create
- `src/components/Hero.astro` (extract + minor copy)
- `src/components/HowItWorks.astro` (extract)
- `src/components/Personas.astro` (extract, minor updates)
- `src/components/Install.astro` (extract)
- `src/components/Faq.astro` (extract + expand to 10 items)
- `src/components/CapabilitiesGrid.astro` (new — 5 domains)
- `src/components/CampaignsPlanning.astro` (new)
- `src/components/TrustBanner.astro` (new — replaces old privacy banner)
