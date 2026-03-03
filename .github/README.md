# GitHub Onboarding

If you just cloned this repository, run:

```bash
npm install
cp .env.example .env  # then add your API key
npm run init
```

`npm run init` walks you through an interactive setup: it builds `config/context.md` from your answers, seeds `config/rss_sources.txt`, and personalizes all agent prompts in `config/prompts/*.local.txt`. Nothing tracked in git is changed.

Re-running `npm run init` is safe — it detects existing files and asks before overwriting.

### API Keys

GRIST supports multiple LLM providers. Set one key in `.env`:

| Provider | Key | Notes |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | |
| Anthropic Claude | `ANTHROPIC_API_KEY` | |
| Groq | `GROQ_API_KEY` | Free tier available |
| Google Gemini | `GOOGLE_API_KEY` | Free tier available |
| OpenRouter | `OPENROUTER_API_KEY` | 100+ models |
| Mistral AI | `MISTRAL_API_KEY` | |
| xAI (Grok) | `XAI_API_KEY` | |
| Together AI | `TOGETHER_API_KEY` | Cheapest open models |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` | Enterprise |

GRIST auto-detects the provider from whichever key is set.
