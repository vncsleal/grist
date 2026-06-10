import { describe, expect, it, vi, afterEach } from "vitest";
import { pollForCompletion, wait } from "@quillby/providers";

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("wait()", () => {
  it("resolves after the given delay", async () => {
    const start = performance.now();
    await wait(5);
    expect(performance.now() - start).toBeGreaterThanOrEqual(4);
  });
});

describe("pollForCompletion()", () => {
  it("polls until isComplete returns true", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ status: "processing" }))
      .mockResolvedValueOnce(makeJsonResponse({ status: "completed" }));

    vi.stubGlobal("fetch", mockFetch);

    const result = await pollForCompletion({
      pollUrl: "https://api.test/poll/123",
      headers: { Authorization: "Bearer test" },
      isComplete: (b: Record<string, unknown>) => b.status === "completed",
      extractResult: () => ({ outputRef: "https://out.test/1", provider: "test" }),
      intervalMs: 5,
      maxPolls: 5,
    });

    expect(result).toEqual({ outputRef: "https://out.test/1", provider: "test" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after max polls (timeout)", async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(makeJsonResponse({ status: "processing" })),
    );

    vi.stubGlobal("fetch", mockFetch);

    await expect(
      pollForCompletion({
        pollUrl: "https://api.test/poll/123",
        headers: {},
        isComplete: () => false,
        extractResult: () => ({ outputRef: "", provider: "" }),
        intervalMs: 5,
        maxPolls: 3,
      }),
    ).rejects.toThrow("Polling timed out");

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("respects AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    vi.stubGlobal("fetch", vi.fn());

    await expect(
      pollForCompletion({
        pollUrl: "https://api.test/poll/123",
        headers: {},
        isComplete: () => false,
        extractResult: () => ({ outputRef: "", provider: "" }),
        signal: controller.signal,
        intervalMs: 5,
        maxPolls: 5,
      }),
    ).rejects.toThrow("Polling aborted");
  });

  it("handles 429 rate limit (waits and retries)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(makeJsonResponse({ status: "completed" }));

    vi.stubGlobal("fetch", mockFetch);

    const result = await pollForCompletion({
      pollUrl: "https://api.test/poll/123",
      headers: {},
      isComplete: (b: Record<string, unknown>) => b.status === "completed",
      extractResult: () => ({ outputRef: "https://out.test/1", provider: "t" }),
      intervalMs: 5,
      maxPolls: 5,
    });

    expect(result).toEqual({ outputRef: "https://out.test/1", provider: "t" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws on non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Internal error", { status: 500 })),
    );

    await expect(
      pollForCompletion({
        pollUrl: "https://api.test/poll/123",
        headers: {},
        isComplete: () => false,
        extractResult: () => ({ outputRef: "", provider: "" }),
        intervalMs: 5,
        maxPolls: 5,
      }),
    ).rejects.toThrow("Poll request failed (500)");
  });

  it("detects 'failed' status and throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeJsonResponse({ status: "failed", error: "Model crashed" }),
      ),
    );

    await expect(
      pollForCompletion({
        pollUrl: "https://api.test/poll/123",
        headers: {},
        isComplete: () => false,
        extractResult: () => ({ outputRef: "", provider: "" }),
        intervalMs: 5,
        maxPolls: 3,
      }),
    ).rejects.toThrow("Poll returned status: failed: Model crashed");
  });

  it("detects 'error' status and throws without error field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeJsonResponse({ status: "error" }),
      ),
    );

    await expect(
      pollForCompletion({
        pollUrl: "https://api.test/poll/123",
        headers: {},
        isComplete: () => false,
        extractResult: () => ({ outputRef: "", provider: "" }),
        intervalMs: 5,
        maxPolls: 3,
      }),
    ).rejects.toThrow("Poll returned status: error");
  });

  it("uses custom intervalMs and maxPolls", async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(makeJsonResponse({ status: "processing" })),
    );

    vi.stubGlobal("fetch", mockFetch);

    const start = Date.now();

    await expect(
      pollForCompletion({
        pollUrl: "https://api.test/poll/123",
        headers: {},
        isComplete: () => false,
        extractResult: () => ({ outputRef: "", provider: "" }),
        intervalMs: 10,
        maxPolls: 2,
      }),
    ).rejects.toThrow("Polling timed out");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(Date.now() - start).toBeGreaterThanOrEqual(10);
  });
});
