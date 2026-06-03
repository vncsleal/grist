import { z } from "zod";
import type { ToolContext } from "./index.js";
import type { TypedMemory } from "@quillby/core";

const MEMORY_TYPES = ["voice_examples", "style_rules", "audience_insights", "do_not_say", "successful_posts", "campaign_context", "source_preferences", "visual_style", "voice_profile", "face_profile"] as const;
const MEMORY_MAP: Record<string, keyof TypedMemory> = { voice_examples: "voiceExamples", style_rules: "styleRules", audience_insights: "audienceInsights", do_not_say: "doNotSay", successful_posts: "successfulPosts", campaign_context: "campaignContext", source_preferences: "sourcePreferences", visual_style: "visualStyle", voice_profile: "voiceProfile", face_profile: "faceProfile" };

const MemorySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), entries: z.array(z.string()), memoryType: z.enum(MEMORY_TYPES).default("voice_examples"), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("get"), memoryType: z.enum(MEMORY_TYPES).optional(), workspaceId: z.string().optional() }),
]);

export const tool = {
  name: "memory" as const,
  description: "Manage typed memory — save editorial rules, voice examples, and audience insights, or retrieve stored memory.",
  inputSchema: MemorySchema,
};

export async function handleTool(raw: unknown, ctx: ToolContext) {
  const parsed = MemorySchema.parse(raw);
  const storage = parsed.workspaceId ? await ctx.storage.withWorkspace(parsed.workspaceId) : ctx.storage;

  if (parsed.action === "save") {
    const resolvedType = MEMORY_MAP[parsed.memoryType] ?? "voiceExamples";
    await storage.appendTypedMemory(resolvedType, parsed.entries, resolvedType === "voiceExamples" ? 10 : undefined);
    const ws = await storage.getCurrentWorkspace();
    return { content: [{ type: "text" as const, text: `Added ${parsed.entries.length} item(s) to ${parsed.memoryType} in workspace "${ws.name}".` }], structuredContent: { added: parsed.entries.length, memoryType: parsed.memoryType, workspaceId: ws.id } };
  }

  if (parsed.action === "get") {
    const typedMemory = (await storage.loadTypedMemory()) ?? {} as Record<string, string[]>;
    const ws = await storage.getCurrentWorkspace();
    if (!parsed.memoryType) return { content: [{ type: "text" as const, text: `Memory for workspace "${ws.name}": ${Object.entries(typedMemory ?? {}).map(([key, entries]) => `${key}: ${(entries as string[]).length} item(s)`).join(", ")}.` }], structuredContent: { workspace: ws, memory: typedMemory } };
    const bucket = MEMORY_MAP[parsed.memoryType] ?? "voiceExamples";
    return { content: [{ type: "text" as const, text: `Memory "${parsed.memoryType}" for workspace "${ws.name}": ${(typedMemory[bucket as keyof typeof typedMemory] as string[] ?? []).length} item(s).` }], structuredContent: { workspace: ws, memoryType: parsed.memoryType, entries: typedMemory[bucket as keyof typeof typedMemory] } };
  }
  return { content: [{ type: "text" as const, text: "Unknown action" }], isError: true };
}
