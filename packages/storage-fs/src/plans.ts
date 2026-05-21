import * as fs from "fs";
import * as path from "path";
import {
  ContentPlanSchema,
  ContentTaskSchema,
  type ContentPlan,
  type ContentTask,
  type ContentPlanStatus,
} from "@quillby/content";
import { getCurrentWorkspaceId, getWorkspacePaths } from "@quillby/workspace";

function plansDir(workspaceId?: string): string {
  const wsId = workspaceId ?? getCurrentWorkspaceId();
  return getWorkspacePaths(wsId).plansDir;
}

function planFilePath(planId: string, workspaceId?: string): string {
  return path.join(plansDir(workspaceId), `${planId}.json`);
}

function tasksFilePath(planId: string, workspaceId?: string): string {
  return path.join(plansDir(workspaceId), `${planId}-tasks.json`);
}

function readPlans(workspaceId?: string): ContentPlan[] {
  const dir = plansDir(workspaceId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.includes("-tasks"))
    .map((f) => {
      try {
        return ContentPlanSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
      } catch {
        return null;
      }
    })
    .filter((p): p is ContentPlan => p !== null);
}

function readTasks(planId: string, workspaceId?: string): ContentTask[] {
  const file = tasksFilePath(planId, workspaceId);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as unknown[];
    return raw.map((r) => ContentTaskSchema.parse(r));
  } catch {
    return [];
  }
}

function writeTasks(planId: string, tasks: ContentTask[], workspaceId?: string): void {
  const file = tasksFilePath(planId, workspaceId);
  fs.writeFileSync(file, JSON.stringify(tasks, null, 2));
}

export function createPlan(plan: ContentPlan, workspaceId?: string): void {
  const file = planFilePath(plan.id, workspaceId);
  fs.writeFileSync(file, JSON.stringify(ContentPlanSchema.parse(plan), null, 2));
}

export function loadPlan(planId: string, workspaceId?: string): ContentPlan | null {
  const file = planFilePath(planId, workspaceId);
  if (!fs.existsSync(file)) return null;
  try {
    return ContentPlanSchema.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    return null;
  }
}

export function listPlans(status?: ContentPlanStatus, workspaceId?: string): ContentPlan[] {
  const all = readPlans(workspaceId);
  return status ? all.filter((p) => p.status === status) : all;
}

export function updatePlan(planId: string, patch: Partial<ContentPlan>, workspaceId?: string): void {
  const existing = loadPlan(planId, workspaceId);
  if (!existing) throw new Error(`Plan "${planId}" not found.`);
  const updated = ContentPlanSchema.parse({
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  createPlan(updated, workspaceId);
}

export function deletePlan(planId: string, workspaceId?: string): void {
  const file = planFilePath(planId, workspaceId);
  const tasksFile = tasksFilePath(planId, workspaceId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  if (fs.existsSync(tasksFile)) fs.unlinkSync(tasksFile);
}

export function createTask(task: ContentTask, workspaceId?: string): void {
  const tasks = readTasks(task.planId, workspaceId);
  const idx = tasks.findIndex((t) => t.id === task.id);
  const parsed = ContentTaskSchema.parse(task);
  if (idx >= 0) {
    tasks[idx] = parsed;
  } else {
    tasks.push(parsed);
  }
  writeTasks(task.planId, tasks, workspaceId);
}

export function loadTask(taskId: string, workspaceId?: string): ContentTask | null {
  const wsId = workspaceId ?? getCurrentWorkspaceId();
  const dir = plansDir(wsId);
  if (!fs.existsSync(dir)) return null;
  const planDirs = fs.readdirSync(dir).filter((f) => f.endsWith("-tasks.json"));
  for (const file of planDirs) {
    const tasks = readTasks(file.replace("-tasks.json", ""), wsId);
    const found = tasks.find((t) => t.id === taskId);
    if (found) return found;
  }
  return null;
}

export function listTasks(planId: string, workspaceId?: string): ContentTask[] {
  return readTasks(planId, workspaceId);
}

export function deleteTask(taskId: string, workspaceId?: string): void {
  const wsId = workspaceId ?? getCurrentWorkspaceId();
  const dir = plansDir(wsId);
  if (!fs.existsSync(dir)) throw new Error(`Task "${taskId}" not found.`);
  const planFiles = fs.readdirSync(dir).filter((f) => f.endsWith("-tasks.json"));
  for (const file of planFiles) {
    const planId = file.replace("-tasks.json", "");
    const tasks = readTasks(planId, wsId);
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx >= 0) {
      tasks.splice(idx, 1);
      writeTasks(planId, tasks, wsId);
      return;
    }
  }
  throw new Error(`Task "${taskId}" not found.`);
}

export function updateTask(taskId: string, patch: Partial<ContentTask>, workspaceId?: string): void {
  const wsId = workspaceId ?? getCurrentWorkspaceId();
  const dir = plansDir(wsId);
  if (!fs.existsSync(dir)) throw new Error(`Task "${taskId}" not found.`);
  const planFiles = fs.readdirSync(dir).filter((f) => f.endsWith("-tasks.json"));
  for (const file of planFiles) {
    const planId = file.replace("-tasks.json", "");
    const tasks = readTasks(planId, wsId);
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx >= 0) {
      tasks[idx] = ContentTaskSchema.parse({
        ...tasks[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      writeTasks(planId, tasks, wsId);
      return;
    }
  }
  throw new Error(`Task "${taskId}" not found.`);
}

export function getTodayQueue(workspaceId?: string): ContentTask[] {
  const today = new Date().toISOString().slice(0, 10);
  const allPlans = readPlans(workspaceId);
  const allTasks: ContentTask[] = [];
  for (const plan of allPlans) {
    allTasks.push(...readTasks(plan.id, workspaceId));
  }
  return allTasks.filter((t) => {
    if (t.status !== "todo" && t.status !== "doing") return false;
    if (!t.dueDate) return true;
    return t.dueDate.slice(0, 10) <= today;
  });
}

export function getCalendar(dateStart: string, dateEnd: string, workspaceId?: string): import("@quillby/content").CalendarEntry[] {
  const allPlans = readPlans(workspaceId);
  const byDate = new Map<string, Array<{ taskId: string; planId: string }>>();

  for (const plan of allPlans) {
    const tasks = readTasks(plan.id, workspaceId);
    for (const task of tasks) {
      const date = task.dueDate?.slice(0, 10);
      if (!date || date < dateStart || date > dateEnd) continue;
      const existing = byDate.get(date) ?? [];
      existing.push({ taskId: task.id, planId: plan.id });
      byDate.set(date, existing);
    }
  }

  return Array.from(byDate.entries()).map(([date, tasks]) => ({
    date,
    tasks,
  }));
}
