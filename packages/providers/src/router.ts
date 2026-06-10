import type { GenerationModality } from "@quillby/core";
import { ProviderError } from "@quillby/core";

// ─── Common result types ───────────────────────────────────────────────────────

export type GenerationResult = {
  /** Local file path or remote URL of the produced asset. */
  outputRef: string;
  /** MIME type of the asset (e.g. "image/png", "audio/mpeg", "video/mp4"). */
  mimeType: string;
  /** Provider + model string, e.g. "openai/gpt-image-1". */
  provider: string;
  /** Optional extra metadata to serialize into GenerationJob.meta. */
  meta?: Record<string, string | number | boolean>;
};

export type GenerationRequest = {
  modality: GenerationModality;
  prompt: string;
  /** Resolved visual style from workspace memory (for image). */
  visualStyle?: string;
  /** Resolved voice profile from workspace memory (for audio). */
  voiceProfile?: string;
  /** Resolved face/appearance profile from workspace memory (for image/video likeness). */
  faceProfile?: string;
  /** Explicit face reference image URL for native identity cloning where supported. */
  faceReferenceImageUrl?: string;
  /** Explicit voice reference audio URL for native identity cloning where supported. */
  voiceReferenceAudioUrl?: string;
  /** Consent signal required for identity cloning. */
  cloneConsentGranted?: boolean;
  /** Persistent ElevenLabs cloned voice ID — reused on every TTS call to avoid re-uploading. */
  elevenlabsClonedVoiceId?: string;
  /** Hint for aspect ratio / format (e.g. "square", "16:9", "portrait"). */
  aspectRatio?: string;
  /** Output directory hint for local mode. */
  outputDir?: string;
  /**
   * Pre-generated audio URL to drive a talking-head video (SadTalker / Wav2Lip pipeline).
   * When set alongside faceReferenceImageUrl + cloneConsentGranted, the Replicate adapter
   * routes to a talking-head model instead of a text-to-video model.
   */
  drivingAudioUrl?: string;
};

// ─── Provider adapter interface ────────────────────────────────────────────────

export interface ProviderAdapter {
  /** Human-readable provider+model identifier. */
  readonly id: string;
  readonly supportedModalities: GenerationModality[];
  generate(req: GenerationRequest): Promise<GenerationResult>;
}

// ─── Tier enumeration ─────────────────────────────────────────────────────────

/** Tier 1 = MCP Sampling (zero-config, host AI client handles it).
 *  Tier 2 = Cloud budget (Quillby-managed API keys, Cloud plan only).
 *  Tier 3 = Direct keys (user-supplied, Self-Hosted only). */
export type ProviderTier = "sampling" | "cloud" | "direct";

// ─── ProviderRouter ─────────────────────────────────────────────────────────────
// Resolves which adapter to use at runtime using the three-tier fallback chain.

export type ProviderRouterOptions = {
  tier1?: ProviderAdapter; // MCP Sampling adapter (injected by server.ts after client connect)
  tier2?: Partial<Record<GenerationModality, ProviderAdapter>>; // Cloud budget adapters
  tier3?: Partial<Record<GenerationModality, ProviderAdapter>>; // Direct-key adapters (self-hosted only)
};

export class ProviderRouter {
  constructor(private opts: ProviderRouterOptions = {}) {}

  /** Wire the Tier 1 MCP Sampling adapter after the client connection is established. */
  setTier1(adapter: ProviderAdapter): void {
    this.opts.tier1 = adapter;
  }

  /** Wire Tier 2 cloud adapters (typically called at startup in cloud mode). */
  setTier2(adapters: Partial<Record<GenerationModality, ProviderAdapter>>): void {
    this.opts.tier2 = adapters;
  }

  /** Wire Tier 3 direct adapters (local/self-hosted environment configuration). */
  setTier3(adapters: Partial<Record<GenerationModality, ProviderAdapter>>): void {
    this.opts.tier3 = adapters;
  }

  /**
   * Generate an asset using the best available tier for this request.
   * Falls through tiers in order: sampling → cloud → direct.
   * Throws if no adapter is available for the requested modality.
   */
  async generate(req: GenerationRequest): Promise<GenerationResult & { tier: ProviderTier }> {
    const { modality } = req;

    // Tier 1: MCP Sampling
    const t1 = this.opts.tier1;
    if (t1 && t1.supportedModalities.includes(modality)) {
      const result = await t1.generate(req);
      return { ...result, tier: "sampling" };
    }

    // Tier 2: Cloud budget
    const t2 = this.opts.tier2?.[modality];
    if (t2) {
      const result = await t2.generate(req);
      return { ...result, tier: "cloud" };
    }

    // Tier 3: Direct keys
    const t3 = this.opts.tier3?.[modality];
    if (t3) {
      const result = await t3.generate(req);
      return { ...result, tier: "direct" };
    }

    throw new ProviderError(
      `No provider configured for modality "${modality}". ` +
      `To generate ${modality} content, your AI client must support MCP Sampling ` +
      `or you need a Pro plan (Cloud) or direct API keys (Self-Hosted).`,
      { modality }
    );
  }

  /** Returns which tier would be used for a given modality, without executing. */
  resolvesTier(modality: GenerationModality): ProviderTier | null {
    if (this.opts.tier1?.supportedModalities.includes(modality)) return "sampling";
    if (this.opts.tier2?.[modality]) return "cloud";
    if (this.opts.tier3?.[modality]) return "direct";
    return null;
  }
}
