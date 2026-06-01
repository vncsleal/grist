import { describe, expect, it } from "vitest";
import {
  ContentTaskTypeSchema,
  ContentTaskPrioritySchema,
  ContentTaskStatusSchema,
  ContentTaskSchema,
  CalendarEntrySchema,
  ContentPlanStatusSchema,
  ContentPlanSchema,
} from "../src/index.js";

describe("ContentTaskTypeSchema", () => {
  it("accepts valid task types", () => {
    expect(ContentTaskTypeSchema.parse("compose")).toBe("compose");
    expect(ContentTaskTypeSchema.parse("curate")).toBe("curate");
    expect(ContentTaskTypeSchema.parse("review")).toBe("review");
    expect(ContentTaskTypeSchema.parse("research")).toBe("research");
    expect(ContentTaskTypeSchema.parse("publish")).toBe("publish");
    expect(ContentTaskTypeSchema.parse("design")).toBe("design");
    expect(ContentTaskTypeSchema.parse("other")).toBe("other");
  });

  it("rejects invalid task type", () => {
    expect(() => ContentTaskTypeSchema.parse("invalid")).toThrow();
  });
});

describe("ContentTaskPrioritySchema", () => {
  it("accepts valid priorities", () => {
    expect(ContentTaskPrioritySchema.parse("p1")).toBe("p1");
    expect(ContentTaskPrioritySchema.parse("p2")).toBe("p2");
    expect(ContentTaskPrioritySchema.parse("p3")).toBe("p3");
  });

  it("rejects invalid priority", () => {
    expect(() => ContentTaskPrioritySchema.parse("p4")).toThrow();
  });
});

describe("ContentTaskStatusSchema", () => {
  it("accepts valid statuses", () => {
    expect(ContentTaskStatusSchema.parse("todo")).toBe("todo");
    expect(ContentTaskStatusSchema.parse("doing")).toBe("doing");
    expect(ContentTaskStatusSchema.parse("review")).toBe("review");
    expect(ContentTaskStatusSchema.parse("done")).toBe("done");
    expect(ContentTaskStatusSchema.parse("cancelled")).toBe("cancelled");
  });
});

describe("ContentTaskSchema", () => {
  it("validates a complete task", () => {
    const result = ContentTaskSchema.parse({
      id: "task-1",
      planId: "plan-1",
      title: "Write post",
      type: "compose",
      priority: "p1",
      status: "todo",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.title).toBe("Write post");
    expect(result.type).toBe("compose");
  });

  it("accepts optional fields", () => {
    const result = ContentTaskSchema.parse({
      id: "task-2",
      planId: "plan-1",
      title: "Review",
      type: "review",
      priority: "p2",
      status: "doing",
      actor: "Alice",
      platform: "linkedin",
      description: "Check for tone",
      dueDate: "2026-06-15",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(result.actor).toBe("Alice");
    expect(result.dueDate).toBe("2026-06-15");
  });

  it("rejects missing required fields", () => {
    expect(() => ContentTaskSchema.parse({})).toThrow();
  });
});

describe("CalendarEntrySchema", () => {
  it("validates a calendar entry with tasks", () => {
    const result = CalendarEntrySchema.parse({
      date: "2026-06-15",
      tasks: [{ taskId: "t-1", planId: "p-1" }],
    });
    expect(result.tasks).toHaveLength(1);
  });

  it("rejects missing date", () => {
    expect(() => CalendarEntrySchema.parse({})).toThrow();
  });
});

describe("ContentPlanStatusSchema", () => {
  it("accepts valid statuses", () => {
    expect(ContentPlanStatusSchema.parse("active")).toBe("active");
    expect(ContentPlanStatusSchema.parse("completed")).toBe("completed");
    expect(ContentPlanStatusSchema.parse("archived")).toBe("archived");
  });
});

describe("ContentPlanSchema", () => {
  it("validates a minimal plan with defaults", () => {
    const result = ContentPlanSchema.parse({
      id: "plan-1",
      name: "Weekly Newsletter",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(result.status).toBe("active");
    expect(result.description).toBe("");
    expect(result.tags).toEqual([]);
  });

  it("validates a complete plan", () => {
    const result = ContentPlanSchema.parse({
      id: "plan-1",
      name: "Campaign",
      description: "Q3 launch",
      dateStart: "2026-07-01",
      dateEnd: "2026-09-30",
      status: "active",
      tags: ["launch", "q3"],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(result.tags).toEqual(["launch", "q3"]);
  });
});
