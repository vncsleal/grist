import { z } from "zod";

export const CampaignStatusSchema = z.enum(["planning", "active", "paused", "completed", "failed"]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const StageStatusSchema = z.enum(["pending", "running", "completed", "failed", "skipped"]);
export type StageStatus = z.infer<typeof StageStatusSchema>;

export const StageConfigSchema = z.object({
  name: z.string().min(1),
  tool: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  dependsOn: z.array(z.string()).optional().default([]),
  condition: z.string().optional(),
  retryCount: z.number().int().min(0).optional().default(0),
  timeout: z.number().int().optional(),
});
export type StageConfig = z.infer<typeof StageConfigSchema>;

export const BlueprintSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  stages: z.array(StageConfigSchema).min(1),
  tags: z.array(z.string()).optional().default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

export const ExecutionLogSchema = z.object({
  stageName: z.string(),
  status: StageStatusSchema,
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  retryAttempt: z.number().int().min(0).optional().default(0),
});
export type ExecutionLog = z.infer<typeof ExecutionLogSchema>;

export const CampaignSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  blueprintId: z.string(),
  name: z.string(),
  status: CampaignStatusSchema,
  stages: z.array(StageConfigSchema),
  executions: z.array(ExecutionLogSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});
export type Campaign = z.infer<typeof CampaignSchema>;
