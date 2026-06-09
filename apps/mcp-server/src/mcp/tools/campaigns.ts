import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext, ToolResult, FullStorage } from "./index.js";
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
  "campaign_stage_complete",
  "campaign_stage_fail",
  "campaign_stage_retry",
  "campaign_blueprint_create",
  "campaign_blueprint_list",
  "campaign_list",
]);

const _StageConfigArray = StageConfigSchema.array();
type _StageConfigList = z.infer<typeof _StageConfigArray>;

const CampaignCreateArgsSchema = z.object({
  name: z.string().min(1),
  blueprintId: z.string().optional(),
  blueprint: _StageConfigArray.optional() as z.ZodType<_StageConfigList | undefined>,
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

const CampaignStageCompleteArgsSchema = z.object({
  campaignId: z.string().min(1),
  stageName: z.string().min(1),
  workspaceId: z.string().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
});

const CampaignStageFailArgsSchema = z.object({
  campaignId: z.string().min(1),
  stageName: z.string().min(1),
  error: z.string().optional(),
  workspaceId: z.string().optional(),
});

const CampaignStageRetryArgsSchema = z.object({
  campaignId: z.string().min(1),
  stageName: z.string().min(1),
  workspaceId: z.string().optional(),
});

type _CampaignStatus = z.infer<typeof CampaignStatusSchema>;

const CampaignBlueprintCreateArgsSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  stages: z.array(StageConfigSchema).min(1) as z.ZodType<_StageConfigList>,
  tags: z.array(z.string()).optional(),
  workspaceId: z.string().optional(),
});

const CampaignBlueprintListArgsSchema = z.object({
  workspaceId: z.string().optional(),
});

const CampaignListArgsSchema = z.object({
  status: CampaignStatusSchema.optional() as z.ZodType<_CampaignStatus | undefined>,
  workspaceId: z.string().optional(),
});

