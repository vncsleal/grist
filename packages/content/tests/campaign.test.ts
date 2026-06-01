import { describe, expect, it } from "vitest";
import type { Campaign, StageConfig } from "../src/index.js";
import {
  CampaignStatusSchema,
  StageStatusSchema,
  StageConfigSchema,
  BlueprintSchema,
  ExecutionLogSchema,
  CampaignSchema,
  transitionStage,
  areDependenciesMet,
  getNextStages,
  checkAllCompleted,
  canRetryStage,
  initialExecutionLogs,
} from "../src/index.js";

describe("CampaignStatusSchema", () => {
  it("accepts valid statuses", () => {
    expect(CampaignStatusSchema.parse("planning")).toBe("planning");
    expect(CampaignStatusSchema.parse("active")).toBe("active");
    expect(CampaignStatusSchema.parse("paused")).toBe("paused");
    expect(CampaignStatusSchema.parse("completed")).toBe("completed");
    expect(CampaignStatusSchema.parse("failed")).toBe("failed");
  });

  it("rejects invalid status", () => {
    expect(() => CampaignStatusSchema.parse("unknown")).toThrow();
  });
});

describe("StageStatusSchema", () => {
  it("accepts valid statuses", () => {
    expect(StageStatusSchema.parse("pending")).toBe("pending");
    expect(StageStatusSchema.parse("running")).toBe("running");
    expect(StageStatusSchema.parse("completed")).toBe("completed");
    expect(StageStatusSchema.parse("failed")).toBe("failed");
    expect(StageStatusSchema.parse("skipped")).toBe("skipped");
  });
});

describe("StageConfigSchema", () => {
  it("validates a stage config with defaults", () => {
    const result = StageConfigSchema.parse({
      name: "Research",
      tool: "research_agent",
    });
    expect(result.params).toEqual({});
    expect(result.dependsOn).toEqual([]);
    expect(result.retryCount).toBe(0);
  });

  it("rejects empty name", () => {
    expect(() => StageConfigSchema.parse({ name: "", tool: "x" })).toThrow();
  });
});

describe("BlueprintSchema", () => {
  it("validates a blueprint with defaults", () => {
    const now = new Date().toISOString();
    const result = BlueprintSchema.parse({
      id: "bp-1",
      name: "Weekly Content",
      stages: [{ name: "Research", tool: "research_agent" }],
      createdAt: now,
      updatedAt: now,
    });
    expect(result.description).toBe("");
    expect(result.tags).toEqual([]);
  });
});

describe("ExecutionLogSchema", () => {
  it("validates an execution log with defaults", () => {
    const result = ExecutionLogSchema.parse({
      stageName: "Research",
      status: "pending",
    });
    expect(result.retryAttempt).toBe(0);
  });

  it("validates a complete execution log", () => {
    const result = ExecutionLogSchema.parse({
      stageName: "Research",
      status: "failed",
      startedAt: "2026-06-01T00:00:00.000Z",
      completedAt: "2026-06-01T01:00:00.000Z",
      error: "Timeout",
      result: { reason: "API down" },
      retryAttempt: 2,
    });
    expect(result.error).toBe("Timeout");
    expect(result.retryAttempt).toBe(2);
  });
});

describe("CampaignSchema", () => {
  it("validates a minimal campaign with defaults", () => {
    const now = new Date().toISOString();
    const result = CampaignSchema.parse({
      id: "camp-1",
      workspaceId: "ws-1",
      name: "Launch",
      status: "planning",
      stages: [{ name: "Research", tool: "research_agent" }],
      createdAt: now,
      updatedAt: now,
    });
    expect(result.executions).toEqual([]);
    expect(result.blueprintId).toBe("");
  });
});

const makeStage = (name: string, overrides?: Partial<StageConfig>): StageConfig => ({
  name,
  tool: `${name}_tool`,
  params: {},
  dependsOn: overrides?.dependsOn ?? [],
  condition: undefined,
  retryCount: overrides?.retryCount ?? 0,
  timeout: undefined,
});

