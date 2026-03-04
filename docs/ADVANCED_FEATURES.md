# Advanced Features & Optimizations

## 🚀 Latest OpenAI Capabilities (2026)

### Available Models
The pipeline now supports all latest OpenAI models (as of March 2026) and automatically selects the best one for each task:

| Model | Use Case | Context | Output | Price/1M | Features |
|-------|----------|---------|--------|----------|----------|
| **gpt-5.2** | Latest general purpose | 400K | 272K | Standard | Best overall quality, broad world knowledge |
| **gpt-5-mini** | Fast filtering & scoring | 128K | 4K | $ | Low latency, most cost-effective |
| **gpt-5.2-pro** | Complex multi-step analysis | 400K | 272K | $$$ | Extended compute, harder thinking |
| **o3** | Deep reasoning | 200K | 100K | $$ | Highest reasoning level, math, science, coding |
| **o4** | Advanced reasoning | 200K | 100K | $$$ | Next-gen reasoning (if available) |
| **gpt-4.1** | Legacy advanced | 128K | 4K | $$ | Previous generation |

**Embeddings:**
- **text-embedding-3-large** - Semantic search, 3072 dimensions, highest quality

### Intelligent Model Selection

The pipeline automatically chooses models based on task complexity:

```typescript
// Librarian: Fast scoring → uses gpt-5-mini
selectModel("fast")

// Researcher: Deep analysis → uses gpt-5.2
selectModel("advanced")

// Complex reasoning tasks → uses o3
selectModel("reasoning")

// Extended compute for hardest problems → uses gpt-5.2-pro
selectModel("pro")
```

## 🧠 Semantic Search & Vector Stores

### Embeddings-Based Deduplication
The new semantic layer prevents duplicate content even when URLs differ:

```typescript
// Old approach: Only exact URL matching
if (seenUrls.has(article.url)) skip();

// New approach: Semantic similarity detection
const embedding = await generateEmbedding(article.title + article.content);
const isDuplicate = await vectorStore.isDuplicate(text, 0.92); // 92% similarity threshold
```

### Features
- ✅ **text-embedding-3-large** - 3072-dimensional vectors for high-quality semantic search
- ✅ **Cosine similarity** - Efficient similarity calculation
- ✅ **Persistent cache** - Vector store saves to `.cache/vector_store.json`
- ✅ **Configurable thresholds** - Adjust sensitivity (default: 92% for duplicates)

### Usage

Enable in `.env`:
```bash
USE_VECTOR_STORE=true
EMBEDDING_MODEL=text-embedding-3-large
```

Benefits:
- Avoids covering the same story from multiple sources
- Detects rephrased or summarized versions of the same content
- Improves content diversity and quality
- Reduces LLM costs by filtering early

### Performance
- **Speed**: ~100ms per embedding (parallelized)
- **Cost**: $0.13 per 1M tokens (text-embedding-3-large)
- **Storage**: ~12KB per vector (3072 floats)
- **Memory**: Handles 10K+ vectors efficiently

## ⚡ Parallelization & Concurrency

### Parallel Processing Framework
The new `src/utils/parallel.ts` module provides:

```typescript
// Process items concurrently with configurable workers
await parallelMap(items, processFn, { workers: 4 })

// Batch process with rate-limiting
await batchProcess(items, processFn, { 
  batchSize: 10,
  workers: 4 
})

// Retry with exponential backoff
await retryWithBackoff(fn, { 
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2
})
```

### Configuration
Control parallelization via environment variables:

```bash
# Number of concurrent workers (default: 4)
PARALLEL_WORKERS=4

# Items per batch (default: 10)
BATCH_SIZE=10

# Parallel requests per call (default: 5)
PARALLEL_REQUESTS=5
```

## 🔄 Batch API Support

For high-volume processing, enable async batch processing:

```typescript
// Coming soon: Native batch API support
// Process thousands of requests efficiently with 50% cost savings
CONFIG.LLM.USE_BATCH_API = true
```

Benefits:
- ✅ 50% lower cost for large batches
- ✅ Run overnight, get results in the morning
- ✅ Automatic retry handling
- ✅ No rate limit concerns

## 🎯 Structured Outputs with Zod

All agent outputs are validated with Zod schemas for type safety:

```typescript
// Automatic parsing and validation
const result = await callLLM({
  systemPrompt: prompt,
  userMessage: message,
  jsonMode: true, // Enforces JSON response
})

// Parsed with full type safety
const parsed = parseJSON<typeof MySchema>(result.content)
```

## 🌊 Streaming Support

Enable streaming for long-running operations:

```typescript
const response = await callLLM({
  systemPrompt: prompt,
  userMessage: message,
  stream: true, // Enable streaming
})

// Stream events fire as tokens arrive
response.on("chunk", (text) => {
  process.stdout.write(text)
})
```

## 📊 Cost Optimization

The pipeline automatically optimizes costs by:

1. **Using fast models for simple tasks**
   - Librarian: `gpt-4o-mini` for scoring (not gpt-4-turbo)
   - Editor: `gpt-4o-mini` for layout (not gpt-4-turbo)

2. **Using advanced models only when needed**
   - Researcher: `gpt-4-turbo` for deep analysis
   - Trend spotter: Complex pattern detection

3. **Respecting rate limits**
   - Exponential backoff for 429 errors
   - Configurable concurrency (default: 4 workers)
   - Batch processing to avoid throttling

4. **Caching responses**
   - 24-hour TTL for identical queries
   - Avoid re-processing seen URLs

### Estimated Daily Cost
- **Fast run** (gpt-4o-mini): ~$0.50-$1.00
- **Standard run** (mixed): ~$2.00-$5.00
- **Research run** (gpt-4-turbo): ~$5.00-$15.00

