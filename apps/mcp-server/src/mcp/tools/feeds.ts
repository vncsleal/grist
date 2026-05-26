import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getGoogleNewsFeeds, getMediumTagFeeds, getFeedlyFeeds } from "../../agents/seeds.js";
import { enrichArticle } from "../../extractors/content.js";
import { logWarn } from "../../logger.js";
import type { ToolContext, ToolStorage } from "./index.js";

function extractContextTopics(ctx: Record<string, unknown> | null): string[] {
  if (!ctx) return [];
  const topics = ctx.topics;
  if (Array.isArray(topics) && topics.every((t): t is string => typeof t === "string")) return topics;
  return [];
}

const FEED_TOOL_NAMES = new Set([
  "add_feeds", "discover_feeds", "list_feeds", "read_article",
]);

export { FEED_TOOL_NAMES };

export const toolDefinitions: Tool[] = [
  {
    name: "discover_feeds",
    description:
      "Discover and save content sources for the user's topics. Adds: Google News RSS (real-time news, any language), Medium tag feeds (professional articles on any industry), Feedly curated publications, and Reddit communities (reddit://r/<subreddit>) via Sampling. Works for any niche: healthcare, law, fashion, construction, farming, finance, etc.",
    annotations: { idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        topics: { type: "array", items: { type: "string" }, description: "Override topics. Defaults to saved user context topics." },
        locale: { type: "string", description: "BCP-47 language tag for Google News, e.g. \"en-US\", \"pt-BR\", \"fr-FR\". Defaults to en-US." },
        country: { type: "string", description: "ISO 3166-1 country code for Google News, e.g. \"US\", \"BR\", \"FR\". Defaults to US." },
      },
    },
  },
  {
    name: "add_feeds",
    description: "Add content sources manually. Accepts: standard RSS/Atom URLs, Medium tag feeds (https://medium.com/feed/tag/<topic>), Google News RSS URLs, and Reddit communities (reddit://r/<subreddit> or reddit://r/<subreddit>/top). Deduplicates automatically.",
    annotations: { idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: { urls: { type: "array", items: { type: "string" }, description: "Source URLs: RSS/Atom URLs, medium.com/feed/tag/*, reddit://r/name" } },
      required: ["urls"],
    },
  },
  {
    name: "list_feeds",
    description: "List all configured RSS feed URLs.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: { workspaceId: { type: "string", description: "Optional workspace override without changing global selection." } },
    },
  },
  {
    name: "read_article",
    description: "Fetch full text for a single article URL using Mozilla Readability. Use after fetch_articles (slim=true).",
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
];

async function resolveStorage(storage: ToolStorage, args: Record<string, unknown>): Promise<ToolStorage> {
  const workspaceId = typeof args.workspaceId === "string" ? args.workspaceId : undefined;
  if (!workspaceId) return storage;
  return storage.withWorkspace(workspaceId);
}

export function handleFeedTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }> {
  const { storage } = ctx;

  switch (name) {
    case "add_feeds": {
      return (async () => {
        const { urls } = args as { urls: string[] };
        const result = await storage.appendSources(urls);
        const totalAfterAdd = (await storage.loadSources()).length;
        return {
          content: [{ type: "text" as const, text: `Added ${result.added} feed(s). Skipped ${result.skipped} duplicate(s). Total: ${totalAfterAdd}. Quillby is ready to open or refresh the workspace Briefing.` }],
          structuredContent: { added: result.added, skipped: result.skipped, total: totalAfterAdd },
        };
      })();
    }

    case "discover_feeds": {
      return (async () => {
        const ctxExists = await storage.contextExists();
        const savedCtx = ctxExists ? await storage.loadContext() : null;
        const { topics: topicOverride, locale = "en-US", country = "US" } = args as { topics?: string[]; locale?: string; country?: string };
        const topics: string[] = topicOverride?.length ? topicOverride : extractContextTopics(savedCtx);
        if (topics.length === 0) {
          return { content: [{ type: "text" as const, text: "No topics are saved for this workspace yet. Update the Quillby setup first." }], structuredContent: { error: "no_topics" } };
        }
        const googleUrls = getGoogleNewsFeeds(topics, locale, country);
        const mediumUrls = getMediumTagFeeds(topics);
        const feedlyUrls = await getFeedlyFeeds(topics, 3);
        const samplingAvailable = !!(ctx.server.server.getClientCapabilities()?.sampling);
        let samplingUrls: string[] = [];
        if (samplingAvailable) {
          const samplingPrompt = `The user is a content creator covering these topics: ${topics.join(", ")}.

Suggest niche content sources that broad news feeds would miss. For each suggestion:
- Reddit communities relevant to these topics: use the format reddit://r/<subreddit> (e.g. reddit://r/smallbusiness, reddit://r/medicine, reddit://r/farming, reddit://r/law)
- Niche industry association blogs, trade publication RSS feeds, or specialist Substack feeds: use standard https:// URLs

Pick communities and publications that match the industry, not tech/startup defaults. A clothing boutique owner needs fashion/retail communities. A health professional needs medical/wellness sources. A lawyer needs legal industry feeds.

Return ONLY a JSON array of strings. 10 items max. No explanation.`;
          const raw = await ctx.sample(samplingPrompt, 600);
          if (raw) {
            try {
              const match = raw.match(/\[.*\]/s);
              if (match) {
                const parsed = JSON.parse(match[0]) as unknown[];
                samplingUrls = parsed.filter(
                  (u): u is string =>
                    typeof u === "string" &&
                    (u.startsWith("http") || u.startsWith("reddit://"))
                );
              }
            } catch (e) {
              logWarn("Sampling response parse failed in discover_feeds", { error: String(e) });
            }
          }
        }
        const allUrls = [...new Set([...googleUrls, ...mediumUrls, ...feedlyUrls, ...samplingUrls])];
        const result = await storage.appendSources(allUrls);
        const discoverResult = {
          topics,
          googleNewsFeeds: googleUrls.length,
          mediumTagFeeds: mediumUrls.length,
          feedlyFeeds: feedlyUrls.length,
          samplingFeeds: samplingUrls.length,
          added: result.added,
          skipped: result.skipped,
          totalFeeds: (await storage.loadSources()).length,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(discoverResult, null, 2) }],
          structuredContent: discoverResult,
        };
      })();
    }

    case "list_feeds": {
      return (async () => {
        const activeStorage = await resolveStorage(storage, args);
        const sources = await activeStorage.loadSources();
        const listFeedsResult = { count: sources.length, feeds: sources };
        return {
          content: [{ type: "text" as const, text: sources.length ? JSON.stringify(listFeedsResult, null, 2) : "No feeds configured. Use add_feeds." }],
          structuredContent: listFeedsResult,
        };
      })();
    }

    case "read_article": {
      return (async () => {
        const { url, title = "" } = args as { url: string; title?: string };
        const content = await enrichArticle(url, title);
        if (!content) {
          return { content: [{ type: "text" as const, text: "Could not retrieve article content (paywalled or fetch failed)." }], structuredContent: { content: null, error: "fetch_failed" } };
        }
        return { content: [{ type: "text" as const, text: content }], structuredContent: { content } };
      })();
    }

    default:
      return Promise.reject(new Error(`Unknown tool: ${name}`));
  }
}
