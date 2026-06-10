import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BflFluxAdapter } from "@quillby/providers";

// ── Global mocks ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

afterAll(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function submitResponse(id: string, pollingUrl?: string): Response {
  return new Response(JSON.stringify({ id, ...(pollingUrl ? { polling_url: pollingUrl } : {}) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function pollResponse(status: string, sample?: string): Response {
  return new Response(JSON.stringify({ status, ...(sample ? { result: { sample } } : {}) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("BflFluxAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("id", () => {
    it("defaults to flux-pro-1.1-ultra", () => {
      expect(new BflFluxAdapter({ apiKey: "k" }).id).toBe("bfl/flux-pro-1.1-ultra");
    });

    it("includes custom model slug", () => {
      const adapter = new BflFluxAdapter({ apiKey: "k", model: "flux-pro-1.1" });
      expect(adapter.id).toBe("bfl/flux-pro-1.1");
    });
  });

  describe("supportedModalities", () => {
    it("returns ['image']", () => {
      expect(new BflFluxAdapter({ apiKey: "k" }).supportedModalities).toEqual(["image"]);
    });
  });

  describe("generate()", () => {
    it("submits to api.bfl.ai/v1/ with correct method and headers", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("req_1", "https://api.bfl.ai/v1/get_result?id=req_1"))
        .mockResolvedValueOnce(pollResponse("Ready", "https://cdn.bfl.ai/output.png"));

      const adapter = new BflFluxAdapter({ apiKey: "secret_key" });
      await adapter.generate({ modality: "image", prompt: "a cat" });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.bfl.ai/v1/");
      expect(opts.method).toBe("POST");
      expect(opts.headers["x-key"]).toBe("secret_key");
      expect(opts.headers["Content-Type"]).toBe("application/json");
    });

    it("sends prompt, aspect_ratio, and output_format in body", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("req_1", "https://api.bfl.ai/v1/get_result?id=req_1"))
        .mockResolvedValueOnce(pollResponse("Ready", "https://cdn.bfl.ai/output.png"));

      const adapter = new BflFluxAdapter({ apiKey: "k" });
      await adapter.generate({ modality: "image", prompt: "a cat" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.prompt).toBe("a cat");
      expect(body.aspect_ratio).toBe("1:1");
      expect(body.output_format).toBe("png");
    });

    it("uses polling_url from submit response when present", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("req_abc", "https://custom.poll/url"))
        .mockResolvedValueOnce(pollResponse("Ready", "https://cdn.bfl.ai/output.png"));

      const adapter = new BflFluxAdapter({ apiKey: "k" });
      await adapter.generate({ modality: "image", prompt: "cat" });

      const pollUrl = mockFetch.mock.calls[1][0];
      expect(pollUrl).toBe("https://custom.poll/url");
    });

    it("falls back to constructed URL when polling_url missing", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("req_xyz"))
        .mockResolvedValueOnce(pollResponse("Ready", "https://cdn.bfl.ai/output.png"));

      const adapter = new BflFluxAdapter({ apiKey: "k" });
      await adapter.generate({ modality: "image", prompt: "cat" });

      const pollUrl = mockFetch.mock.calls[1][0];
      expect(pollUrl).toBe("https://api.bfl.ai/v1/get_result?id=req_xyz");
    });

    it("returns outputRef and mimeType on successful generation", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("req_1", "https://api.bfl.ai/v1/get_result?id=req_1"))
        .mockResolvedValueOnce(pollResponse("Ready", "https://cdn.bfl.ai/out.png"));

      const adapter = new BflFluxAdapter({ apiKey: "k" });
      const result = await adapter.generate({ modality: "image", prompt: "cat" });

      expect(result.outputRef).toBe("https://cdn.bfl.ai/out.png");
      expect(result.mimeType).toBe("image/png");
      expect(result.provider).toBe("bfl/flux-pro-1.1-ultra");
    });

    it("handles not-yet-Ready polling sequence", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("req_1", "https://poll.url"))
        .mockResolvedValueOnce(pollResponse("Processing"))
        .mockResolvedValueOnce(pollResponse("Ready", "https://cdn.bfl.ai/out.png"));

      const adapter = new BflFluxAdapter({ apiKey: "k" });
      const promise = adapter.generate({ modality: "image", prompt: "cat" });
      await vi.advanceTimersByTimeAsync(2_000);
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.outputRef).toBe("https://cdn.bfl.ai/out.png");
    });

    it("throws on Content Moderated status", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("req_1", "https://poll.url"))
        .mockResolvedValueOnce(pollResponse("Content Moderated"));

      const adapter = new BflFluxAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "image", prompt: "bad" })).rejects.toThrow("Content Moderated");
    });

    it("throws on Error status from poll", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("req_1", "https://poll.url"))
        .mockResolvedValueOnce(pollResponse("Error"));

      const adapter = new BflFluxAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "image", prompt: "bad" })).rejects.toThrow("Error");
    });

    it("throws on HTTP error during submit", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

      const adapter = new BflFluxAdapter({ apiKey: "bad" });
      await expect(adapter.generate({ modality: "image", prompt: "cat" })).rejects.toThrow("BFL submit 401");
    });

    it("throws on invalid response (no sample in result)", async () => {
      mockFetch
        .mockResolvedValueOnce(submitResponse("req_1", "https://poll.url"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: "Ready", result: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );

      const adapter = new BflFluxAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "image", prompt: "cat" })).rejects.toThrow("no sample in result");
    });

    it("throws on polling timeout", async () => {
      mockFetch.mockResolvedValueOnce(submitResponse("req_1", "https://poll.url"));
      for (let i = 0; i < 60; i++) {
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({ status: "Processing" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }

      const adapter = new BflFluxAdapter({ apiKey: "k" });
      const promise = adapter.generate({ modality: "image", prompt: "cat" });
      // Attach handler BEFORE advancing timers to prevent unhandled rejection.
      const errorPromise = promise.then<Error>(
        () => { throw new Error("Expected timeout"); },
        (err: unknown) => err as Error,
      );
      await vi.advanceTimersByTimeAsync(120_000);
      const error = await errorPromise;
      expect(error.message).toContain("Polling timed out");
    });
  });
});
