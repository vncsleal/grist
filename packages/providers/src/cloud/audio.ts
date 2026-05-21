import type { ProviderAdapter, GenerationRequest, GenerationResult } from "../router.js";
import type { GenerationModality } from "@quillby/core";
import { ElevenLabsAdapter } from "../direct/audio/elevenlabs.js";
import { MiniMaxAdapter } from "../direct/audio/minimax.js";

/**
 * Tier 2 cloud audio adapter.
 * Uses Quillby-managed server-side API keys — never exposed to end users.
 *
 * Primary:  ElevenLabs Eleven v3    via QUILLBY_ELEVENLABS_API_KEY  (quality + creator brand)
 * Fallback: MiniMax Speech 2.8 HD  via QUILLBY_MINIMAX_API_KEY     (cost/volume fallback)
 *
 * Optional: QUILLBY_ELEVENLABS_DEFAULT_VOICE_ID  — override the default ElevenLabs voice.
 *           QUILLBY_MINIMAX_GROUP_ID              — MiniMax group ID for enterprise accounts.
 */
export class CloudAudioAdapter implements ProviderAdapter {
  readonly id = "cloud/audio";
  readonly supportedModalities: GenerationModality[] = ["audio"];

  private readonly primary: ProviderAdapter | null;
  private readonly fallback: ProviderAdapter | null;

  constructor() {
    const elevenKey = process.env["QUILLBY_ELEVENLABS_API_KEY"]?.trim();
    const minimaxKey = process.env["QUILLBY_MINIMAX_API_KEY"]?.trim();

    this.primary = elevenKey
      ? new ElevenLabsAdapter({
          apiKey: elevenKey,
          voiceId: process.env["QUILLBY_ELEVENLABS_DEFAULT_VOICE_ID"]?.trim(),
        })
      : null;

    this.fallback = minimaxKey
      ? new MiniMaxAdapter({
          apiKey: minimaxKey,
          groupId: process.env["QUILLBY_MINIMAX_GROUP_ID"]?.trim(),
        })
      : null;
  }

  isConfigured(): boolean {
    return this.primary !== null || this.fallback !== null;
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    if (this.primary) {
      try {
        return await this.primary.generate(req);
      } catch (err) {
        const errStr = String(err);
        if (errStr.includes("429")) throw err;
        process.stderr.write(`[quillby] [CloudAudioAdapter] primary failed, trying fallback: ${err}\n`);
      }
    }

    if (this.fallback) {
      return this.fallback.generate(req);
    }

    throw new Error(
      "Cloud audio provider not configured. " +
      "Set QUILLBY_ELEVENLABS_API_KEY or QUILLBY_MINIMAX_API_KEY in the deployment environment."
    );
  }
}
