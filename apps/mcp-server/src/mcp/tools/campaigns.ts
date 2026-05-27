import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext, ToolResult } from "./index.js";
import type { CampaignStore } from "@quillby/workspace";
import {
  CampaignSchema,
  BlueprintSchema,
  CampaignStatusSchema,
  StageConfigSchema,
  initialExecutionLogs,
  transitionStage,
  canRetryStage,
  type Campaign as CampaignType,
  type Blueprint as BlueprintType,
} from "@quillby/content";

export const CAMPAIGN_TOOL_NAMES = new Set<string>([
  "campaign_create",
  "campaign_start",
  "campaign_status",
  "campaign_pause",
  "campaign_stage_retry",
  "campaign_blueprint_create",
  "campaign_blueprint_list",
  "campaign_list",
]);

const CampaignCreateArgsSchema = z.object({
  name: z.string().min(1),
  blueprintId: z.string().optional(),
  blueprint: StageConfigSchema.array().optional(),
  workspaceId: z.string().optional(),
});

const CampaignStartArgsSchema = z.object({
  campaignId: z.string().min(1),
  workspaceId: z.string().optional(),
});

const CampaignStatusArgsSchema = z.object({
  campaignId: z.string().min(1),
  workspaceId: z.string().optional(),
});

const CampaignPauseArgsSchema = z.object({
  campaignId: z.string().min(1),
  workspaceId: z.string().optional(),
});

const CampaignStageRetryArgsSchema = z.object({
  campaignId: z.string().min(1),
  stageName: z.string().min(1),
  workspaceId: z.string().optional(),
});

const CampaignBlueprintCreateArgsSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  stages: z.array(StageConfigSchema).min(1),
  tags: z.array(z.string()).optional(),
  workspaceId: z.string().optional(),
});

const CampaignListArgsSchema = z.object({
  status: CampaignStatusSchema.optional(),
  workspaceId: z.string().optional(),
});

export const campaignToolDefinitions: Tool[] = [
  {
    name: "campaign_create",
    description: "Create a new campaign from a saved blueprint or inline stage definitions.",
    annotations: { idempotentHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Campaign name" },
        blueprintId: { type: "string", description: "ID of a saved blueprint" },
        blueprint: { type: "array", items: { type: "object" }, description: "Inline stage definitions (alternative to blueprintId)" },
        workspaceId: { type: "string", description: "Optional workspace override" },
      },
      required: ["name"],
    },
  },
  {
    name: "campaign_start",
    description: "Start executing a campaign. Kicks off all stages whose dependencies are met.",
    annotations: { idempotentHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID" },
        workspaceId: { type: "string", description: "Optional workspace override" },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "campaign_status",
    description: "Get the full state of a campaign: status, stage progress, execution logs.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID" },
        workspaceId: { type: "string", description: "Optional workspace override" },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "campaign_pause",
    description: "Pause an active campaign. Running stages complete before the pause takes effect.",
    annotations: { idempotentHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID" },
        workspaceId: { type: "string", description: "Optional workspace override" },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "campaign_stage_retry",
    description: "Retry a failed stage in a campaign. Only works if retries remain.",
    annotations: { idempotentHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID" },
        stageName: { type: "string", description: "Stage name to retry" },
        workspaceId: { type: "string", description: "Optional workspace override" },
      },
      required: ["campaignId", "stageName"],
    },
  },
  {
    name: "campaign_blueprint_create",
    description: "Save a campaign blueprint for reuse. Blueprints define the stage pipeline.",
    annotations: { idempotentHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Blueprint name" },
        description: { type: "string", description: "Optional description" },
        stages: { type: "array", items: { type: "object" }, description: "Stage configurations" },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
        workspaceId: { type: "string", description: "Optional workspace override" },
      },
      required: ["name", "stages"],
    },
  },
  {
    name: "campaign_blueprint_list",
    description: "List all saved campaign blueprints.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override" },
      },
    },
  },
  {
    name: "campaign_list",
    description: "List campaigns, optionally filtered by status.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["planning", "active", "paused", "completed", "failed"], description: "Optional status filter" },
        workspaceId: { type: "string", description: "Optional workspace override" },
      },
    },
  },
];

