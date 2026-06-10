import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { GenerationResult } from "@quillby/providers";

const { mockPrimaryGenerate, mockFallbackGenerate } = vi.hoisted(() => ({
  mockPrimaryGenerate: vi.fn(),
  mockFallbackGenerate: vi.fn(),
}));


vi.mock("../../../../packages/providers/dist/direct/image/openai-gpt-image.js", () => ({
  OpenAiGptImageAdapter: class {
    readonly id = "openai/gpt-image";
    readonly supportedModalities = ["image"];
    generate = mockPrimaryGenerate;
  },
}));

vi.mock("../../../../packages/providers/dist/direct/image/bfl-flux.js", () => ({
  BflFluxAdapter: class {
    readonly id = "bfl/flux";
    readonly supportedModalities = ["image"];
    generate = mockFallbackGenerate;
  },
}));

vi.mock("../../../../packages/providers/dist/direct/audio/elevenlabs.js", () => ({
  ElevenLabsAdapter: class {
    readonly id = "elevenlabs/tts";
    readonly supportedModalities = ["audio"];
    generate = mockPrimaryGenerate;
  },
}));

vi.mock("../../../../packages/providers/dist/direct/audio/minimax.js", () => ({
  MiniMaxAdapter: class {
    readonly id = "minimax/speech";
    readonly supportedModalities = ["audio"];
    generate = mockFallbackGenerate;
  },
}));

vi.mock("../../../../packages/providers/dist/direct/video/veo.js", () => ({
  VeoAdapter: class {
    readonly id = "veo/video";
    readonly supportedModalities = ["video"];
    generate = mockPrimaryGenerate;
  },
}));

vi.mock("../../../../packages/providers/dist/direct/video/kling.js", () => ({
  KlingAdapter: class {
    readonly id = "kling/video";
    readonly supportedModalities = ["video"];
    generate = mockFallbackGenerate;
  },
}));

const { CloudImageAdapter, CloudAudioAdapter, CloudVideoAdapter } = await import("@quillby/providers");

beforeEach(() => {
  mockPrimaryGenerate.mockReset();
  mockFallbackGenerate.mockReset();

  process.env["QUILLBY_OPENAI_API_KEY"] = "test-openai";
  process.env["QUILLBY_BFL_API_KEY"] = "test-bfl";
  process.env["QUILLBY_ELEVENLABS_API_KEY"] = "test-eleven";
  process.env["QUILLBY_MINIMAX_API_KEY"] = "test-minimax";
  process.env["QUILLBY_GOOGLE_AI_API_KEY"] = "test-google";
  process.env["QUILLBY_FAL_API_KEY"] = "test-fal";

  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();

  delete process.env["QUILLBY_OPENAI_API_KEY"];
  delete process.env["QUILLBY_BFL_API_KEY"];
  delete process.env["QUILLBY_ELEVENLABS_API_KEY"];
  delete process.env["QUILLBY_MINIMAX_API_KEY"];
  delete process.env["QUILLBY_GOOGLE_AI_API_KEY"];
  delete process.env["QUILLBY_FAL_API_KEY"];
});

describe("CloudImageAdapter", () => {
  it("has correct id", () => {
    const adapter = new CloudImageAdapter();
    expect(adapter.id).toBe("cloud/image");
  });

  it("supports image modality", () => {
    const adapter = new CloudImageAdapter();
    expect(adapter.supportedModalities).toEqual(["image"]);
  });

  it("generate() calls primary provider", async () => {
    mockPrimaryGenerate.mockResolvedValue({
      outputRef: "https://out.test/img.png",
      mimeType: "image/png",
      provider: "openai/gpt-image",
    } satisfies GenerationResult);

    const adapter = new CloudImageAdapter();
    const result = await adapter.generate({ modality: "image", prompt: "a cat" });

    expect(mockPrimaryGenerate).toHaveBeenCalledTimes(1);
    expect(mockFallbackGenerate).not.toHaveBeenCalled();
    expect(result.provider).toBe("openai/gpt-image");
  });

  it("falls through to fallback when primary fails", async () => {
    mockPrimaryGenerate.mockRejectedValue(new Error("Rate limit exceeded"));
    mockFallbackGenerate.mockResolvedValue({
      outputRef: "https://out.test/img.png",
      mimeType: "image/png",
      provider: "bfl/flux",
    } satisfies GenerationResult);

    const adapter = new CloudImageAdapter();
    const result = await adapter.generate({ modality: "image", prompt: "a cat" });

    expect(mockPrimaryGenerate).toHaveBeenCalledTimes(1);
    expect(mockFallbackGenerate).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("bfl/flux");
  });

  it("429 error is NOT swallowed — re-thrown", async () => {
    mockPrimaryGenerate.mockRejectedValue(new Error("429 Too Many Requests"));

    const adapter = new CloudImageAdapter();

    await expect(
      adapter.generate({ modality: "image", prompt: "a cat" }),
    ).rejects.toThrow("429");

    expect(mockFallbackGenerate).not.toHaveBeenCalled();
  });

  it("throws when no provider is configured", async () => {
    delete process.env["QUILLBY_OPENAI_API_KEY"];
    delete process.env["QUILLBY_BFL_API_KEY"];

    const adapter = new CloudImageAdapter();
    await expect(
      adapter.generate({ modality: "image", prompt: "test" }),
    ).rejects.toThrow("Cloud image provider not configured");
  });

  it("uses process.stderr.write (not console.error)", async () => {
    mockPrimaryGenerate.mockRejectedValue(new Error("Primary crashed"));
    mockFallbackGenerate.mockResolvedValue({
      outputRef: "https://out.test/img.png",
      mimeType: "image/png",
      provider: "bfl/flux",
    } satisfies GenerationResult);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const adapter = new CloudImageAdapter();
    await adapter.generate({ modality: "image", prompt: "test" });

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("[quillby] [CloudImageAdapter] primary failed"),
    );
  });
});

