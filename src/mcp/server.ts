import "dotenv/config";
import * as http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  type Tool,
  type Resource,
  type Prompt,
} from "@modelcontextprotocol/sdk/types.js";
import { UserContextSchema, CardInputSchema } from "../types.js";
import {
  loadContext,
  saveContext,
  contextExists,
  contextToPromptText,
  ONBOARDING_PROMPT,
} from "../agents/onboard.js";
import { loadSources, appendSources } from "../agents/discover.js";
import { fetchArticles, preScoreArticles } from "../agents/harvest.js";
import { getGoogleNewsFeeds, getFeedlyFeeds } from "../agents/seeds.js";
import { PLATFORM_GUIDES } from "../agents/compose.js";
import { enrichArticle } from "../extractors/content.js";
import { saveSeenUrls } from "../extractors/rss.js";
import {
  loadLatestHarvest,
  latestHarvestExists,
  saveHarvestOutput,
  saveDraft,
} from "../output/structures.js";
import {
  appendFeedback,
  loadFeedback,
  getPreferredPatterns,
  feedbackSummary,
  type FeedbackRecord,
} from "../output/feedback.js";

const server = new Server(
  { name: "grist-mcp", version: "0.4.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} } }
);

function log(message: string) {
  server.sendLoggingMessage({ level: "info", data: message }).catch(() => {});
}

/**
 * Ask the host model to run inference via MCP Sampling.
 * Returns null if the host does not support Sampling — callers degrade gracefully.
 */
async function sample(prompt: string, maxTokens = 4096): Promise<string | null> {
  const caps = server.getClientCapabilities();
  if (!caps?.sampling) return null;
  try {
    const result = await server.createMessage({
      messages: [{ role: "user", content: { type: "text", text: prompt } }],
      maxTokens,
    });
    if (result.content.type === "text") return result.content.text;
    return null;
  } catch {
    return null;
  }
}

const TOOLS: Tool[] = [
  // ── Onboarding ────────────────────────────────────────────────────────────
  {
    name: "grist_onboard",
    description:
      "Interactive onboarding via MCP Elicitation. Asks 3 inline questions and saves your content creator profile. Falls back to text instructions if the client does not support Elicitation.",
    annotations: { idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: { type: "object", properties: {} },
  },

  // ── Profile ───────────────────────────────────────────────────────────────
  {
    name: "grist_set_context",
    description: "Save the user content creator profile after onboarding.",
    annotations: { destructiveHint: false, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        context: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: { type: "string" },
            industry: { type: "string" },
            topics: { type: "array", items: { type: "string" } },
            voice: { type: "string" },
            audienceDescription: { type: "string" },
            contentGoals: { type: "array", items: { type: "string" } },
            excludeTopics: { type: "array", items: { type: "string" } },
            platforms: { type: "array", items: { type: "string" } },
            voiceExamples: { type: "array", items: { type: "string" } },
          },
          required: ["role", "industry", "topics", "voice", "audienceDescription", "contentGoals", "platforms"],
        },
      },
      required: ["context"],
    },
  },
  {
    name: "grist_get_context",
    description: "Load the saved user profile.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: { type: "object", properties: {} },
  },

  // ── Feeds ─────────────────────────────────────────────────────────────────
  {
    name: "grist_discover_feeds",
    description:
      "Discover and save RSS feeds for the user's topics. Uses Google News RSS (any language/country) + Feedly search (curated publications) + Sampling for niche community feeds. No hardcoded lists.",
    annotations: { idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        topics: {
          type: "array",
          items: { type: "string" },
          description: "Override topics. Defaults to saved user context topics.",
        },
        locale: {
          type: "string",
          description: "BCP-47 language tag for Google News, e.g. \"en-US\", \"pt-BR\", \"fr-FR\". Defaults to en-US.",
        },
        country: {
          type: "string",
          description: "ISO 3166-1 country code for Google News, e.g. \"US\", \"BR\", \"FR\". Defaults to US.",
        },
      },
    },
  },
  {
    name: "grist_add_feeds",
    description: "Add RSS feed URLs to the sources list. Deduplicates automatically.",
    annotations: { idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        urls: { type: "array", items: { type: "string" }, description: "RSS/Atom feed URLs to add" },
      },
      required: ["urls"],
    },
  },
  {
    name: "grist_list_feeds",
    description: "List all configured RSS feed URLs.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: { type: "object", properties: {} },
  },

  // ── Fetch & Research ──────────────────────────────────────────────────────
  {
    name: "grist_fetch_articles",
    description:
      "Fetch articles from RSS feeds. Use slim=true for a fast headline index, then grist_read_article for depth. Articles are pre-sorted by keyword relevance against saved user topics.",
    annotations: { readOnlyHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        sources: { type: "array", items: { type: "string" }, description: "Override RSS URLs. Defaults to all configured sources." },
        slim: { type: "boolean", description: "Return only title/source/link/snippet — no content fetching. Default: false." },
      },
    },
  },
  {
    name: "grist_read_article",
    description: "Fetch full text for a single article URL using Mozilla Readability. Use after grist_fetch_articles (slim=true).",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Article URL to fetch" },
        title: { type: "string", description: "Article title (improves extraction)" },
      },
      required: ["url"],
    },
  },

  // ── Analyze (Sampling-powered) ────────────────────────────────────────────
  {
    name: "grist_analyze_articles",
    description:
      "Full pipeline in one call: fetches feeds, pre-filters by keyword relevance, enriches top articles with Readability, then uses MCP Sampling to score and structure them into cards — all via the host model, no extra API key needed. Falls back to returning pre-scored headlines if Sampling is unavailable.",
    annotations: { readOnlyHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        articleIds: {
          type: "array",
          items: { type: "string" },
          description: "Limit analysis to specific article links. Omit to analyze all fetched articles.",
        },
        topN: {
          type: "number",
          description: "Analyze only the top N pre-scored articles. Default: 15.",
        },
      },
    },
  },

  // ── Daily Brief (two-pass Sampling pipeline) ──────────────────────────────
  {
    name: "grist_daily_brief",
    description:
      "The daily entry point. Two-pass pipeline: fetch headlines slim → Sampling semantically scores them against your profile → deep-read only the top picks → Sampling generates full cards. One call, full brief. Returns a ranked content brief with angles and hooks ready. Requires Sampling.",
    annotations: { readOnlyHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        topN: {
          type: "number",
          description: "How many top-scored articles to deep-read and card. Default: 10.",
        },
      },
    },
  },

  // ── Cards ─────────────────────────────────────────────────────────────────
  {
    name: "grist_save_cards",
    description: "Save analyzed structure cards. GRIST persists them.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              source: { type: "string" },
              link: { type: "string" },
              thesis: { type: "string" },
              relevanceScore: { type: "number" },
              relevanceReason: { type: "string" },
              keyInsights: { type: "array", items: { type: "string" } },
              insightOptions: { type: "array", items: { type: "string" } },
              takeOptions: { type: "array", items: { type: "string" } },
              angleOptions: { type: "array", items: { type: "string" } },
              hookOptions: { type: "array", items: { type: "string" } },
              wireframeOptions: { type: "array", items: { type: "string" } },
              trendTags: { type: "array", items: { type: "string" } },
              transposabilityHint: { type: "string" },
            },
            required: ["title", "source", "link", "thesis"],
          },
        },
      },
      required: ["cards"],
    },
  },
  {
    name: "grist_list_cards",
    description: "List saved structure cards from the latest harvest.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max cards to return." },
        minScore: { type: "number", description: "Filter cards at or above this relevance score (0–10)." },
      },
    },
  },
  {
    name: "grist_get_card",
    description: "Get full details of a structure card by ID.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: { cardId: { type: "number" } },
      required: ["cardId"],
    },
  },

  // ── Drafts ────────────────────────────────────────────────────────────────
  {
    name: "grist_save_draft",
    description: "Save a draft post to disk.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string" },
        platform: { type: "string", description: "linkedin, x, instagram, threads, blog, newsletter, medium" },
        cardId: { type: "number" },
      },
      required: ["content", "platform"],
    },
  },

  // ── Generate (Sampling-powered) ───────────────────────────────────────────
  {
    name: "grist_generate_post",
    description:
      "Generate a finished post via MCP Sampling and save it as a draft. Loads the card, user profile, platform guide, and voice examples — writes the post, saves it. One call: write + save. Requires Sampling.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "number", description: "Structure card ID to base the post on." },
        platform: { type: "string", description: "linkedin, x, instagram, threads, blog, newsletter, medium" },
        angle: { type: "string", description: "Specific angle or take to use. If omitted, uses the card's top angle option." },
      },
      required: ["cardId", "platform"],
    },
  },

  // ── Feedback & reinforced learning ────────────────────────────────────────
  {
    name: "grist_rate_card",
    description:
      "Rate a structure card 1–5. GRIST learns which topics, angles, and hooks resonate — future briefs are biased toward what scored well.",
    annotations: { destructiveHint: false, idempotentHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "number", description: "Card ID to rate." },
        rating: { type: "number", description: "1 (not useful) to 5 (exactly what I needed)." },
        chosenAngle: { type: "string", description: "The angle or take you actually used, if you wrote a post." },
        chosenHook: { type: "string", description: "The opening hook you actually used." },
        whatWorked: { type: "string", description: "Optional: what made this card valuable." },
        whatDidntWork: { type: "string", description: "Optional: what was missing or wrong." },
      },
      required: ["cardId", "rating"],
    },
  },
  {
    name: "grist_rate_post",
    description:
      "Rate a finished post 1–5. Posts rated 4+ are automatically added to your voice examples — future posts will sound more like this one. This is the primary feedback signal GRIST learns from.",
    annotations: { destructiveHint: false, idempotentHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        postContent: { type: "string", description: "The full post text to rate." },
        rating: { type: "number", description: "1 (off-voice/off-message) to 5 (exactly my style and message)." },
        platform: { type: "string", description: "linkedin, x, instagram, threads, blog, newsletter, medium" },
        cardId: { type: "number", description: "Card ID the post was based on (optional but recommended)." },
        whatWorked: { type: "string", description: "Optional: what landed well." },
        whatDidntWork: { type: "string", description: "Optional: what felt off." },
      },
      required: ["postContent", "rating"],
    },
  },
  {
    name: "grist_feedback_stats",
    description:
      "Show what GRIST has learned from your ratings: top-performing topics, angles, hooks, and trend tags. Inspect the accumulated signal and understand what is shaping future briefs.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: { type: "object", properties: {} },
  },
];

