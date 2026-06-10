import * as fs from "fs";
import * as path from "path";
import {
  GenerationJobSchema,
  type GenerationJob,
  type GenerationModality,
} from "@quillby/core";
import { getCurrentWorkspaceId, getWorkspacePaths } from "@quillby/workspace";

function jobsFilePath(workspaceId?: string): string {
  const wsId = workspaceId ?? getCurrentWorkspaceId();
  const paths = getWorkspacePaths(wsId);
  return path.join(paths.root, "jobs.json");
}

function readJobs(workspaceId?: string): GenerationJob[] {
  const file = jobsFilePath(workspaceId);
  if (!fs.existsSync(file)) return [];
  try {
    return GenerationJobSchema.array().parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    // Corrupted jobs file — return empty rather than crashing
    return [];
  }
}

function writeJobs(jobs: GenerationJob[], workspaceId?: string): void {
  const file = jobsFilePath(workspaceId);
  fs.writeFileSync(file, JSON.stringify(jobs, null, 2));
}

export function saveJob(job: GenerationJob, workspaceId?: string): void {
  const jobs = readJobs(workspaceId);
  const idx = jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) {
    jobs[idx] = job;
  } else {
    jobs.unshift(job);
  }
  writeJobs(jobs, workspaceId);
}

export function loadJob(jobId: string, workspaceId?: string): GenerationJob | null {
  return readJobs(workspaceId).find((j) => j.id === jobId) ?? null;
}

export function listJobs(modality?: GenerationModality, workspaceId?: string): GenerationJob[] {
  const all = readJobs(workspaceId);
  return modality ? all.filter((j) => j.modality === modality) : all;
}

export function updateJob(
  jobId: string,
  patch: Partial<GenerationJob>,
  workspaceId?: string
): void {
  const jobs = readJobs(workspaceId);
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) return;
  jobs[idx] = GenerationJobSchema.parse({ ...jobs[idx], ...patch, updatedAt: new Date().toISOString() });
  writeJobs(jobs, workspaceId);
}
