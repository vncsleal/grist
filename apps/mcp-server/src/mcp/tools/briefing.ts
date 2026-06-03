import { z } from "zod";
import type { ToolContext, ToolResult } from "./index.js";
import type { UserContext, TypedMemory } from "@quillby/core";
import { CardInputSchema } from "../../types.js";
import { fetchArticles, preScoreArticles } from "../../agents/harvest.js";
import { enrichArticle } from "../../extractors/content.js";
import { contextToPromptText } from "../../agents/onboard.js";
import { logWarn } from "../../logger.js";

const BriefingSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), topN: z.number().optional() }),
  z.object({ action: z.literal("get"), workspaceId: z.string().optional() }),
]);

export const tool = {
  name: "briefing" as const,
  description:
    "Manage Quillby Briefings — generate a fresh Briefing by fetching feeds, scoring, and producing cards, or open the latest saved Briefing.",
  inputSchema: BriefingSchema,
};

export async function handleTool(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = BriefingSchema.parse(raw);
  const log = (message: string) => {
    ctx.server.server
      .sendLoggingMessage({ level: "info", data: message })
      .catch(() => logWarn("MCP logging message delivery failed"));
  };

  switch (parsed.action) {
    case "generate": {
      const topN = parsed.topN ?? 10;
      if (!(await ctx.storage.contextExists())) {
        return {
          content: [{ type: "text", text: "No context saved for this workspace yet. Set up Quillby first." }],
          structuredContent: { error: "no_context" },
        };
      }
      const userCtx = (await ctx.storage.loadContext()) as Record<string, unknown>;
      const sources = await ctx.storage.loadSources();
      if (sources.length === 0) {
        return {
          content: [{ type: "text", text: "No RSS sources configured. Use discover_feeds first." }],
          structuredContent: { error: "no_sources" },
        };
      }
      const samplingAvailable = !!(ctx.server.server.getClientCapabilities()?.sampling);

      log(`Daily brief: fetching headlines from ${sources.length} feeds...`);
      const { articles: slimArticles, seenUrls } = await fetchArticles(
        sources,
        await ctx.storage.getSeenUrls(),
        log,
        true,
      );
      await ctx.storage.saveSeenUrls(seenUrls);
      if (slimArticles.length === 0) {
        return {
          content: [{ type: "text", text: "No new articles found. All items have been seen before." }],
          structuredContent: { error: "no_new_articles" },
        };
      }

      log(`Scoring ${slimArticles.length} headlines semantically via Sampling...`);
      const headlineList = slimArticles
        .map((a, i) => `${i}: ${a.title} — ${a.snippet ?? ""}`)
        .join("\n");
      const topics = userCtx.topics as string[] | undefined;
      const scorePrompt = `You are scoring news headlines for a ${userCtx.role as string} in ${(userCtx.industry as string) ?? "their industry"}.

User topics: ${topics?.join(", ") ?? ""}
Audience: ${(userCtx.audienceDescription as string) ?? "general"}
Goals: ${((userCtx.contentGoals as string[]) ?? []).join(", ")}
Avoid: ${((userCtx.excludeTopics as string[]) ?? []).length ? ((userCtx.excludeTopics as string[]) ?? []).join(", ") : "nothing specified"}

Headlines (index: title — snippet):
${headlineList}

Return ONLY a JSON array of integers — the indices of the top ${topN} most relevant headlines, ordered best first. No explanation.`;

      const scoreResult = await ctx.sample(scorePrompt, 400);
      let topIndices: number[] = [];
      if (scoreResult.ok) {
        try {
          const match = scoreResult.text.match(/\[[\s\S]*\]/);
          if (match) {
            const parsed = JSON.parse(match[0]) as unknown[];
            topIndices = parsed
              .filter((x): x is number => typeof x === "number" && x >= 0 && x < slimArticles.length)
              .slice(0, topN);
          }
        } catch (e) {
          logWarn("Sampling score parse failed, falling back to keyword pre-scoring", {
            error: String(e),
          });
        }
      }
      if (topIndices.length === 0) {
        const keywordScored = preScoreArticles(slimArticles, topics ?? []);
        topIndices = keywordScored
          .slice(0, topN)
          .map((a) => slimArticles.findIndex((s) => s.link === a.link))
          .filter((i) => i >= 0);
      }

      const topSlim = topIndices.map((i) => slimArticles[i]).filter(Boolean);

      log(`Deep-reading ${topSlim.length} selected articles...`);
      const enriched: {
        title: string;
        source: string;
        link: string;
        snippet: string;
        content: string | null;
      }[] = [];
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

      log("Generating content cards via Sampling...");
      const typedMemory = await ctx.storage.loadTypedMemory();
      const voiceBlock =
        typedMemory && (typedMemory as Record<string, unknown>).voiceExamples
          ? `\n\nVoice examples — match this style, amplify the strongest quirks:\n${(
              (typedMemory as Record<string, string[]>).voiceExamples ?? []
            )
              .map((e, i) => `[${i + 1}]\n${e}`)
              .join("\n\n")}`
          : `\n\nVoice: ${(userCtx.voice as string) ?? "direct and authentic"}`;
      const articleBlobs = enriched
        .map(
          (a, i) =>
            `## Article ${i + 1}: ${a.title}\nURL: ${a.link}\n\n${a.content ?? a.snippet}`,
        )
        .join("\n\n---\n\n");
      const cardPrompt = `You are a content strategist. Analyze these articles for a ${userCtx.role as string} in ${(userCtx.industry as string) ?? "their industry"}.

${contextToPromptText(userCtx as UserContext, typedMemory as TypedMemory)}${voiceBlock}

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

      if (!samplingAvailable) {
        return {
          content: [
            {
              type: "text",
              text: `Quillby fetched ${slimArticles.length} headlines, selected the top ${enriched.length}, and deep-read each one. Generate the content cards now, then call save_cards to persist the Briefing.\n\n${cardPrompt}`,
            },
          ],
          structuredContent: {
            deferred: true,
            headlinesSeen: slimArticles.length,
            deepRead: enriched.length,
          },
        };
      }
      const cardResult = await ctx.sample(cardPrompt, 4000);
      if (!cardResult.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Quillby fetched ${slimArticles.length} headlines, selected the top ${enriched.length}, and deep-read each one. Generate the content cards now, then call save_cards to persist the Briefing.\n\n${cardPrompt}`,
            },
          ],
          structuredContent: {
            deferred: true,
            headlinesSeen: slimArticles.length,
            deepRead: enriched.length,
          },
        };
      }
      let rawBriefCards: unknown[];
      try {
        const match = cardResult.text.match(/\[[\s\S]*\]/);
        if (!match) throw new Error("No JSON array in response");
        rawBriefCards = JSON.parse(match[0]) as unknown[];
      } catch {
        return {
          content: [
            {
              type: "text",
              text: `Card generation returned malformed JSON.\nRaw:\n${cardResult.text}`,
            },
          ],
          structuredContent: { error: "malformed_json", raw: cardResult.text },
        };
      }

      const briefCards = rawBriefCards.map((c) => CardInputSchema.parse(c));
      await ctx.storage.saveHarvestOutput(briefCards, seenUrls);
      const savedBundle = (await ctx.storage.loadLatestHarvest()) as Record<string, unknown> | null;
      const savedCards = (savedBundle?.cards ?? briefCards) as Array<Record<string, unknown>>;
      const briefResult = {
        date: new Date().toISOString().split("T")[0],
        feedsChecked: sources.length,
        headlinesSeen: slimArticles.length,
        deepRead: enriched.length,
        cardsGenerated: savedCards.length,
        brief: savedCards
          .sort((a, b) => ((b.relevanceScore as number) ?? 0) - ((a.relevanceScore as number) ?? 0))
          .map((c) => ({
            id: c.id,
            score: c.relevanceScore,
            title: c.title,
            thesis: c.thesis,
            topAngle: (c.angleOptions as string[] | undefined)?.[0] ?? null,
            topHook: (c.hookOptions as string[] | undefined)?.[0] ?? null,
            trendTags: c.trendTags,
          })),
      };
      return {
        content: [{ type: "text", text: `Briefing generated for ${briefResult.date}. Checked ${briefResult.feedsChecked} feed(s), ${briefResult.headlinesSeen} headline(s) seen, ${briefResult.deepRead} article(s) deep-read, ${briefResult.cardsGenerated} card(s) generated. Top card: "${briefResult.brief[0]?.title ?? "N/A"}" (score ${briefResult.brief[0]?.score ?? "N/A"}).` }],
        structuredContent: briefResult as Record<string, unknown>,
      };
    }

    case "get": {
      const storage = parsed.workspaceId
        ? await ctx.storage.withWorkspace(parsed.workspaceId)
        : ctx.storage;
      const [workspace, hasBriefing] = await Promise.all([
        storage.getCurrentWorkspace(),
        storage.latestHarvestExists(),
      ]);
      if (!hasBriefing) {
        return {
          content: [
            {
              type: "text",
              text: `No Briefing saved yet for workspace "${workspace.name}". Run daily_brief to generate one.`,
            },
          ],
          structuredContent: {
            error: "no_briefing",
            workspace: workspace.name,
            workspaceId: workspace.id,
          },
        };
      }
      const [bundle, userCtx] = await Promise.all([
        storage.loadLatestHarvest(),
        storage.loadContext(),
      ]);
      const bundleData = bundle as Record<string, unknown>;
      const curation = (bundleData.curationState ?? {}) as Record<string, string>;
      const cards = (bundleData.cards ?? []) as Array<Record<string, unknown>>;
      const sorted = [...cards].sort(
        (a, b) => ((b.relevanceScore as number) ?? 0) - ((a.relevanceScore as number) ?? 0),
      );

      const mapCard = (c: Record<string, unknown>) => ({
        id: c.id,
        score: c.relevanceScore,
        title: c.title,
        source: c.source,
        thesis: c.thesis,
        topAngle: (c.angleOptions as string[] | undefined)?.[0] ?? null,
        topHook: (c.hookOptions as string[] | undefined)?.[0] ?? null,
        trendTags: c.trendTags,
        curationStatus: curation[String(c.id)] ?? null,
      });

      const shortlisted = sorted.filter((c) => curation[String(c.id)] === "shortlisted").map(mapCard);
      const skipped = sorted.filter((c) => curation[String(c.id)] === "skipped").map(mapCard);
      const uncurated = sorted.filter((c) => !curation[String(c.id)]).map(mapCard);

      const briefing = {
        workspace: workspace.name,
        workspaceId: workspace.id,
        generatedAt: bundleData.generatedAt,
        totalCards: cards.length,
        profile: userCtx
          ? {
              role: (userCtx as Record<string, unknown>).role,
              industry: (userCtx as Record<string, unknown>).industry,
              topics: (userCtx as Record<string, unknown>).topics,
            }
          : null,
        curationSummary: {
          shortlisted: shortlisted.length,
          skipped: skipped.length,
          uncurated: uncurated.length,
        },
        shortlisted,
        skipped,
        uncurated,
      };
      return {
        content: [{ type: "text", text: `Briefing for "${briefing.workspace}" from ${briefing.generatedAt}: ${briefing.totalCards} card(s) total, ${briefing.curationSummary.shortlisted} shortlisted, ${briefing.curationSummary.skipped} skipped, ${briefing.curationSummary.uncurated} uncurated.` }],
        structuredContent: briefing as Record<string, unknown>,
      };
    }
  }
}
