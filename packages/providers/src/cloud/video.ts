import type { ProviderAdapter, GenerationRequest, GenerationResult } from "../router.js";
import type { GenerationModality } from "@quillby/core";
import { VeoAdapter } from "../direct/video/veo.js";
import { KlingAdapter } from "../direct/video/kling.js";

/**
 * Tier 2 cloud video adapter.
 * Uses Quillby-managed server-side API keys — never exposed to end users.
 *
 * Note: video is always Tier 2 or Tier 3 — MCP Sampling has no video content type.
 *
 * Primary:  Veo 3 via Google AI Studio  via QUILLBY_GOOGLE_AI_API_KEY  (quality + native audio)
 * Fallback: Kling 2 via fal.ai          via QUILLBY_FAL_API_KEY        (cost/speed fallback)
 */
export class CloudVideoAdapter implements ProviderAdapter {
  readonly id = "cloud/video";
  readonly supportedModalities: GenerationModality[] = ["video"];

  private readonly primary: ProviderAdapter | null;
  private readonly fallback: ProviderAdapter | null;

  constructor() {
    const googleKey = process.env["QUILLBY_GOOGLE_AI_API_KEY"]?.trim();
    const falKey = process.env["QUILLBY_FAL_API_KEY"]?.trim();
    this.primary = googleKey ? new VeoAdapter({ apiKey: googleKey }) : null;
    this.fallback = falKey ? new KlingAdapter({ apiKey: falKey }) : null;
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
        process.stderr.write(`[quillby] [CloudVideoAdapter] primary failed, trying fallback: ${err}\n`);
      }
    }

    if (this.fallback) {
      return this.fallback.generate(req);
    }

    throw new Error(
      "Cloud video provider not configured. " +
      "Set QUILLBY_GOOGLE_AI_API_KEY or QUILLBY_FAL_API_KEY in the deployment environment."
    );
  }
}
