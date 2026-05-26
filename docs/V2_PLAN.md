# Quillby V2 Plan (Strict Scope)

## 1. Product Definition

Quillby is an AI agent for:
- copywriters
- marketing professionals
- business owners
- content creators

Quillby core value:
- fetch content from the internet
- filter by workspace interests
- curate relevant cards
- generate brand-consistent outputs per workspace

Workspace consistency dimensions:
- branding
- writing style
- voice profile
- visual appearance

## 2. Distribution Models (Source of Truth)

### Local
- Connected to the user's preferred AI through MCP.
- Typical host: Claude Desktop.
- User gets Quillby workflow plus host AI capabilities.
- V1 baseline: text generation is available.
- V2 additive: image/audio/video generation can use MCP-supported paths where available.
- No provider setup should be required by default in Local onboarding.

### Self-Hosted
- Teams/agencies host their own Quillby server.
- They control their own cloud, data, and provider keys (BYOK).
- They manage memories, drafts, cards, and assets in their own environment.
- V2 additive: multimodal generation (image/audio/video) using their provider keys and workspace references.
- Onboarding should ask whether to configure provider keys now or later (default later).

### Cloud
- Managed hosted Quillby.
- Accessible from anywhere.
- Uses Quillby-managed providers.
- V2 additive: multimodal generation (image/audio/video) without requiring user-managed provider keys.
- Onboarding should state that generation is managed and ready without key setup.

## 3. V1 vs V2 Boundary (Strict)

### V1 (already established)
- Infrastructure and workflow up to text generation.
- MCP-connected text generation (commonly with Claude Desktop in local mode).
- Workspace-memory-driven copy drafting.

### V2 (additive only)
V2 must not rewrite V1. It must add multimodal generation on top of V1:
- image generation
- audio generation
- video generation

Generation inputs in V2 include user reference assets such as:
- self portraits
- brand logos
- professional voice samples
- narrator voice samples

## 4. Output Types

V2 must support these output classes:
- Text: LinkedIn posts, blog posts, newsletters, etc.
- Audio: podcast teasers, voiceovers, narrated snippets, etc.
- Images: Instagram, LinkedIn, and other social visuals.
- Video: YouTube Shorts, TikTok, Instagram Reels.

All outputs must be workspace-conditioned by the saved brand/style/voice/appearance profile.

## 5. Non-Negotiable Rules

1. V2 is additive to V1.
2. Keep the three distribution models and their responsibilities exactly as defined in this document.
3. Do not force API key setup for cloud users.
4. Preserve BYOK control for self-hosted users.
5. Keep local mode MCP-first.
6. Keep source-fetch -> filtering -> card curation -> generation as the core pipeline.
7. Avoid scope drift into unrelated platform or provider complexity unless required to deliver this plan.
8. Keep tool surface lean: prefer fewer, broader tools over many narrow tools.
9. Do not create separate tools when a parameterized existing tool can handle the flow.

## 6. Tooling Principle (Lean by Default)

The tool layer must be concise and generalist.

Rules:
- avoid proliferating specialized tools
- prefer one generalized generation tool path per capability domain
- use parameters to express intent (modality, clone options, references, platform)
- keep specialized tools only for high-risk or irreversible actions
- optimize for correct tool selection by the model, not tool count

Practical implication:
- no "200 tools" pattern
- merge overlapping clone/media behaviors into existing generation and workspace tools where possible
- maintain clear naming and schema consistency so model routing is predictable

## 7. V2 Functional Requirements

### A. Content Intake and Curation
- ingest external sources
- rank and filter by workspace interests
- produce relevant cards for downstream generation

### B. Workspace Memory and Identity Conditioning
- store and retrieve text style memory
- store and retrieve visual brand/appearance cues
- store and retrieve voice cues
- allow reference assets for image/audio/video conditioning

### C. Generation Layer
- generate text from cards and workspace memory
- generate image from cards and workspace memory + visual references
- generate audio from text/cards and workspace memory + voice references
- generate video from cards/scripts and workspace memory + appearance/voice references

### D. Distribution Mode Behavior
- Local: MCP-connected behavior remains primary
- Self-Hosted: BYOK generation paths must work
- Cloud: managed generation paths must work

## 7.1 Source Strategy Upgrade (Multimodal + Auth Connectors)

Current source mix (RSS + Reddit) is useful but no longer sufficient for high-quality
text/audio/image/video outputs at scale.

### Source objectives
- raise signal quality for trend detection
- improve modality coverage (text/audio/image/video)
- reduce fragility from single-source dependence
- support both low-friction public sources and deeper authenticated sources

### Recommended source tiers

