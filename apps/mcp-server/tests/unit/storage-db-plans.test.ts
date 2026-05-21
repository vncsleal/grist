import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createDb, HostedDbWorkspaceStorage } from "../../src/storage.js";

let tempDir = "";
let tempDbPath = "";

function makeStorage(userId = "test-user"): HostedDbWorkspaceStorage {
  const { db } = createDb(`file:${tempDbPath}`);
  const storage = new HostedDbWorkspaceStorage(userId, db);
  return storage;
}

async function withWorkspace(storage: HostedDbWorkspaceStorage): Promise<string> {
  await storage.createWorkspace({ name: "Test", id: "test-ws", makeCurrent: true });
  return "test-ws";
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-db-plans-"));
  tempDbPath = path.join(tempDir, "test.db");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("HostedDbWorkspaceStorage — PlanStorage", () => {
  describe("createPlan", () => {
    it("inserts and retrieves a plan", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const plan = {
        id: "plan-1", name: "Test Plan", description: "A test",
        dateStart: "2026-03-01", dateEnd: "2026-03-31",
        status: "active" as const, tags: ["test"],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      await storage.createPlan(plan);
      const loaded = await storage.loadPlan("plan-1");
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("Test Plan");
      expect(loaded!.tags).toEqual(["test"]);
    });
  });

  describe("loadPlan", () => {
    it("returns null for missing plan", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const result = await storage.loadPlan("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listPlans", () => {
    it("returns all plans", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Plan 1", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createPlan({ id: "p2", name: "Plan 2", status: "active", tags: [], createdAt: now, updatedAt: now });
      const plans = await storage.listPlans();
      expect(plans).toHaveLength(2);
    });

    it("filters by status", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Active", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createPlan({ id: "p2", name: "Completed", status: "completed", tags: [], createdAt: now, updatedAt: now });
      const active = await storage.listPlans("active");
      expect(active).toHaveLength(1);
      expect(active[0]!.id).toBe("p1");
    });
  });

  describe("updatePlan", () => {
    it("updates name and status", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Old", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.updatePlan("p1", { name: "Updated", status: "completed" });
      const loaded = await storage.loadPlan("p1");
      expect(loaded!.name).toBe("Updated");
      expect(loaded!.status).toBe("completed");
    });

    it("throws on missing plan", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      await expect(storage.updatePlan("nonexistent", { name: "X" })).rejects.toThrow("not found");
    });
  });

  describe("deletePlan", () => {
    it("deletes plan and its tasks", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Delete Me", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t1", planId: "p1", title: "Task", type: "compose", priority: "p2", status: "todo", createdAt: now, updatedAt: now });
      await storage.deletePlan("p1");
      expect(await storage.loadPlan("p1")).toBeNull();
      expect(await storage.loadTask("t1")).toBeNull();
    });
  });

  describe("createTask", () => {
    it("inserts a task linked to a plan", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Plan", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t1", planId: "p1", title: "My Task", type: "compose", priority: "p1", status: "todo", createdAt: now, updatedAt: now });
      const loaded = await storage.loadTask("t1");
      expect(loaded).not.toBeNull();
      expect(loaded!.title).toBe("My Task");
    });
  });

  describe("listTasks", () => {
    it("returns all tasks for a plan", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Plan", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t1", planId: "p1", title: "A", type: "compose", priority: "p2", status: "todo", createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t2", planId: "p1", title: "B", type: "review", priority: "p1", status: "doing", createdAt: now, updatedAt: now });
      const tasks = await storage.listTasks("p1");
      expect(tasks).toHaveLength(2);
    });
  });

  describe("updateTask", () => {
    it("updates task status", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Plan", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t1", planId: "p1", title: "Task", type: "compose", priority: "p2", status: "todo", createdAt: now, updatedAt: now });
      await storage.updateTask("t1", { status: "doing" });
      const loaded = await storage.loadTask("t1");
      expect(loaded!.status).toBe("doing");
    });

    it("throws on missing task", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      await expect(storage.updateTask("nonexistent", { status: "done" })).rejects.toThrow("not found");
    });
  });

  describe("deleteTask", () => {
    it("deletes a task", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Plan", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t1", planId: "p1", title: "Task", type: "compose", priority: "p2", status: "todo", createdAt: now, updatedAt: now });
      await storage.deleteTask("t1");
      expect(await storage.loadTask("t1")).toBeNull();
    });

    it("throws on missing task", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      await expect(storage.deleteTask("nonexistent")).rejects.toThrow("not found");
    });
  });

  describe("getTodayQueue", () => {
    it("includes tasks without dueDate", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Plan", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t1", planId: "p1", title: "No date", type: "compose", priority: "p2", status: "todo", createdAt: now, updatedAt: now });
      const queue = await storage.getTodayQueue();
      expect(queue).toHaveLength(1);
    });

    it("includes past-due tasks", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Plan", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t1", planId: "p1", title: "Overdue", type: "compose", priority: "p2", status: "todo", dueDate: "2020-01-01", createdAt: now, updatedAt: now });
      const queue = await storage.getTodayQueue();
      expect(queue).toHaveLength(1);
    });

    it("excludes done tasks", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Plan", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t1", planId: "p1", title: "Done", type: "compose", priority: "p2", status: "done", createdAt: now, updatedAt: now });
      const queue = await storage.getTodayQueue();
      expect(queue).toHaveLength(0);
    });

    it("excludes future-due tasks", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Plan", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t1", planId: "p1", title: "Future", type: "compose", priority: "p2", status: "todo", dueDate: "2099-12-31", createdAt: now, updatedAt: now });
      const queue = await storage.getTodayQueue();
      expect(queue).toHaveLength(0);
    });
  });

  describe("getCalendar", () => {
    it("returns tasks in date range grouped by date", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Plan", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t1", planId: "p1", title: "Task 1", type: "compose", priority: "p2", status: "todo", dueDate: "2026-03-15", createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t2", planId: "p1", title: "Task 2", type: "compose", priority: "p2", status: "todo", dueDate: "2026-03-15", createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t3", planId: "p1", title: "Task 3", type: "compose", priority: "p2", status: "todo", dueDate: "2026-03-16", createdAt: now, updatedAt: now });
      const entries = await storage.getCalendar("2026-03-01", "2026-03-31");
      expect(entries).toHaveLength(2);
      expect(entries[0]!.tasks).toHaveLength(2);
      expect(entries[1]!.tasks).toHaveLength(1);
    });

    it("excludes tasks outside range", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const now = new Date().toISOString();
      await storage.createPlan({ id: "p1", name: "Plan", status: "active", tags: [], createdAt: now, updatedAt: now });
      await storage.createTask({ id: "t1", planId: "p1", title: "Outside", type: "compose", priority: "p2", status: "todo", dueDate: "2026-04-01", createdAt: now, updatedAt: now });
      const entries = await storage.getCalendar("2026-03-01", "2026-03-31");
      expect(entries).toHaveLength(0);
    });
  });

  describe("data isolation", () => {
    it("isolates plans between users", async () => {
      const { db } = createDb(`file:${tempDbPath}`);
      const userA = new HostedDbWorkspaceStorage("user-A", db);
      const userB = new HostedDbWorkspaceStorage("user-B", db);
      await userA.createWorkspace({ name: "A", id: "ws", makeCurrent: true });
      await userB.createWorkspace({ name: "B", id: "ws", makeCurrent: true });
      const now = new Date().toISOString();
      await userA.createPlan({ id: "p1", name: "A's Plan", status: "active", tags: [], createdAt: now, updatedAt: now });
      const plansA = await userA.listPlans();
      const plansB = await userB.listPlans();
      expect(plansA).toHaveLength(1);
      expect(plansB).toHaveLength(0);
    });
  });
});
