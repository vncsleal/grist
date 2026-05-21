import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KlingAdapter } from "@quillby/providers";

// ── Global mocks ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

afterAll(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function queueResponse(requestId: string, statusUrl?: string): Response {
  return new Response(
    JSON.stringify({ request_id: requestId, ...(statusUrl ? { status_url: statusUrl } : {}) }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function statusResponse(status: "completed" | "failed" | "in_queue" | "in_progress" | "processing", videoUrl?: string): Response {
  const body: Record<string, unknown> = { status };
  if (videoUrl) body.output = { video: { url: videoUrl } };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("KlingAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("id", () => {
    it("defaults to fal/fal-ai/kling-video/v2/master/text-to-video", () => {
      expect(new KlingAdapter({ apiKey: "k" }).id).toBe("fal/fal-ai/kling-video/v2/master/text-to-video");
    });

    it("includes custom model path", () => {
      const adapter = new KlingAdapter({ apiKey: "k", model: "fal-ai/kling-video/v2" });
      expect(adapter.id).toBe("fal/fal-ai/kling-video/v2");
    });
  });

  describe("supportedModalities", () => {
    it("returns ['video']", () => {
      expect(new KlingAdapter({ apiKey: "k" }).supportedModalities).toEqual(["video"]);
    });
  });

  describe("generate()", () => {
    it("submits to queue.fal.run with correct headers and body", async () => {
      mockFetch
        .mockResolvedValueOnce(queueResponse("req_abc", "https://queue.fal.run/status/req_abc"))
        .mockResolvedValueOnce(statusResponse("completed", "https://cdn.fal.ai/video.mp4"));

      const adapter = new KlingAdapter({ apiKey: "fal_key" });
      await adapter.generate({ modality: "video", prompt: "A cat walking" });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("queue.fal.run/");
      expect(opts.method).toBe("POST");
      expect(opts.headers["Authorization"]).toBe("Key fal_key");

      const body = JSON.parse(opts.body);
      expect(body.prompt).toBe("A cat walking");
      expect(body.aspect_ratio).toBe("1:1");
      expect(body.duration).toBe("5");
    });

    it("uses status_url from response when available", async () => {
      mockFetch
        .mockResolvedValueOnce(queueResponse("req_abc", "https://custom.status/url"))
        .mockResolvedValueOnce(statusResponse("completed", "https://cdn.fal.ai/video.mp4"));

      const adapter = new KlingAdapter({ apiKey: "k" });
      await adapter.generate({ modality: "video", prompt: "Cat" });

      const pollUrl = mockFetch.mock.calls[1][0];
      expect(pollUrl).toBe("https://custom.status/url");
    });

    it("falls back to constructed URL when status_url missing", async () => {
      mockFetch
        .mockResolvedValueOnce(queueResponse("req_xyz"))
        .mockResolvedValueOnce(statusResponse("completed", "https://cdn.fal.ai/video.mp4"));

      const adapter = new KlingAdapter({ apiKey: "k" });
      await adapter.generate({ modality: "video", prompt: "Cat" });

      const pollUrl = mockFetch.mock.calls[1][0];
      expect(pollUrl).toBe(
        "https://queue.fal.run/fal-ai/kling-video/v2/master/text-to-video/requests/req_xyz/status",
      );
    });

    it("handles lowercase completed status from poll", async () => {
      mockFetch
        .mockResolvedValueOnce(queueResponse("req_1", "https://queue.fal.run/status"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: "in_progress" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(statusResponse("completed", "https://cdn.fal.ai/out.mp4"));

      const adapter = new KlingAdapter({ apiKey: "k" });
      const promise = adapter.generate({ modality: "video", prompt: "Cat" });
      await vi.advanceTimersByTimeAsync(3_000);
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.outputRef).toBe("https://cdn.fal.ai/out.mp4");
    });

    it("returns outputRef and mimeType on success", async () => {
      mockFetch
        .mockResolvedValueOnce(queueResponse("req_1", "https://queue.fal.run/status"))
        .mockResolvedValueOnce(statusResponse("completed", "https://cdn.fal.ai/out.mp4"));

      const adapter = new KlingAdapter({ apiKey: "k" });
      const result = await adapter.generate({ modality: "video", prompt: "Cat" });

      expect(result.outputRef).toBe("https://cdn.fal.ai/out.mp4");
      expect(result.mimeType).toBe("video/mp4");
      expect(result.provider).toBe("fal/fal-ai/kling-video/v2/master/text-to-video");
    });

    it("handles array-form video output", async () => {
      mockFetch
        .mockResolvedValueOnce(queueResponse("req_1", "https://queue.fal.run/status"))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "completed",
              output: { video: [{ url: "https://cdn.fal.ai/v1.mp4" }, { url: "https://cdn.fal.ai/v2.mp4" }] },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );

      const adapter = new KlingAdapter({ apiKey: "k" });
      const result = await adapter.generate({ modality: "video", prompt: "Cat" });

      expect(result.outputRef).toBe("https://cdn.fal.ai/v1.mp4");
    });

    it("throws on HTTP error during submit", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

      const adapter = new KlingAdapter({ apiKey: "bad" });
      await expect(adapter.generate({ modality: "video", prompt: "Cat" })).rejects.toThrow("fal.ai Kling submit 401");
    });

    it("throws when completed but no video URL", async () => {
      mockFetch
        .mockResolvedValueOnce(queueResponse("req_1", "https://queue.fal.run/status"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: "completed", output: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );

      const adapter = new KlingAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "video", prompt: "Cat" })).rejects.toThrow(
        "Kling: completed but no video URL in output",
      );
    });

    it("retries without reference image on submit failure when faceReferenceImageUrl provided", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response("Bad Request", { status: 400 }))
        .mockResolvedValueOnce(queueResponse("req_2", "https://queue.fal.run/status"))
        .mockResolvedValueOnce(statusResponse("completed", "https://cdn.fal.ai/out.mp4"));

      const adapter = new KlingAdapter({ apiKey: "k" });
      const _result = await adapter.generate({
        modality: "video",
        prompt: "Cat",
        faceReferenceImageUrl: "https://example.com/face.jpg",
        cloneConsentGranted: true,
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);

      const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstBody.reference_image_url).toBe("https://example.com/face.jpg");

      const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(secondBody.reference_image_url).toBeUndefined();
    });
  });
});
