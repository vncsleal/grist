import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentWorkspaceId } from "@quillby/workspace";
import type { SessionStore, PlanStorage } from "@quillby/workspace";
import type { Session } from "@quillby/content";
import { logWarn } from "../logger.js";

const STALE_THRESHOLD_MS = 30 * 60 * 1000;
const WARN_THRESHOLD_MS = 15 * 60 * 1000;

const SessionStartArgsSchema = z.object({
  goal: z.string().min(1).describe("What this session aims to accomplish"),
  type: z.enum(["campaign", "plan", "task", "freeform"]).optional().default("freeform"),
  constraints: z.array(z.string()).optional().default([]),
  campaignId: z.string().optional(),
  planId: z.string().optional(),
  taskId: z.string().optional(),
  tokenBudget: z.number().optional().describe("Optional token budget for degradation tracking"),
  template: z.enum(["weekly_linkedin", "daily_brief", "campaign_review"]).optional().describe("Auto-scoping template"),
  workspaceId: z.string().optional(),
});

const SessionCloseArgsSchema = z.object({
  summary: z.string().optional().describe("Session summary / outcomes"),
  workspaceId: z.string().optional(),
});

const SessionStatusArgsSchema = z.object({
  sessionId: z.string().optional().describe("Session ID (defaults to most recent active session)"),
  workspaceId: z.string().optional(),
});

type DegradationWarnings = {
  stale: boolean;
  staleMinutes: number;
  tokenBudgetExhausted: boolean;
  tokenUsagePct: number;
  warnings: string[];
};

function checkDegradation(session: Session): DegradationWarnings {
  const now = Date.now();
  const lastActivity = new Date(session.lastActivityAt).getTime();
  const staleMinutes = Math.round((now - lastActivity) / 60000);
  const warnings: string[] = [];

  if (staleMinutes > WARN_THRESHOLD_MS / 60000) {
    warnings.push(`Session inactive for ${staleMinutes} minutes.`);
  }

  let tokenBudgetExhausted = false;
  let tokenUsagePct = 0;
  if (session.degradation.tokenBudget && session.degradation.tokensUsed !== undefined) {
    tokenUsagePct = Math.round((session.degradation.tokensUsed / session.degradation.tokenBudget) * 100);
    if (tokenUsagePct > 80) {
      warnings.push(`Token budget ${tokenUsagePct}% exhausted (${session.degradation.tokensUsed}/${session.degradation.tokenBudget}).`);
      tokenBudgetExhausted = tokenUsagePct >= 100;
    }
  }

  return {
    stale: staleMinutes > WARN_THRESHOLD_MS / 60000,
    staleMinutes,
    tokenBudgetExhausted,
    tokenUsagePct,
    warnings,
  };
}

const TEMPLATES: Record<string, Partial<Session>> = {
  weekly_linkedin: {
    scope: {
      type: "campaign",
      goal: "Weekly LinkedIn content: research trending topics, compose 3 posts, schedule for the week.",
      constraints: ["LinkedIn only", "max 3 posts", "no video", "professional tone"],
    },
  },
  daily_brief: {
    scope: {
      type: "task",
      goal: "Daily briefing: fetch feeds, score articles, produce cards for curation.",
      constraints: ["feeds only", "no drafting", "card production only"],
    },
  },
  campaign_review: {
    scope: {
      type: "campaign",
      goal: "Campaign performance review: check published content, gather metrics, suggest optimizations.",
      constraints: ["read-only", "no new content creation", "analysis only"],
    },
  },
};

async function autoCloseStaleSessions(store: SessionStore): Promise<number> {
  const stale = await store.findStaleSessions(STALE_THRESHOLD_MS);
  const results = await Promise.allSettled(
    stale.map((session) => store.closeSession(session.id))
  );
  let closed = 0;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      closed++;
    } else {
      logWarn("Failed to close stale session", {
        sessionId: stale[i].id,
        reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }
  return closed;
}

export async function handleSessionStart(
  store: SessionStore,
  storage: PlanStorage,
  args: Record<string, unknown>
) {
  const closedCount = await autoCloseStaleSessions(store);
  const parsed = SessionStartArgsSchema.parse(args);
  const now = new Date().toISOString();
  const id = `session-${randomUUID().slice(0, 8)}`;

  let scope = {
    type: parsed.type,
    goal: parsed.goal,
    constraints: parsed.constraints,
    campaignId: parsed.campaignId,
    planId: parsed.planId,
    taskId: parsed.taskId,
  };

  if (parsed.template) {
    const tmpl = TEMPLATES[parsed.template];
    if (tmpl?.scope) {
      scope = { ...scope, ...tmpl.scope };
    }
  }

  const session: Session = {
    id,
    workspaceId: parsed.workspaceId ?? getCurrentWorkspaceId(),
    scope,
    state: "planning",
    degradation: {
      tokenBudget: parsed.tokenBudget,
      tokensUsed: 0,
      warnings: [],
    },
    startedAt: now,
    lastActivityAt: now,
  };

  await store.createSession(session);

  return {
    content: [{ type: "text" as const, text: JSON.stringify({ session, template: parsed.template ?? null, autoClosedCount: closedCount }, null, 2) }],
    structuredContent: { session, template: parsed.template ?? null, autoClosedCount: closedCount },
  };
}

export async function handleSessionStatus(
  store: SessionStore,
  _storage: PlanStorage,
  args: Record<string, unknown>
) {
  const closedCount = await autoCloseStaleSessions(store);
  const parsed = SessionStatusArgsSchema.parse(args);

  let session: Session | null = null;
  if (parsed.sessionId) {
    session = await store.loadSession(parsed.sessionId);
  } else {
    const all = await store.listSessions();
    const active = all
      .filter((s) => s.state !== "closing")
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
    session = active[0] ?? null;
  }

  if (!session) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ active: false, message: "No active session.", autoClosedCount: closedCount }, null, 2) }],
      structuredContent: { active: false, autoClosedCount: closedCount },
    };
  }

  const degradation = checkDegradation(session);

  return {
    content: [{ type: "text" as const, text: JSON.stringify({ session, degradation, autoClosedCount: closedCount }, null, 2) }],
    structuredContent: { session, degradation, autoClosedCount: closedCount },
  };
}

export async function handleSessionClose(
  store: SessionStore,
  _storage: PlanStorage,
  args: Record<string, unknown>
) {
  const parsed = SessionCloseArgsSchema.parse(args);

  const all = await store.listSessions();
  const active = all
    .filter((s) => s.state !== "closing")
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

  const session = active[0];
  if (!session) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ closed: false, message: "No active session to close." }, null, 2) }],
      structuredContent: { closed: false },
    };
  }

  await store.closeSession(session.id);
  if (parsed.summary) {
    await store.updateSession(session.id, { summary: parsed.summary });
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify({ closed: true, sessionId: session.id, summary: parsed.summary ?? null }, null, 2) }],
    structuredContent: { closed: true, sessionId: session.id, summary: parsed.summary ?? null },
  };
}
