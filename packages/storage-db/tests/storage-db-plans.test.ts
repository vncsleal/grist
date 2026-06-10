import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ContentPlan } from "@quillby/content";
import { createDb } from "@quillby/database";
import { HostedDbWorkspaceStorage } from "../src/index.js";

let tempDir = "";
let tempDbPath = "";

function makeStorage(userId = "test-user"): HostedDbWorkspaceStorage {
  const { db } = createDb(`file:${tempDbPath}`);
  return new HostedDbWorkspaceStorage(userId, db);
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

const now = () => new Date().toISOString();
const plan = (id: string, overrides?: Partial<ContentPlan>) => ({
  id,
  name: `Plan ${id}`,
  description: "",
  status: "active" as const,
  tags: [] as string[],
  createdAt: now(),
  updatedAt: now(),
  ...overrides,
});
const task = (id: string, planId: string, overrides?: Partial<Parameters<HostedDbWorkspaceStorage["createTask"]>[0]>) => ({
  id,
  planId,
  title: `Task ${id}`,
  type: "compose" as const,
  priority: "p2" as const,
  status: "todo" as const,
  createdAt: now(),
  updatedAt: now(),
  ...overrides,
});

describe("HostedDbWorkspaceStorage — PlanStorage", () => {
  describe("createPlan", () => {
    it("inserts and retrieves a plan", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      await storage.createPlan(plan("plan-1"));
      const loaded = await storage.loadPlan("plan-1");
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("Plan plan-1");
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
      const ts = now();
      await storage.createPlan(plan("p1", { createdAt: ts, updatedAt: ts }));
      await storage.createPlan(plan("p2", { createdAt: ts, updatedAt: ts }));
      const plans = await storage.listPlans();
      expect(plans).toHaveLength(2);
    });

    it("filters by status", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const ts = now();
      await storage.createPlan(plan("p1", { status: "active", createdAt: ts, updatedAt: ts }));
      await storage.createPlan(plan("p2", { status: "completed", createdAt: ts, updatedAt: ts }));
      const active = await storage.listPlans("active");
      expect(active).toHaveLength(1);
      expect(active[0]!.id).toBe("p1");
    });
  });

  describe("updatePlan", () => {
    it("updates name and status", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const ts = now();
      await storage.createPlan(plan("p1", { createdAt: ts, updatedAt: ts }));
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
      const ts = now();
      await storage.createPlan(plan("p1", { createdAt: ts, updatedAt: ts }));
      await storage.createTask(task("t1", "p1"));
      await storage.deletePlan("p1");
      expect(await storage.loadPlan("p1")).toBeNull();
      expect(await storage.loadTask("t1")).toBeNull();
    });
  });
});

describe("HostedDbWorkspaceStorage — Tasks", () => {
  describe("createTask", () => {
    it("inserts a task linked to a plan", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const ts = now();
      await storage.createPlan(plan("p1", { createdAt: ts, updatedAt: ts }));
      await storage.createTask(task("t1", "p1"));
      const loaded = await storage.loadTask("t1");
      expect(loaded).not.toBeNull();
      expect(loaded!.title).toBe("Task t1");
    });
  });

  describe("listTasks", () => {
    it("returns all tasks for a plan", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const ts = now();
      await storage.createPlan(plan("p1", { createdAt: ts, updatedAt: ts }));
      await storage.createTask(task("t1", "p1"));
      await storage.createTask(task("t2", "p1"));
      const tasks = await storage.listTasks("p1");
      expect(tasks).toHaveLength(2);
    });
  });

  describe("updateTask", () => {
    it("updates task status", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const ts = now();
      await storage.createPlan(plan("p1", { createdAt: ts, updatedAt: ts }));
      await storage.createTask(task("t1", "p1"));
      await storage.updateTask("t1", { status: "doing" });
      const loaded = await storage.loadTask("t1");
      expect(loaded!.status).toBe("doing");
    });
  });

  describe("deleteTask", () => {
    it("deletes a task", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const ts = now();
      await storage.createPlan(plan("p1", { createdAt: ts, updatedAt: ts }));
      await storage.createTask(task("t1", "p1"));
      await storage.deleteTask("t1");
      expect(await storage.loadTask("t1")).toBeNull();
    });
  });
});

describe("HostedDbWorkspaceStorage — getTodayQueue", () => {
  it("includes tasks without dueDate", async () => {
    const storage = makeStorage();
    await withWorkspace(storage);
    const ts = now();
    await storage.createPlan(plan("p1", { createdAt: ts, updatedAt: ts }));
    await storage.createTask(task("t1", "p1"));
    const queue = await storage.getTodayQueue();
    expect(queue).toHaveLength(1);
  });

  it("excludes done tasks", async () => {
    const storage = makeStorage();
    await withWorkspace(storage);
    const ts = now();
    await storage.createPlan(plan("p1", { createdAt: ts, updatedAt: ts }));
    await storage.createTask(task("t1", "p1", { status: "done" }));
    const queue = await storage.getTodayQueue();
    expect(queue).toHaveLength(0);
  });
});

describe("HostedDbWorkspaceStorage — getCalendar", () => {
  it("returns tasks grouped by date within range", async () => {
    const storage = makeStorage();
    await withWorkspace(storage);
    const ts = now();
    await storage.createPlan(plan("p1", { createdAt: ts, updatedAt: ts }));
    await storage.createTask(task("t1", "p1", { dueDate: "2026-06-15" }));
    await storage.createTask(task("t2", "p1", { dueDate: "2026-06-15" }));
    const entries = await storage.getCalendar("2026-06-01", "2026-06-30");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tasks).toHaveLength(2);
  });
});

describe("HostedDbWorkspaceStorage — data isolation", () => {
  it("isolates plans between users", async () => {
    const { db } = createDb(`file:${tempDbPath}`);
    const userA = new HostedDbWorkspaceStorage("user-A", db);
    const userB = new HostedDbWorkspaceStorage("user-B", db);
    await userA.createWorkspace({ name: "A", id: "ws", makeCurrent: true });
    await userB.createWorkspace({ name: "B", id: "ws", makeCurrent: true });
    const ts = now();
    await userA.createPlan(plan("p1", { createdAt: ts, updatedAt: ts }));
    const plansA = await userA.listPlans();
    const plansB = await userB.listPlans();
    expect(plansA).toHaveLength(1);
    expect(plansB).toHaveLength(0);
  });
});
