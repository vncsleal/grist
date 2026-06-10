import { describe, expect, it } from "vitest";
import {
  CampaignSchema,
  BlueprintSchema,
  StageConfigSchema,
  ExecutionLogSchema,
  CampaignStatusSchema,
  StageStatusSchema,
} from "@quillby/content";

describe("CampaignStatusSchema", () => {
  it("accepts all valid statuses", () => {
    expect(CampaignStatusSchema.parse("planning")).toBe("planning");
    expect(CampaignStatusSchema.parse("active")).toBe("active");
    expect(CampaignStatusSchema.parse("paused")).toBe("paused");
    expect(CampaignStatusSchema.parse("completed")).toBe("completed");
    expect(CampaignStatusSchema.parse("failed")).toBe("failed");
  });

  it("rejects invalid status", () => {
    expect(() => CampaignStatusSchema.parse("invalid")).toThrow();
    expect(() => CampaignStatusSchema.parse("")).toThrow();
  });
});

describe("StageStatusSchema", () => {
  it("accepts all valid statuses", () => {
    expect(StageStatusSchema.parse("pending")).toBe("pending");
    expect(StageStatusSchema.parse("running")).toBe("running");
    expect(StageStatusSchema.parse("completed")).toBe("completed");
    expect(StageStatusSchema.parse("failed")).toBe("failed");
    expect(StageStatusSchema.parse("skipped")).toBe("skipped");
  });

  it("rejects invalid status", () => {
    expect(() => StageStatusSchema.parse("unknown")).toThrow();
  });
});

describe("StageConfigSchema", () => {
  it("accepts valid minimal config", () => {
    const result = StageConfigSchema.parse({ name: "research", tool: "gather" });
    expect(result.name).toBe("research");
    expect(result.params).toEqual({});
    expect(result.dependsOn).toEqual([]);
    expect(result.retryCount).toBe(0);
  });

  it("accepts full config with all fields", () => {
    const result = StageConfigSchema.parse({
      name: "write",
      tool: "composer",
      params: { style: "formal" },
      dependsOn: ["research"],
      condition: "campaign.status === 'active'",
      retryCount: 2,
      timeout: 60000,
    });
    expect(result.params.style).toBe("formal");
    expect(result.dependsOn).toEqual(["research"]);
    expect(result.retryCount).toBe(2);
    expect(result.timeout).toBe(60000);
  });

  it("rejects empty name", () => {
    expect(() => StageConfigSchema.parse({ name: "", tool: "gather" })).toThrow();
  });

  it("rejects negative retryCount", () => {
    expect(() => StageConfigSchema.parse({ name: "x", tool: "y", retryCount: -1 })).toThrow();
  });

  it("rejects non-integer retryCount", () => {
    expect(() => StageConfigSchema.parse({ name: "x", tool: "y", retryCount: 1.5 })).toThrow();
  });
});

describe("ExecutionLogSchema", () => {
  it("accepts valid minimal log", () => {
    const result = ExecutionLogSchema.parse({
      stageName: "research",
      status: "pending",
    });
    expect(result.retryAttempt).toBe(0);
    expect(result.startedAt).toBeUndefined();
  });

  it("rejects empty stageName", () => {
    expect(() => ExecutionLogSchema.parse({
      stageName: "",
      status: "pending",
    })).toThrow();
  });

  it("accepts completed log with all fields", () => {
    const result = ExecutionLogSchema.parse({
      stageName: "write",
      status: "completed",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T01:00:00.000Z",
      error: undefined,
      result: { wordCount: 500 },
      retryAttempt: 1,
    });
    expect(result.result!.wordCount).toBe(500);
    expect(result.retryAttempt).toBe(1);
  });

  it("rejects invalid stage status", () => {
    expect(() => ExecutionLogSchema.parse({
      stageName: "x",
      status: "unknown",
    })).toThrow();
  });

  it("accepts failed log with error", () => {
    const result = ExecutionLogSchema.parse({
      stageName: "deploy",
      status: "failed",
      error: "Connection timeout",
    });
    expect(result.error).toBe("Connection timeout");
  });
});

