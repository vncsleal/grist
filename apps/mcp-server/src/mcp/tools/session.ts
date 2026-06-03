import { z } from "zod";
import type { ToolContext } from "./index.js";
import { handleSessionStart, handleSessionStatus, handleSessionClose } from "../sessions.js";

const SessionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), goal: z.string(), type: z.enum(["campaign", "plan", "task", "freeform"]).optional(), constraints: z.array(z.string()).optional(), campaignId: z.string().optional(), planId: z.string().optional(), taskId: z.string().optional(), tokenBudget: z.number().optional(), template: z.enum(["weekly_linkedin", "daily_brief", "campaign_review"]).optional(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("get"), sessionId: z.string().optional(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("close"), summary: z.string().optional(), workspaceId: z.string().optional() }),
]);

export const tool = {
  name: "session" as const,
  description: "Manage Quillby content sessions — start a scoped session, check status, or close the current session.",
  inputSchema: SessionSchema,
};

export async function handleTool(raw: unknown, ctx: ToolContext) {
  const parsed = SessionSchema.parse(raw);
  const args = { ...parsed, workspaceId: parsed.workspaceId } as Record<string, unknown>;

  switch (parsed.action) {
    case "start": return handleSessionStart(ctx.storage, ctx.storage, args);
    case "get": return handleSessionStatus(ctx.storage, ctx.storage, args);
    case "close": return handleSessionClose(ctx.storage, ctx.storage, args);
  }

}