describe("CloudAudioAdapter", () => {
  it("has correct id", () => {
    const adapter = new CloudAudioAdapter();
    expect(adapter.id).toBe("cloud/audio");
  });

  it("supports audio modality", () => {
    const adapter = new CloudAudioAdapter();
    expect(adapter.supportedModalities).toEqual(["audio"]);
  });

  it("generate() calls primary provider", async () => {
    mockPrimaryGenerate.mockResolvedValue({
      outputRef: "https://out.test/audio.mp3",
      mimeType: "audio/mpeg",
      provider: "elevenlabs/tts",
    } satisfies GenerationResult);

    const adapter = new CloudAudioAdapter();
    const _result = await adapter.generate({ modality: "audio", prompt: "hello" });

    expect(mockPrimaryGenerate).toHaveBeenCalledTimes(1);
    expect(mockFallbackGenerate).not.toHaveBeenCalled();
  });

  it("falls through to fallback when primary fails", async () => {
    mockPrimaryGenerate.mockRejectedValue(new Error("Quota exceeded"));
    mockFallbackGenerate.mockResolvedValue({
      outputRef: "https://out.test/audio.mp3",
      mimeType: "audio/mpeg",
      provider: "minimax/speech",
    } satisfies GenerationResult);

    const adapter = new CloudAudioAdapter();
    const result = await adapter.generate({ modality: "audio", prompt: "hello" });

    expect(result.provider).toBe("minimax/speech");
  });

  it("429 error is NOT swallowed — re-thrown", async () => {
    mockPrimaryGenerate.mockRejectedValue(new Error("HTTP 429"));

    const adapter = new CloudAudioAdapter();

    await expect(
      adapter.generate({ modality: "audio", prompt: "hello" }),
    ).rejects.toThrow("429");

    expect(mockFallbackGenerate).not.toHaveBeenCalled();
  });

  it("throws when no provider is configured", async () => {
    delete process.env["QUILLBY_ELEVENLABS_API_KEY"];
    delete process.env["QUILLBY_MINIMAX_API_KEY"];

    const adapter = new CloudAudioAdapter();
    await expect(
      adapter.generate({ modality: "audio", prompt: "test" }),
    ).rejects.toThrow("Cloud audio provider not configured");
  });
});

describe("CloudVideoAdapter", () => {
  it("has correct id", () => {
    const adapter = new CloudVideoAdapter();
    expect(adapter.id).toBe("cloud/video");
  });

  it("supports video modality", () => {
    const adapter = new CloudVideoAdapter();
    expect(adapter.supportedModalities).toEqual(["video"]);
  });

  it("generate() calls primary provider", async () => {
    mockPrimaryGenerate.mockResolvedValue({
      outputRef: "https://out.test/video.mp4",
      mimeType: "video/mp4",
      provider: "veo/video",
    } satisfies GenerationResult);

    const adapter = new CloudVideoAdapter();
    const _result = await adapter.generate({ modality: "video", prompt: "a dog" });

    expect(mockPrimaryGenerate).toHaveBeenCalledTimes(1);
    expect(mockFallbackGenerate).not.toHaveBeenCalled();
  });

  it("falls through to fallback when primary fails", async () => {
    mockPrimaryGenerate.mockRejectedValue(new Error("Model busy"));
    mockFallbackGenerate.mockResolvedValue({
      outputRef: "https://out.test/video.mp4",
      mimeType: "video/mp4",
      provider: "kling/video",
    } satisfies GenerationResult);

    const adapter = new CloudVideoAdapter();
    const result = await adapter.generate({ modality: "video", prompt: "a dog" });

    expect(result.provider).toBe("kling/video");
  });

  it("429 error is NOT swallowed — re-thrown", async () => {
    mockPrimaryGenerate.mockRejectedValue(new Error("status 429"));

    const adapter = new CloudVideoAdapter();

    await expect(
      adapter.generate({ modality: "video", prompt: "a dog" }),
    ).rejects.toThrow("429");

    expect(mockFallbackGenerate).not.toHaveBeenCalled();
  });

  it("throws when no provider is configured", async () => {
    delete process.env["QUILLBY_GOOGLE_AI_API_KEY"];
    delete process.env["QUILLBY_FAL_API_KEY"];

    const adapter = new CloudVideoAdapter();
    await expect(
      adapter.generate({ modality: "video", prompt: "test" }),
    ).rejects.toThrow("Cloud video provider not configured");
  });
});
