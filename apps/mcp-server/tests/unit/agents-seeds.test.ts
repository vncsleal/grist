import { describe, expect, it, vi, afterEach } from "vitest";
import { getGoogleNewsFeeds, getMediumTagFeeds, getFeedlyFeeds } from "../../src/agents/seeds.js";

describe("getGoogleNewsFeeds", () => {
  it("builds a Google News RSS URL per topic", () => {
    const urls = getGoogleNewsFeeds(["AI", "startups"]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("news.google.com/rss/search");
    expect(urls[0]).toContain("q=AI");
    expect(urls[1]).toContain("q=startups");
  });

  it("encodes special characters in topic names", () => {
    const urls = getGoogleNewsFeeds(["machine learning"]);
    expect(urls[0]).toContain("machine%20learning");
  });

  it("uses default hl=en-US and gl=US when not provided", () => {
    const urls = getGoogleNewsFeeds(["AI"]);
    expect(urls[0]).toContain("hl=en-US");
    expect(urls[0]).toContain("gl=US");
    expect(urls[0]).toContain("ceid=US:en");
  });

  it("accepts custom hl and gl parameters", () => {
    const urls = getGoogleNewsFeeds(["tech"], "pt-BR", "BR");
    expect(urls[0]).toContain("hl=pt-BR");
    expect(urls[0]).toContain("gl=BR");
    expect(urls[0]).toContain("ceid=BR:pt");
  });

  it("handles empty topics array", () => {
    const urls = getGoogleNewsFeeds([]);
    expect(urls).toEqual([]);
  });
});

describe("getMediumTagFeeds", () => {
  it("builds Medium tag feed URLs", () => {
    const urls = getMediumTagFeeds(["AI", "startups"]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe("https://medium.com/feed/tag/ai");
    expect(urls[1]).toBe("https://medium.com/feed/tag/startups");
  });

  it("slugifies multi-word topics", () => {
    const urls = getMediumTagFeeds(["Machine Learning"]);
    expect(urls[0]).toBe("https://medium.com/feed/tag/machine-learning");
  });

  it("removes special characters from slug", () => {
    const urls = getMediumTagFeeds(["C# programming"]);
    expect(urls[0]).toBe("https://medium.com/feed/tag/c-programming");
  });

  it("trims whitespace from topics", () => {
    const urls = getMediumTagFeeds(["  AI  "]);
    expect(urls[0]).toBe("https://medium.com/feed/tag/ai");
  });

  it("handles empty topics array", () => {
    const urls = getMediumTagFeeds([]);
    expect(urls).toEqual([]);
  });
});

describe("getFeedlyFeeds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns feeds from Feedly search results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { feedId: "feed/https://blog.example.com/rss" },
          { feedId: "feed/https://news.example.org/feed" },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const feeds = await getFeedlyFeeds(["AI"]);
    expect(feeds).toHaveLength(2);
    expect(feeds[0]).toBe("https://blog.example.com/rss");
    expect(feeds[1]).toBe("https://news.example.org/feed");
  });

  it("filters out non-http feedIds and handles missing feedId", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { feedId: "feed/https://valid.com/rss" },
          { feedId: "feed/cloud://invalid" },
          { feedId: undefined },
          {},
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const feeds = await getFeedlyFeeds(["test"]);
    expect(feeds).toEqual(["https://valid.com/rss"]);
  });

  it("filters out feedId with feed/ prefix but not http", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { feedId: "feed/cloud://service" },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const feeds = await getFeedlyFeeds(["test"]);
    expect(feeds).toEqual([]);
  });

  it("returns empty array when no results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const feeds = await getFeedlyFeeds(["test"]);
    expect(feeds).toEqual([]);
  });

  it("handles fetch errors gracefully per topic", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const feeds = await getFeedlyFeeds(["test"]);
    expect(feeds).toEqual([]);
  });

  it("handles non-ok response gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });
    vi.stubGlobal("fetch", mockFetch);

    const feeds = await getFeedlyFeeds(["test"]);
    expect(feeds).toEqual([]);
  });

  it("aggregates results across multiple topics", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          results: [{ feedId: `feed/https://topic${callCount}.com/rss` }],
        }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const feeds = await getFeedlyFeeds(["AI", "startups"]);
    expect(feeds).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
