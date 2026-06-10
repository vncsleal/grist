import { randomUUID } from "node:crypto";
import {
  PlanCreateArgsSchema,
  PlanListArgsSchema,
  TaskCreateArgsSchema,
  TaskMoveArgsSchema,
  TaskDeleteArgsSchema,
  CalendarArgsSchema,
} from "./schemas.js";
import type { PlanStorage } from "@quillby/core";

export async function handlePlanCreate(
  storage: PlanStorage,
  args: Record<string, unknown>
) {
  const parsed = PlanCreateArgsSchema.parse(args);
  const id = `plan-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const plan = {
    id,
    name: parsed.name,
    description: parsed.description ?? "",
    dateStart: parsed.dateStart,
    dateEnd: parsed.dateEnd,
    status: "active" as const,
    tags: parsed.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };
  await storage.createPlan(plan);
  return {
    content: [{ type: "text" as const, text: `Plan created: "${plan.name}" (${plan.id}). Status: ${plan.status}. Range: ${plan.dateStart ?? "not set"} — ${plan.dateEnd ?? "not set"}. Tags: ${plan.tags.join(", ") || "none"}.` }],
    structuredContent: plan,
  };
}

export async function handlePlanList(
  storage: PlanStorage,
  args: Record<string, unknown>
) {
  const parsed = PlanListArgsSchema.parse(args);
  const plans = await storage.listPlans(parsed.status);
  return {
    content: [{ type: "text" as const, text: `${plans.length} plan(s).${plans.slice(0, 5).map(p => `\n  ${p.id}: ${p.name} [${p.status}]`).join("")}${plans.length > 5 ? `\n  ... +${plans.length - 5} more` : ""}` }],
    structuredContent: { count: plans.length, plans },
  };
}

export async function handlePlanToday(
  storage: PlanStorage,
  _args: Record<string, unknown>
) {
  const tasks = await storage.getTodayQueue();
  return {
    content: [{ type: "text" as const, text: `${tasks.length} task(s) for today.${tasks.slice(0, 5).map(t => `\n  [${t.priority ?? "?"}] ${t.title} (${t.status ?? "?"})${t.platform ? ` — ${t.platform}` : ""}`).join("")}${tasks.length > 5 ? `\n  ... +${tasks.length - 5} more` : ""}` }],
    structuredContent: { count: tasks.length, tasks },
  };
}

export async function handleTaskCreate(
  storage: PlanStorage,
  args: Record<string, unknown>
) {
  const parsed = TaskCreateArgsSchema.parse(args);
  const id = `task-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const task = {
    id,
    planId: parsed.planId,
    title: parsed.title,
    type: parsed.type,
    priority: parsed.priority,
    status: "todo" as const,
    actor: parsed.actor,
    platform: parsed.platform,
    dueDate: parsed.dueDate,
    description: parsed.description,
    createdAt: now,
    updatedAt: now,
  };
  await storage.createTask(task);
  return {
    content: [{ type: "text" as const, text: `Task created: "${task.title}" (${task.id}) for plan ${task.planId}. Priority: ${task.priority ?? "not set"}. Due: ${task.dueDate ?? "not set"}. Type: ${task.type ?? "other"}.` }],
    structuredContent: task,
  };
}

export async function handleTaskMove(
  storage: PlanStorage,
  args: Record<string, unknown>
) {
  const parsed = TaskMoveArgsSchema.parse(args);
  await storage.updateTask(parsed.taskId, { status: parsed.status });
  const task = await storage.loadTask(parsed.taskId);
  return {
    content: [{ type: "text" as const, text: `Task ${parsed.taskId} moved to "${parsed.status}". Title: ${task?.title ?? "unknown"}.` }],
    structuredContent: { taskId: parsed.taskId, status: parsed.status, task },
  };
}

export async function handleTaskDelete(
  storage: PlanStorage,
  args: Record<string, unknown>
) {
  const parsed = TaskDeleteArgsSchema.parse(args);
  await storage.deleteTask(parsed.taskId);
  return {
    content: [{ type: "text" as const, text: `Task ${parsed.taskId} deleted.` }],
    structuredContent: { taskId: parsed.taskId, deleted: true },
  };
}

export async function handleCalendar(
  storage: PlanStorage,
  args: Record<string, unknown>
) {
  const parsed = CalendarArgsSchema.parse(args);
  const entries = (await storage.getCalendar(parsed.dateStart, parsed.dateEnd)) ?? [];
  return {
    content: [{ type: "text" as const, text: `Calendar from ${parsed.dateStart} to ${parsed.dateEnd}: ${entries.length} entr${entries.length === 1 ? "y" : "ies"}.${entries.slice(0, 10).map(e => `\n  ${e.date ?? "?"}: ${e.tasks.map(t => t.taskId).join(", ") || "?"}`).join("")}${entries.length > 10 ? `\n  ... +${entries.length - 10} more` : ""}` }],
    structuredContent: { dateStart: parsed.dateStart, dateEnd: parsed.dateEnd, entries },
  };
}
