import { describe, expect, it } from "vitest";
import {
  GenerateImageArgsSchema,
  GenerateAudioArgsSchema,
  GenerateVideoArgsSchema,
  GetJobArgsSchema,
  SetProviderArgsSchema,
  SetCloneIdentityArgsSchema,
  DeleteVoiceCloneArgsSchema,
  ListJobsArgsSchema,
} from "../../src/mcp/schemas.js";

describe("GenerateImageArgsSchema", () => {
  it("accepts valid input", () => {
    const result = GenerateImageArgsSchema.parse({
      prompt: "A serene mountain landscape at dawn",
    });
    expect(result.prompt).toBe("A serene mountain landscape at dawn");
    expect(result.aspectRatio).toBe("square");
  });

  it("rejects empty prompt", () => {
    expect(() => GenerateImageArgsSchema.parse({ prompt: "" })).toThrow();
  });

  it("rejects prompt > 5000 chars", () => {
    expect(() =>
      GenerateImageArgsSchema.parse({ prompt: "x".repeat(5001) })
    ).toThrow();
  });

  it("accepts optional cardId", () => {
    const result = GenerateImageArgsSchema.parse({
      prompt: "test",
      cardId: 42,
    });
    expect(result.cardId).toBe(42);
  });

  it("defaults aspectRatio to square", () => {
    const result = GenerateImageArgsSchema.parse({ prompt: "test" });
    expect(result.aspectRatio).toBe("square");
  });

  it("rejects invalid aspectRatio", () => {
    expect(() =>
      GenerateImageArgsSchema.parse({ prompt: "test", aspectRatio: "ultrawide" })
    ).toThrow();
  });
});

describe("GenerateAudioArgsSchema", () => {
  it("accepts valid input", () => {
    const result = GenerateAudioArgsSchema.parse({
      prompt: "This is a narrative script for a podcast intro.",
    });
    expect(result.prompt).toBe("This is a narrative script for a podcast intro.");
    expect(result.cloneVoice).toBe(false);
  });

  it("defaults cloneVoice to false", () => {
    const result = GenerateAudioArgsSchema.parse({
      prompt: "Hello world",
    });
    expect(result.cloneVoice).toBe(false);
  });
});

describe("GenerateVideoArgsSchema", () => {
  it("accepts valid input", () => {
    const result = GenerateVideoArgsSchema.parse({
      prompt: "A cinematic product reveal shot",
    });
    expect(result.prompt).toBe("A cinematic product reveal shot");
    expect(result.aspectRatio).toBe("9:16");
  });

  it("defaults aspectRatio to 9:16", () => {
    const result = GenerateVideoArgsSchema.parse({ prompt: "test" });
    expect(result.aspectRatio).toBe("9:16");
  });
});

describe("GetJobArgsSchema", () => {
  it("requires jobId", () => {
    expect(() => GetJobArgsSchema.parse({})).toThrow();
  });

  it("accepts valid jobId", () => {
    const result = GetJobArgsSchema.parse({ jobId: "abc-123" });
    expect(result.jobId).toBe("abc-123");
  });
});

describe("SetProviderArgsSchema", () => {
  it("requires modality, provider, and apiKey", () => {
    expect(() => SetProviderArgsSchema.parse({})).toThrow();
    expect(() => SetProviderArgsSchema.parse({ modality: "image" })).toThrow();
    expect(() =>
      SetProviderArgsSchema.parse({ modality: "image", provider: "replicate" })
    ).toThrow();
    const result = SetProviderArgsSchema.parse({
      modality: "image",
      provider: "replicate",
      apiKey: "sk-test",
    });
    expect(result.modality).toBe("image");
    expect(result.provider).toBe("replicate");
    expect(result.apiKey).toBe("sk-test");
  });
});

describe("SetCloneIdentityArgsSchema", () => {
  it("requires cloneConsentGranted", () => {
    expect(() => SetCloneIdentityArgsSchema.parse({})).toThrow();
  });

  it("accepts cloneConsentGranted true", () => {
    const result = SetCloneIdentityArgsSchema.parse({
      cloneConsentGranted: true,
    });
    expect(result.cloneConsentGranted).toBe(true);
  });
});

describe("DeleteVoiceCloneArgsSchema", () => {
  it("accepts empty input", () => {
    const result = DeleteVoiceCloneArgsSchema.parse({});
    expect(result).toBeDefined();
  });
});

describe("ListJobsArgsSchema", () => {
  it("accepts optional modality filter", () => {
    const withModality = ListJobsArgsSchema.parse({ modality: "image" });
    expect(withModality.modality).toBe("image");

    const withoutModality = ListJobsArgsSchema.parse({});
    expect(withoutModality.modality).toBeUndefined();
  });
});
