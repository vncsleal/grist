import { z } from "zod";
import type { ToolContext } from "./index.js";
import { getGoogleNewsFeeds, getMediumTagFeeds, getFeedlyFeeds } from "../../agents/seeds.js";
import { enrichArticle } from "../../extractors/content.js";
import { logWarn } from "../../logger.js";

function extractContextTopics(ctx: Record<string, unknown> | null): string[] {
  if (!ctx) return [];
  const topics = ctx.topics;
  if (Array.isArray(topics) && topics.every((t): t is string => typeof t === "string")) return topics;
  return [];
}

const FeedsSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("discover"), topics: z.array(z.string()).optional(), locale: z.string().optional(), country: z.string().optional() }),
  z.object({ action: z.literal("add"), urls: z.array(z.string()) }),
  z.object({ action: z.literal("list"), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("read"), url: z.string(), title: z.string().optional() }),
]);

export const tool = {
  name: "feeds" as const,
  description: "Manage RSS feeds — discover feeds for your topics, add feeds manually, list configured feeds, or read an article.",
  inputSchema: FeedsSchema,
};

export async function handleTool(raw: unknown, ctx: ToolContext) {
  const parsed = FeedsSchema.parse(raw);

  switch (parsed.action) {
    case "add": {
      const result = await ctx.storage.appendSources(parsed.urls);
      const totalAfterAdd = (await ctx.storage.loadSources()).length;
      return { content: [{ type: "text" as const, text: `Added ${result.added} feed(s). Skipped ${result.skipped} duplicate(s). Total: ${totalAfterAdd}.` }], structuredContent: { added: result.added, skipped: result.skipped, total: totalAfterAdd } };
    }
    case "discover": {
      const ctxExists = await ctx.storage.contextExists();
      const savedCtx = ctxExists ? await ctx.storage.loadContext() : null;
      const topics = parsed.topics?.length ? parsed.topics : extractContextTopics(savedCtx);
      if (topics.length === 0) return { content: [{ type: "text" as const, text: "No topics are saved for this workspace yet. Update the Quillby setup first." }], structuredContent: { error: "no_topics" } };
      const googleUrls = getGoogleNewsFeeds(topics, parsed.locale ?? "en-US", parsed.country ?? "US");
      const mediumUrls = getMediumTagFeeds(topics);
      const feedlyUrls = await getFeedlyFeeds(topics, 3);
      let samplingUrls: string[] = [];
      const samplingAvailable = !!(ctx.server.server.getClientCapabilities()?.sampling);
      if (samplingAvailable) {
        const samplingPrompt = `The user is a content creator covering these topics: ${topics.join(", ")}.\n\nSuggest niche content sources that broad news feeds would miss. For each suggestion:\n- Reddit communities relevant to these topics: use the format reddit://r/<subreddit>\n- Niche industry blogs, trade publication RSS feeds, or specialist Substack feeds: use standard https:// URLs\n\nReturn ONLY a JSON array of strings. 10 items max. No explanation.`;
        const raw = await ctx.sample(samplingPrompt, 600);
        if (raw.ok) {
          try { const m = raw.text.match(/\[.*\]/s); if (m) { const p = JSON.parse(m[0]) as unknown[]; samplingUrls = p.filter((u): u is string => typeof u === "string" && (u.startsWith("http") || u.startsWith("reddit://"))); } } catch (e) { logWarn("Sampling parse failed", { error: String(e) }); }
        }
      }
      const allUrls = [...new Set([...googleUrls, ...mediumUrls, ...feedlyUrls, ...samplingUrls])];
      const addResult = await ctx.storage.appendSources(allUrls);
      return { content: [{ type: "text" as const, text: JSON.stringify({ topics, googleNewsFeeds: googleUrls.length, mediumTagFeeds: mediumUrls.length, feedlyFeeds: feedlyUrls.length, samplingFeeds: samplingUrls.length, added: addResult.added, skipped: addResult.skipped, totalFeeds: (await ctx.storage.loadSources()).length }, null, 2) }], structuredContent: { topics, googleNewsFeeds: googleUrls.length, mediumTagFeeds: mediumUrls.length, feedlyFeeds: feedlyUrls.length, samplingFeeds: samplingUrls.length, added: addResult.added, skipped: addResult.skipped, totalFeeds: (await ctx.storage.loadSources()).length } };
    }
    case "list": {
      const activeStorage = parsed.workspaceId ? await ctx.storage.withWorkspace(parsed.workspaceId) : ctx.storage;
      const sources = await activeStorage.loadSources();
      return { content: [{ type: "text" as const, text: sources.length ? JSON.stringify({ count: sources.length, feeds: sources }, null, 2) : "No feeds configured. Use add_feeds." }], structuredContent: { count: sources.length, feeds: sources } };
    }
    case "read": {
      const content = await enrichArticle(parsed.url, parsed.title ?? "");
      if (!content) return { content: [{ type: "text" as const, text: "Could not retrieve article content (paywalled or fetch failed)." }], structuredContent: { content: null, error: "fetch_failed" } };
      return { content: [{ type: "text" as const, text: content }], structuredContent: { content } };
    }
  }
}
