import { randomUUID } from "node:crypto";
import {
  PlanCreateArgsSchema,
  PlanListArgsSchema,
  TaskCreateArgsSchema,
  TaskMoveArgsSchema,
  TaskDeleteArgsSchema,
  CalendarArgsSchema,
} from "./schemas.js";
import type { PlanStorage } from "@quillby/workspace";

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
    content: [{ type: "text" as const, text: JSON.stringify(plan, null, 2) }],
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
    content: [{ type: "text" as const, text: JSON.stringify({ count: plans.length, plans }, null, 2) }],
    structuredContent: { count: plans.length, plans },
  };
}

export async function handlePlanToday(
  storage: PlanStorage,
  _args: Record<string, unknown>
) {
  const tasks = await storage.getTodayQueue();
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ count: tasks.length, tasks }, null, 2) }],
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
    content: [{ type: "text" as const, text: JSON.stringify(task, null, 2) }],
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
    content: [{ type: "text" as const, text: JSON.stringify({ taskId: parsed.taskId, status: parsed.status, task }, null, 2) }],
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
    content: [{ type: "text" as const, text: JSON.stringify({ taskId: parsed.taskId, deleted: true }, null, 2) }],
    structuredContent: { taskId: parsed.taskId, deleted: true },
  };
}

export async function handleCalendar(
  storage: PlanStorage,
  args: Record<string, unknown>
) {
  const parsed = CalendarArgsSchema.parse(args);
  const entries = await storage.getCalendar(parsed.dateStart, parsed.dateEnd);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ dateStart: parsed.dateStart, dateEnd: parsed.dateEnd, entries }, null, 2) }],
    structuredContent: { dateStart: parsed.dateStart, dateEnd: parsed.dateEnd, entries },
  };
}
