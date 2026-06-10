import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import os from "os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-test-"));
const plansDir = path.join(tmpDir, "plans");

vi.mock("@quillby/workspace", () => ({
  getCurrentWorkspaceId: () => "test-ws",
  getWorkspacePaths: () => ({
    plansDir,
  }),
}));

beforeEach(() => {
  fs.mkdirSync(plansDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

import {
  createPlan,
  loadPlan,
  listPlans,
  updatePlan,
  deletePlan,
  createTask,
  loadTask,
  listTasks,
  updateTask,
  deleteTask,
  getTodayQueue,
  getCalendar,
} from "../src/plans.js";

const now = new Date().toISOString();

const samplePlan = {
  id: "plan-1",
  name: "Test Plan",
  status: "active" as const,
  description: "",
  tags: [],
  createdAt: now,
  updatedAt: now,
};

const sampleTask = {
  id: "task-1",
  planId: "plan-1",
  title: "Write post",
  type: "compose" as const,
  priority: "p1" as const,
  status: "todo" as const,
  createdAt: now,
  updatedAt: now,
};

describe("plans CRUD", () => {
  it("creates and loads a plan", () => {
    createPlan(samplePlan);
    const loaded = loadPlan("plan-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Test Plan");
  });

  it("returns null for missing plan", () => {
    expect(loadPlan("nonexistent")).toBeNull();
  });

  it("lists plans", () => {
    createPlan(samplePlan);
    createPlan({ ...samplePlan, id: "plan-2", name: "Second" });
    expect(listPlans()).toHaveLength(2);
  });

  it("filters plans by status", () => {
    createPlan(samplePlan);
    createPlan({ ...samplePlan, id: "plan-2", status: "archived" });
    const active = listPlans("active");
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("plan-1");
  });

  it("updates a plan", () => {
    createPlan(samplePlan);
    updatePlan("plan-1", { name: "Updated" });
    expect(loadPlan("plan-1")!.name).toBe("Updated");
  });

  it("throws on updating missing plan", () => {
    expect(() => updatePlan("nonexistent", { name: "x" })).toThrow();
  });

  it("deletes a plan and its tasks", () => {
    createPlan(samplePlan);
    createTask(sampleTask);
    deletePlan("plan-1");
    expect(loadPlan("plan-1")).toBeNull();
    expect(listTasks("plan-1")).toEqual([]);
  });
});

describe("tasks CRUD", () => {
  it("creates and loads a task", () => {
    createPlan(samplePlan);
    createTask(sampleTask);
    const loaded = loadTask("task-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe("Write post");
  });

  it("returns null for missing task", () => {
    expect(loadTask("nonexistent")).toBeNull();
  });

  it("lists tasks for a plan", () => {
    createPlan(samplePlan);
    createTask(sampleTask);
    createTask({ ...sampleTask, id: "task-2", title: "Review" });
    expect(listTasks("plan-1")).toHaveLength(2);
  });

  it("replaces existing task on duplicate id", () => {
    createPlan(samplePlan);
    createTask(sampleTask);
    createTask({ ...sampleTask, title: "Updated" });
    const tasks = listTasks("plan-1");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Updated");
  });

  it("updates a task", () => {
    createPlan(samplePlan);
    createTask(sampleTask);
    updateTask("task-1", { status: "doing" });
    const loaded = loadTask("task-1");
    expect(loaded!.status).toBe("doing");
  });

  it("deletes a task", () => {
    createPlan(samplePlan);
    createTask(sampleTask);
    deleteTask("task-1");
    expect(loadTask("task-1")).toBeNull();
  });
});

describe("getTodayQueue", () => {
  it("returns tasks that are todo or doing with no due date", () => {
    createPlan(samplePlan);
    createTask({ ...sampleTask, id: "t-todo", status: "todo" });
    createTask({ ...sampleTask, id: "t-doing", status: "doing" });
    const queue = getTodayQueue();
    expect(queue).toHaveLength(2);
  });

  it("excludes done and cancelled tasks", () => {
    createPlan(samplePlan);
    createTask({ ...sampleTask, id: "t-done", status: "done" });
    createTask({ ...sampleTask, id: "t-cancelled", status: "cancelled" });
    expect(getTodayQueue()).toHaveLength(0);
  });

  it("includes overdue tasks", () => {
    createPlan(samplePlan);
    createTask({ ...sampleTask, id: "t-overdue", status: "todo", dueDate: "2020-01-01" });
    expect(getTodayQueue()).toHaveLength(1);
  });

  it("excludes future tasks", () => {
    createPlan(samplePlan);
    createTask({ ...sampleTask, id: "t-future", status: "todo", dueDate: "2099-12-31" });
    expect(getTodayQueue()).toHaveLength(0);
  });
});

describe("getCalendar", () => {
  it("groups tasks by date within range", () => {
    createPlan(samplePlan);
    createTask({ ...sampleTask, id: "t-1", dueDate: "2026-06-15" });
    createTask({ ...sampleTask, id: "t-2", dueDate: "2026-06-15" });
    createTask({ ...sampleTask, id: "t-3", dueDate: "2026-06-16" });
    const entries = getCalendar("2026-06-15", "2026-06-20");
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.date === "2026-06-15")!.tasks).toHaveLength(2);
  });

  it("excludes tasks outside date range", () => {
    createPlan(samplePlan);
    createTask({ ...sampleTask, id: "t-out", dueDate: "2026-07-01" });
    expect(getCalendar("2026-06-01", "2026-06-30")).toHaveLength(0);
  });
});