function storeFromCtx(ctx: ToolContext): CampaignStore {
  return ctx.storage as unknown as CampaignStore;
}

async function handleCreate(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignCreateArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { name, blueprintId, blueprint, workspaceId: inputWs } = parsed.data;
  const workspaceId = inputWs || (await ctx.storage.getCurrentWorkspaceId());
  const store = storeFromCtx(ctx);
  const now = new Date().toISOString();

  let stages = blueprint;
  if (blueprintId) {
    const saved = await store.loadBlueprint(blueprintId);
    if (!saved) {
      return { content: [{ type: "text", text: `Blueprint "${blueprintId}" not found.` }], isError: true };
    }
    stages = saved.stages;
  }

  if (!stages) {
    return { content: [{ type: "text", text: "Provide either blueprintId or blueprint (inline stage definitions)." }], isError: true };
  }

  const campaign: CampaignType = {
    id: `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    blueprintId: blueprintId ?? "",
    name,
    status: "planning",
    stages,
    executions: initialExecutionLogs(stages),
    createdAt: now,
    updatedAt: now,
  };

  CampaignSchema.parse(campaign);
  await store.createCampaign(campaign);

  return {
    content: [{ type: "text", text: `Created campaign "${name}" (${campaign.id}) with ${stages.length} stages.` }],
    structuredContent: { campaign },
  };
}

async function handleStart(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignStartArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { campaignId } = parsed.data;
  const store = storeFromCtx(ctx);

  const campaign = await store.loadCampaign(campaignId);
  if (!campaign) {
    return { content: [{ type: "text", text: `Campaign "${campaignId}" not found.` }], isError: true };
  }

  if (campaign.status !== "planning" && campaign.status !== "paused" && campaign.status !== "failed") {
    return { content: [{ type: "text", text: `Cannot start campaign in "${campaign.status}" state.` }], isError: true };
  }

  const updated = transitionStage(campaign, campaign.stages[0]?.name ?? "", "pending" as const);
  updated.status = "active";
  updated.updatedAt = new Date().toISOString();
  updated.startedAt = updated.startedAt ?? new Date().toISOString();
  await store.updateCampaign(campaignId, { status: "active", startedAt: updated.startedAt, updatedAt: updated.updatedAt });

  return {
    content: [{ type: "text", text: `Campaign "${campaign.name}" started. ${campaign.stages.length} stages.` }],
    structuredContent: { campaignId, status: "active", stageCount: campaign.stages.length },
  };
}

async function handleStatus(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignStatusArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { campaignId } = parsed.data;
  const store = storeFromCtx(ctx);

  const campaign = await store.loadCampaign(campaignId);
  if (!campaign) {
    return { content: [{ type: "text", text: `Campaign "${campaignId}" not found.` }], isError: true };
  }

  const summary = campaign.executions.map((e) =>
    `  ${e.stageName}: ${e.status}${e.error ? ` (${e.error})` : ""}${e.retryAttempt && e.retryAttempt > 0 ? ` [retry ${e.retryAttempt}]` : ""}`
  ).join("\n");

  return {
    content: [{
      type: "text",
      text: [
        `Campaign: ${campaign.name}`,
        `Status: ${campaign.status}`,
        `Stages: ${campaign.stages.length}`,
        campaign.startedAt ? `Started: ${campaign.startedAt}` : "",
        campaign.completedAt ? `Completed: ${campaign.completedAt}` : "",
        "",
        `--- Execution Log ---`,
        summary,
      ].filter(Boolean).join("\n"),
    }],
    structuredContent: { campaign },
  };
}

async function handlePause(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignPauseArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { campaignId } = parsed.data;
  const store = storeFromCtx(ctx);

  const campaign = await store.loadCampaign(campaignId);
  if (!campaign) {
    return { content: [{ type: "text", text: `Campaign "${campaignId}" not found.` }], isError: true };
  }

  if (campaign.status !== "active") {
    return { content: [{ type: "text", text: `Cannot pause campaign in "${campaign.status}" state.` }], isError: true };
  }

  await store.updateCampaign(campaignId, { status: "paused", updatedAt: new Date().toISOString() });

  return {
    content: [{ type: "text", text: `Campaign "${campaign.name}" paused.` }],
    structuredContent: { campaignId, status: "paused" },
  };
}

async function handleStageRetry(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignStageRetryArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { campaignId, stageName } = parsed.data;
  const store = storeFromCtx(ctx);

  const campaign = await store.loadCampaign(campaignId);
  if (!campaign) {
    return { content: [{ type: "text", text: `Campaign "${campaignId}" not found.` }], isError: true };
  }

  if (!canRetryStage(campaign, stageName)) {
    return { content: [{ type: "text", text: `Stage "${stageName}" cannot be retried (not failed or retries exhausted).` }], isError: true };
  }

  const updated = transitionStage(campaign, stageName, "pending", { error: undefined });
  const execution = updated.executions.find((e) => e.stageName === stageName);
  if (execution) execution.retryAttempt = (execution.retryAttempt ?? 0) + 1;

  updated.status = "active";
  await store.updateCampaign(campaignId, {
    status: "active",
    executions: updated.executions,
    updatedAt: new Date().toISOString(),
  });

  return {
    content: [{ type: "text", text: `Stage "${stageName}" queued for retry (attempt ${execution?.retryAttempt ?? 1}).` }],
    structuredContent: { campaignId, stageName, retryAttempt: execution?.retryAttempt ?? 1 },
  };
}

async function handleBlueprintCreate(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignBlueprintCreateArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { name, description, stages, tags } = parsed.data;
  const store = storeFromCtx(ctx);
  const now = new Date().toISOString();

  const blueprint: BlueprintType = {
    id: `bp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: description ?? "",
    stages,
    tags: tags ?? [],
    createdAt: now,
    updatedAt: now,
  };

  BlueprintSchema.parse(blueprint);
  await store.saveBlueprint(blueprint);

  return {
    content: [{ type: "text", text: `Saved blueprint "${name}" (${blueprint.id}) with ${stages.length} stages.` }],
    structuredContent: { blueprint },
  };
}

