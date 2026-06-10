import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VeoAdapter } from "@quillby/providers";

// ── Global mocks ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

afterAll(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function submitResponse(opName: string): Response {
  return new Response(JSON.stringify({ name: opName }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function operationResponse(done: boolean, overrides?: { videoUri?: string; errorMsg?: string }): Response {
  const body: Record<string, unknown> = {};
  if (done) {
    body.done = true;
    if (overrides?.videoUri) {
      body.response = {
        generateVideoResponse: {
          generatedSamples: [{ video: { uri: overrides.videoUri, mimeType: "video/mp4" } }],
        },
      };
    }
    if (overrides?.errorMsg) {
      body.error = { message: overrides.errorMsg, code: 3 };
    }
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("VeoAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("id", () => {
    it("defaults to google/veo-3.0-generate-preview", () => {
      expect(new VeoAdapter({ apiKey: "k" }).id).toBe("google/veo-3.0-generate-preview");
    });

    it("includes custom model slug", () => {
      const adapter = new VeoAdapter({ apiKey: "k", model: "veo-3.0-generate-preview" });
      expect(adapter.id).toBe("google/veo-3.0-generate-preview");
    });
  });

  describe("supportedModalities", () => {
    it("returns ['video']", () => {
      expect(new VeoAdapter({ apiKey: "k" }).supportedModalities).toEqual(["video"]);
    });
  });

  describe("generate()", () => {
    it("uses X-Goog-Api-Key header, not query param", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("operations/abc123"))
        .mockResolvedValueOnce(operationResponse(true, { videoUri: "gs://output/video.mp4" }));

      const adapter = new VeoAdapter({ apiKey: "google_key" });
      await adapter.generate({ modality: "video", prompt: "A flying cat" });

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("generativelanguage.googleapis.com/v1beta/models/");
      expect(url).not.toContain("key=");
      expect(opts.headers["X-Goog-Api-Key"]).toBe("google_key");
    });

    it("submits to correct endpoint with instances and parameters", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("operations/abc123"))
        .mockResolvedValueOnce(operationResponse(true, { videoUri: "gs://output/video.mp4" }));

      const adapter = new VeoAdapter({ apiKey: "k" });
      await adapter.generate({ modality: "video", prompt: "A cat" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.instances).toEqual([{ prompt: "A cat" }]);
      expect(body.parameters).toEqual({ aspectRatio: "1:1", durationSeconds: 8 });
    });

    it("polls for completion using operation name", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("operations/op_789"))
        .mockResolvedValueOnce(operationResponse(false))
        .mockResolvedValueOnce(operationResponse(true, { videoUri: "gs://output/vid.mp4" }));

      const adapter = new VeoAdapter({ apiKey: "k" });
      const promise = adapter.generate({ modality: "video", prompt: "Cat" });
      await vi.advanceTimersByTimeAsync(5_000);
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
      const pollUrl = mockFetch.mock.calls[1][0];
      expect(pollUrl).toContain("operations/op_789");
      expect(result.outputRef).toBe("gs://output/vid.mp4");
    });

    it("polls with X-Goog-Api-Key on poll requests too", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("operations/op_1"))
        .mockResolvedValueOnce(operationResponse(false))
        .mockResolvedValueOnce(operationResponse(true, { videoUri: "gs://out.mp4" }));

      const adapter = new VeoAdapter({ apiKey: "gk" });
      const promise = adapter.generate({ modality: "video", prompt: "Cat" });
      await vi.advanceTimersByTimeAsync(5_000);
      await promise;

      const pollOpts = mockFetch.mock.calls[1][1];
      expect(pollOpts.headers["X-Goog-Api-Key"]).toBe("gk");
    });

    it("reports correct provider in result", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("operations/op_1"))
        .mockResolvedValueOnce(operationResponse(true, { videoUri: "gs://out.mp4" }));

      const adapter = new VeoAdapter({ apiKey: "k" });
      const result = await adapter.generate({ modality: "video", prompt: "Cat" });

      expect(result.provider).toBe("google/veo-3.0-generate-preview");
      expect(result.mimeType).toBe("video/mp4");
    });

    it("throws on HTTP error during submit", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

      const adapter = new VeoAdapter({ apiKey: "bad" });
      await expect(adapter.generate({ modality: "video", prompt: "Cat" })).rejects.toThrow("Veo 3 submit 403");
    });

    it("throws when operation has no name", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
      );

      const adapter = new VeoAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "video", prompt: "Cat" })).rejects.toThrow(
        "Veo 3 did not return an operation name",
      );
    });

    it("throws on error in poll response", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("operations/op_1"))
        .mockResolvedValueOnce(operationResponse(true, { errorMsg: "Safety filter triggered" }));

      const adapter = new VeoAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "video", prompt: "Violent" })).rejects.toThrow(
        "Veo 3 error: Safety filter triggered",
      );
    });

    it("throws when poll completes but no video URI", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("operations/op_1"))
        .mockResolvedValueOnce(operationResponse(true));

      const adapter = new VeoAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "video", prompt: "Cat" })).rejects.toThrow(
        "Veo 3 completed but no video URI in response",
      );
    });

    it("retries without reference image on submit failure when faceReferenceImageUrl provided", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response("Bad Request", { status: 400 }))
        .mockResolvedValueOnce(submitResponse("operations/op_2"))
        .mockResolvedValueOnce(operationResponse(true, { videoUri: "gs://out.mp4" }));

      const adapter = new VeoAdapter({ apiKey: "k" });
      const result = await adapter.generate({
        modality: "video",
        prompt: "Cat",
        faceReferenceImageUrl: "https://example.com/face.jpg",
        cloneConsentGranted: true,
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.provider).toBe("google/veo-3.0-generate-preview");

      const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstBody.parameters.referenceImageUri).toBe("https://example.com/face.jpg");

      const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(secondBody.parameters.referenceImageUri).toBeUndefined();
    });
  });
});
