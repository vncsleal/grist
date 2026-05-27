import type { Campaign, StageConfig, StageStatus, ExecutionLog } from "./types.js";

export function transitionStage(
  campaign: Campaign,
  stageName: string,
  toStatus: StageStatus,
  meta?: { error?: string; result?: Record<string, unknown> },
): Campaign {
  const now = new Date().toISOString();
  const existing = campaign.executions.find((e) => e.stageName === stageName);

  const updatedExecution: ExecutionLog = {
    stageName,
    status: toStatus,
    startedAt: existing?.startedAt ?? (toStatus === "running" ? now : undefined),
    completedAt: toStatus === "completed" || toStatus === "failed" || toStatus === "skipped" ? now : undefined,
    error: meta?.error,
    result: meta?.result,
    retryAttempt: existing?.retryAttempt ?? 0,
  };

  const executions = [
    ...campaign.executions.filter((e) => e.stageName !== stageName),
    updatedExecution,
  ];

  const allCompleted = executions
    .filter((e) => campaign.stages.some((s) => s.name === e.stageName))
    .every((e) => e.status === "completed" || e.status === "skipped");

  const anyFailed = executions.some((e) => e.status === "failed");

  return {
    ...campaign,
    executions,
    status: allCompleted ? "completed" : anyFailed ? "failed" : campaign.status,
    startedAt: campaign.startedAt ?? (toStatus === "running" ? now : undefined),
    completedAt: allCompleted ? now : undefined,
    error: meta?.error,
    updatedAt: now,
  };
}

export function areDependenciesMet(stage: StageConfig, campaign: Campaign): boolean {
  for (const dep of stage.dependsOn) {
    const execution = campaign.executions.find((e) => e.stageName === dep);
    if (!execution || (execution.status !== "completed" && execution.status !== "skipped")) {
      return false;
    }
  }
  return true;
}

export function getNextStages(campaign: Campaign): StageConfig[] {
  const startedOrRunning = new Set(
    campaign.executions
      .filter((e) => e.status === "running" || e.status === "completed" || e.status === "skipped")
      .map((e) => e.stageName),
  );

  const failed = new Set(
    campaign.executions
      .filter((e) => e.status === "failed")
      .map((e) => e.stageName),
  );

  return campaign.stages.filter((stage) => {
    if (startedOrRunning.has(stage.name)) return false;
    if (failed.has(stage.name)) return false;
    return areDependenciesMet(stage, campaign);
  });
}

export function checkAllCompleted(campaign: Campaign): boolean {
  return campaign.stages.every((stage) => {
    const execution = campaign.executions.find((e) => e.stageName === stage.name);
    return execution && (execution.status === "completed" || execution.status === "skipped");
  });
}

export function canRetryStage(campaign: Campaign, stageName: string): boolean {
  const stage = campaign.stages.find((s) => s.name === stageName);
  const execution = campaign.executions.find((e) => e.stageName === stageName);
  if (!stage || !execution) return false;
  if (execution.status !== "failed") return false;
  return execution.retryAttempt < stage.retryCount;
}

export function initialExecutionLogs(stages: StageConfig[]): ExecutionLog[] {
  return stages.map((stage) => ({
    stageName: stage.name,
    status: "pending" as const,
    retryAttempt: 0,
  }));
}
