---
title: FAQ
description: Frequently asked questions about Quillby
order: 4
---

## General

<details class="faq-q">
<summary>Do I need to know how to code?</summary>
No. If you can hold a conversation with Claude, you can use Quillby. Everything happens through natural language — you ask, it does.
</details>

<details class="faq-q">
<summary>Does it work for any niche?</summary>
Yes. Tech, marketing, law, finance, health, education, real estate, fashion — any field with content online. You tell Quillby your topics once, and it adapts from there.
</details>

<details class="faq-q">
<summary>Is it free?</summary>
Yes. Local mode is completely free and always will be. It runs on your machine with no account, no subscription, and no paid features. A cloud mode with team workspaces and a web dashboard is in development.
</details>

<details class="faq-q">
<summary>Is Quillby open source?</summary>
Yes. MIT licensed. The full source code is on [GitHub](https://github.com/vncsleal/quillby). Anyone can inspect it, modify it, or contribute.
</details>

<details class="faq-q">
<summary>How is this different from using Claude alone?</summary>
Claude is a conversation partner. Quillby is a content agent that lives inside Claude. Instead of starting from scratch every time, Quillby:

- Reads your sources every day and surfaces what's relevant
- Writes in your established voice, not generic AI tone
- Remembers your style per workspace (client, brand, newsletter)
- Plans campaigns and tracks your content calendar
</details>

## Setup

<details class="faq-q">
<summary>What do I need to use Quillby?</summary>
You need [Claude Desktop](https://claude.ai/download) (free). The macOS and Windows installers include everything else. For the npx install method, you'll also need [Node.js 20+](https://nodejs.org).
</details>

<details class="faq-q">
<summary>Do I need Claude Desktop?</summary>
Yes. Quillby connects to Claude Desktop and gives it new abilities — scanning feeds, drafting posts, planning campaigns — all inside the chat you already use.
</details>

<details class="faq-q">
<summary>How long does setup take?</summary>
About three minutes. Download the installer, restart Claude, and answer two questions about your work. That's the entire setup.
</details>

## Daily Use

<details class="faq-q">
<summary>Can I use it for multiple clients?</summary>
Yes. Each client gets their own workspace with separate memory, sources, voice profile, and drafts. Nothing mixes between workspaces.
</details>

<details class="faq-q">
<summary>Does it learn my writing style?</summary>
Yes. Every draft you save becomes a voice example. Over time Quillby adapts to your tone, vocabulary, and rhythm. Different workspaces can have completely different voices.
</details>

<details class="faq-q">
<summary>Can I plan content ahead of time?</summary>
Yes. Quillby has a campaign system for multi-stage content series, a task board to track progress, and a calendar to see what's publishing when — all inside Claude.
</details>

<details class="faq-q">
<summary>Can it generate images or audio?</summary>
Quillby can generate images and audio if you connect a supported service like OpenAI or ElevenLabs. This is optional — the core brief-to-draft workflow needs nothing else to configure.
</details>

## Privacy

<details class="faq-q">
<summary>Is my data safe?</summary>
Everything runs on your machine. Nothing leaves it unless you explicitly connect a third-party service. The code is open source and auditable.
</details>

<details class="faq-q">
<summary>Does Quillby collect usage data?</summary>
No. Quillby does not collect analytics, crash reports, telemetry, or any information about how you use it.
</details>

<details class="faq-q">
<summary>Where is my data stored?</summary>
All your workspace data lives at `~/.quillby/` on your local filesystem. You can back it up by copying that folder, sync it with Dropbox, or open it in any text editor.
</details>