const RESOURCES: Resource[] = [
  {
    uri: "grist://context",
    name: "User Content Profile",
    description: "The user content creator profile: role, industry, topics, voice, audience, goals, platforms.",
    mimeType: "application/json",
  },
  {
    uri: "grist://harvest/latest",
    name: "Latest Harvest Cards",
    description: "Structure cards from the most recent fetch+analysis session.",
    mimeType: "application/json",
  },
  {
    uri: "grist://feeds",
    name: "RSS Feed Sources",
    description: "All configured RSS feed URLs.",
    mimeType: "text/plain",
  },
];

const PROMPTS: Prompt[] = [
  {
    name: "grist_onboarding",
    description: "Guide the user through initial GRIST setup to collect their content creator profile.",
  },
  {
    name: "grist_workflow",
    description: "Full GRIST workflow: onboard, discover feeds, fetch, analyze, generate posts.",
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    switch (name) {
      case "grist_onboard": {
        const caps = server.getClientCapabilities();
        if (!caps?.elicitation?.form) {
          // Client doesn't support form elicitation — return the static onboarding prompt
          return {
            content: [{ type: "text" as const, text: ONBOARDING_PROMPT }],
            structuredContent: { elicitationAvailable: false, message: ONBOARDING_PROMPT },
          };
        }

        // Step 1 — Identity
        const s1 = await server.elicitInput({
          message: "Let's set up your GRIST profile. Step 1 of 3: who are you?",
          requestedSchema: {
            type: "object" as const,
            properties: {
              name: { type: "string" as const, title: "Your name", description: "Optional — used to personalize prompts" },
              role: { type: "string" as const, title: "Your role", description: "e.g. founder, marketer, software engineer, researcher" },
              industry: { type: "string" as const, title: "Industry or niche", description: "e.g. SaaS, healthcare, fintech, creator economy" },
            },
            required: ["role", "industry"],
          },
        });
        if (s1.action !== "accept" || !s1.content) {
          return {
            content: [{ type: "text" as const, text: "Onboarding cancelled." }],
            structuredContent: { cancelled: true, message: "Onboarding cancelled." },
          };
        }

        // Step 2 — Topics & audience
        const s2 = await server.elicitInput({
          message: "Step 2 of 3: what do you write about, and who reads it?",
          requestedSchema: {
            type: "object" as const,
            properties: {
              topics: { type: "string" as const, title: "Topics to cover", description: "Comma-separated: e.g. AI, developer tools, startup fundraising" },
              audienceDescription: { type: "string" as const, title: "Your audience", description: "e.g. senior engineers at B2B SaaS companies" },
              contentGoals: { type: "string" as const, title: "Content goals", description: "Comma-separated: e.g. build authority, grow newsletter, drive inbound leads" },
            },
            required: ["topics", "audienceDescription", "contentGoals"],
          },
        });
        if (s2.action !== "accept" || !s2.content) {
          return {
            content: [{ type: "text" as const, text: "Onboarding cancelled." }],
            structuredContent: { cancelled: true, message: "Onboarding cancelled." },
          };
        }

        // Step 3 — Voice & platforms
        const s3 = await server.elicitInput({
          message: "Step 3 of 3: how do you write, and where do you publish?",
          requestedSchema: {
            type: "object" as const,
            properties: {
              voice: { type: "string" as const, title: "Writing voice", description: "e.g. direct and analytical, no corporate speak, sardonic, data-heavy" },
              platforms: {
                type: "array" as const,
                title: "Publishing platforms",
                description: "Select all platforms you use",
                items: { type: "string" as const, enum: ["linkedin", "x", "blog", "newsletter", "medium", "instagram", "threads"] },
              },
              excludeTopics: { type: "string" as const, title: "Topics to avoid (optional)", description: "Comma-separated topics GRIST should filter out" },
            },
            required: ["voice", "platforms"],
          },
        });
        if (s3.action !== "accept" || !s3.content) {
          return {
            content: [{ type: "text" as const, text: "Onboarding cancelled." }],
            structuredContent: { cancelled: true, message: "Onboarding cancelled." },
          };
        }

        const splitCSV = (v: unknown): string[] =>
          typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const toStrArr = (v: unknown): string[] =>
          Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : splitCSV(v);

        const onboardCtx = UserContextSchema.parse({
          name: s1.content.name || undefined,
          role: s1.content.role,
          industry: s1.content.industry,
          topics: splitCSV(s2.content.topics),
          audienceDescription: s2.content.audienceDescription,
          contentGoals: splitCSV(s2.content.contentGoals),
          voice: s3.content.voice,
          platforms: toStrArr(s3.content.platforms),
          excludeTopics: s3.content.excludeTopics ? splitCSV(s3.content.excludeTopics) : [],
        });
        saveContext(onboardCtx);

        const summary = `Profile saved!\n\nRole: ${onboardCtx.role} in ${onboardCtx.industry}\nTopics: ${onboardCtx.topics.join(", ")}\nPlatforms: ${onboardCtx.platforms.join(", ")}\nVoice: ${onboardCtx.voice}\n\nNext: call grist_discover_feeds to set up your RSS sources.`;
        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: { saved: true, profile: onboardCtx as unknown as Record<string, unknown> },
        };
      }

      case "grist_set_context": {
        const context = UserContextSchema.parse((args as { context: unknown }).context);
        saveContext(context);
        return {
          content: [{ type: "text" as const, text: `Context saved. Role: ${context.role}. Topics: ${context.topics.join(", ")}. Platforms: ${context.platforms.join(", ")}.` }],
          structuredContent: { saved: true, role: context.role, topics: context.topics, platforms: context.platforms },
        };
      }

      case "grist_get_context": {
        if (!contextExists()) {
          return { content: [{ type: "text" as const, text: "No context saved. Run grist_onboarding first." }], structuredContent: { error: "no_context" } };
        }
        const ctxData = loadContext()!;
        return { content: [{ type: "text" as const, text: JSON.stringify(ctxData, null, 2) }], structuredContent: ctxData as unknown as Record<string, unknown> };
      }

      case "grist_add_feeds": {
        const { urls } = args as { urls: string[] };
        const result = appendSources(urls);
        const totalAfterAdd = loadSources().length;
        return {
          content: [{ type: "text" as const, text: `Added ${result.added} feed(s). Skipped ${result.skipped} duplicate(s). Total: ${totalAfterAdd}. Use grist_fetch_articles to pull articles.` }],
          structuredContent: { added: result.added, skipped: result.skipped, total: totalAfterAdd },
        };
      }

      case "grist_discover_feeds": {
        const ctx = contextExists() ? loadContext() : null;
        const { topics: topicOverride, locale = "en-US", country = "US" } = args as { topics?: string[]; locale?: string; country?: string };
        const topics: string[] = topicOverride?.length ? topicOverride : (ctx?.topics ?? []);
        if (topics.length === 0) {
          return { content: [{ type: "text" as const, text: "No topics in context. Run grist_onboarding first." }], structuredContent: { error: "no_topics" } };
        }
        // 1. Google News RSS — one feed per topic, real-time, multilingual
        const googleUrls = getGoogleNewsFeeds(topics, locale, country);
        // 2. Feedly search — curated publication feeds per topic
        const feedlyUrls = await getFeedlyFeeds(topics, 3);
        // 3. Sampling — ask the model for subreddits and niche community feeds
        const samplingAvailable = !!(server.getClientCapabilities()?.sampling);
        let samplingUrls: string[] = [];
        if (samplingAvailable) {
          const samplingPrompt = `The user is a content creator covering these topics: ${topics.join(", ")}.

Suggest relevant RSS/Atom community feeds that Google News and mainstream publications would miss — specifically:
- Subreddits (format: https://www.reddit.com/r/<name>/.rss)
- Niche industry forums or association blogs with RSS
- Specialist newsletters or substack feeds

Return ONLY a JSON array of URL strings. 10 items max. No explanation.`;
          const raw = await sample(samplingPrompt, 600);
          if (raw) {
            try {
              const match = raw.match(/\[.*\]/s);
              if (match) {
                const parsed = JSON.parse(match[0]) as unknown[];
                samplingUrls = parsed.filter((u): u is string => typeof u === "string" && u.startsWith("http"));
              }
            } catch {
              // ignore parse errors
            }
          }
        }
        const allUrls = [...new Set([...googleUrls, ...feedlyUrls, ...samplingUrls])];
        const result = appendSources(allUrls);
        const discoverResult = {
          topics,
          googleNewsFeeds: googleUrls.length,
          feedlyFeeds: feedlyUrls.length,
          samplingFeeds: samplingUrls.length,
          added: result.added,
          skipped: result.skipped,
          totalFeeds: loadSources().length,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(discoverResult, null, 2) }],
          structuredContent: discoverResult,
        };
      }

      case "grist_list_feeds": {
        const sources = loadSources();
        const listFeedsResult = { count: sources.length, feeds: sources };
        return {
          content: [{ type: "text" as const, text: sources.length ? JSON.stringify(listFeedsResult, null, 2) : "No feeds configured. Use grist_add_feeds." }],
          structuredContent: listFeedsResult,
        };
      }

      case "grist_fetch_articles": {
        const { sources: overrideSources, slim } = args as { sources?: string[]; slim?: boolean };
        const sources = overrideSources?.length ? overrideSources : loadSources();
        if (sources.length === 0) {
          return { content: [{ type: "text" as const, text: "No RSS sources configured. Use grist_discover_feeds to add curated feeds, or grist_add_feeds with manual URLs." }], structuredContent: { error: "no_sources" } };
        }
        const ctx = contextExists() ? loadContext() : null;
        const topics: string[] = ctx?.topics ?? [];
        const { articles, seenUrls } = await fetchArticles(sources, log, slim ?? false);
        saveSeenUrls(seenUrls);
        const scored = topics.length > 0 ? preScoreArticles(articles, topics) : articles.map((a) => ({ ...a, _preScore: 0 }));
        const output = slim
          ? scored.map(({ enrichedContent: _ec, ...rest }: { enrichedContent?: unknown; [k: string]: unknown }) => rest)
          : scored;
        const fetchResult = { feedsChecked: sources.length, articleCount: articles.length, slim: slim ?? false, articles: output };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(fetchResult, null, 2) }],
          structuredContent: fetchResult as unknown as Record<string, unknown>,
        };
      }

      case "grist_read_article": {
        const { url, title = "" } = args as { url: string; title?: string };
        const content = await enrichArticle(url, title);
        if (!content) {
          return { content: [{ type: "text" as const, text: "Could not retrieve article content (paywalled or fetch failed)." }], structuredContent: { content: null, error: "fetch_failed" } };
        }
        return { content: [{ type: "text" as const, text: content }], structuredContent: { content } };
      }

      case "grist_save_cards": {
        const { cards: rawCards } = args as { cards: unknown[] };
        const cards = rawCards.map((c) => CardInputSchema.parse(c));
        if (cards.length === 0) {
          return { content: [{ type: "text" as const, text: "No cards provided." }], structuredContent: { saved: 0 } };
        }
        const outputDir = saveHarvestOutput(cards, new Set());
        return { content: [{ type: "text" as const, text: `Saved ${cards.length} card(s) to ${outputDir}.` }], structuredContent: { saved: cards.length, outputDir } };
      }

      case "grist_list_cards": {
        if (!latestHarvestExists()) {
          return { content: [{ type: "text" as const, text: "No harvest found. Fetch articles and save cards first." }], structuredContent: { error: "no_harvest" } };
        }
        const { limit, minScore } = args as { limit?: number; minScore?: number };
        const bundle = loadLatestHarvest();
        let cards = bundle.cards;
        if (minScore != null) {
          cards = cards.filter((c) => (c.relevanceScore ?? 0) >= minScore);
        }
        if (limit) cards = cards.slice(0, limit);
        const listCardsResult = { generatedAt: bundle.generatedAt, total: bundle.cards.length, showing: cards.length, cards: cards.map((c) => ({ id: c.id, title: c.title, source: c.source, relevanceScore: c.relevanceScore, thesis: c.thesis, trendTags: c.trendTags })) };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(listCardsResult, null, 2) }],
          structuredContent: listCardsResult as unknown as Record<string, unknown>,
        };
      }

      case "grist_analyze_articles": {
        const { topN: rawTopN } = args as { topN?: number };
        const topN = rawTopN ?? 15;
        if (!contextExists()) {
          return { content: [{ type: "text" as const, text: "No context saved. Run grist_onboarding first." }], structuredContent: { error: "no_context" } };
        }
        const ctx = loadContext()!;
        const sources = loadSources();
        if (sources.length === 0) {
          return { content: [{ type: "text" as const, text: "No RSS sources configured. Use grist_discover_feeds first." }], structuredContent: { error: "no_sources" } };
        }
        const samplingAvailable = !!(server.getClientCapabilities()?.sampling);
        if (!samplingAvailable) {
          return { content: [{ type: "text" as const, text: "Sampling not available in this client. Use grist_fetch_articles + grist_read_article + grist_save_cards for manual analysis." }], structuredContent: { error: "sampling_unavailable" } };
        }
        // Fetch slim articles
        const { articles, seenUrls } = await fetchArticles(sources, log, true);
        saveSeenUrls(seenUrls);
        if (articles.length === 0) {
          return { content: [{ type: "text" as const, text: "No new articles found. All items have been seen before." }], structuredContent: { error: "no_new_articles" } };
        }
        // Semantic scoring via Sampling (keyword fallback)
        const fbPatternsAnalyze = getPreferredPatterns(loadFeedback());
        log(`Scoring ${articles.length} headlines semantically...`);
        const headlineList = articles
          .map((a, i) => `${i}: ${a.title} — ${a.snippet ?? ""}`)
          .join("\n");
        const scorePrompt = `You are scoring news headlines for a ${ctx.role} in ${
          ctx.industry ?? "their industry"
        }.

User topics: ${ctx.topics.join(", ")}
Audience: ${ctx.audienceDescription ?? "general"}
Goals: ${ctx.contentGoals.join(", ")}
Avoid: ${ctx.excludeTopics?.length ? ctx.excludeTopics.join(", ") : "nothing specified"}

Headlines (index: title — snippet):
${headlineList}

Return ONLY a JSON array of integers — the indices of the top ${topN} most relevant headlines, ordered best first. No explanation.`;
        const fbScoreSignalAnalyze =
          fbPatternsAnalyze.topics.length > 0 || fbPatternsAnalyze.trendTags.length > 0
            ? `\n\nLearned signal — from past high-rated content (boost articles matching these):\n${fbPatternsAnalyze.topics.length > 0 ? `- Topics: ${fbPatternsAnalyze.topics.join(", ")}\n` : ""}${fbPatternsAnalyze.trendTags.length > 0 ? `- Tags: ${fbPatternsAnalyze.trendTags.slice(0, 8).join(", ")}` : ""}`.trimEnd()
            : "";
        const scoreRaw = await sample(scorePrompt + fbScoreSignalAnalyze, 400);
        let topIndices: number[] = [];
        if (scoreRaw) {
          try {
            const m = scoreRaw.match(/\[[\s\S]*\]/);
            if (m) {
              const parsed = JSON.parse(m[0]) as unknown[];
              topIndices = parsed
                .filter((x): x is number => typeof x === "number" && x >= 0 && x < articles.length)
                .slice(0, topN);
            }
          } catch { /* fall through to keyword fallback */ }
        }
        if (topIndices.length === 0) {
          topIndices = preScoreArticles(articles, ctx.topics)
            .slice(0, topN)
            .map((a) => articles.findIndex((s) => s.link === a.link))
            .filter((i) => i >= 0);
        }
        const topArticles = topIndices.map((i) => articles[i]).filter(Boolean);
        // Enrich top articles
        const enriched: { title: string; url: string; snippet: string; content: string | null }[] = [];
        for (const article of topArticles) {
          const content = await enrichArticle(article.link, article.title ?? "");
          enriched.push({ title: article.title ?? "", url: article.link, snippet: article.snippet ?? "", content });
        }
        // Build analysis prompt
        const articleBlobs = enriched.map((a, i) =>
          `## Article ${i + 1}: ${a.title}\nURL: ${a.url}\n\n${a.content ?? a.snippet}`
        ).join("\n\n---\n\n");
        const voiceBlock = ctx.voiceExamples?.length
          ? `\n\nUser voice examples (study and match this style — do NOT smooth it out):\n${ctx.voiceExamples.map((e, i) => `[${i + 1}]\n${e}`).join("\n\n")}`
          : `\n\nUser voice: ${ctx.voice ?? "direct and authentic"}`;

        const analysisPrompt = `You are an expert content strategist. Analyze these articles for a ${ctx.role} in ${ctx.industry ?? "their industry"}.

User topics: ${ctx.topics.join(", ")}
User audience: ${ctx.audienceDescription ?? "general"}
User platforms: ${ctx.platforms.join(", ")}${voiceBlock}

${articleBlobs}

For each article, produce a JSON object with these fields:
- title (string)
- url (string)
- source (string — domain of URL)
- thesis (string — one sharp sentence: the single most important insight)
- relevanceScore (number 1-10)
- trendTags (array of 3-5 short tags)
- contentAngles (array of 2-3 post angles for the user's platforms)
- keyQuotes (array of 1-2 memorable lines or stats from the article)

Return ONLY a valid JSON array of these objects, no prose.`;
        const raw = await sample(analysisPrompt, 2000);
        if (!raw) {
          return { content: [{ type: "text" as const, text: "Sampling returned no result. Try again or use grist_fetch_articles + grist_save_cards manually." }], structuredContent: { error: "sampling_failed" } };
        }
        let cards: unknown[];
        try {
          const match = raw.match(/\[.*\]/s);
          if (!match) throw new Error("No JSON array in response");
          cards = JSON.parse(match[0]) as unknown[];
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Sampling returned malformed JSON. Raw response:\n${raw}` }], structuredContent: { error: "malformed_json", raw } };
        }
        const parsed = cards.map((c) => CardInputSchema.parse(c));
        const outputDir = saveHarvestOutput(parsed, seenUrls);
        const analyzeResult = { analyzed: parsed.length, outputDir, cards: parsed.map((c) => ({ title: c.title, relevanceScore: c.relevanceScore, thesis: c.thesis })) };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(analyzeResult, null, 2) }],
          structuredContent: analyzeResult as unknown as Record<string, unknown>,
        };
      }

      case "grist_daily_brief": {
        const { topN: rawTopN } = args as { topN?: number };
        const topN = rawTopN ?? 10;
        if (!contextExists()) {
          return { content: [{ type: "text" as const, text: "No context saved. Run grist_onboarding first." }], structuredContent: { error: "no_context" } };
        }
        const ctx = loadContext()!;
        const fbPatterns = getPreferredPatterns(loadFeedback());
        const sources = loadSources();
        if (sources.length === 0) {
          return { content: [{ type: "text" as const, text: "No RSS sources configured. Use grist_discover_feeds first." }], structuredContent: { error: "no_sources" } };
        }
        const samplingAvailable = !!(server.getClientCapabilities()?.sampling);
        if (!samplingAvailable) {
          return { content: [{ type: "text" as const, text: "Sampling not available in this client. Use grist_analyze_articles or the manual workflow instead." }], structuredContent: { error: "sampling_unavailable" } };
        }

        // Pass 1: headlines only — fast, no content fetching
        log(`Daily brief: fetching headlines from ${sources.length} feeds...`);
        const { articles: slimArticles, seenUrls } = await fetchArticles(sources, log, true);
        saveSeenUrls(seenUrls);
        if (slimArticles.length === 0) {
          return { content: [{ type: "text" as const, text: "No new articles found. All items have been seen before." }], structuredContent: { error: "no_new_articles" } };
        }

        // Pass 1b: Sampling-based semantic scoring (not keyword matching)
        log(`Scoring ${slimArticles.length} headlines semantically via Sampling...`);
        const headlineList = slimArticles
          .map((a, i) => `${i}: ${a.title} — ${a.snippet ?? ""}`)
          .join("\n");
        const scorePrompt = `You are scoring news headlines for a ${ctx.role} in ${
          ctx.industry ?? "their industry"
        }.

User topics: ${ctx.topics.join(", ")}
Audience: ${ctx.audienceDescription ?? "general"}
Goals: ${ctx.contentGoals.join(", ")}
Avoid: ${ctx.excludeTopics?.length ? ctx.excludeTopics.join(", ") : "nothing specified"}

Headlines (index: title — snippet):
${headlineList}

Return ONLY a JSON array of integers — the indices of the top ${topN} most relevant headlines, ordered best first. No explanation.`;

        const fbScoreSignal =
          fbPatterns.topics.length > 0 || fbPatterns.trendTags.length > 0
            ? `\n\nLearned signal — from past high-rated content (boost articles matching these):\n${fbPatterns.topics.length > 0 ? `- Topics: ${fbPatterns.topics.join(", ")}\n` : ""}${fbPatterns.trendTags.length > 0 ? `- Tags: ${fbPatterns.trendTags.slice(0, 8).join(", ")}` : ""}`.trimEnd()
            : "";
        const scoreRaw = await sample(scorePrompt + fbScoreSignal, 400);
        let topIndices: number[] = [];
        if (scoreRaw) {
          try {
            const match = scoreRaw.match(/\[[\s\S]*\]/);
            if (match) {
              const parsed = JSON.parse(match[0]) as unknown[];
              topIndices = parsed
                .filter((x): x is number => typeof x === "number" && x >= 0 && x < slimArticles.length)
                .slice(0, topN);
            }
          } catch {
            // fall back to keyword pre-scoring
          }
        }
        if (topIndices.length === 0) {
          const keywordScored = preScoreArticles(slimArticles, ctx.topics);
          topIndices = keywordScored
            .slice(0, topN)
            .map((a) => slimArticles.findIndex((s) => s.link === a.link))
            .filter((i) => i >= 0);
        }

        const topSlim = topIndices.map((i) => slimArticles[i]).filter(Boolean);

        // Pass 2: deep-read only the selected articles
        log(`Deep-reading ${topSlim.length} selected articles...`);
        const enriched: { title: string; source: string; link: string; snippet: string; content: string | null }[] = [];
        for (const article of topSlim) {
          const content = await enrichArticle(article.link, article.title ?? "");
          enriched.push({
            title: article.title ?? "",
            source: article.source ?? article.link,
            link: article.link,
            snippet: article.snippet ?? "",
            content,
          });
        }

        // Pass 3: Sampling generates full cards in one call
        log("Generating content cards via Sampling...");
        const voiceBlock3 = ctx.voiceExamples?.length
          ? `\n\nVoice examples — match this style, amplify the strongest quirks:\n${ctx.voiceExamples.map((e, i) => `[${i + 1}]\n${e}`).join("\n\n")}`
          : `\n\nVoice: ${ctx.voice ?? "direct and authentic"}`;
        const articleBlobs = enriched
          .map((a, i) => `## Article ${i + 1}: ${a.title}\nURL: ${a.link}\n\n${a.content ?? a.snippet}`)
          .join("\n\n---\n\n");
        const cardPrompt = `You are a content strategist. Analyze these articles for a ${ctx.role} in ${
          ctx.industry ?? "their industry"
        }.

User topics: ${ctx.topics.join(", ")}
User platforms: ${ctx.platforms.join(", ")}${voiceBlock3}${fbPatterns.angles.length > 0 ? `\n\nAngles that resonated with this user in past rated posts (let these inform the angleOptions and hookOptions you generate):\n${fbPatterns.angles.map((a) => `- ${a}`).join("\n")}` : ""}

${articleBlobs}

For each article produce a JSON object with these exact fields:
- title (string)
- source (string — domain of URL)
- link (string — article URL exactly as provided above)
- thesis (string — one sharp sentence: the single most important takeaway)
- relevanceScore (number 0-10)
- relevanceReason (string — one sentence why this is useful for the user)
- keyInsights (array of 2-3 specific facts or data points from the article)
- angleOptions (array of 3 distinct post angles matching the user voice and platforms)
- hookOptions (array of 3 opening lines — specific, no filler openers, no rhetorical questions that give away the answer)
- trendTags (array of 3-5 short tags)
- transposabilityHint (string — how to make this universal beyond just the news hook)

Return ONLY a valid JSON array of these objects, no prose.`;

        const cardRaw = await sample(cardPrompt, 4000);
        if (!cardRaw) {
          return { content: [{ type: "text" as const, text: "Sampling returned no result for card generation. Try again." }], structuredContent: { error: "sampling_failed" } };
        }
        let rawBriefCards: unknown[];
        try {
          const match = cardRaw.match(/\[[\s\S]*\]/);
          if (!match) throw new Error("No JSON array in response");
          rawBriefCards = JSON.parse(match[0]) as unknown[];
        } catch {
          return { content: [{ type: "text" as const, text: `Card generation returned malformed JSON.\nRaw:\n${cardRaw}` }], structuredContent: { error: "malformed_json", raw: cardRaw } };
        }

        const briefCards = rawBriefCards.map((c) => CardInputSchema.parse(c));
        saveHarvestOutput(briefCards, seenUrls);
        const savedBundle = loadLatestHarvest();
        const briefResult = {
          date: new Date().toISOString().split("T")[0],
          feedsChecked: sources.length,
          headlinesSeen: slimArticles.length,
          deepRead: enriched.length,
          cardsGenerated: savedBundle.cards.length,
          brief: savedBundle.cards
            .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
            .map((c) => ({
              id: c.id,
              score: c.relevanceScore,
              title: c.title,
              thesis: c.thesis,
              topAngle: c.angleOptions?.[0] ?? null,
              topHook: c.hookOptions?.[0] ?? null,
              trendTags: c.trendTags,
            })),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(briefResult, null, 2) }],
          structuredContent: briefResult as unknown as Record<string, unknown>,
        };
      }

      case "grist_get_card": {
        if (!latestHarvestExists()) {
          return { content: [{ type: "text" as const, text: "No harvest found." }], structuredContent: { error: "no_harvest" } };
        }
        const { cardId } = args as { cardId: number };
        const bundle = loadLatestHarvest();
        const card = bundle.cards.find((c) => c.id === cardId);
        if (!card) {
          return { content: [{ type: "text" as const, text: `Card #${cardId} not found. Available: ${bundle.cards.map((c) => c.id).join(", ")}.` }], structuredContent: { error: "not_found", cardId } };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(card, null, 2) }], structuredContent: card as unknown as Record<string, unknown> };
      }

      case "grist_save_draft": {
        const { content, platform, cardId } = args as { content: string; platform: string; cardId?: number };
        const filePath = saveDraft(content, platform, cardId);
        return { content: [{ type: "text" as const, text: `Draft saved to ${filePath}.` }], structuredContent: { saved: true, platform, filePath } };
      }

      case "grist_generate_post": {
        const { cardId: genCardId, platform: genPlatform, angle } = args as { cardId: number; platform: string; angle?: string };
        if (!latestHarvestExists()) {
          return { content: [{ type: "text" as const, text: "No harvest found. Run grist_daily_brief or grist_analyze_articles first." }], structuredContent: { error: "no_harvest" } };
        }
        if (!contextExists()) {
          return { content: [{ type: "text" as const, text: "No context saved. Run grist_onboarding first." }], structuredContent: { error: "no_context" } };
        }
        const genSamplingAvailable = !!(server.getClientCapabilities()?.sampling);
        if (!genSamplingAvailable) {
          return { content: [{ type: "text" as const, text: "Sampling not available. Write the post yourself and use grist_save_draft to persist it." }], structuredContent: { error: "sampling_unavailable" } };
        }
        const genBundle = loadLatestHarvest();
        const genCard = genBundle.cards.find((c) => c.id === genCardId);
        if (!genCard) {
          return { content: [{ type: "text" as const, text: `Card #${genCardId} not found. Available: ${genBundle.cards.map((c) => c.id).join(", ")}.` }], structuredContent: { error: "not_found", cardId: genCardId } };
        }
        const genCtx = loadContext()!;
        const guide = PLATFORM_GUIDES[genPlatform];
        if (!guide) {
          return { content: [{ type: "text" as const, text: `Unknown platform: "${genPlatform}". Available: ${Object.keys(PLATFORM_GUIDES).join(", ")}.` }], structuredContent: { error: "unknown_platform", platform: genPlatform } };
        }
        const chosenAngle = angle ?? genCard.angleOptions?.[0] ?? genCard.thesis;
        const genVoiceBlock = genCtx.voiceExamples?.length
          ? `Voice examples — read these carefully. Match the register, rhythm, and vocabulary exactly. Oversteer on the strongest quirks:\n${genCtx.voiceExamples.map((e, i) => `[${i + 1}]\n${e}`).join("\n\n")}`
          : `Voice description: ${genCtx.voice ?? "direct and authentic"}`;
        const genFbPatterns = getPreferredPatterns(loadFeedback());
        const genAnglesHint =
          genFbPatterns.angles.length > 0
            ? `\n\nAngles that resonated with this user in past rated posts (adapt if thematically relevant):\n${genFbPatterns.angles.map((a) => `- ${a}`).join("\n")}`
            : "";
        const generatePrompt = `You are writing a ${genPlatform} post for ${
          genCtx.name ?? "a content creator"
        } — a ${genCtx.role} in ${genCtx.industry ?? "their industry"}.

## User profile
- Audience: ${genCtx.audienceDescription ?? "general"}
- Goals: ${genCtx.contentGoals.join(", ")}
- Platforms: ${genCtx.platforms.join(", ")}

## ${genVoiceBlock}

## Source card
Title: ${genCard.title}
Thesis: ${genCard.thesis}
Angle to use: ${chosenAngle}
Key insights: ${genCard.keyInsights?.join(" | ") ?? ""}
Trend tags: ${genCard.trendTags?.join(", ") ?? ""}
Transposability hint: ${genCard.transposabilityHint ?? ""}
Hook options (pick the best or write a stronger one): ${genCard.hookOptions?.join(" | ") ?? ""}

## Platform guide
${guide}${genAnglesHint}

## Absolute rules — any violation produces an unusable draft
- NEVER use: "It's not X, it's Y" contrasts, em-dash clusters (1 max per post), bullet lists masquerading as prose
- NEVER use these words: "game-changer", "transformative", "innovative", "powerful", "exciting", "impactful", "leverage", "unlock", "dive into"
- NEVER use filler openers: "In today's world", "In an era of", "Let's talk about", "Here's the thing:", "The truth is:"
- NEVER use rhetorical question openers that give away the answer
- NEVER use motivational closings: "Remember: X matters", "Don't forget to X"
- NEVER smooth out the rough edges — the rough edges are the voice
- Write the post only. No intro sentence, no commentary, no "Here is the post:".`;
        log(`Generating ${genPlatform} post for card #${genCardId}...`);
        const draft = await sample(generatePrompt, 2000);
        if (!draft) {
          return { content: [{ type: "text" as const, text: "Sampling returned no result. Try again." }], structuredContent: { error: "sampling_failed" } };
        }
        const draftPath = saveDraft(draft.trim(), genPlatform, genCardId);
        const generateResult = { platform: genPlatform, cardId: genCardId, angle: chosenAngle, savedTo: draftPath, draft: draft.trim() };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(generateResult, null, 2) }],
          structuredContent: generateResult,
        };
      }

      case "grist_rate_card": {
        const {
          cardId: rateCardId,
          rating: cardRating,
          chosenAngle: rateChosenAngle,
          chosenHook: rateChosenHook,
          whatWorked: cardWhatWorked,
          whatDidntWork: cardWhatDidntWork,
        } = args as { cardId: number; rating: number; chosenAngle?: string; chosenHook?: string; whatWorked?: string; whatDidntWork?: string };
        if (cardRating < 1 || cardRating > 5) {
          return { content: [{ type: "text" as const, text: "Rating must be between 1 and 5." }], structuredContent: { error: "invalid_rating" } };
        }
        const rateBundle = latestHarvestExists() ? loadLatestHarvest() : null;
        const rateCard = rateBundle?.cards.find((c) => c.id === rateCardId);
        const rateCtx = contextExists() ? loadContext() : null;
        const cardRecord: FeedbackRecord = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          type: "card",
          rating: cardRating,
          cardId: rateCardId,
          trendTags: rateCard?.trendTags ?? [],
          usedAngle: rateChosenAngle,
          usedHook: rateChosenHook,
          whatWorked: cardWhatWorked,
          whatDidntWork: cardWhatDidntWork,
          topics: rateCtx?.topics ?? [],
        };
        appendFeedback(cardRecord);
        const cardMsg =
          cardRating >= 4
            ? `Card #${rateCardId} rated ${cardRating}/5. Patterns noted — future briefs will favor similar topics and angles.`
            : `Card #${rateCardId} rated ${cardRating}/5. Noted.`;
        return {
          content: [{ type: "text" as const, text: cardMsg }],
          structuredContent: { saved: true, rating: cardRating, cardId: rateCardId },
        };
      }

      case "grist_rate_post": {
        const {
          postContent: ratePostContent,
          rating: postRating,
          platform: ratePlatform,
          cardId: ratePostCardId,
          whatWorked: postWhatWorked,
          whatDidntWork: postWhatDidntWork,
        } = args as { postContent: string; rating: number; platform?: string; cardId?: number; whatWorked?: string; whatDidntWork?: string };
        if (postRating < 1 || postRating > 5) {
          return { content: [{ type: "text" as const, text: "Rating must be between 1 and 5." }], structuredContent: { error: "invalid_rating" } };
        }
        const ratePostBundle = latestHarvestExists() ? loadLatestHarvest() : null;
        const ratePostCard =
          ratePostCardId != null ? ratePostBundle?.cards.find((c) => c.id === ratePostCardId) : undefined;
        const postCtx = contextExists() ? loadContext() : null;
        const postRecord: FeedbackRecord = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          type: "post",
          rating: postRating,
          cardId: ratePostCardId,
          platform: ratePlatform,
          postContent: ratePostContent,
          trendTags: ratePostCard?.trendTags ?? [],
          whatWorked: postWhatWorked,
          whatDidntWork: postWhatDidntWork,
          topics: postCtx?.topics ?? [],
        };
        appendFeedback(postRecord);
        let voiceMsg = "";
        if (postRating >= 4 && postCtx) {
          const existingExamples = postCtx.voiceExamples ?? [];
          const updatedExamples = [ratePostContent, ...existingExamples].slice(0, 10);
          saveContext({ ...postCtx, voiceExamples: updatedExamples });
          voiceMsg = " Added to your voice examples — future posts will sound more like this one.";
        }
        const postMsg =
          postRating >= 4
            ? `Post rated ${postRating}/5.${voiceMsg}`
            : `Post rated ${postRating}/5. Noted.`;
        return {
          content: [{ type: "text" as const, text: postMsg }],
          structuredContent: { saved: true, rating: postRating, voiceExampleAdded: postRating >= 4 },
        };
      }

      case "grist_feedback_stats": {
        const allFeedback = loadFeedback();
        if (allFeedback.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No feedback recorded yet. Rate cards and posts with grist_rate_card and grist_rate_post to start building the learning signal." }],
            structuredContent: { total: 0 },
          };
        }
        const stats = feedbackSummary(allFeedback);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }],
          structuredContent: stats,
        };
      }

      default:
        return { content: [{ type: "text" as const, text: `Unknown tool: ${name}` }], isError: true, structuredContent: { error: "unknown_tool", toolName: name } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true, structuredContent: { error: message } };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const { uri } = req.params;
  switch (uri) {
    case "grist://context": {
      const text = contextExists()
        ? JSON.stringify(loadContext(), null, 2)
        : JSON.stringify({ error: "No context saved. Run grist_onboarding first." });
      return { contents: [{ uri, mimeType: "application/json", text }] };
    }
    case "grist://harvest/latest": {
      const text = latestHarvestExists()
        ? JSON.stringify(loadLatestHarvest(), null, 2)
        : JSON.stringify({ error: "No harvest yet. Run grist_fetch_articles and grist_save_cards." });
      return { contents: [{ uri, mimeType: "application/json", text }] };
    }
    case "grist://feeds": {
      const sources = loadSources();
      return { contents: [{ uri, mimeType: "text/plain", text: sources.length ? sources.join("\n") : "# No feeds configured." }] };
    }
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  const { name } = req.params;
  switch (name) {
    case "grist_onboarding": {
      const exists = contextExists();
      const existing = exists ? loadContext() : null;
      return {
        description: "GRIST onboarding",
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: exists
                ? `I have a saved profile:\n\n${contextToPromptText(existing!)}\n\nUpdate it?`
                : "Set up GRIST for my content workflow.",
            },
          },
          {
            role: "assistant" as const,
            content: {
              type: "text" as const,
              text: exists
                ? "I can see your profile. Tell me what to change and I will call grist_set_context."
                : ONBOARDING_PROMPT,
            },
          },
        ],
      };
    }

    case "grist_workflow": {
      const platformGuideText = Object.entries(PLATFORM_GUIDES)
        .map(([p, g]) => `**${p}**: ${g}`)
        .join("\n\n");

      const ctx = contextExists() ? loadContext() : null;
      const voiceSection = ctx?.voiceExamples?.length
        ? `### Voice reference (read before writing any draft)

These are approved posts that define the target voice. Match the register, rhythm, and directness. Oversteer — if it feels too contained, it's wrong.

${ctx.voiceExamples.map((e, i) => `**Example ${i + 1}:**\n\`\`\`\n${e}\n\`\`\``).join("\n\n")}`
        : ctx?.voice
        ? `### Voice\n\n${ctx.voice}\n\nNo approved examples yet. Call grist_set_context with voiceExamples to lock in reference posts.`
        : "### Voice\n\nNo profile saved. Run grist_onboarding first.";

      const workflowText = `## GRIST Workflow

GRIST handles file I/O and data plumbing. All editorial judgment lives in the model.

### Setup (once)
1. Run grist_onboarding prompt, collect answers, call grist_set_context.
2. Call grist_discover_feeds — it matches your topics against a curated seed list and optionally expands it via Sampling. No manual feed hunting needed.

### Daily workflow — Automated (when Sampling is available)
1. Call grist_analyze_articles (limit: 8–12). GRIST fetches articles, pre-scores by topic overlap, enriches the top N, sends them to you via Sampling, and saves the resulting cards automatically.
2. Call grist_list_cards (minScore: 7) to see the strongest cards.
3. Call grist_get_card for the card you want to post about.
4. Write the post using the platform guide below.
5. Call grist_save_draft to persist it.

### Daily workflow — Manual (when Sampling is unavailable)
1. Call grist_fetch_articles with slim=true — returns a headline index sorted by pre-score. Fast, no content fetching.
2. Read grist://context. Identify the most promising articles by title and _preScore.
3. Call grist_read_article for each article you want to read in full.
4. Score relevance yourself. Generate card fields.
5. Call grist_save_cards with your analyzed cards.
6. Call grist_get_card for the card you want to post about.
7. Write the post using the platform guide below.
8. Call grist_save_draft to persist it.

### Voice rules (apply before writing any draft)
- Read the user's voiceExamples in their context. Identify the 2-3 strongest stylistic quirks. Amplify them — oversteer, not understeer.
- BANNED: “It’s not X, it’s Y” contrasts. Em-dash clusters. Bullet lists as prose. “Game-changer”, “transformative”, “powerful”, “unlock”, “leverage”, “dive into”. Filler openers (“In today’s world”, “Here’s the thing”). Emoji stacking. Numbered listicles. Motivational closings.
- Write like the user, not like an assistant helping the user.

${voiceSection}

### Platform guides

${platformGuideText}`;

      return {
        description: "GRIST workflow",
        messages: [
          { role: "user" as const, content: { type: "text" as const, text: "How do I use GRIST?" } },
          { role: "assistant" as const, content: { type: "text" as const, text: workflowText } },
        ],
      };
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Scheduled autonomous harvest
// ---------------------------------------------------------------------------

