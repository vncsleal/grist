import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import os from "os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-test-"));
const root = tmpDir;

vi.mock("@quillby/workspace", () => ({
  getCurrentWorkspaceId: () => "test-ws",
  getWorkspacePaths: () => ({
    root,
  }),
}));

beforeEach(() => {
  fs.mkdirSync(root, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

import { saveJob, loadJob, listJobs, updateJob } from "../src/jobs.js";

const now = new Date().toISOString();

const sampleJob = {
  id: "job-1",
  workspaceId: "test-ws",
  modality: "image" as const,
  prompt: "A cat",
  status: "queued" as const,
  createdAt: now,
  updatedAt: now,
};

describe("jobs CRUD", () => {
  it("saves and loads a job", () => {
    saveJob(sampleJob);
    const loaded = loadJob("job-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.prompt).toBe("A cat");
  });

  it("returns null for missing job", () => {
    expect(loadJob("nonexistent")).toBeNull();
  });

  it("lists all jobs", () => {
    saveJob(sampleJob);
    saveJob({ ...sampleJob, id: "job-2", modality: "audio" });
    expect(listJobs()).toHaveLength(2);
  });

  it("filters jobs by modality", () => {
    saveJob(sampleJob);
    saveJob({ ...sampleJob, id: "job-2", modality: "audio" });
    const imageJobs = listJobs("image");
    expect(imageJobs).toHaveLength(1);
    expect(imageJobs[0].id).toBe("job-1");
  });

  it("updates a job", () => {
    saveJob(sampleJob);
    updateJob("job-1", { status: "done" });
    const loaded = loadJob("job-1");
    expect(loaded!.status).toBe("done");
  });

  it("does not throw on updating missing job", () => {
    expect(() => updateJob("nonexistent", { status: "done" })).not.toThrow();
  });

  it("prepends new jobs", () => {
    saveJob(sampleJob);
    saveJob({ ...sampleJob, id: "job-2" });
    const all = listJobs();
    expect(all[0].id).toBe("job-2");
  });
});
