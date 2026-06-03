import { z } from "zod";
import type { ToolContext } from "./index.js";

const DraftsSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), content: z.string(), platform: z.string(), cardId: z.number().optional(), addToVoiceExamples: z.boolean().optional(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("list"), workspaceId: z.string().optional() }),
]);

export const tool = {
  name: "drafts" as const,
  description: "Manage draft posts — save a finished draft or list all saved drafts.",
  inputSchema: DraftsSchema,
};

export async function handleTool(raw: unknown, ctx: ToolContext) {
  const parsed = DraftsSchema.parse(raw);
  const storage = parsed.workspaceId ? await ctx.storage.withWorkspace(parsed.workspaceId) : ctx.storage;

  switch (parsed.action) {
    case "save": {
      const filePath = await storage.saveDraft(parsed.content, parsed.platform, parsed.cardId);
      if (parsed.addToVoiceExamples) await storage.appendTypedMemory("voiceExamples", [parsed.content], 10);
      return {
        content: [{ type: "text" as const, text: parsed.addToVoiceExamples ? `Draft saved to ${filePath}. Added to voice memory.` : `Draft saved to ${filePath}.` }],
        structuredContent: { saved: true, platform: parsed.platform, filePath, voiceExampleAdded: parsed.addToVoiceExamples ?? false },
      };
    }
    case "list": {
      const drafts = await storage.listDrafts();
      return {
        content: [{ type: "text" as const, text: drafts.length ? `${drafts.length} draft(s) saved.${(drafts as Array<Record<string, unknown>>).slice(0, 5).map(d => `\n  [${d.platform ?? "?"}] ${(d.content as string ?? "").slice(0, 60)}${(d.content as string ?? "").length > 60 ? "…" : ""}`).join("")}${drafts.length > 5 ? `\n  … and ${drafts.length - 5} more` : ""}` : "No saved drafts for this workspace yet." }],
        structuredContent: { count: drafts.length, drafts },
      };
    }
  }
}