async function runScheduledHarvest(): Promise<void> {
  const tag = "[grist-schedule]";
  if (!contextExists()) {
    process.stderr.write(`${tag} No profile saved — skipping.\n`);
    return;
  }
  const ctx = loadContext()!;
  const sources = loadSources();
  if (sources.length === 0) {
    process.stderr.write(`${tag} No feeds configured — skipping.\n`);
    return;
  }
  const topN = parseInt(process.env.GRIST_SCHEDULE_TOP_N ?? "15", 10);
  process.stderr.write(`${tag} Fetching articles from ${sources.length} feeds...\n`);
  try {
    const { articles, seenUrls } = await fetchArticles(
      sources,
      (msg) => process.stderr.write(`${tag} ${msg}\n`),
      true,
    );
    saveSeenUrls(seenUrls);
    if (articles.length === 0) {
      process.stderr.write(`${tag} No new articles.\n`);
      return;
    }
    const top = preScoreArticles(articles, ctx.topics).slice(0, topN);
    const cards = top.map((a) =>
      CardInputSchema.parse({
        title: a.title ?? "Untitled",
        source: (() => { try { return new URL(a.link).hostname; } catch { return a.link; } })(),
        link: a.link,
        thesis: a.snippet ?? a.title ?? "",
        trendTags: [],
      })
    );
    const outputDir = saveHarvestOutput(cards, seenUrls);
    process.stderr.write(`${tag} Done. ${cards.length} card(s) saved to ${outputDir}.\n`);
  } catch (err) {
    process.stderr.write(`${tag} Error: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

function scheduleDaily(timeStr: string, fn: () => Promise<void>): void {
  const parts = timeStr.split(":");
  const hour = parseInt(parts[0] ?? "", 10);
  const minute = parseInt(parts[1] ?? "0", 10);
  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    process.stderr.write(`[grist-schedule] Invalid GRIST_SCHEDULE "${timeStr}" — expected HH:MM. Scheduling disabled.\n`);
    return;
  }
  const msUntilNext = (): number => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  };
  const tick = (): void => {
    const delay = msUntilNext();
    process.stderr.write(`[grist-schedule] Next harvest at ${timeStr} (in ${Math.round(delay / 60000)} min).\n`);
    setTimeout(async () => { await fn(); tick(); }, delay).unref();
  };
  tick();
}

// ---------------------------------------------------------------------------

const TRANSPORT_MODE = process.env.GRIST_TRANSPORT ?? "stdio";

if (TRANSPORT_MODE === "http") {
  // Stateful HTTP mode: each client session gets its own transport instance.
  // A single shared Server handles all sessions via per-request transports.
  const PORT = parseInt(process.env.PORT ?? "3000", 10);

  // Map of sessionId → transport, so we can route GET/DELETE back to the right session.
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    // A2A agent card — served unauthenticated so other agents can discover capabilities
    if (url.pathname === "/.well-known/agent.json") {
      const baseUrl = process.env.GRIST_BASE_URL ?? `http://localhost:${PORT}`;
      const agentCard = {
        name: "GRIST",
        description: "Guided Research & Insight Synthesis Tool — RSS content intelligence MCP server. Fetches, scores, and structures articles into content cards for social media posts.",
        url: `${baseUrl}/mcp`,
        version: "0.4.0",
        capabilities: {
          streaming: true,
          pushNotifications: false,
          stateTransitionHistory: false,
        },
        authentication: {
          schemes: process.env.GRIST_HTTP_TOKEN ? ["Bearer"] : ["None"],
        },
        defaultInputModes: ["application/json"],
        defaultOutputModes: ["application/json"],
        skills: [
          {
            id: "content_harvest",
            name: "Content Harvest",
            description: "Fetch articles from RSS feeds, score for relevance, structure into content cards.",
            tags: ["rss", "content", "feeds", "articles"],
            examples: ["Run grist_daily_brief", "Fetch and analyze articles"],
          },
          {
            id: "post_generation",
            name: "Post Generation",
            description: "Generate platform-specific social media posts from content cards using the user voice profile.",
            tags: ["linkedin", "twitter", "blog", "newsletter"],
            examples: ["Generate a LinkedIn post from card #3"],
          },
          {
            id: "feed_management",
            name: "Feed Management",
            description: "Discover, add, and list RSS feed sources.",
            tags: ["rss", "feeds", "discovery"],
            examples: ["Discover feeds for AI topics", "Add a new RSS feed"],
          },
        ],
      };
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }).end(JSON.stringify(agentCard, null, 2));
      return;
    }

    if (url.pathname !== "/mcp") {
      res.writeHead(404).end("Not found");
      return;
    }

    // Bearer token auth — enforced when GRIST_HTTP_TOKEN is set
    const BEARER_TOKEN = process.env.GRIST_HTTP_TOKEN;
    if (BEARER_TOKEN) {
      const authHeader = req.headers.authorization ?? "";
      const match = authHeader.match(/^Bearer (.+)$/i);
      const tokenValid =
        match != null &&
        match[1].length === BEARER_TOKEN.length &&
        timingSafeEqual(Buffer.from(match[1]), Buffer.from(BEARER_TOKEN));
      if (!tokenValid) {
        res.writeHead(401, { "WWW-Authenticate": 'Bearer realm="grist-mcp"' }).end("Unauthorized");
        return;
      }
    }

    // Route GET/DELETE to existing session transport
    if (req.method === "GET" || req.method === "DELETE") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400).end("Missing or unknown mcp-session-id");
        return;
      }
      const existing = sessions.get(sessionId)!;
      await existing.handleRequest(req, res);
      return;
    }

    // POST — new or existing session
    if (req.method === "POST") {
      // Read body
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks).toString("utf-8");
      let parsedBody: unknown;
      try { parsedBody = JSON.parse(body); } catch { parsedBody = undefined; }

      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (sessionId && sessions.has(sessionId)) {
        // Existing session
        await sessions.get(sessionId)!.handleRequest(req, res, parsedBody);
        return;
      }

      // New session
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      sessions.set(transport.sessionId ?? randomUUID(), transport);

      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };

      // Each new session connects a fresh Server clone sharing the same handlers.
      // Because @modelcontextprotocol/sdk v1.x Server is not multi-transport,
      // we create a new Server per session but reuse all the registered handlers
      // by reconnecting the same `server` instance (which is stateless wrt transport).
      await server.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
      return;
    }

    res.writeHead(405).end("Method not allowed");
  });

  httpServer.listen(PORT, () => {
    process.stderr.write(`GRIST MCP server listening on http://localhost:${PORT}/mcp\n`);
    if (!process.env.GRIST_HTTP_TOKEN) {
      process.stderr.write("WARNING: GRIST_HTTP_TOKEN is not set — the /mcp endpoint is unprotected.\n");
    }
  });
} else {
  // Default: stdio (local MCP clients — Claude Desktop, VS Code, Cursor)
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Scheduled autonomous harvest — fires daily at GRIST_SCHEDULE (HH:MM local time).
// Runs regardless of transport mode but works best as an HTTP daemon.
// In stdio mode it only fires while an MCP client has the server open.
const GRIST_SCHEDULE = process.env.GRIST_SCHEDULE;
if (GRIST_SCHEDULE) {
  scheduleDaily(GRIST_SCHEDULE, runScheduledHarvest);
}
