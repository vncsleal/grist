import { describe, expect, it, vi } from "vitest";

vi.mock("@quillby/workspace", () => ({
  getCurrentWorkspace: () => ({ name: "Test Workspace" }),
}));

import { contextToPromptText } from "../../src/agents/onboard.js";

const BASE_CTX = {
  role: "Dev",
  industry: "Tech",
  topics: ["Test"],
  voice: "Clear",
  audienceDescription: "Devs",
  contentGoals: ["Share"],
  platforms: ["blog"],
  excludeTopics: [],
};

const EMPTY_MEMORY = {
  voiceExamples: [],
  styleRules: [],
  audienceInsights: [],
  doNotSay: [],
  successfulPosts: [],
  campaignContext: [],
  sourcePreferences: [],
  visualStyle: [],
  voiceProfile: [],
  faceProfile: [],
};

describe("contextToPromptText", () => {
  it("renders all required fields", () => {
    const result = contextToPromptText({
      ...BASE_CTX,
      name: "Jane Doe",
      topics: ["AI", "UX"],
      contentGoals: ["Thought leadership"],
      platforms: ["linkedin", "x"],
    });

    expect(result).toContain("Workspace: Test Workspace");
    expect(result).toContain("Name: Jane Doe");
    expect(result).toContain("Role: Dev");
    expect(result).toContain("Industry: Tech");
    expect(result).toContain("Topics: AI, UX");
    expect(result).toContain("Voice: Clear");
    expect(result).toContain("Audience: Devs");
    expect(result).toContain("Goals: Thought leadership");
    expect(result).toContain("Platforms: linkedin, x");
  });

  it("omits name line when name is empty", () => {
    const result = contextToPromptText({ ...BASE_CTX, name: "" });
    expect(result).not.toContain("Name:");
  });

  it("includes excludeTopics when present", () => {
    const result = contextToPromptText({
      ...BASE_CTX,
      excludeTopics: ["Politics", "Religion"],
    });
    expect(result).toContain("Avoid: Politics, Religion");
  });

  it("appends typed memory sections when provided", () => {
    const result = contextToPromptText(BASE_CTX, {
      ...EMPTY_MEMORY,
      voiceExamples: ["Post about growth hacks"],
      styleRules: ["Short paragraphs"],
      doNotSay: ["Don't use jargon"],
    });

    expect(result).toContain("Voice examples:");
    expect(result).toContain("Post about growth hacks");
    expect(result).toContain("Style rules:");
    expect(result).toContain("Short paragraphs");
    expect(result).toContain("Do not say:");
    expect(result).toContain("Don't use jargon");
  });

  it("omits empty typed memory sections", () => {
    const result = contextToPromptText(BASE_CTX, EMPTY_MEMORY);
    expect(result).not.toContain("Voice examples:");
    expect(result).not.toContain("Style rules:");
    expect(result).not.toContain("Do not say:");
  });

  it("includes audience insights when present in typed memory", () => {
    const result = contextToPromptText(BASE_CTX, {
      ...EMPTY_MEMORY,
      audienceInsights: ["Readers prefer short posts"],
    });
    expect(result).toContain("Audience insights:");
    expect(result).toContain("Readers prefer short posts");
  });

  it("includes campaign context when present in typed memory", () => {
    const result = contextToPromptText(BASE_CTX, {
      ...EMPTY_MEMORY,
      campaignContext: ["Q2 product launch"],
    });
    expect(result).toContain("Campaign context:");
    expect(result).toContain("Q2 product launch");
  });

  it("includes source preferences when present in typed memory", () => {
    const result = contextToPromptText(BASE_CTX, {
      ...EMPTY_MEMORY,
      sourcePreferences: ["TechCrunch", "HN"],
    });
    expect(result).toContain("Source preferences:");
    expect(result).toContain("[1] TechCrunch");
    expect(result).toContain("[2] HN");
  });

  it("returns only workspace info when typedMemory is undefined", () => {
    const result = contextToPromptText(BASE_CTX);
    expect(result).toContain("Workspace: Test Workspace");
    expect(result).not.toContain("Voice examples:");
  });
});
