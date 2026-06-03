import { z } from "zod";
import type { ToolContext, ToolResult, FullStorage } from "./index.js";
import {
  handlePlanCreate,
  handlePlanList,
  handlePlanToday,
  handleTaskCreate,
  handleTaskMove,
  handleTaskDelete,
  handleCalendar,
} from "../planning.js";

const PlanningSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_plan"), name: z.string(), description: z.string().optional(), dateStart: z.string().optional(), dateEnd: z.string().optional(), tags: z.array(z.string()).optional(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("list_plans"), status: z.enum(["active", "completed", "archived"]).optional(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("get_tasks"), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("create_task"), planId: z.string(), title: z.string(), type: z.enum(["compose", "curate", "review", "research", "publish", "design", "other"]).optional(), priority: z.enum(["p1", "p2", "p3"]).optional(), actor: z.string().optional(), platform: z.string().optional(), dueDate: z.string().optional(), description: z.string().optional(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("move_task"), taskId: z.string(), status: z.enum(["todo", "doing", "review", "done", "cancelled"]), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("delete_task"), taskId: z.string(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("get_calendar"), dateStart: z.string(), dateEnd: z.string(), workspaceId: z.string().optional() }),
]);

const actionToHandler: Record<string, (storage: FullStorage, args: Record<string, unknown>) => Promise<ToolResult>> = {
  create_plan: handlePlanCreate,
  list_plans: handlePlanList,
  get_tasks: handlePlanToday,
  create_task: handleTaskCreate,
  move_task: handleTaskMove,
  delete_task: handleTaskDelete,
  get_calendar: handleCalendar,
};

export const tool = {
  name: "planning" as const,
  description: "Manage content plans, tasks, and calendar — create plans, list plans, get today tasks, create/move/delete tasks, view calendar.",
  inputSchema: PlanningSchema,
};

export async function handleTool(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = PlanningSchema.parse(raw);
  const action = parsed.action;
  const handler = actionToHandler[action];
  if (!handler) {
    return { content: [{ type: "text", text: `Unknown planning action: ${action}` }], isError: true };
  }
  const storage = await resolvePlanStorage(ctx, (parsed as Record<string, unknown>).workspaceId as string | undefined);
  return handler(storage, parsed as Record<string, unknown>);
}

async function resolvePlanStorage(ctx: ToolContext, workspaceId?: string): Promise<FullStorage> {
  const storage = workspaceId ? await ctx.storage.withWorkspace(workspaceId) : ctx.storage;
  return storage as FullStorage;
}
