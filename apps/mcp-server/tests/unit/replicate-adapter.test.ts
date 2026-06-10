import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplicateAdapter } from "@quillby/providers";

// ── Global mocks ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock wait so polling loops run instantly
vi.mock("../../../packages/providers/src/polling.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../packages/providers/src/polling.js")>();
  return { ...original, wait: vi.fn().mockResolvedValue(undefined) };
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function predictionResponse(
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled",
  overrides?: { output?: unknown; error?: string; getUrl?: string },
): Response {
  const body: Record<string, unknown> = { status };
  if (overrides?.output !== undefined) body.output = overrides.output;
  if (overrides?.error) body.error = overrides.error;
  if (overrides?.getUrl) body.urls = { get: overrides.getUrl };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ReplicateAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("id", () => {
    it("returns replicate/multimodal", () => {
      expect(new ReplicateAdapter({ apiToken: "t" }).id).toBe("replicate/multimodal");
    });
  });

  describe("supportedModalities", () => {
    it("returns ['image', 'audio', 'video']", () => {
      expect(new ReplicateAdapter({ apiToken: "t" }).supportedModalities).toEqual(["image", "audio", "video"]);
    });
  });

  describe("generate() — model selection", () => {
    it("uses default image model for image modality", async () => {
      mockFetch.mockResolvedValueOnce(predictionResponse("succeeded", { output: "https://example.com/img.png" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      await adapter.generate({ modality: "image", prompt: "A cat" });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("black-forest-labs/flux-2-pro");
    });

    it("uses default audio model for audio modality", async () => {
      mockFetch.mockResolvedValueOnce(predictionResponse("succeeded", { output: "https://example.com/audio.mp3" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      await adapter.generate({ modality: "audio", prompt: "Hello" });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("minimax/speech-2.8-turbo");
    });

    it("uses default video model for video modality", async () => {
      mockFetch
        .mockResolvedValueOnce(predictionResponse("processing", { getUrl: "https://api.replicate.com/v1/predictions/p1" }))
        .mockResolvedValueOnce(predictionResponse("succeeded", { output: "https://example.com/vid.mp4" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      await adapter.generate({ modality: "video", prompt: "A cat running" });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("runwayml/gen-4.5");
    });
  });

  describe("generate() — clone audio/video", () => {
    it("uses clone audio model when voiceReferenceAudioUrl + consent granted", async () => {
      mockFetch.mockResolvedValueOnce(predictionResponse("succeeded", { output: "https://example.com/clone.mp3" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      await adapter.generate({
        modality: "audio",
        prompt: "Hello",
        voiceReferenceAudioUrl: "https://example.com/ref.mp3",
        cloneConsentGranted: true,
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("resemble-ai/chatterbox-turbo");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.input.reference_audio).toBe("https://example.com/ref.mp3");
      expect(body.input.text).toBe("Hello");
    });

    it("uses clone video model when faceReferenceImageUrl + drivingAudioUrl + consent granted", async () => {
      mockFetch
        .mockResolvedValueOnce(predictionResponse("processing", { getUrl: "https://api.replicate.com/v1/predictions/p1" }))
        .mockResolvedValueOnce(predictionResponse("succeeded", { output: "https://example.com/talk.mp4" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      await adapter.generate({
        modality: "video",
        prompt: "",
        faceReferenceImageUrl: "https://example.com/face.jpg",
        drivingAudioUrl: "https://example.com/drive.mp3",
        cloneConsentGranted: true,
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("bytedance/omni-human");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.input.image).toBe("https://example.com/face.jpg");
      expect(body.input.audio).toBe("https://example.com/drive.mp3");
    });

    it("uses default audio when cloneConsentGranted is false even with voiceReferenceAudioUrl", async () => {
      mockFetch.mockResolvedValueOnce(predictionResponse("succeeded", { output: "https://example.com/audio.mp3" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      await adapter.generate({
        modality: "audio",
        prompt: "Hello",
        voiceReferenceAudioUrl: "https://example.com/ref.mp3",
        cloneConsentGranted: false,
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("minimax/speech-2.8-turbo");
    });
  });

  describe("generate() — prediction flow", () => {
    it("submits to Replicate predict endpoint with correct headers", async () => {
      mockFetch.mockResolvedValueOnce(predictionResponse("succeeded", { output: "https://example.com/out.png" }));

      const adapter = new ReplicateAdapter({ apiToken: "r8_token" });
      await adapter.generate({ modality: "image", prompt: "Cat" });

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.replicate.com/v1/models/");
      expect(url).toContain("/predictions");
      expect(opts.method).toBe("POST");
      expect(opts.headers["Authorization"]).toBe("Bearer r8_token");
      expect(opts.headers["Content-Type"]).toBe("application/json");
      expect(opts.headers["Prefer"]).toBe("wait");
    });

    it("uses Prefer: respond-async for video modality", async () => {
      mockFetch
        .mockResolvedValueOnce(predictionResponse("processing", { getUrl: "https://api.replicate.com/v1/predictions/p1" }))
        .mockResolvedValueOnce(predictionResponse("succeeded", { output: "https://example.com/vid.mp4" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      await adapter.generate({ modality: "video", prompt: "Cat" });

      expect(mockFetch.mock.calls[0][1].headers["Prefer"]).toBe("respond-async");
    });

    it("returns immediately when prediction succeeds on first response", async () => {
      mockFetch.mockResolvedValueOnce(predictionResponse("succeeded", { output: "https://example.com/out.png" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      const result = await adapter.generate({ modality: "image", prompt: "Cat" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.outputRef).toBe("https://example.com/out.png");
      expect(result.mimeType).toBe("image/png");
      expect(result.provider).toBe("replicate/multimodal");
    });

    it("polls for completion when prediction starts as processing", async () => {
      mockFetch
        .mockResolvedValueOnce(predictionResponse("processing", { getUrl: "https://api.replicate.com/v1/predictions/p1" }))
        .mockResolvedValueOnce(predictionResponse("succeeded", { output: "https://example.com/out.png" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      const result = await adapter.generate({ modality: "image", prompt: "Cat" });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const pollUrl = mockFetch.mock.calls[1][0];
      expect(pollUrl).toBe("https://api.replicate.com/v1/predictions/p1");
      expect(result.outputRef).toBe("https://example.com/out.png");
    });

    it("throws on failed status in initial prediction", async () => {
      mockFetch.mockResolvedValueOnce(predictionResponse("failed", { error: "Credit limit exceeded" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      await expect(adapter.generate({ modality: "image", prompt: "Cat" })).rejects.toThrow(
        "Replicate prediction failed: Credit limit exceeded",
      );
    });

    it("throws on canceled status in initial prediction", async () => {
      mockFetch.mockResolvedValueOnce(predictionResponse("canceled", { error: "User cancelled" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      await expect(adapter.generate({ modality: "image", prompt: "Cat" })).rejects.toThrow(
        "Replicate prediction canceled: User cancelled",
      );
    });

    it("throws on canceled status during polling", async () => {
      mockFetch
        .mockResolvedValueOnce(predictionResponse("processing", { getUrl: "https://api.replicate.com/v1/predictions/p1" }))
        .mockResolvedValueOnce(predictionResponse("canceled", { error: "User cancelled" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      await expect(adapter.generate({ modality: "image", prompt: "Cat" })).rejects.toThrow(
        "Replicate prediction canceled: User cancelled",
      );
    });

    it("throws when no poll URL available", async () => {
      mockFetch.mockResolvedValueOnce(predictionResponse("processing"));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      await expect(adapter.generate({ modality: "image", prompt: "Cat" })).rejects.toThrow("no poll URL is available");
    });

    it("throws on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

      const adapter = new ReplicateAdapter({ apiToken: "bad" });
      await expect(adapter.generate({ modality: "image", prompt: "Cat" })).rejects.toThrow(
        "Replicate create prediction 401",
      );
    });

    it("includes meta.audioRef for clone video when drivingAudioUrl present", async () => {
      mockFetch
        .mockResolvedValueOnce(predictionResponse("processing", { getUrl: "https://api.replicate.com/v1/predictions/p1" }))
        .mockResolvedValueOnce(predictionResponse("succeeded", { output: "https://example.com/talk.mp4" }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      const result = await adapter.generate({
        modality: "video",
        prompt: "",
        faceReferenceImageUrl: "https://example.com/face.jpg",
        drivingAudioUrl: "https://example.com/drive.mp3",
        cloneConsentGranted: true,
      });

      expect(result.meta).toBeDefined();
      expect(result.meta!.audioRef).toBe("https://example.com/drive.mp3");
    });

    it("handles array output from successful prediction", async () => {
      mockFetch.mockResolvedValueOnce(
        predictionResponse("succeeded", { output: ["https://example.com/out1.png", "https://example.com/out2.png"] }),
      );

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      const result = await adapter.generate({ modality: "image", prompt: "Cat" });

      expect(result.outputRef).toBe("https://example.com/out1.png");
    });

    it("handles object output with url field", async () => {
      mockFetch.mockResolvedValueOnce(predictionResponse("succeeded", { output: { url: "https://example.com/out.png" } }));

      const adapter = new ReplicateAdapter({ apiToken: "t" });
      const result = await adapter.generate({ modality: "image", prompt: "Cat" });

      expect(result.outputRef).toBe("https://example.com/out.png");
    });
  });
});
