# GRIST v0.1

**Guided Research & Insight Synthesis Tool.**

AI agent for reading the internet and writing content in your voice.
Automatically filters RSS feeds for relevant tech news, researches articles deeply, and generates structure cards with multiple insights and takes.

## Quick Start

```bash
# Install dependencies
npm install

# Initialize local private files (context, sources, and prompt overrides)
npm run init

# Copy .env.example and add an API key for your preferred provider
cp .env.example .env

# Copy personal context template and customize it
cp config/context.example.md config/context.md

# Copy feed sources template and customize it
cp config/rss_sources.example.txt config/rss_sources.txt

# Harvest structure cards
npm run harvest

# See card board (id, title, top take/insight)
npm run board

# Compose one draft from a selected structure card
npm run compose -- --card 1 --platform LinkedIn

# Show command help
npm run help
```

## Architecture

Two-step workflow split by intent:

```
HARVEST
📡 Fetch → 📚 Filter → 🔬 Research → 📈 Trends + 🧐 Concepts → 🏗️ Structure Cards

COMPOSE
🧩 Pick card + insight + take → ✍️ Generate one draft for chosen platform
```

## Key Files

```
src/
  index.ts              # Orchestrator
  config.ts             # Configuration
  types.ts              # TypeScript types & schemas
  llm.ts                # Multi-provider LLM client (OpenAI, Anthropic, Groq, Gemini, OpenRouter)
  
  extractors/
    rss.ts              # RSS feed fetching
    content.ts          # Article content extraction
  
  agents/
    librarian.ts        # Filter & score items
    researcher.ts       # Deep article analysis
    editor.ts           # Generate content concepts
      copywriter.ts       # Build wireframes
    trend-spotter.ts    # Cross-article pattern detection
  
  output/
      structures.ts       # Structure cards + harvest/compose persistence

config/
   context.md            # Your identity & voice
   rss_sources.txt       # RSS feed URLs
   prompts/
  README.md           # Prompt contracts
      librarian.txt       # Scoring & filtering rules
      researcher.txt      # Deep analysis framework
      editor.txt          # Content concept generation
      copywriter.txt      # Wireframe building
      ghostwriter.txt     # Publish-ready draft writing
      trend-spotter.txt   # Pattern detection
```

## Configuration

Edit `config/context.md` to customize:
- Your identity and tech stack
- Content interests and dislikes
- Writing voice and tone
- Content themes and goals

The file `config/context.md` is gitignored; commit-safe template lives at `config/context.example.md`.

Edit `config/rss_sources.txt` to add/remove RSS feeds.
The file `config/rss_sources.txt` is gitignored; commit-safe template lives at `config/rss_sources.example.txt`.

For prompt personalization, create local override files in `config/prompts/` using `*.local.txt`
(for example `editor.local.txt`, `copywriter.local.txt`). The runtime prefers local overrides automatically,
and these files are gitignored.

## Output

Harvest creates:
- `overview.md` — run summary
- `structures.md` — readable structure cards
- `structures.json` — compose-ready structured data

Compose creates:
- `draft.md` — one draft from selected card/insight/take

## Commands

- `npm run harvest` — scan and build structure cards
- `npm run board` — list latest structure cards for quick selection
- `npm run compose -- --card <id> --platform <platform>` — generate one draft on demand
- `npm run init` — interactive setup: builds context, seeds RSS sources, personalizes prompts
- `npm run help` — show commands and examples

## Open Source Readiness

This repo is set up for public collaboration with:
- `LICENSE` (MIT)
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `.github/ISSUE_TEMPLATE/*`
- `.github/PULL_REQUEST_TEMPLATE.md`

Contributor onboarding quick path: see `.github/README.md`.

Before publishing, run:

```bash
npm install
npm run typecheck
npm run harvest
```

Then push to GitHub and enable:
- Issues
- Discussions (optional)
- Security Advisories

## LLM Providers

GRIST auto-detects which provider to use based on the key you set in `.env`.

