import { describe, expect, it } from "vitest";
import { PLATFORM_GUIDES, SUPPORTED_PLATFORMS } from "../../src/agents/compose.js";

describe("compose", () => {
  it("exports SUPPORTED_PLATFORMS matching PLATFORM_GUIDES keys", () => {
    const expected = Object.keys(PLATFORM_GUIDES).sort();
    expect(SUPPORTED_PLATFORMS.sort()).toEqual(expected);
  });

  it("includes known platforms", () => {
    expect(SUPPORTED_PLATFORMS).toContain("linkedin");
    expect(SUPPORTED_PLATFORMS).toContain("x");
    expect(SUPPORTED_PLATFORMS).toContain("blog");
    expect(SUPPORTED_PLATFORMS).toContain("newsletter");
  });

  it("each platform guide is a non-empty string", () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      const guide = PLATFORM_GUIDES[platform];
      expect(typeof guide).toBe("string");
      expect(guide.length).toBeGreaterThan(50);
    }
  });

  it("has at least 10 platform guides", () => {
    expect(SUPPORTED_PLATFORMS.length).toBeGreaterThanOrEqual(10);
  });
});
