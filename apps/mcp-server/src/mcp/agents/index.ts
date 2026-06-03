import { z } from "zod";
import type { ToolContext, ToolResult } from "../tools/index.js";
import type { AgentRole } from "@quillby/core";
import { getAgentByRole, getAgentByLabel } from "./registry.js";
import { acquireLock, releaseLock, releaseStaleLocks, getLock } from "./lock.js";
import { createHandoffState, type HandoffRequest } from "./handoff.js";

export { AGENTS, getAgentByRole, getAgentByLabel } from "./registry.js";
export { acquireLock, releaseLock, releaseStaleLocks, getLock } from "./lock.js";
export { createHandoffState, transferContext } from "./handoff.js";
export type { HandoffRequest } from "./handoff.js";

export const AGENT_TOOL_NAMES = new Set<string>([
  "agent_delegate",
  "agent_handoff",
  "agent_status",
]);

const AgentDelegateArgsSchema = z.object({
  agent: z.string().min(1, "agent is required"),
  task: z.string().min(1, "task is required"),
  workspaceId: z.string().optional(),
  context: z.string().optional(),
  maxTokens: z.number().int().positive().max(128_000).optional(),
});

const AgentHandoffArgsSchema = z.object({
  from: z.string().min(1, "from agent is required"),
  to: z.string().min(1, "to agent is required"),
  reason: z.string().min(1, "reason is required"),
  workspaceId: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function handleAgentTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case "agent_delegate":
      return handleDelegate(args, ctx);
    case "agent_handoff":
      return handleHandoff(args, ctx);
    case "agent_status":
      return handleStatus(args, ctx);
    default:
      return {
        content: [{ type: "text", text: `Unknown agent tool: ${name}` }],
        isError: true,
      };
  }
}

async function handleDelegate(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const parsed = AgentDelegateArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid agent_delegate arguments: ${parsed.error.message}` }],
      isError: true,
    };
  }

  const { agent: role, task, workspaceId: inputWorkspaceId, context, maxTokens } = parsed.data;
  const workspaceId = inputWorkspaceId || (await ctx.storage.getCurrentWorkspaceId());

  const agent = getAgentByRole(role as AgentRole) ?? getAgentByLabel(role);
  if (!agent) {
    const roles = ["@researcher", "@writer", "@strategist", "@analyst"].join(", ");
    return {
      content: [{ type: "text", text: `Unknown agent '${role}'. Available: ${roles}` }],
      isError: true,
    };
  }

  if (!acquireLock("workspace", workspaceId, agent.role)) {
    return {
      content: [{ type: "text", text: `Cannot delegate to ${agent.label}: workspace is locked by another agent. Try again later or use agent_status to check.` }],
      isError: true,
    };
  }

  try {
    const toolsDesc = [...agent.tools.readTools, ...agent.tools.writeTools]
      .map((t) => `- ${t}`)
      .join("\n");

    const prompt = [
      agent.contextPrompt,
      "",
      `## Current task`,
      task,
      "",
      `## Available tools for ${agent.label}`,
      toolsDesc,
      "",
      `## Context`,
      `Workspace: ${workspaceId}`,
      `Deployment: ${ctx.deploymentMode}`,
      context ? `\n## Additional context\n${context}` : "",
    ].join("\n");

    let result: string;
    if (agent.capabilities.canSample) {
      const sampled = await ctx.sample(prompt, maxTokens ?? 4096);
      result = sampled.ok ? sampled.text : "[Sampling unavailable — agent cannot process this task without host AI support]";
    } else {
      result = `Agent ${agent.label} does not support autonomous processing. Describe the task to the user and ask them to use the appropriate tools manually.`;
    }

    return {
      content: [{ type: "text", text: result }],
      structuredContent: {
        agent: agent.role,
        workspaceId,
        samplingUsed: agent.capabilities.canSample,
      },
    };
  } finally {
    releaseLock("workspace", workspaceId, agent.role);
  }
}

async function handleHandoff(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const parsed = AgentHandoffArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Invalid agent_handoff arguments: ${parsed.error.message}` }],
      isError: true,
    };
  }

  const { from: fromRole, to: toRole, reason, workspaceId: inputWorkspaceId, context } = parsed.data;
  const workspaceId = inputWorkspaceId || (await ctx.storage.getCurrentWorkspaceId());

  const fromAgent = getAgentByRole(fromRole as AgentRole) ?? getAgentByLabel(fromRole);
  const toAgent = getAgentByRole(toRole as AgentRole) ?? getAgentByLabel(toRole);

  if (!fromAgent || !toAgent) {
    return {
      content: [{ type: "text", text: `Unknown agent. From: ${fromAgent ? "ok" : "unknown"}, To: ${toAgent ? "ok" : "unknown"}` }],
      isError: true,
    };
  }

  const handoffReq: HandoffRequest = {
    from: fromAgent.role,
    to: toAgent.role,
    reason,
    contextSnapshot: { ...context, workspaceId },
    workspaceId,
  };

  const handoffState = createHandoffState(handoffReq);

  return {
    content: [{ type: "text", text: `Handoff from ${fromAgent.label} to ${toAgent.label}: ${reason}` }],
    structuredContent: {
      handoff: handoffState,
      fromAgent: fromAgent.role,
      toAgent: toAgent.role,
      reason,
      workspaceId,
    },
  };
}

async function handleStatus(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const staleReleased = releaseStaleLocks();
  const workspaceId = (args.workspaceId as string) || (await ctx.storage.getCurrentWorkspaceId());
  const lock = getLock("workspace", workspaceId);

  return {
    content: [{
      type: "text",
      text: [
        `Deployment: ${ctx.deploymentMode}`,
        `Workspace: ${workspaceId}`,
        lock ? `Locked by: @${lock.agent} (since ${new Date(lock.acquiredAt).toISOString()})` : "No active lock",
        staleReleased > 0 ? `Released ${staleReleased} stale lock(s)` : "",
        `Available agents: @researcher, @writer, @strategist, @analyst`,
      ].filter(Boolean).join("\n"),
    }],
    structuredContent: {
      deploymentMode: ctx.deploymentMode,
      workspaceId,
      lock: lock ? { agent: lock.agent, acquiredAt: new Date(lock.acquiredAt).toISOString() } : null,
      staleLocksReleased: staleReleased,
    },
  };
}