| Provider | Key | Free tier |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | No |
| Anthropic Claude | `ANTHROPIC_API_KEY` | No |
| Groq | `GROQ_API_KEY` | Yes |
| Google Gemini | `GOOGLE_API_KEY` | Yes |
| OpenRouter | `OPENROUTER_API_KEY` | Pay-per-use, 100+ models |
| Mistral AI | `MISTRAL_API_KEY` | No |
| xAI (Grok) | `XAI_API_KEY` | No |
| Together AI | `TOGETHER_API_KEY` | Pay-per-use, cheapest open models |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` | Enterprise |

Only one key is needed. To force a specific provider: `LLM_PROVIDER=groq`

Default models per provider:
- **OpenAI** — `gpt-5-mini` / `gpt-5.2` / `o3`
- **Anthropic** — `claude-haiku-3-5` / `claude-sonnet-4-5` / `claude-opus-4`
- **Groq** — `llama-3.1-8b-instant` / `llama-3.3-70b-versatile`
- **Gemini** — `gemini-2.0-flash` / `gemini-2.5-pro`
- **OpenRouter** — configurable via `LLM_MODEL_*` env vars
- **Mistral** — `mistral-small-latest` / `mistral-medium-latest` / `mistral-large-latest`
- **xAI** — `grok-3-mini` / `grok-3`
- **Together AI** — `Meta-Llama-3.1-8B-Instruct-Turbo` / `Meta-Llama-3.3-70B-Instruct-Turbo`
- **Azure** — deployment names via `LLM_MODEL_*` env vars

Override any model tier in `.env`:
```bash
LLM_MODEL_FAST=     # filtering & scoring
LLM_MODEL=          # general purpose
LLM_MODEL_RESEARCH= # analysis & personalization
LLM_MODEL_REASONING=# deep reasoning
```

## Advanced Features

### 🧠 Semantic Deduplication (Optional)
Prevent duplicate content even when URLs differ:

```bash
# Enable in .env
USE_VECTOR_STORE=true
EMBEDDING_MODEL=text-embedding-3-large
```

Benefits:
- Detects semantically similar articles from different sources
- Avoids covering the same story twice
- Improves content diversity
- Reduces processing costs

### ⚡ Parallel Processing
Configure concurrency for faster execution:

```bash
PARALLEL_WORKERS=4       # Concurrent agent tasks
BATCH_SIZE=10            # Items per batch
PARALLEL_REQUESTS=5      # LLM API parallelism
```

See [docs/ADVANCED_FEATURES.md](./docs/ADVANCED_FEATURES.md) for:
- Batch API integration
- Streaming support
- Model selection strategies
- Cost optimization tips
- Performance tuning

See [config/prompts/README.md](./config/prompts/README.md) for prompt contracts and safe editing rules.

## Cost Tracking

Every `harvest`, `compose`, and `init` run automatically tracks:
- ✅ **Token usage** - Prompt, completion, cached, reasoning tokens from every LLM call
- ✅ **Estimated costs** - Computed from accurate token counts (all providers)
- ✅ **Actual billed costs** - Returned per-request by OpenRouter
- ✅ **OpenAI reconciliation** - Optionally fetches actual OpenAI billing data
- ✅ **Cost logs** - Detailed JSON files in `costs/` with per-request breakdown
- ✅ **CLI summary** - Shows estimated + actual costs after each run

**Costs displayed in CLI:**
```
Estimated cost                                    $0.1234
Actual billed cost                                $0.1187
```

Only OpenRouter shows "Actual billed cost" (per-request cost in API response).
Other providers show estimated costs (highly accurate, using published pricing).

See [docs/COST_TRACKING.md](./docs/COST_TRACKING.md) for:
- Token breakdown by type (cached, reasoning, audio, etc.)
- Cost optimization strategies
- Provider comparison (OpenRouter vs OpenAI vs others)
- OpenAI reconciliation setup
- Monthly cost estimates

## Cost Estimate

- ~100 items processed → ~$0.50 (with gpt-4o-mini)
- ~20 concepts generated → ~$0.20
- **Total per run:** ~$0.70 for full pipeline

## Development

```bash
# Watch mode
npm run dev

# Harvest structures
npm run harvest

# Compose one draft from latest harvest
npm run compose -- --card 1 --platform LinkedIn

# Build
npm run build

# Clear cache
npm run clear-cache
```

## What Makes It Different

1. **Tool-Calling Architecture** — Uses OpenAI's function calling for cleaner agent loops
2. **Modular Agents** — Each stage is independent, testable, and reusable
3. **Your Voice** — Deeply integrated with your identity from `config/context.md`
4. **Idea-First Workflow** — Harvest reusable structures, then compose with your own angle
5. **Cost-Conscious** — Uses cheapest appropriate models, caches aggressively

## Next Steps

- Run a harvest cycle: `npm run harvest`
- Compose from a selected card: `npm run compose -- --card 1 --platform LinkedIn`
- Check `output/` files
- Refine `config/context.md` based on output quality
- Integrate with your publish workflow

---

Built by Vinicius Leal | "Ship ideas before they get overthought"
