import { describe, expect, it, vi } from "vitest";

interface MockJob {
  id: string;
  status: string;
  updatedAt: string;
}

function createMockJobStorage(jobs: MockJob[]) {
  const store = new Map(jobs.map((j) => [j.id, { ...j }]));
  return {
    listJobs: vi.fn().mockResolvedValue(Array.from(store.values())),
    updateJob: vi.fn().mockImplementation(async (id: string, patch: Partial<MockJob>) => {
      const existing = store.get(id);
      if (existing) Object.assign(existing, patch);
    }),
    _store: store,
  };
}

async function recoverOrphanedJobs(storage: ReturnType<typeof createMockJobStorage>): Promise<number> {
  const jobs = await storage.listJobs();
  const cutoff = Date.now() - 5 * 60 * 1000;
  let recovered = 0;
  for (const job of jobs) {
    const updated = new Date(job.updatedAt).getTime();
    if ((job.status === "running" || job.status === "queued") && updated < cutoff) {
      await storage.updateJob(job.id, {
        status: "failed",
        error: "Job runner recovered: orphaned job was abandoned.",
      });
      recovered++;
    }
  }
  return recovered;
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString();
}

describe("recoverOrphanedJobs", () => {
  it("fails jobs stuck in running for > 5 minutes", async () => {
    const storage = createMockJobStorage([
      { id: "job-1", status: "running", updatedAt: minutesAgo(10) },
      { id: "job-2", status: "running", updatedAt: minutesAgo(2) },
    ]);
    const count = await recoverOrphanedJobs(storage);
    expect(count).toBe(1);
    expect(storage.updateJob).toHaveBeenCalledWith("job-1", {
      status: "failed",
      error: expect.stringContaining("orphaned"),
    });
  });

  it("fails jobs stuck in queued for > 5 minutes", async () => {
    const storage = createMockJobStorage([
      { id: "job-1", status: "queued", updatedAt: minutesAgo(6) },
    ]);
    const count = await recoverOrphanedJobs(storage);
    expect(count).toBe(1);
  });

  it("skips recent running jobs (< 5 min)", async () => {
    const storage = createMockJobStorage([
      { id: "job-1", status: "running", updatedAt: minutesAgo(2) },
    ]);
    const count = await recoverOrphanedJobs(storage);
    expect(count).toBe(0);
    expect(storage.updateJob).not.toHaveBeenCalled();
  });

  it("skips completed jobs", async () => {
    const storage = createMockJobStorage([
      { id: "job-1", status: "done", updatedAt: minutesAgo(30) },
      { id: "job-2", status: "failed", updatedAt: minutesAgo(30) },
    ]);
    const count = await recoverOrphanedJobs(storage);
    expect(count).toBe(0);
  });

  it("returns correct count when multiple jobs are recovered", async () => {
    const storage = createMockJobStorage([
      { id: "old-running", status: "running", updatedAt: minutesAgo(10) },
      { id: "old-queued", status: "queued", updatedAt: minutesAgo(10) },
      { id: "recent-running", status: "running", updatedAt: minutesAgo(1) },
      { id: "done", status: "done", updatedAt: minutesAgo(60) },
    ]);
    const count = await recoverOrphanedJobs(storage);
    expect(count).toBe(2);
  });
});
