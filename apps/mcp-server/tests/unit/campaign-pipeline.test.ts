import { describe, expect, it } from "vitest";
import {
  transitionStage,
  areDependenciesMet,
  getNextStages,
  checkAllCompleted,
  canRetryStage,
  initialExecutionLogs,
  type Campaign,
  type StageConfig,
} from "@quillby/content";

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp-test",
    workspaceId: "default",
    blueprintId: "bp-1",
    name: "Test Campaign",
    status: "active",
    stages: [
      { name: "research", tool: "gather", params: {}, dependsOn: [], retryCount: 0 },
      { name: "write", tool: "composer", params: {}, dependsOn: ["research"], retryCount: 2 },
      { name: "review", tool: "editor", params: {}, dependsOn: ["write"], retryCount: 0 },
      { name: "publish", tool: "deploy", params: {}, dependsOn: ["review"], retryCount: 0 },
    ],
    executions: [
      { stageName: "research", status: "completed", retryAttempt: 0, completedAt: new Date().toISOString() },
      { stageName: "write", status: "pending", retryAttempt: 0 },
      { stageName: "review", status: "pending", retryAttempt: 0 },
      { stageName: "publish", status: "pending", retryAttempt: 0 },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function nowApprox(a: string, b: string): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 1000;
}

describe("transitionStage", () => {
  it("transitions a stage to running", () => {
    const campaign = makeCampaign();
    const updated = transitionStage(campaign, "write", "running");
    const exec = updated.executions.find((e) => e.stageName === "write")!;
    expect(exec.status).toBe("running");
    expect(exec.startedAt).toBeDefined();
    expect(updated.status).toBe("active");
  });

  it("transitions a stage to completed", () => {
    const campaign = makeCampaign();
    const updated = transitionStage(campaign, "write", "completed", { result: { wordCount: 500 } });
    const exec = updated.executions.find((e) => e.stageName === "write")!;
    expect(exec.status).toBe("completed");
    expect(exec.completedAt).toBeDefined();
    expect(exec.result).toEqual({ wordCount: 500 });
  });

  it("transitions campaign to completed when all stages done", () => {
    const campaign = makeCampaign();
    let updated = transitionStage(campaign, "write", "completed");
    updated = transitionStage(updated, "review", "completed");
    updated = transitionStage(updated, "publish", "completed");
    expect(updated.status).toBe("completed");
    expect(updated.completedAt).toBeDefined();
  });

  it("sets campaign status to failed when any stage fails", () => {
    const campaign = makeCampaign();
    const updated = transitionStage(campaign, "write", "failed", { error: "Out of ideas" });
    expect(updated.status).toBe("failed");
    expect(updated.error).toBe("Out of ideas");
  });

  it("sets startedAt when first stage transitions to running", () => {
    const campaign = makeCampaign({ startedAt: undefined });
    const updated = transitionStage(campaign, "write", "running");
    expect(updated.startedAt).toBeDefined();
  });

  it("preserves startedAt on subsequent transitions", () => {
    const campaign = makeCampaign();
    const updated = transitionStage(campaign, "write", "running");
    expect(updated.startedAt).toBe(campaign.startedAt);
  });

  it("updates updatedAt on every transition", () => {
    const campaign = makeCampaign();
    const updated = transitionStage(campaign, "write", "running");
    expect(nowApprox(updated.updatedAt, new Date().toISOString())).toBe(true);
  });

  it("replaces existing execution for the same stage", () => {
    const campaign = makeCampaign();
    const updated = transitionStage(campaign, "research", "completed", { result: { depth: "full" } });
    expect(updated.executions.filter((e) => e.stageName === "research")).toHaveLength(1);
    expect(updated.executions.find((e) => e.stageName === "research")!.result).toEqual({ depth: "full" });
  });
});

