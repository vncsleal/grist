---
title: Privacy Policy
updated: "Last updated: June 8, 2026"
---

## Our Commitment to Privacy

Quillby is designed to run locally on your machine. We believe privacy is a feature, not an afterthought. This policy explains how your data is handled when you use Quillby, what stays on your machine, and what — if anything — leaves it. It complies with the **Lei Geral de Proteção de Dados (LGPD — Law 13.709/2018)** and reflects our commitment to data protection by design.

## Data Controller

The data controller — the entity responsible for deciding how your personal data is processed — is the Quillby project maintainer:

- **Project:** Quillby (open-source MCP server)
- **Maintainer:** Vncsleal
- **Contact:** Open an issue on [GitHub](https://github.com/vncsleal/quillby)

## Data We Collect

**Quillby does not collect any personal data.** It is a local-first application. All data you create or configure stays on your machine:

- **Workspace data** (feeds, briefs, cards, drafts, memory, voice examples) is stored at `~/.quillby/` on your local filesystem.
- **Audit log.** Quillby maintains a local audit log at `~/.quillby/audit.log` that records operations performed (e.g., feed fetches, brief generation, provider calls). This log stays on your machine and is never transmitted.
- **No cloud storage.** We do not operate servers that receive or store your workspace data.
- **No telemetry.** Quillby does not collect analytics, usage data, crash reports, or any information about how you use the software.
- **No account.** You do not need to create an account, provide an email address, or log in to use Quillby.

## Legal Basis for Processing (LGPD Art. 7 and 10)

Since Quillby processes no personal data on our servers, the legal basis for the software’s local operation is **legitimate interest** (Art. 7, IX — LGPD): the processing is performed exclusively on your own device, under your control, and is necessary for the software to function as intended.

If you voluntarily configure a third-party provider (AI, media generation, etc.), the legal basis shifts to **your consent** (Art. 7, I — LGPD), which you give by actively entering your API key and configuring the integration. You may revoke this consent at any time by removing the provider configuration.

## What Leaves Your Machine

Quillby can optionally communicate with external services if you explicitly configure them:

- **Feed fetching.** When you run a daily brief or discover feeds, Quillby fetches content from the RSS feeds, Reddit communities, and websites you have configured — standard HTTP requests no different from opening those pages in a browser.
- **MCP Sampling.** If your AI client supports MCP Sampling, Quillby may delegate text generation to your client (e.g., AI client). This stays within your local environment and is subject to your client’s privacy policy.
- **Third-party provider APIs.** If you configure a media generation provider (OpenAI, ElevenLabs, Replicate, etc.), your API key is stored in your system keychain or encrypted file. Data sent to these providers is governed by their respective privacy policies.

## International Data Transfers (LGPD Art. 33)

Quillby itself does not transfer your data internationally — it runs entirely on your machine. However, if you configure a third-party provider headquartered outside Brazil (e.g., OpenAI in the US), data sent to that provider may be transferred internationally. Such transfers are based on your explicit consent (Art. 33, I — LGPD) and are subject to the provider’s privacy policy and data processing agreements.

## API Key Security

Provider API keys are stored securely on your machine:

- **macOS:** Keys are stored in the system Keychain (hardware-backed encryption).
- **Other platforms:** Keys are encrypted at rest using AES-256-GCM with a key derived from a machine-specific secret.
- Keys are never sent to Quillby’s servers (we don’t have any).
- You can revoke or delete stored keys at any time through the provider settings.

## Data Retention

Since all data is stored locally on your machine, retention is entirely under your control:

- **Workspace data** is retained until you delete it or uninstall the software. No data is retained on our side because none is collected.
- **API keys** can be revoked or deleted at any time through provider settings or your system keychain.
- **Audit log** is retained locally at `~/.quillby/audit.log` until you delete or rotate it. It does not contain personal data.
- **Cache and temp files** generated during operation can be safely deleted at any time.

## Your Rights Under LGPD (Art. 18)

As a data subject in Brazil, you have the following rights regarding your personal data. Since Quillby does not collect or store personal data on our servers, exercising these rights is straightforward:

- **Confirmation and access:** You can inspect all data stored locally at `~/.quillby/`.
- **Correction:** You can edit or update any local data directly.
- **Anonymization, blocking, or deletion:** You can delete any local file or uninstall the software entirely.
- **Data portability:** All data is stored in standard formats (JSON, Markdown) and can be copied freely.
- **Information about sharing:** This policy discloses all third-party integrations (see “What Leaves Your Machine”).
- **Revocation of consent:** You may revoke consent for third-party processing at any time by removing provider configurations.

To exercise any of these rights, simply manage the data directly on your machine, or open an issue on [GitHub](https://github.com/vncsleal/quillby) for assistance. Under LGPD Art. 19, requests will be responded to within **15 days** from receipt.

## Children’s Privacy

Quillby is not directed at children under 13. We do not knowingly collect any information from children.

## Encarregado (Data Protection Officer — LGPD Art. 41)

For privacy-related inquiries, complaints, or to exercise your LGPD rights, contact the project maintainer, who serves as the data protection contact:

- **Contact method:** Open an issue on [GitHub](https://github.com/vncsleal/quillby)
- **Response time:** Up to 15 days as per LGPD Art. 19

For prompt assistance, include “Privacy” in the issue title.

## Cookies

Quillby’s marketing website sets two functional cookies:

- **`quillby-lang`** — remembers your language preference (30-day expiry).
- **`quillby-cookie-dismissed`** — remembers that you dismissed the cookie notice (1-year expiry).

Neither cookie contains personal data. No tracking, analytics, or advertising cookies are used.

## Changes to This Policy

We may update this policy as Quillby evolves. Material changes will be communicated through the software’s update notes. Continued use after changes constitutes acceptance of the updated policy.

## Governing Law

This Privacy Policy is governed by the laws of the Federative Republic of Brazil, specifically the Lei Geral de Proteção de Dados (LGPD — Law 13.709/2018).
