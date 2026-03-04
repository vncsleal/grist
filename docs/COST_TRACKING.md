# Cost Tracking & Token Usage

GRIST provides **granular per-request cost tracking** for all LLM API calls across all commands (`harvest`, `compose`, `init`).

## Key Features

- ✅ **Automatic tracking** - Every LLM call is logged with detailed token usage
- ✅ **Accurate tokens** - Captures all token types: prompt, completion, cached, reasoning, audio
- ✅ **Actual billing costs** - OpenRouter returns per-request costs directly
- ✅ **Estimated costs** - All providers: computed from accurate token counts
- ✅ **OpenAI reconciliation** - Optional automatic reconciliation with OpenAI billing API
- ✅ **Confidence levels** - Track whether costs are actual, estimated, or unknown
- ✅ **Provider comparison** - See costs broken down by provider and model
- ✅ **Transparent output** - CLI displays both estimated and actual billed costs

## Where Costs Are Logged

After every run, costs are saved to:
```
costs/costs_<date>_<timestamp>.json
```

Example structure:
```json
{
  "entries": [
    {
      "stage": "librarian",
      "provider": "openai",
      "model": "gpt-4o-mini",
      "requestId": "chatcmpl-ABC123...",
      "tokens": {
        "promptTokens": 4686,
        "completionTokens": 232,
        "cachedTokens": 1200,
        "reasoningTokens": 0,
        "audioInputTokens": 0,
        "audioOutputTokens": 0,
        "cacheCreationTokens": 0,
        "cacheReadTokens": 0
      },
      "estimatedCost": 0.0008421,
      "billedCost": 0.0009500,
      "confidence": "actual",
      "timestamp": 1772484719006
    }
  ],
  "totalEstimatedCost": 0.1234,
  "totalBilledCost": 0.1187,
  "timestamp": "2026-03-03T20:55:00.000Z"
}
```

## CLI Display

After each run, you'll see:

```
╭─ PIPELINE COMPLETE ────────────────────────────────────────╮
│ API Usage                                                  │
├────────────────────────────────────────────────────────────┤
│ Total LLM calls                                        42  │
│ Estimated cost                                    $0.1234  │
│ Actual billed cost                                $0.1187  │
├────────────────────────────────────────────────────────────┤
```

**Interpretation:**
- **Estimated cost** - Computed from published pricing table
- **Actual billed cost** - Only shown for OpenRouter (they provide per-request costs)
- Missing "Actual billed cost" line = provider doesn't offer per-request billing data

## Token Types Tracked

### All Providers
- **promptTokens** - Input tokens
- **completionTokens** - Output tokens

### Provider-Specific
- **cachedTokens** - Prompt caching (OpenAI, Groq, Together AI, Gemini)
  - Charged at 50% of input token price
  - Reduces costs for repeated context
  
- **reasoningTokens** - Thinking/reasoning compute (OpenAI o1/o3 models)
  - Charged separately at a higher rate
  - Indicates how much reasoning was used
  
- **audioTokens** - Audio I/O (OpenAI audio models)
  - audioInputTokens - Speech-to-text tokens
  - audioOutputTokens - Text-to-speech tokens
  
- **cacheCreationTokens** / **cacheReadTokens** - Anthropic prompt caching
- **thinkingTokens** - Gemini thinking (Gemini 2.0 experimental)

## Provider Cost Behavior

### OpenRouter ✅ Actual Costs
- **Per-request cost** - Provided in response
- **Confidence** - "actual"
- **When available** - Every request (if provider returns it)

Example:
```json
{
  "confidence": "actual",
  "estimatedCost": 0.00100,
  "billedCost": 0.00098
}
```

### OpenAI ⚠️ Estimated + Auto-Reconciliation
- **Per-request cost** - Estimated from MODEL_PRICING table
- **Confidence** - "estimated" initially
- **Auto-reconciliation** - After harvest/compose, attempts to fetch actual costs from OpenAI's organization billing API
  - If successful: updates cost log with `billedCost` and confidence → "actual"
  - If fails silently: continues with estimated costs only
  - Requires: `OPENAI_API_KEY` with organization-level API access

### Other Providers (Anthropic, Gemini, Groq, etc.) ❌ Estimated Only
- **Per-request cost** - Estimated from MODEL_PRICING table
- **Confidence** - "estimated"
- **No billing API** - Providers don't expose per-request cost data
- **Accuracy** - Estimates use published current pricing (very accurate)

## How Costs Are Computed

### For Providers Without Per-Request Cost Data

```typescript
// Basic calculation
cost = (promptTokens × inputPrice) + (completionTokens × outputPrice)

// With caching (50% discount on cached tokens)
cost += (cachedTokens × inputPrice × 0.5)

// With reasoning (separate pricing for o1/o3) 
cost += (reasoningTokens × reasoningPrice)

// Result: very accurate estimate matching actual billing
```

**Pricing table location:** `src/costs.ts` (MODEL_PRICING)

**Updates:** Table uses current 2026 pricing — update if provider prices change

## Cost Breakdown by Pipeline Stage

View costs per stage in CLI output and cost log:

```json
{
  "byStage": {
    "librarian": 0.03245,      // Filtering & scoring
    "researcher": 0.04892,     // Deep article analysis
    "trend-spotter": 0.01234,  // Pattern detection
    "editor": 0.02156,         // Concept generation
    "copywriter": 0.03450,     // Draft generation
    "cache": 0.00023           // Embeddings
  }
}
```

## Cost Optimization Tips

