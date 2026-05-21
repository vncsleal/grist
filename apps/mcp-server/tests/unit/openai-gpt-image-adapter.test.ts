import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { OpenAiGptImageAdapter } from "@quillby/providers";

// ── Global mocks ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

afterAll(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function imageResponse(b64Json?: string, url?: string): Response {
  const data: Record<string, string> = {};
  if (b64Json) data.b64_json = b64Json;
  if (url) data.url = url;
  return new Response(JSON.stringify({ data: [data] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("OpenAiGptImageAdapter", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-openai-test-"));
  });

  describe("id", () => {
    it("defaults to openai/gpt-image-1.5", () => {
      expect(new OpenAiGptImageAdapter({ apiKey: "k" }).id).toBe("openai/gpt-image-1.5");
    });

    it("includes custom model", () => {
      const adapter = new OpenAiGptImageAdapter({ apiKey: "k", model: "gpt-image-1" });
      expect(adapter.id).toBe("openai/gpt-image-1");
    });
  });

  describe("supportedModalities", () => {
    it("returns ['image']", () => {
      expect(new OpenAiGptImageAdapter({ apiKey: "k" }).supportedModalities).toEqual(["image"]);
    });
  });

  describe("generate()", () => {
    it("sends correct request shape to OpenAI", async () => {
      mockFetch.mockResolvedValueOnce(imageResponse(PNG_BASE64));

      const adapter = new OpenAiGptImageAdapter({ apiKey: "sk-openai" });
      await adapter.generate({ modality: "image", prompt: "A cat", outputDir: tmpDir });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/images/generations");
      expect(opts.method).toBe("POST");
      expect(opts.headers["Authorization"]).toBe("Bearer sk-openai");
      expect(opts.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(opts.body);
      expect(body.model).toBe("gpt-image-1.5");
      expect(body.prompt).toBe("A cat");
      expect(body.n).toBe(1);
      expect(body.size).toBe("1024x1024");
    });

    it("uses portrait aspect ratio -> 1024x1792", async () => {
      mockFetch.mockResolvedValueOnce(imageResponse(PNG_BASE64));

      const adapter = new OpenAiGptImageAdapter({ apiKey: "k" });
      await adapter.generate({ modality: "image", prompt: "Cat", aspectRatio: "portrait", outputDir: tmpDir });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe("1024x1792");
    });

    it("uses 16:9 aspect ratio -> 1792x1024", async () => {
      mockFetch.mockResolvedValueOnce(imageResponse(PNG_BASE64));

      const adapter = new OpenAiGptImageAdapter({ apiKey: "k" });
      await adapter.generate({ modality: "image", prompt: "Cat", aspectRatio: "16:9", outputDir: tmpDir });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe("1792x1024");
    });

    it("uses landscape aspect ratio -> 1792x1024", async () => {
      mockFetch.mockResolvedValueOnce(imageResponse(PNG_BASE64));

      const adapter = new OpenAiGptImageAdapter({ apiKey: "k" });
      await adapter.generate({ modality: "image", prompt: "Cat", aspectRatio: "landscape", outputDir: tmpDir });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe("1792x1024");
    });

    it("saves b64_json response to file and returns outputRef with file path", async () => {
      mockFetch.mockResolvedValueOnce(imageResponse(PNG_BASE64));

      const adapter = new OpenAiGptImageAdapter({ apiKey: "k" });
      const result = await adapter.generate({ modality: "image", prompt: "Cat", outputDir: tmpDir });

      expect(result.outputRef).toContain(tmpDir);
      expect(result.outputRef).toMatch(/\.png$/);
      expect(result.mimeType).toBe("image/png");
      expect(result.provider).toBe("openai/gpt-image-1.5");

      expect(fs.existsSync(result.outputRef)).toBe(true);
      const written = fs.readFileSync(result.outputRef);
      expect(written.equals(Buffer.from(PNG_BASE64, "base64"))).toBe(true);
    });

    it("returns URL directly when response has url instead of b64_json", async () => {
      mockFetch.mockResolvedValueOnce(
        imageResponse(undefined, "https://oaidalleapiprodscus.blob.core.windows.net/img.png"),
      );

      const adapter = new OpenAiGptImageAdapter({ apiKey: "k" });
      const result = await adapter.generate({ modality: "image", prompt: "Cat", outputDir: tmpDir });

      expect(result.outputRef).toBe("https://oaidalleapiprodscus.blob.core.windows.net/img.png");
      expect(result.mimeType).toBe("image/png");
    });

    it("includes visualStyle in prompt when provided", async () => {
      mockFetch.mockResolvedValueOnce(imageResponse(PNG_BASE64));

      const adapter = new OpenAiGptImageAdapter({ apiKey: "k" });
      await adapter.generate({
        modality: "image",
        prompt: "A cat",
        visualStyle: "watercolor",
        outputDir: tmpDir,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.prompt).toContain("Style: watercolor");
    });

    it("includes faceProfile in prompt when provided", async () => {
      mockFetch.mockResolvedValueOnce(imageResponse(PNG_BASE64));

      const adapter = new OpenAiGptImageAdapter({ apiKey: "k" });
      await adapter.generate({
        modality: "image",
        prompt: "A person",
        faceProfile: "John Doe, 30, caucasian",
        outputDir: tmpDir,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.prompt).toContain("Subject appearance: John Doe, 30, caucasian");
    });

    it("throws on API error", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Insufficient quota", { status: 429 }));

      const adapter = new OpenAiGptImageAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "image", prompt: "Cat", outputDir: tmpDir })).rejects.toThrow(
        "OpenAI Images API 429",
      );
    });

    it("throws when response has no data array", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const adapter = new OpenAiGptImageAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "image", prompt: "Cat", outputDir: tmpDir })).rejects.toThrow(
        "OpenAI Images API returned no data",
      );
    });

    it("throws when response has neither b64_json nor url", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{}] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const adapter = new OpenAiGptImageAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "image", prompt: "Cat", outputDir: tmpDir })).rejects.toThrow(
        "OpenAI Images API returned no b64_json or url",
      );
    });
  });
});
