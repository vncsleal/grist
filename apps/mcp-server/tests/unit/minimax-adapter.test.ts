import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MiniMaxAdapter } from "@quillby/providers";

// ── Global mocks ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

afterAll(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

const HEX_AUDIO = "fff390";
const HEX_BYTES = Buffer.from(HEX_AUDIO, "hex");

function ttsResponse(hexAudio: string): Response {
  return new Response(
    JSON.stringify({ data: { audio: hexAudio }, base_resp: { status_code: 0, status_msg: "ok" } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("MiniMaxAdapter", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-minimax-test-"));
  });

  describe("id", () => {
    it("returns minimax/speech-2.8-hd", () => {
      expect(new MiniMaxAdapter({ apiKey: "k" }).id).toBe("minimax/speech-2.8-hd");
    });
  });

  describe("supportedModalities", () => {
    it("returns ['audio']", () => {
      expect(new MiniMaxAdapter({ apiKey: "k" }).supportedModalities).toEqual(["audio"]);
    });
  });

  describe("generate()", () => {
    it("submits to api.minimax.io/v1/t2a_v2 with correct headers", async () => {
      mockFetch.mockResolvedValueOnce(ttsResponse(HEX_AUDIO));

      const adapter = new MiniMaxAdapter({ apiKey: "mm_key" });
      await adapter.generate({ modality: "audio", prompt: "Hello", outputDir: tmpDir });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.minimax.io/v1/t2a_v2");
      expect(opts.method).toBe("POST");
      expect(opts.headers["Authorization"]).toBe("Bearer mm_key");
      expect(opts.headers["Content-Type"]).toBe("application/json");
    });

    it("sends output_format hex in payload", async () => {
      mockFetch.mockResolvedValueOnce(ttsResponse(HEX_AUDIO));

      const adapter = new MiniMaxAdapter({ apiKey: "k" });
      await adapter.generate({ modality: "audio", prompt: "Hi", outputDir: tmpDir });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.output_format).toBe("hex");
      expect(body.model).toBe("speech-2.8-hd");
    });

    it("sends default voice_setting", async () => {
      mockFetch.mockResolvedValueOnce(ttsResponse(HEX_AUDIO));

      const adapter = new MiniMaxAdapter({ apiKey: "k" });
      await adapter.generate({ modality: "audio", prompt: "Hi", outputDir: tmpDir });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.voice_setting.voice_id).toBe("Wise_Woman");
      expect(body.voice_setting.speed).toBe(1.0);
    });

    it("includes groupId query param when groupId is set", async () => {
      mockFetch.mockResolvedValueOnce(ttsResponse(HEX_AUDIO));

      const adapter = new MiniMaxAdapter({ apiKey: "k", groupId: "grp_abc" });
      await adapter.generate({ modality: "audio", prompt: "Hi", outputDir: tmpDir });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("GroupId=grp_abc");
    });

    it("uses voice_clone object when voiceReferenceAudioUrl and consent granted", async () => {
      mockFetch.mockResolvedValueOnce(ttsResponse(HEX_AUDIO));

      const adapter = new MiniMaxAdapter({ apiKey: "k" });
      await adapter.generate({
        modality: "audio",
        prompt: "Hello",
        voiceReferenceAudioUrl: "https://example.com/ref.mp3",
        cloneConsentGranted: true,
        outputDir: tmpDir,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.voice_clone).toEqual({ audio_url: "https://example.com/ref.mp3" });
    });

    it("omits voice_clone when cloneConsentGranted is false", async () => {
      mockFetch.mockResolvedValueOnce(ttsResponse(HEX_AUDIO));

      const adapter = new MiniMaxAdapter({ apiKey: "k" });
      await adapter.generate({
        modality: "audio",
        prompt: "Hello",
        voiceReferenceAudioUrl: "https://example.com/ref.mp3",
        cloneConsentGranted: false,
        outputDir: tmpDir,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.voice_clone).toBeUndefined();
    });

    it("decodes hex response and writes audio file", async () => {
      mockFetch.mockResolvedValueOnce(ttsResponse(HEX_AUDIO));

      const adapter = new MiniMaxAdapter({ apiKey: "k" });
      const result = await adapter.generate({ modality: "audio", prompt: "Hi", outputDir: tmpDir });

      expect(result.outputRef).toContain(tmpDir);
      expect(result.mimeType).toBe("audio/mpeg");
      expect(result.provider).toBe("minimax/speech-2.8-hd");

      const written = fs.readFileSync(result.outputRef);
      expect(Buffer.from(written)).toEqual(HEX_BYTES);
    });

    it("retries without voice_clone on initial failure when voiceReferenceAudioUrl provided", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response("Error", { status: 400 }))
        .mockResolvedValueOnce(ttsResponse(HEX_AUDIO));

      const adapter = new MiniMaxAdapter({ apiKey: "k" });
      await adapter.generate({
        modality: "audio",
        prompt: "Hello",
        voiceReferenceAudioUrl: "https://example.com/ref.mp3",
        cloneConsentGranted: true,
        outputDir: tmpDir,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstBody.voice_clone).toBeDefined();

      const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(secondBody.voice_clone).toBeUndefined();
    });

    it("does not retry on failure when no voiceReferenceAudioUrl", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Rate limited", { status: 429 }));

      const adapter = new MiniMaxAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "audio", prompt: "Hi", outputDir: tmpDir })).rejects.toThrow(
        "MiniMax TTS 429",
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("uses custom voiceId when provided in config", async () => {
      mockFetch.mockResolvedValueOnce(ttsResponse(HEX_AUDIO));

      const adapter = new MiniMaxAdapter({ apiKey: "k", voiceId: "My_Custom_Voice" });
      await adapter.generate({ modality: "audio", prompt: "Hi", outputDir: tmpDir });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.voice_setting.voice_id).toBe("My_Custom_Voice");
    });

    it("throws when base_resp indicates error", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {},
            base_resp: { status_code: 1002, status_msg: "Invalid parameter" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

      const adapter = new MiniMaxAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "audio", prompt: "Hi", outputDir: tmpDir })).rejects.toThrow(
        "MiniMax TTS error: Invalid parameter",
      );
    });

    it("throws when no audio data returned", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: {}, base_resp: { status_code: 0, status_msg: "ok" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const adapter = new MiniMaxAdapter({ apiKey: "k" });
      await expect(adapter.generate({ modality: "audio", prompt: "Hi", outputDir: tmpDir })).rejects.toThrow(
        "MiniMax TTS returned no audio data",
      );
    });

    it("prepends voiceProfile to prompt when provided", async () => {
      mockFetch.mockResolvedValueOnce(ttsResponse(HEX_AUDIO));

      const adapter = new MiniMaxAdapter({ apiKey: "k" });
      await adapter.generate({
        modality: "audio",
        prompt: "Read this aloud",
        voiceProfile: "calm and soothing",
        outputDir: tmpDir,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("[Voice direction: calm and soothing]");
      expect(body.text).toContain("Read this aloud");
    });
  });
});
