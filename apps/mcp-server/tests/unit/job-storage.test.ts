import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { sql } from "drizzle-orm";
import { createDb, HostedDbWorkspaceStorage } from "../../src/storage.js";
import type { GenerationJob } from "@quillby/core";

let tempDir = "";
let tempDbPath = "";

function makeJob(overrides: Partial<GenerationJob> = {}): GenerationJob {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? "job-test-1",
    workspaceId: overrides.workspaceId ?? "default",
    modality: "image",
    prompt: "a serene mountain landscape",
    status: "queued",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function createTestDb(userId: string) {
  const { db } = createDb(`file:${tempDbPath}`);
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`));
  await db.run(sql.raw(`INSERT OR IGNORE INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('${userId}', 'Test User', '${userId}@test.com', 1, ${Date.now()}, ${Date.now()})`));
  return { db };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-job-storage-"));
  tempDbPath = path.join(tempDir, "test.db");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("saveJob", () => {
  it("inserts a new job", async () => {
    const { db } = await createTestDb("user-save");
    const storage = new HostedDbWorkspaceStorage("user-save", db);

    const job = makeJob({ id: "job-insert-1", modality: "image" });
    await storage.saveJob(job);

    const loaded = await storage.loadJob("job-insert-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe("job-insert-1");
    expect(loaded!.status).toBe("queued");
    expect(loaded!.modality).toBe("image");
    expect(loaded!.prompt).toBe("a serene mountain landscape");
  });

  it("updates existing job on conflict (same id)", async () => {
    const { db } = await createTestDb("user-conflict");
    const storage = new HostedDbWorkspaceStorage("user-conflict", db);

    const job = makeJob({ id: "job-conflict-1", status: "queued" });
    await storage.saveJob(job);

    const updated = makeJob({ id: "job-conflict-1", status: "running" });
    await storage.saveJob(updated);

    const loaded = await storage.loadJob("job-conflict-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.status).toBe("running");
  });
});

describe("loadJob", () => {
  it("returns null for a missing job", async () => {
    const { db } = await createTestDb("user-load");
    const storage = new HostedDbWorkspaceStorage("user-load", db);

    const loaded = await storage.loadJob("non-existent-job-id");
    expect(loaded).toBeNull();
  });
});

describe("listJobs", () => {
  it("returns all jobs for the current workspace", async () => {
    const { db } = await createTestDb("user-list");
    const storage = new HostedDbWorkspaceStorage("user-list", db);

    const ws = await storage.getCurrentWorkspace();

    await storage.saveJob(makeJob({ id: "list-1", workspaceId: ws.id, modality: "image" }));
    await storage.saveJob(makeJob({ id: "list-2", workspaceId: ws.id, modality: "audio" }));

    const jobs = await storage.listJobs();
    expect(jobs).toHaveLength(2);
  });

  it("filters by modality when specified", async () => {
    const { db } = await createTestDb("user-filter");
    const storage = new HostedDbWorkspaceStorage("user-filter", db);

    const ws = await storage.getCurrentWorkspace();

    await storage.saveJob(makeJob({ id: "filter-1", workspaceId: ws.id, modality: "image" }));
    await storage.saveJob(makeJob({ id: "filter-2", workspaceId: ws.id, modality: "audio" }));
    await storage.saveJob(makeJob({ id: "filter-3", workspaceId: ws.id, modality: "video" }));

    const audioJobs = await storage.listJobs("audio");
    expect(audioJobs).toHaveLength(1);
    expect(audioJobs[0]!.id).toBe("filter-2");
  });
});

describe("updateJob", () => {
  it("updates job status and outputRef", async () => {
    const { db } = await createTestDb("user-update");
    const storage = new HostedDbWorkspaceStorage("user-update", db);

    const job = makeJob({ id: "job-update-1", status: "queued" });
    await storage.saveJob(job);

    await storage.updateJob("job-update-1", {
      status: "done",
      outputRef: "/outputs/image-1.png",
    });

    const loaded = await storage.loadJob("job-update-1");
    expect(loaded!.status).toBe("done");
    expect(loaded!.outputRef).toBe("/outputs/image-1.png");
  });

  it("updates error field on failure", async () => {
    const { db } = await createTestDb("user-error");
    const storage = new HostedDbWorkspaceStorage("user-error", db);

    const job = makeJob({ id: "job-error-1", status: "running" });
    await storage.saveJob(job);

    await storage.updateJob("job-error-1", {
      status: "failed",
      error: "API rate limit exceeded",
    });

    const loaded = await storage.loadJob("job-error-1");
    expect(loaded!.status).toBe("failed");
    expect(loaded!.error).toBe("API rate limit exceeded");
  });
});

describe("getMonthlyJobCount", () => {
  it("returns 0 when no jobs exist", async () => {
    const { db } = await createTestDb("user-count");
    const storage = new HostedDbWorkspaceStorage("user-count", db);

    const count = await storage.getMonthlyJobCount("image");
    expect(count).toBe(0);
  });

  it("returns the correct count for the current month", async () => {
    const { db } = await createTestDb("user-count2");
    const storage = new HostedDbWorkspaceStorage("user-count2", db);

    const ws = await storage.getCurrentWorkspace();

    await storage.saveJob(makeJob({ id: "count-1", workspaceId: ws.id, modality: "image" }));
    await storage.saveJob(makeJob({ id: "count-2", workspaceId: ws.id, modality: "image" }));

    const count = await storage.getMonthlyJobCount("image");
    expect(count).toBe(2);
  });

  it("counts only the requested modality", async () => {
    const { db } = await createTestDb("user-count3");
    const storage = new HostedDbWorkspaceStorage("user-count3", db);

    const ws = await storage.getCurrentWorkspace();

    await storage.saveJob(makeJob({ id: "count-m-1", workspaceId: ws.id, modality: "image" }));
    await storage.saveJob(makeJob({ id: "count-m-2", workspaceId: ws.id, modality: "audio" }));

    const imageCount = await storage.getMonthlyJobCount("image");
    const audioCount = await storage.getMonthlyJobCount("audio");

    expect(imageCount).toBe(1);
    expect(audioCount).toBe(1);
  });
});
