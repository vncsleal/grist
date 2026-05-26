import { describe, expect, it } from "vitest";
import {
  UserContextSchema,
  TypedMemorySchema,
  GenerationJobSchema,
  GenerationJobStatusSchema,
  GenerationModalitySchema,
  WorkspaceMetadataSchema,
  RssItemSchema,
  EnrichedArticleSchema,
  CardInputSchema,
  HarvestBundleSchema,
  DraftSchema,
} from "../src/index.js";

describe("UserContextSchema", () => {
  it("validates a minimal user context", () => {
    const result = UserContextSchema.parse({
      role: "Developer",
      industry: "Tech",
      topics: ["AI"],
      voice: "Clear",
      audienceDescription: "Fellow devs",
      contentGoals: ["Educate"],
      platforms: ["x"],
    });
    expect(result.role).toBe("Developer");
  });

  it("provides defaults for optional fields", () => {
    const result = UserContextSchema.parse({
      role: "Dev",
      industry: "Tech",
      topics: ["Code"],
      voice: "Direct",
      audienceDescription: "Devs",
      contentGoals: ["Share"],
      platforms: ["blog"],
    });
    expect(result.excludeTopics).toEqual([]);
    expect(result.name).toBeUndefined();
  });

  it("rejects missing required fields", () => {
    expect(() => UserContextSchema.parse({})).toThrow();
  });
});

describe("TypedMemorySchema", () => {
  it("provides empty array defaults for all fields", () => {
    const result = TypedMemorySchema.parse({});
    expect(result.voiceExamples).toEqual([]);
    expect(result.styleRules).toEqual([]);
    expect(result.audienceInsights).toEqual([]);
    expect(result.doNotSay).toEqual([]);
    expect(result.successfulPosts).toEqual([]);
    expect(result.campaignContext).toEqual([]);
    expect(result.sourcePreferences).toEqual([]);
  });
});

describe("GenerationJobSchema", () => {
  it("validates a complete generation job", () => {
    const result = GenerationJobSchema.parse({
      id: "job-1",
      workspaceId: "ws-1",
      modality: "image",
      prompt: "A cat",
      status: "done",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.id).toBe("job-1");
    expect(result.status).toBe("done");
  });
});

describe("GenerationJobStatusSchema", () => {
  it("accepts valid statuses", () => {
    expect(GenerationJobStatusSchema.parse("queued")).toBe("queued");
    expect(GenerationJobStatusSchema.parse("running")).toBe("running");
    expect(GenerationJobStatusSchema.parse("done")).toBe("done");
    expect(GenerationJobStatusSchema.parse("failed")).toBe("failed");
  });

  it("rejects invalid status", () => {
    expect(() => GenerationJobStatusSchema.parse("unknown")).toThrow();
  });
});

describe("GenerationModalitySchema", () => {
  it("accepts valid modalities", () => {
    expect(GenerationModalitySchema.parse("image")).toBe("image");
    expect(GenerationModalitySchema.parse("audio")).toBe("audio");
    expect(GenerationModalitySchema.parse("video")).toBe("video");
  });
});

describe("RssItemSchema", () => {
  it("validates an RSS item", () => {
    const result = RssItemSchema.parse({
      id: "1",
      source: "TechCrunch",
      title: "AI News",
      link: "https://example.com",
      snippet: "Summary",
    });
    expect(result.title).toBe("AI News");
  });
});

describe("EnrichedArticleSchema", () => {
  it("validates an enriched article", () => {
    const result = EnrichedArticleSchema.parse({
      id: "1",
      source: "Blog",
      title: "Post",
      link: "https://example.com",
      snippet: "Snippet",
      enrichedContent: "Full text here",
    });
    expect(result.enrichedContent).toBe("Full text here");
  });
});

describe("CardInputSchema", () => {
  it("validates a card input with defaults", () => {
    const result = CardInputSchema.parse({
      title: "Title",
      source: "Source",
      link: "https://example.com",
      thesis: "Core idea",
    });
    expect(result.relevanceScore).toBe(0);
    expect(result.keyInsights).toEqual([]);
  });
});

describe("WorkspaceMetadataSchema", () => {
  it("validates workspace metadata", () => {
    const result = WorkspaceMetadataSchema.parse({
      id: "ws-1",
      name: "My Workspace",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.description).toBe("");
    expect(result.cloneConsentGranted).toBe(false);
  });
});

describe("HarvestBundleSchema", () => {
  it("validates a harvest bundle with cards", () => {
    const result = HarvestBundleSchema.parse({
      generatedAt: new Date().toISOString(),
      dateLabel: "2026-05-26",
      cards: [],
    });
    expect(result.cards).toEqual([]);
  });
});

describe("DraftSchema", () => {
  it("validates a draft", () => {
    const result = DraftSchema.parse({
      platform: "linkedin",
      content: "Post text here",
    });
    expect(result.platform).toBe("linkedin");
  });
});
