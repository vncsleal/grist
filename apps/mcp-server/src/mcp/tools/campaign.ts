import { z } from "zod";
import type { ToolContext } from "./index.js";
import { handleCampaignTool } from "./campaigns.js";

const CampaignSchema = z.discriminatedUnion("action" as never, [
  z.object({ action: z.literal("create"), name: z.string(), blueprintId: z.string().optional(), blueprint: z.array(z.record(z.unknown())).optional(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("start"), campaignId: z.string(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("pause"), campaignId: z.string(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("get"), campaignId: z.string(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("list"), status: z.enum(["planning","active","paused","completed","failed"]).optional(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("create_blueprint"), name: z.string(), description: z.string().optional(), stages: z.array(z.record(z.unknown())), tags: z.array(z.string()).optional(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("list_blueprints"), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("complete_stage"), campaignId: z.string(), stageName: z.string(), workspaceId: z.string().optional(), result: z.record(z.unknown()).optional() }),
  z.object({ action: z.literal("fail_stage"), campaignId: z.string(), stageName: z.string(), error: z.string().optional(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("retry_stage"), campaignId: z.string(), stageName: z.string(), workspaceId: z.string().optional() }),
]);

// Map actions to old tool names and delegate to existing handler
const actionToOldName: Record<string, string> = {
  create: "campaign_create", start: "campaign_start", pause: "campaign_pause",
  get: "campaign_status", list: "campaign_list",
  create_blueprint: "campaign_blueprint_create", list_blueprints: "campaign_blueprint_list",
  complete_stage: "campaign_stage_complete", fail_stage: "campaign_stage_fail",
  retry_stage: "campaign_stage_retry",
};

export const tool = { name: "campaign" as const, description: "Manage content campaigns — create, start, pause, track, blueprints, stages.", inputSchema: CampaignSchema };

export async function handleTool(raw: unknown, ctx: ToolContext) {
  const parsed = CampaignSchema.parse(raw);
  const oldName = actionToOldName[parsed.action];
  const { workspaceId: ws, ...rest } = parsed as Record<string, unknown>;
  const args = ws ? { ...rest, workspaceId: ws } : rest;
  return handleCampaignTool(oldName, args as Record<string, unknown>, ctx);
}