### 1. Use Cheaper Models for Fast Tasks
```bash
# In .env
LLM_MODEL_FAST=gpt-4o-mini    # $0.15/$0.60 per 1M tokens
LLM_MODEL=gpt-4o              # $2.50/$10 per 1M tokens
LLM_MODEL_RESEARCH=gpt-4-turbo # $10/$30 per 1M tokens
```

Fast tasks don't need expensive models:
- **Librarian** (filtering) - Fastest model
- **Trend-spotter** (pattern matching) - Fastest model  
- **Researcher** (analysis) - Advanced model
- **Copywriter** (drafting) - Balanced model

### 2. Enable Prompt Caching (OpenAI)
```bash
# In .env
USE_PROMPT_CACHE=true
```

Caches:
- `config/context.md` - Your identity (reused every request)
- Extracted article content - Deduplicated across batches

Savings: 50% reduction on repeated context

### 3. Tune Parallelization
```bash
# In .env
PARALLEL_WORKERS=4            # CPU threads (balance with API rate limits)
BATCH_SIZE=10                 # Items per batch
PARALLEL_REQUESTS=3           # Concurrent API calls
```

- Higher parallelism = faster execution but higher initial cost
- Lower parallelism = slower but cheaper (rate-limited APIs)

### 4. Semantic Deduplication (Prevents Wasted Analysis)
```bash
# In .env
USE_VECTOR_STORE=true
EMBEDDING_MODEL=text-embedding-3-small  # Cheaper, fast
```

Prevents:
- Analyzing the same news from multiple sources
- Analyzing rephrased/summarized versions
- Wasted LLM calls on duplicates

Cost savings: Often 30-40% fewer items processed

### 5. Use Groq or Together AI for Testing
```bash
# Free/cheap inference providers
GROQ_API_KEY=...              # Free tier, ~1-3x cheaper than OpenAI
TOGETHER_API_KEY=...          # Pay-per-use, cheapest open models
```

Perfect for:
- Development and testing
- Large-scale runs (100+ items)
- Non-critical content

### 6. Reduce Content Length
```typescript
// In src/config.ts
ENRICHMENT: {
  MAX_CONTENT_LENGTH: 2000,   // Default: 4000. Reduce to save tokens.
  MAX_INSIGHTS: 3,             // Fewer insights = fewer output tokens
  MAX_QUOTES: 5,               // Fewer quotes = smaller responses
}
```

## Analyzing Cost Logs

### View costs by model:
```json
{
  "byModel": {
    "gpt-4o-mini": 0.0234,
    "gpt-4-turbo": 0.0876,
    "text-embedding-3-small": 0.0001
  }
}
```

### View costs by confidence level:
```json
{
  "byConfidence": {
    "actual": 0.0500,      // OpenRouter or reconciled OpenAI
    "estimated": 0.1234,   // Most providers
    "unknown": 0.0001      // Shouldn't happen
  }
}
```

### Investigate individual requests:
```bash
# Find expensive requests
cat costs/costs_*.json | jq '.entries | sort_by(.estimatedCost) | reverse | .[0:5]'

# Find cached requests (savings detected)
cat costs/costs_*.json | jq '.entries[] | select(.tokens.cachedTokens > 100)'

# Total by stage across all time
cat costs/costs_*.json | jq -s '.[].byStage | add'
```

## OpenAI Organization Billing API (Experimental)

To enable automatic reconciliation with actual OpenAI billing:

### 1. Get Organization API Access
- Admin user in OpenAI organization
- Create organization API key (different from regular API key)
- Set in `.env`:
```bash
OPENAI_ORG_ID=org-...           # Your organization ID
OPENAI_API_KEY=sk-...           # Use organization-level key
```

### 2. How It Works
After `npm run harvest`, reconciliation automatically:
1. Reads cost log with request IDs
2. Queries OpenAI `/v1/usage/completions` API
3. Matches actual costs to estimate costs
4. Updates cost log with `billedCost` field
5. Changes confidence from "estimated" → "actual"

### 3. What Gets Matched
- Request IDs from `response.id` (automatic in every response)
- Billing period: Last 24 hours of requests
- Updates: Only requests successfully matched

### 4. Benefits
- Verify pricing hasn't changed
- Detect promotional discounts or tier benefits
- Audit accuracy of estimates for budgeting
- Ensure cost prediction accuracy

### 5. Troubleshooting
If reconciliation fails silently:
- Check `OPENAI_ORG_ID` is set correctly
- Verify organization-level API key (not user-level)
- Check organization has billing access enabled
- Look for recent errors in cost log

## Cost Estimates (2026 Pricing)

### Single Harvest Run (100 items)
```
Librarian (filtering)     ~$0.03  (gpt-4o-mini)
Researcher (8 items)      ~$0.05  (gpt-4-turbo)  
Trend-spotter            ~$0.01  (gpt-4o-mini)
Editor & Copywriter      ~$0.03  (gpt-4o)
Embeddings (dedup)       ~$0.0001

Total: ~$0.12 per harvest
```

### Single Compose Run (1 draft)
```
Copywriter             ~$0.01-0.02  (gpt-4o)

Total: ~$0.015 per compose
```

### Cost Reduction with Optimization
- **Caching enabled** - Save 20-30% on repeated context
- **Semantic dedup** - Save 20-40% on duplicate content
- **Smaller models** - Save 2-3x by using gpt-4o-mini for filtering
- **Groq/Together** - Save 3-5x with open-source models

**Realistic monthly cost:** $5-20 (depending on item volume and optimization)

## Related Files

- `src/costs.ts` - Cost tracking implementation
- `src/reconcile.ts` - OpenAI reconciliation logic
- `src/llm.ts` - Token extraction from LLM responses
- `costs/` - Cost log files (auto-generated)