async function handleBlueprintList(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const store = storeFromCtx(ctx);

  const blueprints = await store.listBlueprints();
  const summary = blueprints.map((b) => `  ${b.id}: ${b.name} (${b.stages.length} stages)`).join("\n");

  return {
    content: [{ type: "text", text: blueprints.length === 0 ? "No blueprints saved." : `Saved blueprints:\n${summary}` }],
    structuredContent: { blueprints },
  };
}

async function handleList(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignListArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { status } = parsed.data;
  const store = storeFromCtx(ctx);

  const campaigns = await store.listCampaigns(status);
  const summary = campaigns.map((c) => `  ${c.id}: ${c.name} [${c.status}] (${c.stages.length} stages)`).join("\n");

  return {
    content: [{ type: "text", text: campaigns.length === 0 ? "No campaigns found." : `Campaigns:\n${summary}` }],
    structuredContent: { campaigns },
  };
}

export async function handleCampaignTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case "campaign_create":
      return handleCreate(args, ctx);
    case "campaign_start":
      return handleStart(args, ctx);
    case "campaign_status":
      return handleStatus(args, ctx);
    case "campaign_pause":
      return handlePause(args, ctx);
    case "campaign_stage_retry":
      return handleStageRetry(args, ctx);
    case "campaign_blueprint_create":
      return handleBlueprintCreate(args, ctx);
    case "campaign_blueprint_list":
      return handleBlueprintList(args, ctx);
    case "campaign_list":
      return handleList(args, ctx);
    default:
      return { content: [{ type: "text", text: `Unknown campaign tool: ${name}` }], isError: true };
  }
}
