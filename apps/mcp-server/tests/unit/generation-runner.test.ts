import { describe, expect, it, vi } from "vitest";

interface MockJob {
  id: string;
  workspaceId: string;
  modality: string;
  prompt: string;
  status: string;
  outputRef?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface MockProviderRequest {
  modality: string;
  prompt: string;
  visualStyle?: string;
  voiceProfile?: string;
  faceProfile?: string;
  faceReferenceImageUrl?: string;
  voiceReferenceAudioUrl?: string;
  cloneConsentGranted?: boolean;
  elevenlabsClonedVoiceId?: string;
  drivingAudioUrl?: string;
  aspectRatio?: string;
}

interface MockProviderResult {
  outputRef: string;
  provider: string;
  mimeType: string;
  meta?: Record<string, unknown>;
}

function createMockJobStorage() {
  const store = new Map<string, MockJob>();
  return {
    saveJob: vi.fn().mockImplementation(async (job: MockJob) => {
      store.set(job.id, { ...job });
    }),
    updateJob: vi
      .fn()
      .mockImplementation(async (id: string, patch: Partial<MockJob>) => {
        const existing = store.get(id);
        if (existing) Object.assign(existing, patch);
      }),
    loadJob: vi.fn().mockImplementation(async (id: string) => store.get(id) ?? null),
    listJobs: vi.fn().mockResolvedValue(Array.from(store.values())),
    getPlan: vi.fn().mockResolvedValue("free"),
    _store: store,
  };
}

function createMockProvider(result?: MockProviderResult, shouldThrow = false) {
  return {
    generate: vi.fn().mockImplementation(async (_req: MockProviderRequest) => {
      if (shouldThrow) throw new Error("Provider failure");
      return result ?? { outputRef: "/tmp/output.png", provider: "test", mimeType: "image/png" };
    }),
  };
}

async function runGenerationJob(
  jobStorage: ReturnType<typeof createMockJobStorage>,
  jobId: string,
  modality: string,
  prompt: string,
  provider: ReturnType<typeof createMockProvider>,
  options?: {
    aspectRatio?: string;
    cloneVoice?: boolean;
    cloneAvatar?: boolean;
    drivingAudioUrl?: string;
  }
): Promise<void> {
  await jobStorage.updateJob(jobId, { status: "running" });
  try {
    const req: MockProviderRequest = {
      modality,
      prompt,
      aspectRatio: options?.aspectRatio,
    };
    const result = await provider.generate(req);
    await jobStorage.updateJob(jobId, {
      status: "done",
      outputRef: result.outputRef,
      provider: result.provider,
      meta: JSON.stringify({ mimeType: result.mimeType, ...(result.meta ?? {}) }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await jobStorage.updateJob(jobId, { status: "failed", error: msg });
  }
}

describe("runGenerationJob", () => {
  it("updates status from running to done on success", async () => {
    const jobStorage = createMockJobStorage();
    const provider = createMockProvider({
      outputRef: "/tmp/output.png",
      provider: "test-provider",
      mimeType: "image/png",
    });

    const now = new Date().toISOString();
    await jobStorage.saveJob({
      id: "job-1",
      workspaceId: "ws-1",
      modality: "image",
      prompt: "A beautiful sunset",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    await runGenerationJob(jobStorage, "job-1", "image", "A beautiful sunset", provider);

    const calls = jobStorage.updateJob.mock.calls;
    const runningCall = calls.find((c: unknown[]) => c[0] === "job-1" && c[1]?.status === "running");
    const doneCall = calls.find(
      (c: unknown[]) => c[0] === "job-1" && c[1]?.status === "done"
    );

    expect(runningCall).toBeDefined();
    expect(doneCall).toBeDefined();
    expect(doneCall[1]?.outputRef).toBe("/tmp/output.png");
    expect(doneCall[1]?.provider).toBe("test-provider");
  });

  it("stores outputRef on success", async () => {
    const jobStorage = createMockJobStorage();
    const provider = createMockProvider({
      outputRef: "/tmp/generated.mp3",
      provider: "elevenlabs",
      mimeType: "audio/mpeg",
    });

    const now = new Date().toISOString();
    await jobStorage.saveJob({
      id: "job-2",
      workspaceId: "ws-1",
      modality: "audio",
      prompt: "Narrate this script",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    await runGenerationJob(jobStorage, "job-2", "audio", "Narrate this script", provider);

    const doneCall = jobStorage.updateJob.mock.calls.find(
      (c: unknown[]) => c[0] === "job-2" && c[1]?.status === "done"
    );
    expect(doneCall[1]?.outputRef).toBe("/tmp/generated.mp3");
  });

  it("updates status to failed on error", async () => {
    const jobStorage = createMockJobStorage();
    const provider = createMockProvider(undefined, true);

    const now = new Date().toISOString();
    await jobStorage.saveJob({
      id: "job-3",
      workspaceId: "ws-1",
      modality: "video",
      prompt: "A cinematic scene",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });

    await runGenerationJob(jobStorage, "job-3", "video", "A cinematic scene", provider);

    const failedCall = jobStorage.updateJob.mock.calls.find(
      (c: unknown[]) => c[0] === "job-3" && c[1]?.status === "failed"
    );
    expect(failedCall).toBeDefined();
    expect(failedCall[1]?.error).toBe("Provider failure");
  });
});
