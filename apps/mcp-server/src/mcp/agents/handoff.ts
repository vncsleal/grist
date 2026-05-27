import type { AgentRole, AgentContext, HandoffState } from "@quillby/core";

export interface HandoffRequest {
  from: AgentRole;
  to: AgentRole;
  reason: string;
  contextSnapshot: Record<string, unknown>;
  workspaceId: string;
  userId?: string;
}

export function createHandoffState(req: HandoffRequest): HandoffState {
  return {
    fromAgent: req.from,
    toAgent: req.to,
    workspaceId: req.workspaceId,
    contextSnapshot: req.contextSnapshot,
    handoffReason: req.reason,
    timestamp: new Date().toISOString(),
  };
}

export function transferContext(ctx: AgentContext, handoff: HandoffState): AgentContext {
  return {
    ...ctx,
    agent: handoff.toAgent,
    handoffChain: [...(ctx.handoffChain ?? []), handoff],
    memory: {
      ...(ctx.memory ?? {}),
      ...(handoff.contextSnapshot.memory as Record<string, string[]> ?? {}),
    },
  };
}