describe("areDependenciesMet", () => {
  it("returns true when no dependencies", () => {
    const campaign = makeCampaign();
    const stage: StageConfig = { name: "standalone", tool: "x", params: {}, dependsOn: [], retryCount: 0 };
    expect(areDependenciesMet(stage, campaign)).toBe(true);
  });

  it("returns true when all deps completed", () => {
    const campaign = makeCampaign();
    const stage = campaign.stages[1]!;
    expect(areDependenciesMet(stage, campaign)).toBe(true);
  });

  it("returns true when deps are skipped", () => {
    const campaign = makeCampaign({
      executions: [
        { stageName: "research", status: "skipped", retryAttempt: 0 },
        { stageName: "write", status: "pending", retryAttempt: 0 },
        { stageName: "review", status: "pending", retryAttempt: 0 },
        { stageName: "publish", status: "pending", retryAttempt: 0 },
      ],
    });
    const stage = campaign.stages[1]!;
    expect(areDependenciesMet(stage, campaign)).toBe(true);
  });

  it("returns false when a dep is still pending", () => {
    const campaign = makeCampaign();
    const stage = campaign.stages[3]!; // publish depends on review
    expect(areDependenciesMet(stage, campaign)).toBe(false);
  });

  it("returns false when a dep has failed", () => {
    const campaign = makeCampaign({
      executions: [
        { stageName: "research", status: "completed", retryAttempt: 0 },
        { stageName: "write", status: "failed", retryAttempt: 1, error: "Error" },
        { stageName: "review", status: "pending", retryAttempt: 0 },
        { stageName: "publish", status: "pending", retryAttempt: 0 },
      ],
    });
    const stage = campaign.stages[2]!; // review depends on write
    expect(areDependenciesMet(stage, campaign)).toBe(false);
  });

  it("returns false when a dep execution is missing", () => {
    const campaign = makeCampaign({ executions: [] });
    const stage: StageConfig = { name: "x", tool: "t", params: {}, dependsOn: ["research"], retryCount: 0 };
    expect(areDependenciesMet(stage, campaign)).toBe(false);
  });
});

describe("getNextStages", () => {
  it("returns stages whose deps are met and not started", () => {
    const campaign = makeCampaign();
    const next = getNextStages(campaign);
    expect(next).toHaveLength(1);
    expect(next[0]!.name).toBe("write");
  });

  it("returns multiple ready stages when deps are met", () => {
    const campaign = makeCampaign({
      stages: [
        { name: "a", tool: "t1", params: {}, dependsOn: [], retryCount: 0 },
        { name: "b", tool: "t2", params: {}, dependsOn: [], retryCount: 0 },
      ],
      executions: [],
    });
    const next = getNextStages(campaign);
    expect(next).toHaveLength(2);
  });

  it("does not return already running stages", () => {
    const campaign = makeCampaign({
      stages: [
        { name: "research", tool: "gather", params: {}, dependsOn: [], retryCount: 0 },
        { name: "write", tool: "composer", params: {}, dependsOn: ["research"], retryCount: 2 },
        { name: "publish", tool: "deploy", params: {}, dependsOn: ["research"], retryCount: 0 },
      ],
      executions: [
        { stageName: "research", status: "completed", retryAttempt: 0 },
        { stageName: "write", status: "running", retryAttempt: 0 },
        { stageName: "publish", status: "pending", retryAttempt: 0 },
      ],
    });
    const next = getNextStages(campaign);
    expect(next.find((s) => s.name === "write")).toBeUndefined();
    expect(next.find((s) => s.name === "publish")).toBeDefined();
  });

  it("does not return failed stages", () => {
    const campaign = makeCampaign({
      executions: [
        { stageName: "research", status: "completed", retryAttempt: 0 },
        { stageName: "write", status: "failed", retryAttempt: 1, error: "Error" },
        { stageName: "review", status: "pending", retryAttempt: 0 },
        { stageName: "publish", status: "pending", retryAttempt: 0 },
      ],
    });
    const next = getNextStages(campaign);
    expect(next.find((s) => s.name === "write")).toBeUndefined();
    expect(next.find((s) => s.name === "review")).toBeUndefined(); // review depends on write
  });

  it("returns empty when all stages are done", () => {
    const campaign = makeCampaign({
      executions: [
        { stageName: "research", status: "completed", retryAttempt: 0 },
        { stageName: "write", status: "completed", retryAttempt: 0 },
        { stageName: "review", status: "completed", retryAttempt: 0 },
        { stageName: "publish", status: "completed", retryAttempt: 0 },
      ],
    });
    expect(getNextStages(campaign)).toHaveLength(0);
  });
});