async function resolveStore(ctx: ToolContext, workspaceId?: string): Promise<FullStorage> {
  const store = workspaceId ? await ctx.storage.withWorkspace(workspaceId) : ctx.storage;
  if (typeof store.createCampaign !== "function") {
    throw new Error("Campaign operations not supported by this storage backend");
  }
  return store;
}

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
    description: "Start a campaign. Sets all stages to pending and activates the campaign. Stages must be executed manually — check campaign_status for ready stages, run the appropriate tool for each, then call campaign_stage_complete when done.",
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
    description: "Get the full state of a campaign: status, stage progress, execution logs, and which stages are ready to run.",
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
    name: "campaign_stage_complete",
    description: "Mark a campaign stage as completed. Use after successfully running the stage's tool. Campaign status auto-updates when all stages are done.",
    annotations: { idempotentHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID" },
        stageName: { type: "string", description: "Stage name to mark complete" },
        workspaceId: { type: "string", description: "Optional workspace override" },
        result: { type: "object", description: "Optional result data from the tool call" },
      },
      required: ["campaignId", "stageName"],
    },
  },
  {
    name: "campaign_stage_fail",
    description: "Mark a campaign stage as failed. Provide an error description. Use campaign_stage_retry to retry if retries remain.",
    annotations: { idempotentHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID" },
        stageName: { type: "string", description: "Stage name to mark failed" },
        error: { type: "string", description: "Description of the error" },
        workspaceId: { type: "string", description: "Optional workspace override" },
      },
      required: ["campaignId", "stageName"],
    },
  },
  {
    name: "campaign_stage_retry",
    description: "Reset a failed stage to pending for retry. Increments the retry attempt counter.",
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
    description: "List all saved campaign blueprints for the current (or specified) workspace.",
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
    case "campaign_stage_complete":
      return handleStageComplete(args, ctx);
    case "campaign_stage_fail":
      return handleStageFail(args, ctx);
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

async function handleCreate(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignCreateArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { name, blueprintId, blueprint, workspaceId: inputWorkspaceId } = parsed.data;
  const store = await resolveStore(ctx, inputWorkspaceId);
  const now = new Date().toISOString();
  const wsId = inputWorkspaceId || (await ctx.storage.getCurrentWorkspaceId());

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

  const id = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const existing = await store.loadCampaign(id);
  if (existing) {
    return { content: [{ type: "text", text: "ID collision — try again." }], isError: true };
  }

  const campaign: CampaignType = {
    id,
    workspaceId: wsId,
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
    content: [{ type: "text", text: `Created campaign "${name}" (${id}) with ${stages.length} stages.` }],
    structuredContent: { campaign },
  };
}

async function handleStart(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignStartArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { campaignId, workspaceId } = parsed.data;
  const store = await resolveStore(ctx, workspaceId);

  const campaign = await store.loadCampaign(campaignId);
  if (!campaign) {
    return { content: [{ type: "text", text: `Campaign "${campaignId}" not found.` }], isError: true };
  }

  if (campaign.status !== "planning" && campaign.status !== "paused" && campaign.status !== "failed") {
    return { content: [{ type: "text", text: `Cannot start campaign in "${campaign.status}" state.` }], isError: true };
  }

  const now = new Date().toISOString();
  const updated: CampaignType = {
    ...campaign,
    executions: initialExecutionLogs(campaign.stages),
    status: "active",
    startedAt: campaign.startedAt ?? now,
    updatedAt: now,
  };

  await store.updateCampaign(campaignId, {
    status: updated.status,
    executions: updated.executions,
    startedAt: updated.startedAt,
    updatedAt: updated.updatedAt,
  });

  return {
    content: [{ type: "text", text: `Campaign "${campaign.name}" started. Stages: ${campaign.stages.length}. Use campaign_status to see ready stages, then run each stage's tool and mark complete with campaign_stage_complete.` }],
    structuredContent: { campaignId, status: "active", stageCount: campaign.stages.length },
  };
}

async function handleStatus(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignStatusArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { campaignId, workspaceId } = parsed.data;
  const store = await resolveStore(ctx, workspaceId);

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

  const { campaignId, workspaceId } = parsed.data;
  const store = await resolveStore(ctx, workspaceId);

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

async function handleStageComplete(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignStageCompleteArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { campaignId, stageName, workspaceId, result } = parsed.data;
  const store = await resolveStore(ctx, workspaceId);

  const campaign = await store.loadCampaign(campaignId);
  if (!campaign) {
    return { content: [{ type: "text", text: `Campaign "${campaignId}" not found.` }], isError: true };
  }

  const stageExists = campaign.stages.some((s) => s.name === stageName);
  if (!stageExists) {
    return { content: [{ type: "text", text: `Stage "${stageName}" not found in campaign.` }], isError: true };
  }

  const updated = transitionStage(campaign, stageName, "completed", { result });
  await store.updateCampaign(campaignId, {
    status: updated.status,
    executions: updated.executions,
    completedAt: updated.completedAt,
    updatedAt: updated.updatedAt,
  });

  const statusText = updated.status === "completed"
    ? "All stages complete — campaign finished!"
    : `Stage "${stageName}" completed. ${getNextStagesCount(updated)} stages ready.`;

  return {
    content: [{ type: "text", text: statusText }],
    structuredContent: { campaignId, stageName, status: "completed", campaign: updated },
  };
}

async function handleStageFail(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignStageFailArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { campaignId, stageName, error, workspaceId } = parsed.data;
  const store = await resolveStore(ctx, workspaceId);

  const campaign = await store.loadCampaign(campaignId);
  if (!campaign) {
    return { content: [{ type: "text", text: `Campaign "${campaignId}" not found.` }], isError: true };
  }

  const stageExists = campaign.stages.some((s) => s.name === stageName);
  if (!stageExists) {
    return { content: [{ type: "text", text: `Stage "${stageName}" not found in campaign.` }], isError: true };
  }

  const updated = transitionStage(campaign, stageName, "failed", { error: error ?? "Unknown error" });
  await store.updateCampaign(campaignId, {
    status: updated.status,
    executions: updated.executions,
    error: updated.error,
    updatedAt: updated.updatedAt,
  });

  const retryAvailable = canRetryStage(campaign, stageName);

  return {
    content: [{ type: "text", text: `Stage "${stageName}" failed.${retryAvailable ? " Use campaign_stage_retry to retry." : ""}${updated.status === "failed" ? " Campaign failed." : ""}` }],
    structuredContent: { campaignId, stageName, status: "failed", error: error ?? "Unknown error", retryAvailable, campaign: updated },
  };
}

async function handleStageRetry(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignStageRetryArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { campaignId, stageName, workspaceId } = parsed.data;
  const store = await resolveStore(ctx, workspaceId);

  const campaign = await store.loadCampaign(campaignId);
  if (!campaign) {
    return { content: [{ type: "text", text: `Campaign "${campaignId}" not found.` }], isError: true };
  }

  if (!canRetryStage(campaign, stageName)) {
    return { content: [{ type: "text", text: `Stage "${stageName}" cannot be retried (not failed or retries exhausted).` }], isError: true };
  }

  const stage = campaign.stages.find((s) => s.name === stageName)!;
  const existingExecution = campaign.executions.find((e) => e.stageName === stageName)!;
  const nextRetryAttempt = (existingExecution.retryAttempt ?? 0) + 1;

  const updated = transitionStage(campaign, stageName, "pending", { error: undefined });
  const finalExecutions = updated.executions.map((e) =>
    e.stageName === stageName ? { ...e, retryAttempt: nextRetryAttempt } : e,
  );
  const finalStatus = campaign.status === "failed" ? "active" : updated.status;

  await store.updateCampaign(campaignId, {
    status: finalStatus,
    executions: finalExecutions,
    error: undefined,
    updatedAt: new Date().toISOString(),
  });

  return {
    content: [{ type: "text", text: `Stage "${stageName}" reset for retry (attempt ${nextRetryAttempt}/${stage.retryCount + 1}).` }],
    structuredContent: { campaignId, stageName, retryAttempt: nextRetryAttempt, maxRetries: stage.retryCount },
  };
}

async function handleBlueprintCreate(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = CampaignBlueprintCreateArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { name, description, stages, tags, workspaceId } = parsed.data;
  const store = await resolveStore(ctx, workspaceId);
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
  const parsed = CampaignBlueprintListArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }], isError: true };
  }

  const { workspaceId } = parsed.data;
  const store = await resolveStore(ctx, workspaceId);

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

  const { status, workspaceId } = parsed.data;
  const store = await resolveStore(ctx, workspaceId);

  const campaigns = await store.listCampaigns(status);
  const summary = campaigns.map((c) => `  ${c.id}: ${c.name} [${c.status}] (${c.stages.length} stages)`).join("\n");

  return {
    content: [{ type: "text", text: campaigns.length === 0 ? "No campaigns found." : `Campaigns:\n${summary}` }],
    structuredContent: { campaigns },
  };
}

function getNextStages(campaign: CampaignType): CampaignType["stages"] {
  return campaign.stages.filter((stage) => {
    const execution = campaign.executions.find((e) => e.stageName === stage.name);
    if (execution && (execution.status === "running" || execution.status === "completed" || execution.status === "skipped")) return false;
    if (execution && execution.status === "failed") return false;
    return stage.dependsOn.every((dep) => {
      const depExec = campaign.executions.find((e) => e.stageName === dep);
      return depExec && (depExec.status === "completed" || depExec.status === "skipped");
    });
  });
}

function getNextStagesCount(campaign: CampaignType): number {
  return getNextStages(campaign).length;
}