const makeCampaign = (overrides?: Partial<Campaign>): Campaign => {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    id: "camp-1",
    workspaceId: "ws-1",
    blueprintId: "",
    name: "Test Campaign",
    status: "active",
    stages: [],
    executions: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

describe("initialExecutionLogs", () => {
  it("creates pending logs for each stage", () => {
    const stages = [makeStage("Research"), makeStage("Write")];
    const logs = initialExecutionLogs(stages);
    expect(logs).toHaveLength(2);
    expect(logs[0].status).toBe("pending");
    expect(logs[0].retryAttempt).toBe(0);
  });
});

describe("areDependenciesMet", () => {
  it("returns true when no dependencies", () => {
    const stage = makeStage("Research");
    const campaign = makeCampaign();
    expect(areDependenciesMet(stage, campaign)).toBe(true);
  });

  it("returns true when all dependencies completed", () => {
    const stage = makeStage("Write", { dependsOn: ["Research"] });
    const campaign = makeCampaign({
      executions: [{ stageName: "Research", status: "completed", retryAttempt: 0 }],
    });
    expect(areDependenciesMet(stage, campaign)).toBe(true);
  });

  it("returns true when dependency skipped", () => {
    const stage = makeStage("Write", { dependsOn: ["Research"] });
    const campaign = makeCampaign({
      executions: [{ stageName: "Research", status: "skipped", retryAttempt: 0 }],
    });
    expect(areDependenciesMet(stage, campaign)).toBe(true);
  });

  it("returns false when dependency not started", () => {
    const stage = makeStage("Write", { dependsOn: ["Research"] });
    const campaign = makeCampaign();
    expect(areDependenciesMet(stage, campaign)).toBe(false);
  });

  it("returns false when dependency failed", () => {
    const stage = makeStage("Write", { dependsOn: ["Research"] });
    const campaign = makeCampaign({
      executions: [{ stageName: "Research", status: "failed", retryAttempt: 0 }],
    });
    expect(areDependenciesMet(stage, campaign)).toBe(false);
  });
});

describe("transitionStage", () => {
  it("transitions a stage to running", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research")],
      executions: [{ stageName: "Research", status: "pending", retryAttempt: 0 }],
    });
    const result = transitionStage(campaign, "Research", "running");
    expect(result.executions[0].status).toBe("running");
    expect(result.executions[0].startedAt).toBeDefined();
    expect(result.startedAt).toBeDefined();
  });

  it("transitions a stage to completed", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research")],
      executions: [{ stageName: "Research", status: "running", retryAttempt: 0 }],
    });
    const result = transitionStage(campaign, "Research", "completed");
    expect(result.executions[0].status).toBe("completed");
    expect(result.executions[0].completedAt).toBeDefined();
    expect(result.status).toBe("completed");
  });

  it("marks campaign as failed on stage failure", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research")],
      executions: [{ stageName: "Research", status: "running", retryAttempt: 0 }],
    });
    const result = transitionStage(campaign, "Research", "failed", { error: "Something broke" });
    expect(result.status).toBe("failed");
    expect(result.error).toBe("Something broke");
  });

  it("preserves existing retry attempt", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research", { retryCount: 2 })],
      executions: [{ stageName: "Research", status: "failed", retryAttempt: 1 }],
    });
    const result = transitionStage(campaign, "Research", "running");
    expect(result.executions[0].retryAttempt).toBe(1);
  });

  it("campaign stays active when some stages remain", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research"), makeStage("Write")],
      executions: [{ stageName: "Research", status: "completed", retryAttempt: 0 }],
    });
    const result = transitionStage(campaign, "Research", "completed");
    expect(result.status).toBe("active");
  });
});

describe("getNextStages", () => {
  it("returns all stages when none started", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research"), makeStage("Write")],
    });
    const next = getNextStages(campaign);
    expect(next).toHaveLength(2);
  });

  it("returns only stages with met dependencies", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research"), makeStage("Write", { dependsOn: ["Research"] })],
    });
    const next = getNextStages(campaign);
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe("Research");
  });

  it("does not return already started or failed stages", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research"), makeStage("Write", { dependsOn: ["Research"] })],
      executions: [
        { stageName: "Research", status: "completed", retryAttempt: 0 },
      ],
    });
    const next = getNextStages(campaign);
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe("Write");
  });

  it("excludes failed stages", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research"), makeStage("Write")],
      executions: [{ stageName: "Research", status: "failed", retryAttempt: 0 }],
    });
    const next = getNextStages(campaign);
    expect(next.every((s) => s.name !== "Research")).toBe(true);
  });
});

describe("checkAllCompleted", () => {
  it("returns true when all stages done or skipped", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research"), makeStage("Write")],
      executions: [
        { stageName: "Research", status: "completed", retryAttempt: 0 },
        { stageName: "Write", status: "skipped", retryAttempt: 0 },
      ],
    });
    expect(checkAllCompleted(campaign)).toBe(true);
  });

  it("returns false when a stage is still pending", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research")],
      executions: [{ stageName: "Research", status: "pending", retryAttempt: 0 }],
    });
    expect(checkAllCompleted(campaign)).toBe(false);
  });
});

describe("canRetryStage", () => {
  it("returns true when stage failed and retries remain", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research", { retryCount: 3 })],
      executions: [{ stageName: "Research", status: "failed", retryAttempt: 1 }],
    });
    expect(canRetryStage(campaign, "Research")).toBe(true);
  });

  it("returns false when retries exhausted", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research", { retryCount: 1 })],
      executions: [{ stageName: "Research", status: "failed", retryAttempt: 1 }],
    });
    expect(canRetryStage(campaign, "Research")).toBe(false);
  });

  it("returns false when stage not found", () => {
    const campaign = makeCampaign();
    expect(canRetryStage(campaign, "Nonexistent")).toBe(false);
  });

  it("returns false when stage has no execution", () => {
    const campaign = makeCampaign({
      stages: [makeStage("Research")],
    });
    expect(canRetryStage(campaign, "Research")).toBe(false);
  });
});