describe("checkAllCompleted", () => {
  it("returns true when all stages completed", () => {
    const campaign = makeCampaign({
      executions: [
        { stageName: "research", status: "completed", retryAttempt: 0 },
        { stageName: "write", status: "completed", retryAttempt: 0 },
        { stageName: "review", status: "completed", retryAttempt: 0 },
        { stageName: "publish", status: "completed", retryAttempt: 0 },
      ],
    });
    expect(checkAllCompleted(campaign)).toBe(true);
  });

  it("returns true when some stages are skipped", () => {
    const campaign = makeCampaign({
      executions: [
        { stageName: "research", status: "skipped", retryAttempt: 0 },
        { stageName: "write", status: "completed", retryAttempt: 0 },
        { stageName: "review", status: "completed", retryAttempt: 0 },
        { stageName: "publish", status: "skipped", retryAttempt: 0 },
      ],
    });
    expect(checkAllCompleted(campaign)).toBe(true);
  });

  it("returns false when a stage is pending", () => {
    const campaign = makeCampaign();
    expect(checkAllCompleted(campaign)).toBe(false);
  });

  it("returns false when a stage has failed", () => {
    const campaign = makeCampaign({
      executions: [
        { stageName: "research", status: "completed", retryAttempt: 0 },
        { stageName: "write", status: "failed", retryAttempt: 1 },
        { stageName: "review", status: "pending", retryAttempt: 0 },
        { stageName: "publish", status: "pending", retryAttempt: 0 },
      ],
    });
    expect(checkAllCompleted(campaign)).toBe(false);
  });
});

describe("canRetryStage", () => {
  it("returns true when retries remain", () => {
    const campaign = makeCampaign({
      executions: [
        { stageName: "research", status: "completed", retryAttempt: 0 },
        { stageName: "write", status: "failed", retryAttempt: 0, error: "Error" },
        { stageName: "review", status: "pending", retryAttempt: 0 },
        { stageName: "publish", status: "pending", retryAttempt: 0 },
      ],
    });
    expect(canRetryStage(campaign, "write")).toBe(true);
  });

  it("returns false when retries exhausted", () => {
    const campaign = makeCampaign({
      executions: [
        { stageName: "research", status: "completed", retryAttempt: 0 },
        { stageName: "write", status: "failed", retryAttempt: 2, error: "Error" },
        { stageName: "review", status: "pending", retryAttempt: 0 },
        { stageName: "publish", status: "pending", retryAttempt: 0 },
      ],
    });
    expect(canRetryStage(campaign, "write")).toBe(false);
  });

  it("returns false when stage is not failed", () => {
    const campaign = makeCampaign();
    expect(canRetryStage(campaign, "write")).toBe(false);
  });

  it("returns false when stage does not exist", () => {
    const campaign = makeCampaign();
    expect(canRetryStage(campaign, "nonexistent")).toBe(false);
  });

  it("returns false when execution does not exist", () => {
    const campaign = makeCampaign({ executions: [] });
    expect(canRetryStage(campaign, "research")).toBe(false);
  });

  it("returns false when stage has no retryCount (default 0)", () => {
    const campaign = makeCampaign({
      executions: [
        { stageName: "research", status: "failed", retryAttempt: 0, error: "E" },
        { stageName: "write", status: "pending", retryAttempt: 0 },
        { stageName: "review", status: "pending", retryAttempt: 0 },
        { stageName: "publish", status: "pending", retryAttempt: 0 },
      ],
    });
    expect(canRetryStage(campaign, "research")).toBe(false);
  });
});