#### Tier 1 (implement now: high ROI, low friction)
- Keep and expand existing RSS stack:
   - Google News RSS (already implemented)
   - Medium tags (already implemented)
   - Feedly-discovered publisher feeds (already implemented)
   - Reddit communities (already implemented)
- Add YouTube public discovery:
   - Channel and topic trend signals via YouTube Data API
   - Works with server credentials for public discovery use cases
   - Use for video hooks, title patterns, and thumbnail/topic trend extraction
- Add stock inspiration sources for visual planning:
   - Unsplash API (API key; public search, curated topics)
   - Pexels API (API key; photo + video libraries)
   - Use only for moodboard/reference discovery, not for direct content cloning

#### Tier 2 (implement next: authenticated creator context)
- Add "Login with Google" connector:
   - OAuth2 flow for YouTube channel-aware context (creator-owned signals)
   - Use when user explicitly wants channel-conditioned planning
- Add "Login with Reddit" connector:
   - OAuth2 flow for personalized subreddit/user context
   - Optional upgrade over public subreddit fetches
- Add "Login with Spotify" connector:
   - OAuth2 for creator podcast/music context where needed
   - For public catalog-only use cases, allow server-to-server token flow

#### Tier 3 (enterprise/review-gated connectors)
- Instagram Graph API (Business/Creator accounts only; app review and scope controls)
- TikTok Login + Posting APIs (for posting workflows)
- X API (pay-per-usage, credit-based)
- TikTok Research API only for approved academic/nonprofit research contexts

### Explicit recommendation for Quillby

1. Do not make Instagram/TikTok/X required for V2 baseline.
2. Ship a robust Tier 1 multi-source engine first.
3. Add OAuth connectors as optional upgrades with clear UX: "connect account for deeper personalization".
4. Keep all source connectors pluggable so cloud/self-hosted/local can enable different sets safely.

### Source-to-modality mapping

- Text outputs:
   - RSS publishers + Reddit + YouTube metadata trends
- Audio outputs:
   - RSS + podcast/creator channel signals (Spotify/YouTube where connected)
- Image outputs:
   - Trend context from text sources + Unsplash/Pexels mood references
- Video outputs:
   - YouTube trend structures + Pexels reference motion libraries + connected social signals when authorized

### Connector auth model (required for implementation)

Every source connector must declare one auth mode:
- `public` (no key, e.g. RSS)
- `api_key` (server-side key, e.g. Unsplash/Pexels)
- `oauth2` (user-granted account access, e.g. Google/Instagram/TikTok/Reddit)

Each workspace may enable connectors independently. Source credentials and tokens must be stored encrypted, and connector availability must be mode-aware:
- Local: default to public + optional user-approved OAuth
- Self-Hosted: full BYOK and custom connector enablement
- Cloud: managed connectors, with user OAuth where account-scoped access is needed

### Acceptance impact

Add to V2 acceptance expectations:
- At least 3 independent source classes active in baseline (news/publisher, community, visual/video inspiration)
- Source failure in one class does not break briefing generation
- OAuth connectors are optional, additive, and clearly permissioned

## 7.2 Integration Blueprint (for implementation + local testing)

This section defines how source connector integration should be built so it can be implemented safely and tested locally before cloud rollout.

### A. Connector contract

Each connector must implement:
- `id`: stable identifier (`rss`, `reddit`, `youtube`, `unsplash`, `pexels`, `spotify`, `instagram`, `tiktok`, `x`)
- `authMode`: `public | api_key | oauth2`
- `capabilities`: `discover | fetch_headlines | fetch_media_refs | fetch_account_signals`
- `scopes`: required OAuth scopes (OAuth connectors only)
- `rateLimitPolicy`: request budget and retry/backoff rules

### B. Storage model

Keep current source URL storage for backwards compatibility, and add connector state as a parallel layer.

Required objects per workspace:
- `enabledConnectors`: array of connector IDs
- `connectorConfig`: non-secret config (topic filters, locales, channel IDs, subreddit sets)
- `connectorSecrets`: API keys or OAuth tokens, encrypted at rest

Local storage:
- prefer OS keychain for secrets on macOS local mode
- fallback to encrypted file with `QUILLBY_KEYRING_SECRET` or `QUILLBY_PROVIDER_ENCRYPTION_KEY`

Hosted storage:
- encrypted token storage server-side
- strict user/workspace partitioning

### C. Source identity format

To avoid breaking existing RSS flows, support both:
- raw URLs (`https://...`) for RSS/Atom
- connector URIs for non-RSS sources