## 🔍 Performance Metrics

Monitor pipeline performance with built-in stats:

```typescript
// Get LLM call statistics
const stats = getCallStats()
// Returns: { total: 23, cached: 5, failed: 0 }
```

## 🛠️ Environment Variables

```bash
# Model selection
LLM_MODEL_FAST=gpt-4o-mini          # For fast tasks
LLM_MODEL=gpt-4o-mini               # Standard tasks
LLM_MODEL_RESEARCH=gpt-4-turbo      # Research tasks
LLM_MODEL_REASONING=o1-mini         # Reasoning tasks

# Parallelization
PARALLEL_WORKERS=4                  # Concurrent workers
BATCH_SIZE=10                       # Items per batch
PARALLEL_REQUESTS=5                 # Parallel API calls

# Advanced features
USE_STREAMING=true                  # Enable streaming
USE_BATCH_API=false                 # Use async batch API (soon)
```

## 💰 Cost Optimization

GRIST automatically tracks costs per request with granular detail. See [COST_TRACKING.md](./COST_TRACKING.md) for comprehensive guides.

### Key Optimization Strategies

#### 1. Model Tier Selection
Different task complexities require different models:

```bash
# Fast filtering — use cheapest model
LLM_MODEL_FAST=gpt-4o-mini      # $0.15/$0.60 per 1M tokens

# General tasks — balanced cost/quality
LLM_MODEL=gpt-4o                # $2.50/$10 per 1M tokens

# Deep research — best quality
LLM_MODEL_RESEARCH=gpt-4-turbo  # $10/$30 per 1M tokens

# Complex reasoning — expensive but necessary
LLM_MODEL_REASONING=o3          # $200/$800 per 1M tokens
```

**Rule of thumb:** Use strongest models only where needed.

Library tasks (filtering) can use gpt-4o-mini.
Research tasks require gpt-4-turbo.
Reasoning tasks need o1/o3.

#### 2. Prompt Caching (OpenAI)
Automatically caches repeated context at 50% input token cost:

```bash
USE_PROMPT_CACHE=true
```

Caches:
- `config/context.md` - Your identity (reused every request)
- Common system prompts - Shared across all requests in a batch
- Article headers - Deduplicated across many items

**Savings:** 30-50% reduction on repeated context tokens.

#### 3. Provider Selection
Different providers offer different pricing/quality tradeoffs:

| Provider | Speed | Cost | Free Tier| Quality |
|----------|-------|------|----------|---------|
| OpenRouter | Fast | $$ | Pay-as-you-go | Excellent |
| OpenAI | Fast | $$ | No | Excellent |
| Groq | Very Fast | $ | Yes | Good |
| Together AI | Fast | $ | Pay-as-you-go | Good |
| Anthropic | Medium | $$$ | No | Excellent |
| Gemini | Fast | $ | Yes | Good |

For cost-sensitive runs: Use Groq or Together AI.
For quality: Use OpenAI or Anthropic.

#### 4. Semantic Deduplication
Prevents wasted analysis on duplicate content:

```bash
USE_VECTOR_STORE=true
EMBEDDING_MODEL=text-embedding-3-small   # Cheaper than large
```

**Savings:** 20-40% fewer items processed when deduplication active.

#### 5. Content Length Limits
Reduce input tokens by limiting article length:

```bash
# In src/config.ts
ENRICHMENT: {
  MAX_CONTENT_LENGTH: 2000,     // Reduce from 4000
  MAX_INSIGHTS: 2,               // Reduce from 3
  MAX_QUOTES: 3,                 // Reduce from 5
}
```

**Trade-off:** Slightly lower quality analysis but 25-35% cheaper.

#### 6. Batch Sizing
Large batches require more LLM context but process more items:

```bash
BATCH_SIZE=20    # Larger batches = fewer API calls but higher per-call cost
BATCH_SIZE=5     # Smaller batches = more calls but lower per-call cost
```

**Optimal:** 10-15 items per batch (balances efficiency).

#### 7. Parallel Workers
Higher parallelism speeds up execution but increases concurrency costs:

```bash
PARALLEL_WORKERS=4       # Standard: balances speed & cost
PARALLEL_WORKERS=2       # Conservative: slower but cheaper rate-limiting
PARALLEL_WORKERS=8       # Aggressive: fast but expensive
```

### Monitoring Costs

Every run generates detailed cost logs in `costs/costs_*.json`:

```bash
# View costs from last run
cat costs/costs_*.json | tail -1 | jq '.totalEstimatedCost'

# Find most expensive stage
cat costs/costs_*.json | jq '.byStage | to_entries | sort_by(.value) | reverse | .[0]'

# Track costs over time
for f in costs/costs_*.json; do 
  echo "$(date -r $f +%Y-%m-%d): $(jq '.totalEstimatedCost' < $f)"
done
```

### Expected Costs (Per Run)

With optimization:
- **100-item harvest** - $0.08-0.12
- **Typed compose** - $0.01-0.02
- **Monthly (10 runs)** - $0.80-1.50

Without optimization:
- **100-item harvest** - $0.15-0.25
- **Typed compose** - $0.02-0.03
- **Monthly (10 runs)** - $1.70-3.00

**Optimization can save 40-50% of costs.**

## 🎨 Future Enhancements

- [ ] Native batch API integration (50% cost savings)
- [ ] Vision API for image analysis
- [ ] Real-time streaming with events
- [ ] Custom fine-tuned models
- [ ] Multi-modal inputs (text + images + audio)
- [ ] Distributed processing across multiple machines

## 📚 References

- [OpenAI Models](https://platform.openai.com/docs/models)
- [Batch API](https://platform.openai.com/docs/guides/batches)
- [Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