describe("initialExecutionLogs", () => {
  it("creates pending logs for each stage", () => {
    const stages: StageConfig[] = [
      { name: "a", tool: "t1", params: {}, dependsOn: [], retryCount: 0 },
      { name: "b", tool: "t2", params: {}, dependsOn: [], retryCount: 0 },
    ];
    const logs = initialExecutionLogs(stages);
    expect(logs).toHaveLength(2);
    expect(logs[0]!.status).toBe("pending");
    expect(logs[0]!.retryAttempt).toBe(0);
    expect(logs[1]!.status).toBe("pending");
  });
});

describe("edge cases", () => {
  it("circular dependencies: getNextStages returns none when all depend on each other", () => {
    const campaign = makeCampaign({
      stages: [
        { name: "a", tool: "t1", params: {}, dependsOn: ["b"], retryCount: 0 },
        { name: "b", tool: "t2", params: {}, dependsOn: ["a"], retryCount: 0 },
      ],
      executions: [],
    });
    const next = getNextStages(campaign);
    expect(next).toHaveLength(0);
  });

  it("last stage skipped marks campaign as completed", () => {
    const campaign = makeCampaign({
      executions: [
        { stageName: "research", status: "completed", retryAttempt: 0 },
        { stageName: "write", status: "skipped", retryAttempt: 0 },
        { stageName: "review", status: "completed", retryAttempt: 0 },
        { stageName: "publish", status: "pending", retryAttempt: 0 },
      ],
    });
    expect(checkAllCompleted(campaign)).toBe(false);
    const updated = transitionStage(campaign, "publish", "skipped");
    expect(updated.status).toBe("completed");
  });

  it("retry exhaustion triggers no more retries", () => {
    const campaign = makeCampaign({
      stages: [
        { name: "research", tool: "gather", params: {}, dependsOn: [], retryCount: 2 },
        { name: "write", tool: "composer", params: {}, dependsOn: ["research"], retryCount: 2 },
        { name: "review", tool: "editor", params: {}, dependsOn: ["write"], retryCount: 2 },
        { name: "publish", tool: "deploy", params: {}, dependsOn: ["review"], retryCount: 2 },
      ],
      executions: [
        { stageName: "research", status: "completed", retryAttempt: 0 },
        { stageName: "write", status: "failed", retryAttempt: 2, error: "Final error" },
        { stageName: "review", status: "pending", retryAttempt: 0 },
        { stageName: "publish", status: "pending", retryAttempt: 0 },
      ],
    });
    expect(canRetryStage(campaign, "write")).toBe(false);
  });

  it("all stage config fields survive transition", () => {
    const campaign = makeCampaign({
      stages: [
        {
          name: "research", tool: "gather",
          params: { depth: "full" }, dependsOn: [], retryCount: 2, timeout: 30000, condition: "always",
        },
      ],
    });
    const updated = transitionStage(campaign, "research", "completed");
    const stage = updated.stages.find((s) => s.name === "research")!;
    expect(stage.timeout).toBe(30000);
    expect(stage.condition).toBe("always");
    expect(stage.retryCount).toBe(2);
    expect(stage.params).toEqual({ depth: "full" });
  });

  it("transitionStage handles nonexistent stageName by creating phantom execution", () => {
    const campaign = makeCampaign();
    const updated = transitionStage(campaign, "nonexistent", "completed");
    const exec = updated.executions.find((e) => e.stageName === "nonexistent")!;
    expect(exec).toBeDefined();
    expect(exec.status).toBe("completed");
  });
});