describe("BlueprintSchema", () => {
  it("accepts valid blueprint", () => {
    const result = BlueprintSchema.parse({
      id: "bp-123",
      name: "Weekly LinkedIn",
      stages: [{ name: "research", tool: "gather" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.description).toBe("");
    expect(result.tags).toEqual([]);
  });

  it("accepts blueprint with all fields", () => {
    const result = BlueprintSchema.parse({
      id: "bp-456",
      name: "Newsletter",
      description: "Monthly newsletter pipeline",
      stages: [
        { name: "research", tool: "gather" },
        { name: "write", tool: "composer", dependsOn: ["research"] },
      ],
      tags: ["newsletter", "monthly"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(result.stages).toHaveLength(2);
    expect(result.tags).toHaveLength(2);
  });

  it("rejects blueprint without stages", () => {
    expect(() => BlueprintSchema.parse({
      id: "bp-1",
      name: "Empty",
      stages: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })).toThrow();
  });

  it("rejects missing name", () => {
    expect(() => BlueprintSchema.parse({
      id: "bp-1",
      stages: [{ name: "x", tool: "y" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })).toThrow();
  });
});

describe("CampaignSchema", () => {
  it("accepts valid minimal campaign", () => {
    const result = CampaignSchema.parse({
      id: "camp-123",
      workspaceId: "default",
      name: "Test Campaign",
      status: "planning",
      stages: [{ name: "research", tool: "gather" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.executions).toEqual([]);
    expect(result.blueprintId).toBe("");
  });

  it("accepts campaign with executions", () => {
    const result = CampaignSchema.parse({
      id: "camp-456",
      workspaceId: "ws-1",
      blueprintId: "bp-1",
      name: "Active Campaign",
      status: "active",
      stages: [{ name: "research", tool: "gather" }],
      executions: [{ stageName: "research", status: "running", startedAt: "2026-01-01T00:00:00.000Z" }],
      startedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.executions).toHaveLength(1);
    expect(result.startedAt).toBeDefined();
  });

  it("accepts completed campaign", () => {
    const result = CampaignSchema.parse({
      id: "camp-789",
      workspaceId: "default",
      name: "Done",
      status: "completed",
      stages: [{ name: "stage1", tool: "t" }],
      executions: [{ stageName: "stage1", status: "completed", completedAt: "2026-01-01T01:00:00.000Z" }],
      completedAt: "2026-01-01T01:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T01:00:00.000Z",
    });
    expect(result.completedAt).toBeDefined();
  });

  it("accepts failed campaign with error", () => {
    const result = CampaignSchema.parse({
      id: "camp-fail",
      workspaceId: "default",
      name: "Failed",
      status: "failed",
      stages: [{ name: "deploy", tool: "t" }],
      executions: [{ stageName: "deploy", status: "failed", error: "Timeout" }],
      error: "Timeout",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.error).toBe("Timeout");
  });

  it("rejects invalid campaign status", () => {
    expect(() => CampaignSchema.parse({
      id: "camp-1",
      workspaceId: "default",
      name: "Bad",
      status: "unknown",
      stages: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => CampaignSchema.parse({
      id: "camp-1",
      workspaceId: "default",
      name: "",
      status: "planning",
      stages: [{ name: "x", tool: "y" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })).toThrow();
  });

  it("rejects empty workspaceId", () => {
    expect(() => CampaignSchema.parse({
      id: "camp-1",
      workspaceId: "",
      name: "Test",
      status: "planning",
      stages: [{ name: "x", tool: "y" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })).toThrow();
  });

  it("rejects empty stages array", () => {
    expect(() => CampaignSchema.parse({
      id: "camp-1",
      workspaceId: "default",
      name: "No Stages",
      status: "planning",
      stages: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })).toThrow();
  });

  it("rejects empty id", () => {
    expect(() => CampaignSchema.parse({
      id: "",
      workspaceId: "default",
      name: "Test",
      status: "planning",
      stages: [{ name: "x", tool: "y" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })).toThrow();
  });
});
