import { describe, expect, it } from "vitest";
import {
  ContentPlanSchema,
  ContentTaskSchema,
  CalendarEntrySchema,
  SessionSchema,
  SessionScopeSchema,
  DegradationInfoSchema,
} from "@quillby/content";

describe("ContentPlanSchema", () => {
  it("accepts valid minimal plan", () => {
    const result = ContentPlanSchema.parse({
      id: "plan-abc",
      name: "Weekly LinkedIn",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.name).toBe("Weekly LinkedIn");
    expect(result.status).toBe("active");
    expect(result.tags).toEqual([]);
  });

  it("accepts valid full plan", () => {
    const result = ContentPlanSchema.parse({
      id: "plan-123",
      name: "Monthly Newsletter",
      description: "March 2026 newsletter campaign",
      dateStart: "2026-03-01",
      dateEnd: "2026-03-31",
      status: "active",
      tags: ["newsletter", "march"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.description).toBe("March 2026 newsletter campaign");
    expect(result.tags).toHaveLength(2);
  });

  it("rejects invalid status", () => {
    expect(() => ContentPlanSchema.parse({
      id: "plan-1",
      name: "Test",
      status: "invalid",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })).toThrow();
  });

  it("defaults description to empty string", () => {
    const result = ContentPlanSchema.parse({
      id: "plan-1",
      name: "Test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.description).toBe("");
  });

  it("rejects missing name", () => {
    expect(() => ContentPlanSchema.parse({
      id: "plan-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })).toThrow();
  });
});

describe("ContentTaskSchema", () => {
  it("accepts valid minimal task", () => {
    const result = ContentTaskSchema.parse({
      id: "task-abc",
      planId: "plan-123",
      title: "Write LinkedIn post",
      type: "compose",
      priority: "p1",
      status: "todo",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.title).toBe("Write LinkedIn post");
    expect(result.type).toBe("compose");
  });

  it("accepts task with all fields", () => {
    const result = ContentTaskSchema.parse({
      id: "task-xyz",
      planId: "plan-123",
      title: "Review analytics",
      type: "research",
      priority: "p2",
      status: "doing",
      actor: "strategist",
      platform: "linkedin",
      cardId: 42,
      draftId: "draft-1",
      description: "Deep dive into last week's metrics",
      dueDate: "2026-03-15",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(result.actor).toBe("strategist");
    expect(result.dueDate).toBe("2026-03-15");
  });

  it("rejects invalid type", () => {
    expect(() => ContentTaskSchema.parse({
      id: "task-1",
      planId: "plan-1",
      title: "Test",
      type: "invalid",
      priority: "p1",
      status: "todo",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })).toThrow();
  });

  it("rejects invalid priority", () => {
    expect(() => ContentTaskSchema.parse({
      id: "task-1",
      planId: "plan-1",
      title: "Test",
      type: "compose",
      priority: "p4",
      status: "todo",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })).toThrow();
  });
});

describe("CalendarEntrySchema", () => {
  it("accepts valid entry", () => {
    const result = CalendarEntrySchema.parse({
      date: "2026-03-15",
      tasks: [{ taskId: "task-1", planId: "plan-1" }],
    });
    expect(result.date).toBe("2026-03-15");
    expect(result.tasks).toHaveLength(1);
  });

  it("rejects missing tasks", () => {
    expect(() => CalendarEntrySchema.parse({ date: "2026-03-15" })).toThrow();
  });
});

describe("SessionSchema", () => {
  it("accepts valid minimal session", () => {
    const result = SessionSchema.parse({
      id: "session-abc",
      workspaceId: "default",
      scope: { type: "freeform", goal: "Research topic X", constraints: [] },
      state: "planning",
      startedAt: "2026-01-01T00:00:00.000Z",
      lastActivityAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.state).toBe("planning");
    expect(result.degradation.warnings).toEqual([]);
  });

  it("accepts closed session", () => {
    const result = SessionSchema.parse({
      id: "session-xyz",
      workspaceId: "default",
      scope: { type: "task", goal: "Write post", constraints: [] },
      state: "closing",
      startedAt: "2026-01-01T00:00:00.000Z",
      lastActivityAt: "2026-01-02T00:00:00.000Z",
      closedAt: "2026-01-02T00:00:00.000Z",
      summary: "Completed 3 drafts",
    });
    expect(result.closedAt).toBeDefined();
    expect(result.summary).toBe("Completed 3 drafts");
  });

  it("rejects invalid state", () => {
    expect(() => SessionSchema.parse({
      id: "session-1",
      workspaceId: "default",
      scope: { type: "freeform", goal: "Test", constraints: [] },
      state: "invalid",
      startedAt: "2026-01-01T00:00:00.000Z",
      lastActivityAt: "2026-01-01T00:00:00.000Z",
    })).toThrow();
  });
});

describe("SessionScopeSchema", () => {
  it("accepts campaign scope with IDs", () => {
    const result = SessionScopeSchema.parse({
      type: "campaign",
      goal: "Weekly LinkedIn",
      constraints: ["LinkedIn only"],
      campaignId: "campaign-1",
    });
    expect(result.campaignId).toBe("campaign-1");
  });

  it("rejects missing goal", () => {
    expect(() => SessionScopeSchema.parse({
      type: "freeform",
      constraints: [],
    })).toThrow();
  });
});

describe("DegradationInfoSchema", () => {
  it("applies empty defaults", () => {
    const result = DegradationInfoSchema.parse({});
    expect(result.warnings).toEqual([]);
  });

  it("accepts full degradation info", () => {
    const result = DegradationInfoSchema.parse({
      tokenBudget: 8000,
      tokensUsed: 4000,
      contextAgeMinutes: 10,
      warnings: ["Token budget 50% exhausted."],
    });
    expect(result.tokenBudget).toBe(8000);
    expect(result.warnings).toHaveLength(1);
  });
});
