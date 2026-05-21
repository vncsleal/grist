import { z } from "zod";

export const SessionScopeTypeSchema = z.enum(["campaign", "plan", "task", "freeform"]);
export type SessionScopeType = z.infer<typeof SessionScopeTypeSchema>;

export const SessionScopeSchema = z.object({
  type: SessionScopeTypeSchema,
  goal: z.string(),
  constraints: z.array(z.string()).default([]),
  campaignId: z.string().optional(),
  planId: z.string().optional(),
  taskId: z.string().optional(),
});
export type SessionScope = z.infer<typeof SessionScopeSchema>;

export const SessionStateSchema = z.enum(["planning", "executing", "reviewing", "closing"]);
export type SessionState = z.infer<typeof SessionStateSchema>;

export const DegradationInfoSchema = z.object({
  tokenBudget: z.number().optional(),
  tokensUsed: z.number().optional(),
  contextAgeMinutes: z.number().optional(),
  warnings: z.array(z.string()).default([]),
});
export type DegradationInfo = z.infer<typeof DegradationInfoSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scope: SessionScopeSchema,
  state: SessionStateSchema,
  degradation: DegradationInfoSchema.default({}),
  contextSnapshot: z.string().optional(),
  startedAt: z.string(),
  lastActivityAt: z.string(),
  closedAt: z.string().optional(),
  summary: z.string().optional(),
});
export type Session = z.infer<typeof SessionSchema>;
