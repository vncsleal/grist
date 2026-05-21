import type { ProviderAdapter, GenerationRequest, GenerationResult } from "../router.js";
import type { GenerationModality } from "@quillby/core";
import { OpenAiGptImageAdapter } from "../direct/image/openai-gpt-image.js";
import { BflFluxAdapter } from "../direct/image/bfl-flux.js";

/**
 * Tier 2 cloud image adapter.
 * Uses Quillby-managed server-side API keys — never exposed to end users.
 *
 * Primary:  GPT Image 1.5 via QUILLBY_OPENAI_API_KEY  (quality leader)
 * Fallback: FLUX.2 [pro]  via QUILLBY_BFL_API_KEY     (cost/style fallback)
 */
export class CloudImageAdapter implements ProviderAdapter {
  readonly id = "cloud/image";
  readonly supportedModalities: GenerationModality[] = ["image"];

  private readonly primary: ProviderAdapter | null;
  private readonly fallback: ProviderAdapter | null;

  constructor() {
    const openaiKey = process.env["QUILLBY_OPENAI_API_KEY"]?.trim();
    const bflKey = process.env["QUILLBY_BFL_API_KEY"]?.trim();
    this.primary = openaiKey ? new OpenAiGptImageAdapter({ apiKey: openaiKey }) : null;
    this.fallback = bflKey ? new BflFluxAdapter({ apiKey: bflKey }) : null;
  }

  /** Returns true if at least one provider is configured. Used by factory to skip unconfigured tiers. */
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
        process.stderr.write(`[quillby] [CloudImageAdapter] primary failed, trying fallback: ${err}\n`);
      }
    }

    if (this.fallback) {
      return this.fallback.generate(req);
    }

    throw new Error(
      "Cloud image provider not configured. " +
      "Set QUILLBY_OPENAI_API_KEY or QUILLBY_BFL_API_KEY in the deployment environment."
    );
  }
}
