import { z } from "zod";
import type { ToolContext, ToolResult } from "./index.js";
import type { UserContext, TypedMemory } from "@quillby/core";
import { CardInputSchema } from "../../types.js";
import { PLATFORM_GUIDES } from "../../agents/compose.js";
import { contextToPromptText } from "../../agents/onboard.js";

const CardsSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), cards: z.array(CardInputSchema), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("list"), workspaceId: z.string().optional(), limit: z.number().optional(), minScore: z.number().optional() }),
  z.object({ action: z.literal("get"), cardId: z.number(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("curate"), cardId: z.number(), status: z.enum(["shortlist", "skip", "clear"]), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("generate_post"), cardId: z.number().optional(), platform: z.string().optional(), angle: z.string().optional() }),
]);

export const tool = {
  name: "cards" as const,
  description:
    "Manage content cards — save analyzed cards from the Briefing, list all cards, get card details, curate (shortlist/skip/clear), or generate a platform post from a card.",
  inputSchema: CardsSchema,
};

export async function handleTool(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CardsSchema.parse(raw);

  switch (parsed.action) {
    case "save": {
      const storage = parsed.workspaceId
        ? await ctx.storage.withWorkspace(parsed.workspaceId)
        : ctx.storage;
      const cards = parsed.cards.map((c) => CardInputSchema.parse(c));
      if (cards.length === 0) {
        return { content: [{ type: "text", text: "No cards provided." }], structuredContent: { saved: 0 } };
      }
      const outputDir = await storage.saveHarvestOutput(cards, new Set());
      return {
        content: [{ type: "text", text: `Saved ${cards.length} card(s) to ${outputDir}.` }],
        structuredContent: { saved: cards.length, outputDir },
      };
    }

    case "list": {
      const storage = parsed.workspaceId
        ? await ctx.storage.withWorkspace(parsed.workspaceId)
        : ctx.storage;
      if (!(await storage.latestHarvestExists())) {
        return {
          content: [{ type: "text", text: "No harvest found. Fetch articles and save cards first." }],
          structuredContent: { error: "no_harvest" },
        };
      }
      const bundle = (await storage.loadLatestHarvest()) as Record<string, unknown>;
      const cards = (bundle.cards ?? []) as Array<Record<string, unknown>>;
      const curation = (bundle.curationState ?? {}) as Record<string, string>;
      let filtered = cards;
      if (parsed.minScore != null) {
        filtered = filtered.filter((c) => (c.relevanceScore as number) >= parsed.minScore!);
      }
      if (parsed.limit) filtered = filtered.slice(0, parsed.limit);
      const result = {
        generatedAt: bundle.generatedAt,
        total: cards.length,
        showing: filtered.length,
        cards: filtered.map((c) => ({
          id: c.id,
          title: c.title,
          source: c.source,
          relevanceScore: c.relevanceScore,
          thesis: c.thesis,
          trendTags: c.trendTags,
          curationStatus: curation[String(c.id)] ?? null,
        })),
      };
      return {
        content: [{ type: "text", text: `Showing ${result.showing} of ${result.total} card(s) from ${result.generatedAt}.${result.cards.slice(0, 5).map(c => `\n  [${c.id}] ${c.title} (score ${c.relevanceScore})${c.curationStatus ? ` [${c.curationStatus}]` : ""}`).join("")}${result.cards.length > 5 ? `\n  ... +${result.cards.length - 5} more` : ""}` }],
        structuredContent: result as Record<string, unknown>,
      };
    }

    case "get": {
      const storage = parsed.workspaceId
        ? await ctx.storage.withWorkspace(parsed.workspaceId)
        : ctx.storage;
      if (!(await storage.latestHarvestExists())) {
        return {
          content: [{ type: "text", text: "No harvest found." }],
          structuredContent: { error: "no_harvest" },
        };
      }
      const bundle = (await storage.loadLatestHarvest()) as Record<string, unknown>;
      const cards = (bundle.cards ?? []) as Array<Record<string, unknown>>;
      const card = cards.find((c) => c.id === parsed.cardId);
      if (!card) {
        return {
          content: [
            {
              type: "text",
              text: `Card #${parsed.cardId} not found. Available: ${cards.map((c) => c.id).join(", ")}.`,
            },
          ],
          structuredContent: { error: "not_found", cardId: parsed.cardId },
        };
      }
      return {
        content: [{ type: "text", text: `Card #${(card as Record<string, unknown>).id}: "${(card as Record<string, unknown>).title}". Source: ${(card as Record<string, unknown>).source}. Score: ${(card as Record<string, unknown>).relevanceScore}. Thesis: ${(card as Record<string, unknown>).thesis}. Tags: ${((card as Record<string, unknown>).trendTags as string[] ?? []).join(", ")}.` }],
        structuredContent: card as Record<string, unknown>,
      };
    }

    case "curate": {
      const storage = parsed.workspaceId
        ? await ctx.storage.withWorkspace(parsed.workspaceId)
        : ctx.storage;
      if (!(await storage.latestHarvestExists())) {
        return {
          content: [{ type: "text", text: "No harvest found. Save cards first." }],
          structuredContent: { error: "no_harvest" },
        };
      }
      const bundle = (await storage.loadLatestHarvest()) as Record<string, unknown>;
      const cards = (bundle.cards ?? []) as Array<Record<string, unknown>>;
      const card = cards.find((c) => c.id === parsed.cardId);
      if (!card) {
        return {
          content: [
            {
              type: "text",
              text: `Card #${parsed.cardId} not found. Available: ${cards.map((c) => c.id).join(", ")}.`,
            },
          ],
          structuredContent: { error: "not_found", cardId: parsed.cardId },
        };
      }
      const key = String(parsed.cardId);
      if (parsed.status === "clear") {
        const cleared = { ...((bundle.curationState ?? {}) as Record<string, string>) };
        delete cleared[key];
        await storage.saveCurationState(cleared as Record<string, "shortlisted" | "skipped">);
      } else {
        const statusMap: Record<"shortlist" | "skip", "shortlisted" | "skipped"> = {
          shortlist: "shortlisted",
          skip: "skipped",
        };
        await storage.saveCurationState({ [key]: statusMap[parsed.status] });
      }
      const newStatus =
        parsed.status === "clear"
          ? "cleared"
          : parsed.status === "shortlist"
            ? "shortlisted"
            : "skipped";
      return {
        content: [
          {
            type: "text",
            text: `Card #${parsed.cardId} "${card.title as string}" — status set to ${newStatus}.`,
          },
        ],
        structuredContent: { cardId: parsed.cardId, title: card.title, status: newStatus },
      };
    }

    case "generate_post": {
      if (!(await ctx.storage.latestHarvestExists())) {
        return {
          content: [{ type: "text", text: "No Briefing is available for this workspace yet. Refresh Quillby first." }],
          structuredContent: { error: "no_harvest" },
        };
      }
      if (!(await ctx.storage.contextExists())) {
        return {
          content: [{ type: "text", text: "No context saved for this workspace yet. Set up Quillby first." }],
          structuredContent: { error: "no_context" },
        };
      }
      const samplingAvailable = !!(ctx.server.server.getClientCapabilities()?.sampling);
      const bundle = (await ctx.storage.loadLatestHarvest()) as Record<string, unknown>;
      const cards = (bundle.cards ?? []) as Array<Record<string, unknown>>;
      const userCtx = (await ctx.storage.loadContext()) as Record<string, unknown>;
      const platforms = (userCtx.platforms as string[] | undefined) ?? [];
      const genPlatform = parsed.platform ?? platforms[0] ?? "linkedin";

      let genCardId = parsed.cardId;
      if (genCardId == null) {
        const curation = (bundle.curationState ?? {}) as Record<string, string>;
        const sorted = [...cards].sort(
          (a, b) => ((b.relevanceScore as number) ?? 0) - ((a.relevanceScore as number) ?? 0),
        );
        const shortlisted = sorted.find((c) => curation[String(c.id)] === "shortlisted");
        const picked = shortlisted ?? sorted[0];
        if (!picked) {
          return {
            content: [{ type: "text", text: "No cards available. Refresh the Briefing first." }],
            structuredContent: { error: "no_cards" },
          };
        }
        genCardId = picked.id as number;
      }

      const genCard = cards.find((c) => c.id === genCardId);
      if (!genCard) {
        return {
          content: [
            {
              type: "text",
              text: `Card #${genCardId} not found. Available: ${cards.map((c) => c.id).join(", ")}.`,
            },
          ],
          structuredContent: { error: "not_found", cardId: genCardId },
        };
      }

      const typedMemory = await ctx.storage.loadTypedMemory();
      const guide = PLATFORM_GUIDES[genPlatform];
      if (!guide) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown platform: "${genPlatform}". Available: ${Object.keys(PLATFORM_GUIDES).join(", ")}.`,
            },
          ],
          structuredContent: { error: "unknown_platform", platform: genPlatform },
        };
      }

      const chosenAngle = parsed.angle ?? (genCard.angleOptions as string[] | undefined)?.[0] ?? (genCard.thesis as string);
      const voiceExamples = (typedMemory as Record<string, string[]> | null)?.voiceExamples ?? [];
      const voiceBlock = voiceExamples.length
        ? `Voice examples — read these carefully. Match the register, rhythm, and vocabulary exactly. Oversteer on the strongest quirks:\n${voiceExamples.map((e, i) => `[${i + 1}]\n${e}`).join("\n\n")}`
        : `Voice description: ${(userCtx.voice as string) ?? "direct and authentic"}`;

      const generatePrompt = `You are writing a ${genPlatform} post for ${(userCtx.name as string) ?? "a content creator"} — a ${userCtx.role as string} in ${(userCtx.industry as string) ?? "their industry"}.

## User profile
${contextToPromptText(userCtx as UserContext, typedMemory as TypedMemory)
  .split("\n")
  .map((line) => `- ${line}`)
  .join("\n")}

## ${voiceBlock}

## Source card
Title: ${genCard.title as string}
Thesis: ${genCard.thesis as string}
Angle to use: ${chosenAngle}
Key insights: ${((genCard.keyInsights as string[]) ?? []).join(" | ")}
Trend tags: ${((genCard.trendTags as string[]) ?? []).join(", ")}
Transposability hint: ${(genCard.transposabilityHint as string) ?? ""}
Hook options (pick the best or write a stronger one): ${((genCard.hookOptions as string[]) ?? []).join(" | ")}

## Platform guide
${guide}

## Absolute rules — any violation produces an unusable draft
- NEVER use: "It's not X, it's Y" contrasts, em-dash clusters (1 max per post), bullet lists masquerading as prose
- NEVER use these words: "game-changer", "transformative", "innovative", "powerful", "exciting", "impactful", "leverage", "unlock", "dive into"
- NEVER use filler openers: "In today's world", "In an era of", "Let's talk about", "Here's the thing:", "The truth is:"
- NEVER use rhetorical question openers that give away the answer
- NEVER use motivational closings: "Remember: X matters", "Don't forget to X"
- NEVER smooth out the rough edges — the rough edges are the voice
- Write the post only. No intro sentence, no commentary, no "Here is the post:".`;

      if (!samplingAvailable) {
        return {
          content: [
            {
              type: "text",
              text: `${generatePrompt}\n\n---\nWrite the post above, then call save_draft with content="<your post>", platform="${genPlatform}", cardId=${genCardId}.`,
            },
          ],
          structuredContent: { deferred: true, platform: genPlatform, cardId: genCardId },
        };
      }
      const draftResult = await ctx.sample(generatePrompt, 2000);
      if (!draftResult.ok) {
        return {
          content: [
            {
              type: "text",
              text: `${generatePrompt}\n\n---\nWrite the post above, then call save_draft with content="<your post>", platform="${genPlatform}", cardId=${genCardId}.`,
            },
          ],
          structuredContent: { deferred: true, platform: genPlatform, cardId: genCardId },
        };
      }
      const draftPath = await ctx.storage.saveDraft(draftResult.text.trim(), genPlatform, genCardId);
      const result = {
        platform: genPlatform,
        cardId: genCardId,
        angle: chosenAngle,
        savedTo: draftPath,
        draft: draftResult.text.trim(),
      };
      return {
        content: [{ type: "text", text: `Draft generated for ${result.platform} (card #${result.cardId}, angle: "${result.angle}"). Saved to ${result.savedTo}.\n\n${result.draft}` }],
        structuredContent: result,
      };
    }
  }
}