Recommended URI patterns:
- `reddit://r/<subreddit>/<sort>` (existing)
- `youtube://search/<query>`
- `youtube://channel/<channelId>`
- `unsplash://search/<query>`
- `pexels://photos/<query>`
- `pexels://videos/<query>`
- `spotify://show/<id>` or `spotify://search/<query>`

### D. Extraction routing

Extend source routing beyond RSS/Reddit:
- `reddit://` → Reddit extractor
- `youtube://` → YouTube extractor
- `unsplash://` → Unsplash extractor
- `pexels://` → Pexels extractor
- `spotify://` → Spotify extractor
- default `http(s)://` → RSS extractor

All extractors must normalize into a shared article/media candidate shape used by scoring and briefing.

### E. OAuth integration flow (local-first)

For OAuth connectors (`google`, `reddit`, `spotify`, later `instagram/tiktok/x`):
1. Start connect request from MCP/app endpoint.
2. Redirect user to provider consent page with `state` and PKCE.
3. Handle callback, validate `state`, exchange code for tokens.
4. Encrypt and store refresh/access tokens scoped by workspace.
5. Expose connector status via a `get_connectors` style endpoint/tool.

Local testing note:
- OAuth requires an HTTPS callback for most providers; use localhost-exempt providers where allowed, otherwise use a tunnel (for example ngrok/Cloudflare Tunnel) with a registered redirect URI.

### F. Local env and test fixtures

Add optional env vars (local/self-hosted):
- `QUILLBY_YOUTUBE_API_KEY`
- `QUILLBY_UNSPLASH_ACCESS_KEY`
- `QUILLBY_PEXELS_API_KEY`
- `QUILLBY_SPOTIFY_CLIENT_ID`, `QUILLBY_SPOTIFY_CLIENT_SECRET`
- `QUILLBY_GOOGLE_CLIENT_ID`, `QUILLBY_GOOGLE_CLIENT_SECRET`
- `QUILLBY_OAUTH_BASE_URL` (for callback URL construction)

For deterministic local tests:
- include fixture payloads for each connector
- include a replay/mock mode to avoid quota burn and flaky CI

### G. Local test matrix (minimum)

1. Connector bootstrap:
- can enable/disable each connector per workspace

2. Auth behavior:
- API-key connectors fail gracefully when keys missing
- OAuth connectors show `not_connected` until consent completes

3. Fetch behavior:
- each connector returns normalized candidates
- router handles mixed source sets in one run

4. Failure isolation:
- one connector failing does not fail whole briefing job

5. Caching + freshness:
- repeated runs dedupe seen items
- freshness window works across connectors

6. Security:
- secrets are never returned in MCP responses/resources
- tokens are encrypted at rest and partitioned by workspace

### H. Recommended implementation order

1. Implement connector contract + routing scaffolding.
2. Add YouTube (public API-key mode).
3. Add Unsplash and Pexels (API-key mode).
4. Add connector status/introspection tooling and app endpoints.
5. Add Google/Reddit/Spotify OAuth connectors.
6. Add Instagram/TikTok/X only after baseline reliability and UX are stable.

## 7.3 Reviewer Feedback Loop (Small-Team Version)

Do not build RLHF infrastructure for V2. For a 1-2 person team, the right approach is a lightweight reviewer feedback loop that improves prompts, defaults, and memory over time.

### A. Scope

Use one reviewer role only:
- approve output
- reject output
- mark small fixes (`too generic`, `wrong angle`, `weak hook`, `bad CTA`, `off-brand`)
- optionally add one short free-text note

### B. What gets stored

Store only minimal structured feedback per output:
- `outputId`
- `workspaceId`
- `promptVersion`
- `decision`: `approved | rejected | revised`
- `reasons`: short tag array
- `note`: optional short text

This should be enough to spot repeated failure patterns without building a training system.

### C. How it improves quality

Use reviewer feedback in three simple ways:
1. update workspace memory with stable editorial preferences
2. adjust prompt templates when the same failure reason repeats
3. compare prompt versions by approval rate and revision rate

Do not auto-rewrite prompts from single examples. Only change defaults after repeated signals.

### D. Suggested tooling

Keep tooling minimal:
- add a `review_output` style action/tool
- save feedback alongside existing job/output records
- expose a simple weekly summary by workspace:
   - top rejection reasons
   - most-approved prompt version
   - outputs needing manual rewrite

### E. Local testing

Minimum validation:
1. reviewer can approve/reject an output locally
2. tagged reasons are saved correctly
3. repeated reasons can be counted in a summary
4. feedback never exposes secrets or provider config

### F. Success criteria

This is successful if:
- reviewer effort stays under 30 seconds per output
- repeated failure patterns become visible within one week of use
- prompt/template changes can be tied to measurable approval-rate improvement

