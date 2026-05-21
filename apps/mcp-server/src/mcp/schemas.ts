import { z } from "zod";

export const GenerateImageArgsSchema = z.object({
  prompt: z.string().min(1).max(5000).describe("Image description"),
  cardId: z.number().int().optional(),
  aspectRatio: z.enum(["square", "portrait", "landscape", "16:9", "9:16"]).optional().default("square"),
  workspaceId: z.string().optional(),
});

export const GenerateAudioArgsSchema = z.object({
  prompt: z.string().min(1).max(10000).describe("Script or text to narrate"),
  cardId: z.number().int().optional(),
  cloneVoice: z.boolean().optional().default(false),
  workspaceId: z.string().optional(),
});

export const GenerateVideoArgsSchema = z.object({
  prompt: z.string().min(1).max(5000).describe("Scene description + narrative direction"),
  cardId: z.number().int().optional(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional().default("9:16"),
  cloneAvatar: z.boolean().optional().default(false),
  drivingAudioUrl: z.string().url().optional(),
  workspaceId: z.string().optional(),
});

export const GetJobArgsSchema = z.object({
  jobId: z.string().min(1),
  workspaceId: z.string().optional(),
});

export const ListJobsArgsSchema = z.object({
  modality: z.enum(["image", "audio", "video"]).optional(),
  workspaceId: z.string().optional(),
});

export const GetProvidersArgsSchema = z.object({});

export const SetProviderArgsSchema = z.object({
  modality: z.enum(["image", "audio", "video"]),
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  voiceId: z.string().optional(),
  groupId: z.string().optional(),
});

export const ClearProviderArgsSchema = z.object({
  modality: z.enum(["image", "audio", "video"]),
});

export const SetCloneIdentityArgsSchema = z.object({
  workspaceId: z.string().optional(),
  faceReferenceImageUrl: z.string().url().optional(),
  voiceReferenceAudioUrl: z.string().url().optional(),
  cloneConsentGranted: z.boolean(),
});

export const CloneVoiceArgsSchema = z.object({
  workspaceId: z.string().optional(),
  name: z.string().optional(),
  overwrite: z.boolean().optional().default(false),
});

export const DeleteVoiceCloneArgsSchema = z.object({
  workspaceId: z.string().optional(),
});

// ── Content Planning ─────────────────────────────────────────────────────────

export const PlanCreateArgsSchema = z.object({
  name: z.string().min(1).max(200).describe("Plan name"),
  description: z.string().optional().describe("Optional description"),
  dateStart: z.string().optional().describe("ISO date (YYYY-MM-DD) for plan start"),
  dateEnd: z.string().optional().describe("ISO date (YYYY-MM-DD) for plan end"),
  tags: z.array(z.string()).optional().describe("Optional tags"),
  workspaceId: z.string().optional(),
});

export const PlanListArgsSchema = z.object({
  status: z.enum(["active", "completed", "archived"]).optional(),
  workspaceId: z.string().optional(),
});

export const PlanTodayArgsSchema = z.object({
  workspaceId: z.string().optional(),
});

export const TaskCreateArgsSchema = z.object({
  planId: z.string().min(1),
  title: z.string().min(1).max(500),
  type: z.enum(["compose", "curate", "review", "research", "publish", "design", "other"]).optional().default("compose"),
  priority: z.enum(["p1", "p2", "p3"]).optional().default("p2"),
  actor: z.string().optional().describe("Who should do this task"),
  platform: z.string().optional(),
  dueDate: z.string().optional().describe("ISO date (YYYY-MM-DD)"),
  description: z.string().optional(),
  workspaceId: z.string().optional(),
});

export const TaskMoveArgsSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["todo", "doing", "review", "done", "cancelled"]),
  workspaceId: z.string().optional(),
});

export const TaskDeleteArgsSchema = z.object({
  taskId: z.string().min(1),
  workspaceId: z.string().optional(),
});

export const CalendarArgsSchema = z.object({
  dateStart: z.string().describe("ISO date (YYYY-MM-DD) for range start"),
  dateEnd: z.string().describe("ISO date (YYYY-MM-DD) for range end"),
  workspaceId: z.string().optional(),
});

// ── Billing & Plan Management ─────────────────────────────────────────────────

export const GetPlanArgsSchema = z.object({});

export const GetPricingArgsSchema = z.object({});

export const BillingActionArgsSchema = z.object({
  action: z.enum(["upgrade", "downgrade", "manage"]).describe("Billing action to perform"),
});
