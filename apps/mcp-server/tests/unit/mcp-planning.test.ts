import { describe, expect, it, vi } from "vitest";
import {
  handlePlanCreate,
  handlePlanList,
  handlePlanToday,
  handleTaskCreate,
  handleTaskMove,
  handleTaskDelete,
  handleCalendar,
} from "../../src/mcp/planning.js";
import type { PlanStorage } from "@quillby/workspace";

function mockStorage(): PlanStorage {
  return {
    createPlan: vi.fn(),
    loadPlan: vi.fn(),
    listPlans: vi.fn().mockResolvedValue([]),
    updatePlan: vi.fn(),
    deletePlan: vi.fn(),
    createTask: vi.fn(),
    loadTask: vi.fn(),
    listTasks: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    getCalendar: vi.fn(),
    getTodayQueue: vi.fn().mockResolvedValue([]),
  };
}

describe("handlePlanCreate", () => {
  it("creates a plan with auto-generated id", async () => {
    const storage = mockStorage();
    const result = await handlePlanCreate(storage, {
      name: "Weekly LinkedIn",
      description: "March campaign",
    });
    const data = result.structuredContent as Record<string, unknown>;
    expect(data.name).toBe("Weekly LinkedIn");
    expect((data.id as string).startsWith("plan-")).toBe(true);
    expect((data as { status: string }).status).toBe("active");
  });

  it("passes tags through", async () => {
    const storage = mockStorage();
    const result = await handlePlanCreate(storage, {
      name: "Test",
      tags: ["linkedin", "weekly"],
    });
    const data = result.structuredContent as { tags?: string[] };
    expect(data.tags).toEqual(["linkedin", "weekly"]);
  });
});

describe("handlePlanList", () => {
  it("calls listPlans with status filter", async () => {
    const storage = mockStorage();
    await handlePlanList(storage, { status: "active" });
    expect(storage.listPlans).toHaveBeenCalledWith("active");
  });

  it("calls listPlans without filter", async () => {
    const storage = mockStorage();
    await handlePlanList(storage, {});
    expect(storage.listPlans).toHaveBeenCalledWith(undefined);
  });
});

describe("handlePlanToday", () => {
  it("calls getTodayQueue", async () => {
    const storage = mockStorage();
    await handlePlanToday(storage, {});
    expect(storage.getTodayQueue).toHaveBeenCalledOnce();
  });
});

describe("handleTaskCreate", () => {
  it("creates task with auto-generated id and defaults", async () => {
    const storage = mockStorage();
    const result = await handleTaskCreate(storage, {
      planId: "plan-1",
      title: "Write post",
    });
    const data = result.structuredContent as Record<string, unknown>;
    expect(data.title).toBe("Write post");
    expect((data.id as string).startsWith("task-")).toBe(true);
    expect((data as { status: string }).status).toBe("todo");
    expect((data as { type: string }).type).toBe("compose");
  });

  it("calls createTask with full task data", async () => {
    const storage = mockStorage();
    await handleTaskCreate(storage, {
      planId: "plan-1",
      title: "Research topic",
      type: "research",
      priority: "p1",
      actor: "researcher",
    });
    expect(storage.createTask).toHaveBeenCalledOnce();
    const task = (storage.createTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(task.planId).toBe("plan-1");
    expect(task.actor).toBe("researcher");
  });
});

describe("handleTaskMove", () => {
  it("updates status and loads task", async () => {
    const storage = mockStorage();
    (storage.loadTask as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "t1", planId: "p1", title: "Test", type: "compose",
      priority: "p2", status: "doing",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    await handleTaskMove(storage, { taskId: "t1", status: "doing" });
    expect(storage.updateTask).toHaveBeenCalledWith("t1", { status: "doing" });
    expect(storage.loadTask).toHaveBeenCalledWith("t1");
  });
});

describe("handleTaskDelete", () => {
  it("calls deleteTask", async () => {
    const storage = mockStorage();
    await handleTaskDelete(storage, { taskId: "t1" });
    expect(storage.deleteTask).toHaveBeenCalledWith("t1");
  });
});

describe("handleCalendar", () => {
  it("passes date bounds through", async () => {
    const storage = mockStorage();
    await handleCalendar(storage, { dateStart: "2026-03-01", dateEnd: "2026-03-31" });
    expect(storage.getCalendar).toHaveBeenCalledWith("2026-03-01", "2026-03-31");
  });
});