## 8. Onboarding UX/DX Contract (Simple, Honest, Straightforward)

Target experience:
- guided, short setup
- mode-aware behavior
- minimal jargon
- first meaningful output fast

Expected onboarding flow:
1. Welcome + scope: "3-minute setup"
2. Creator profile: role, audience, goals, primary platforms
3. Sources: add trusted feeds/sites/creators
4. Brand memory: writing samples + optional visual/voice references
5. Mode-specific setup:
	- Local: "I will use your connected MCP AI client. No provider setup needed."
	- Cloud: "You are ready. Generation is managed by Quillby."
	- Self-Hosted: "Configure provider keys now or later?" (default later)
6. First win: generate card -> draft -> media output

Behavior principle:
- progressive disclosure
- collect only what is needed to unlock immediate value

## 9. Mode Detection Constraint and Resolution

Constraint:
- Claude Desktop chat should not be assumed to have direct access to MCP connection URL details.
- Client-side URL inspection is not a reliable mode detection source.

Resolution:
- mode must be server-authoritative
- onboarding must read runtime mode from Quillby server/tool response
- if mode cannot be resolved, ask one explicit fallback question: Local / Cloud / Self-Hosted

## 10. Current Implementation Focus (Execution Contract)

This is the immediate implementation sequence after this doc update:

1. Align MCP/server tools and handlers with strict V2 scope.
2. Complete missing clone-oriented audio/video generation flows.
3. Ensure end-to-end multimodal job lifecycle (queue -> run -> done/failed -> asset exposure).
4. Validate local, self-hosted, and cloud behavior against this plan.
5. Keep tool count compact while implementing missing features.

## 10.1 Clone Feature Productization Steps

After proof-of-concept validation, clone-driven generation requires these steps before production:

1. **Lock API contract**: Define explicit payload schemas for `avatar_clone` and `reel_voiceover` intents.
   - `avatar_clone`: portrait + voice input → talking-head talking video (OmniHuman path)
   - `reel_voiceover`: scenario prompt + voice input → environment video + narration → muxed reel (Runway + external audio)
   - Validate parameter combinations early; reject invalid mixes (e.g., reel_voiceover without voice URL).

2. **Enforce mode-specific routing**: Update provider adapter to reject invalid parameter combinations upstream.
   - Prevent avatar_clone calls without face_reference; prevent reel_voiceover calls without driving_audio_url.
   - Add explicit provider method dispatch (e.g., `generateAvatarClone()` vs `generateReelWithVoiceover()`).
   - Return clear validation errors before reaching model API layer.

3. **Add reliability tests**: Build test suites for both paths.
   - Unit tests: parameter validation, provider routing, error handling
   - Integration tests: end-to-end clone audio → talking-head video; scenario video + voiceover → muxed reel
   - Mock Replicate/Runway responses to avoid API quota consumption.

4. **Add quality controls**: Ensure output meets production standards.
   - Audio loudness normalization (ffmpeg loudnorm filter for -14 LUFS target).
   - Optional subtitle generation for speech-driven video (accessibility).
   - Audio ducking for scenario videos with background music (if applicable).
   - Validate sync offsets automatically (ffprobe duration check).

5. **Update acceptance criteria**: Extend section 12 to document clone feature expectations.
   - avatar_clone path: portrait → talking-head video with cloned voice, face reference preserved, lip-sync within ±200ms.
   - reel_voiceover path: scenario + voice → muxed video, audio sync verified, output playable on all platforms.
   - Both paths maintain workspace voice/appearance conditioning.

## 11. Out of Scope for This Phase

- Any rewrite of V1 text pipeline.
- New product direction outside copywriter/marketing/business-owner/content-creator use cases.
- Non-essential provider sprawl that does not directly improve delivery of this strict V2 plan.
- Splitting simple capabilities into many specialized tools when parameterized tools suffice.

## 12. Acceptance Criteria

V2 is considered aligned only when all are true:

1. V1 text workflow remains intact.
2. V2 adds working image/audio/video generation.
3. Reference-conditioned generation works (voice/appearance/brand cues).
4. Local mode works with MCP-connected flow.
5. Self-hosted mode works with BYOK.
6. Cloud mode works with Quillby-managed providers.
7. Source -> filter -> cards -> multimodal outputs is stable end-to-end.
8. Onboarding is mode-aware and follows the simple progressive flow above.
9. Runtime mode detection is server-authoritative (or explicit user fallback question).
10. Tool surface remains lean and unambiguous for model tool-calling.

---

If implementation decisions conflict with this file, this file wins.
