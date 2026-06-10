/**
 * Unit tests — ElevenLabsAdapter voice clone logic with mocked fetch.
 *
 * Covers:
 *  - generate() uses elevenlabsClonedVoiceId when consent is granted
 *  - generate() falls back to config.voiceId / DEFAULT when no cloned ID
 *  - generate() falls back to DEFAULT when cloned ID present but consent revoked
 *  - createVoiceClone() builds correct FormData and returns voice_id
 *  - deleteVoiceClone() calls DELETE endpoint and tolerates 404
 */
import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { ElevenLabsAdapter } from "@quillby/providers";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAudioResponse(_voiceId: string): Response {
  // Minimal MP3 header (3 bytes) — enough to write to disk.
  const audio = Buffer.from([0xff, 0xfb, 0x90]);
  return new Response(audio, {
    status: 200,
    headers: { "content-type": "audio/mpeg" },
  });
}

// ── generate() voice selection ────────────────────────────────────────────────

describe("ElevenLabsAdapter.generate() — voice selection", () => {
  const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"; // Rachel

  it("uses elevenlabsClonedVoiceId when cloneConsentGranted=true", async () => {
    const capturedUrls: string[] = [];

    vi.stubGlobal("fetch", async (url: string) => {
      capturedUrls.push(url);
      return makeAudioResponse("");
    });

    const adapter = new ElevenLabsAdapter({ apiKey: "test_key" });
    const tmpDir = fs.mkdtempSync("/tmp/quillby-test-");

    await adapter.generate({
      modality: "audio",
      prompt: "Hello world",
      elevenlabsClonedVoiceId: "cloned_voice_xyz",
      cloneConsentGranted: true,
      outputDir: tmpDir,
    });

    expect(capturedUrls[0]).toContain("cloned_voice_xyz");
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("falls back to DEFAULT when cloneConsentGranted is false even if cloned ID present", async () => {
    const capturedUrls: string[] = [];

    vi.stubGlobal("fetch", async (url: string) => {
      capturedUrls.push(url);
      return makeAudioResponse("");
    });

    const adapter = new ElevenLabsAdapter({ apiKey: "test_key" });
    const tmpDir = fs.mkdtempSync("/tmp/quillby-test-");

    await adapter.generate({
      modality: "audio",
      prompt: "Hello world",
      elevenlabsClonedVoiceId: "cloned_voice_xyz",
      cloneConsentGranted: false,
      outputDir: tmpDir,
    });

    expect(capturedUrls[0]).toContain(DEFAULT_VOICE);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("uses config.voiceId when no cloned ID present", async () => {
    const capturedUrls: string[] = [];

    vi.stubGlobal("fetch", async (url: string) => {
      capturedUrls.push(url);
      return makeAudioResponse("");
    });

    const adapter = new ElevenLabsAdapter({ apiKey: "test_key", voiceId: "config_voice_id" });
    const tmpDir = fs.mkdtempSync("/tmp/quillby-test-");

    await adapter.generate({ modality: "audio", prompt: "test", outputDir: tmpDir });

    expect(capturedUrls[0]).toContain("config_voice_id");
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });
});

// ── createVoiceClone() ────────────────────────────────────────────────────────

describe("ElevenLabsAdapter.createVoiceClone()", () => {
  it("fetches reference audio and POSTs to /v1/voices/add, returns voice_id", async () => {
    const audioData = Buffer.from([0xff, 0xfb, 0x90]);
    let addCalled = false;

    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("example.com/voice.mp3")) {
        return new Response(audioData, {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      }
      if (typeof url === "string" && url.includes("/v1/voices/add")) {
        addCalled = true;
        // Verify POST method.
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ voice_id: "new_cloned_voice_99" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const voiceId = await ElevenLabsAdapter.createVoiceClone(
      "test_api_key",
      "https://example.com/voice.mp3",
      "Test Clone"
    );

    expect(addCalled).toBe(true);
    expect(voiceId).toBe("new_cloned_voice_99");
    vi.unstubAllGlobals();
  });

  it("throws when ElevenLabs returns non-OK", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("example.com")) {
        return new Response(Buffer.from([0x00]), { status: 200, headers: { "content-type": "audio/mpeg" } });
      }
      return new Response("quota exceeded", { status: 429 });
    });

    await expect(
      ElevenLabsAdapter.createVoiceClone("key", "https://example.com/ref.mp3", "Clone")
    ).rejects.toThrow("429");

    vi.unstubAllGlobals();
  });
});

// ── deleteVoiceClone() ────────────────────────────────────────────────────────

describe("ElevenLabsAdapter.deleteVoiceClone()", () => {
  it("calls DELETE /v1/voices/:id", async () => {
    let deleteCalled = false;

    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("/v1/voices/voice_to_delete")) {
        deleteCalled = true;
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await ElevenLabsAdapter.deleteVoiceClone("test_key", "voice_to_delete");
    expect(deleteCalled).toBe(true);
    vi.unstubAllGlobals();
  });

  it("silently ignores 404 (voice already gone)", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));

    // Should not throw.
    await expect(
      ElevenLabsAdapter.deleteVoiceClone("key", "already_gone")
    ).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });
});
