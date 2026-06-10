import { z } from "zod";

export const ContentTaskTypeSchema = z.enum(["compose", "curate", "review", "research", "publish", "design", "other"]);
export type ContentTaskType = z.infer<typeof ContentTaskTypeSchema>;

export const ContentTaskPrioritySchema = z.enum(["p1", "p2", "p3"]);
export type ContentTaskPriority = z.infer<typeof ContentTaskPrioritySchema>;

export const ContentTaskStatusSchema = z.enum(["todo", "doing", "review", "done", "cancelled"]);
export type ContentTaskStatus = z.infer<typeof ContentTaskStatusSchema>;

export const ContentTaskSchema = z.object({
  id: z.string(),
  planId: z.string(),
  title: z.string(),
  type: ContentTaskTypeSchema,
  priority: ContentTaskPrioritySchema,
  status: ContentTaskStatusSchema,
  actor: z.string().optional(),
  platform: z.string().optional(),
  cardId: z.number().optional(),
  draftId: z.string().optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ContentTask = z.infer<typeof ContentTaskSchema>;

export const CalendarEntrySchema = z.object({
  date: z.string(),
  tasks: z.array(z.object({
    taskId: z.string(),
    planId: z.string(),
  })),
});
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>;

export const ContentPlanStatusSchema = z.enum(["active", "completed", "archived"]);
export type ContentPlanStatus = z.infer<typeof ContentPlanStatusSchema>;

export const ContentPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
  status: ContentPlanStatusSchema.default("active"),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ContentPlan = z.infer<typeof ContentPlanSchema>;
