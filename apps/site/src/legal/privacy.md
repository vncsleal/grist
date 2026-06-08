---
title: Privacy Policy
updated_at: "2026-06-08"
---

## Our Commitment to Privacy

Quillby is designed to run locally on your machine. We believe privacy is a feature, not an afterthought. This policy explains how your data is handled when you use Quillby, what stays on your machine, and what — if anything — leaves it.

## Data Storage

Quillby stores all your data on your local machine:

- **Workspace data** (feeds, briefs, cards, drafts, memory, voice examples) is stored at `~/.quillby/` on your local filesystem.
- **No cloud storage**. We do not operate servers that receive or store your workspace data. There is no "Quillby cloud" that holds your content.
- **No telemetry**. Quillby does not collect analytics, usage data, crash reports, or any information about how you use the software.
- **No account**. You do not need to create an account, provide an email address, or log in to use Quillby.

## What Leaves Your Machine

Quillby can optionally communicate with external services if you explicitly configure them:

- **Feed fetching**. When you run a daily brief or discover feeds, Quillby fetches content from the RSS feeds, Reddit communities, and websites you have configured. These are standard HTTP requests — no different from opening those pages in a browser.
- **MCP Sampling**. If your AI client supports MCP Sampling, Quillby may delegate text generation requests to your client (e.g., Claude Desktop). This happens within your local environment and is subject to your client's privacy policy.
- **Third-party provider APIs**. If you configure a media generation provider (OpenAI, ElevenLabs, Replicate, BFL Flux, MiniMax, Google AI, fal.ai), your API key is stored in your system keychain or an encrypted file on your machine. Data sent to these providers — prompts, reference images, voice samples — is governed by their respective privacy policies.

## API Key Security

Provider API keys are stored securely:

- **macOS**: Keys are stored in the system Keychain (hardware-backed encryption).
- **Other platforms**: Keys are encrypted at rest using AES-256-GCM with a key derived from a machine-specific secret.
- Keys are never sent to Quillby's servers (we don't have any).
- You can revoke or delete stored keys at any time through the provider settings.

## Children's Privacy

Quillby is not directed at children under 13. We do not knowingly collect any information from children.

## Changes to This Policy

We may update this policy as Quillby evolves. Material changes will be communicated through the software's update notes. Continued use after changes constitutes acceptance of the updated policy.

## Contact

If you have questions about this policy, open an issue on [GitHub](https://github.com/vncsleal/quillby).

---

*Last updated: June 8, 2026*
