import type { GenerationModality } from "@quillby/core";
import type { ProviderAdapter, GenerationRequest, GenerationResult } from "../router.js";
import { pollForCompletion } from "../polling.js";

// ── Default model slugs ────────────────────────────────────────────────────────
// Image: FLUX.2 [pro] — high-fidelity, character-consistent, 5M+ runs (BFL, 2025)
const DEFAULT_IMAGE_MODEL = "black-forest-labs/flux-2-pro";
// Audio: MiniMax Speech 2.8 Turbo — 40+ languages, voice cloning, real-time speed
const DEFAULT_AUDIO_MODEL = "minimax/speech-2.8-turbo";
// Video: Runway Gen-4.5 — #1 Artificial Analysis text-to-video benchmark
const DEFAULT_VIDEO_MODEL = "runwayml/gen-4.5";

// Identity-clone specialised models
// Chatterbox Turbo: open-source TTS with instant voice cloning from reference audio
const DEFAULT_CLONE_AUDIO_MODEL = "resemble-ai/chatterbox-turbo";
// OmniHuman: face photo + driving audio → realistic talking-head video (official, ByteDance)
const DEFAULT_CLONE_VIDEO_MODEL = "bytedance/omni-human";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 120;

export type ReplicateConfig = {
  apiToken: string;
  imageModel?: string;
  audioModel?: string;
  videoModel?: string;
  /** Override the voice-clone audio model (default: resemble-ai/chatterbox-turbo). */
  cloneAudioModel?: string;
  /** Override the talking-head video model (default: bytedance/omni-human). */
  cloneVideoModel?: string;
};

type ReplicatePrediction = {
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  error?: string;
  output?: unknown;
  urls?: { get?: string };
};

function modelFor(modality: GenerationModality, config: ReplicateConfig): string {
  if (modality === "image") return config.imageModel ?? process.env.QUILLBY_REPLICATE_IMAGE_MODEL?.trim() ?? DEFAULT_IMAGE_MODEL;
  if (modality === "audio") return config.audioModel ?? process.env.QUILLBY_REPLICATE_AUDIO_MODEL?.trim() ?? DEFAULT_AUDIO_MODEL;
  return config.videoModel ?? process.env.QUILLBY_REPLICATE_VIDEO_MODEL?.trim() ?? DEFAULT_VIDEO_MODEL;
}

function outputToUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output.find((x) => typeof x === "string");
    return typeof first === "string" ? first : null;
  }
  if (output && typeof output === "object") {
    // HACK: Replicate API response is dynamic
    const asRecord = output as Record<string, unknown>;
    if (typeof asRecord.url === "string") return asRecord.url;
  }
  return null;
}

type PredictionParams = {
  model: string;
  body: Record<string, unknown>;
  /** true → Prefer: respond-async; false → Prefer: wait (sync up to Replicate's 60s window). */
  async: boolean;
};

export class ReplicateAdapter implements ProviderAdapter {
  readonly id = "replicate/multimodal";
  readonly supportedModalities: GenerationModality[] = ["image", "audio", "video"];

  constructor(private readonly config: ReplicateConfig) {}

  /**
   * Build the model slug, input body, and async preference for this request.
   *
   * Routing precedence:
   *  1. Clone audio  — audio + voiceReferenceAudioUrl + consent → XTTS-v2
   *  2. Clone video  — video + faceReferenceImageUrl + drivingAudioUrl + consent → SadTalker
   *  3. Default      — prompt-driven standard generation
   */
  private buildPredictionParams(req: GenerationRequest): PredictionParams {
    // ── Clone audio: synthesise speech in user's voice ─────────────────────
    if (
      req.modality === "audio" &&
      req.voiceReferenceAudioUrl &&
      req.cloneConsentGranted
    ) {
      const model =
        this.config.cloneAudioModel ??
        process.env.QUILLBY_REPLICATE_CLONE_AUDIO_MODEL?.trim() ??
        DEFAULT_CLONE_AUDIO_MODEL;
      return {
        model,
        body: {
          // Chatterbox Turbo: `text` + optional `reference_audio` for voice cloning
          input: {
            text: req.prompt,
            reference_audio: req.voiceReferenceAudioUrl,
          },
        },
        async: false, // Chatterbox Turbo generates in ~3s, sync wait is fine
      };
    }

    // ── Clone video: talking-head from face photo + driving audio ──────────
    if (
      req.modality === "video" &&
      req.faceReferenceImageUrl &&
      req.drivingAudioUrl &&
      req.cloneConsentGranted
    ) {
      const model =
        this.config.cloneVideoModel ??
        process.env.QUILLBY_REPLICATE_CLONE_VIDEO_MODEL?.trim() ??
        DEFAULT_CLONE_VIDEO_MODEL;
      return {
        model,
        body: {
          // OmniHuman: `image` (face photo) + `audio` (driving audio) → talking-head video
          input: {
            image: req.faceReferenceImageUrl,
            audio: req.drivingAudioUrl,
          },
        },
        async: true, // OmniHuman takes ~2-3 minutes
      };
    }

    // ── Default: prompt-driven generation ─────────────────────────────────
    const model = modelFor(req.modality, this.config);
    return {
      model,
      body: {
        input: {
          prompt: req.prompt,
          ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}),
        },
      },
      async: req.modality === "video",
    };
  }

  private async createPrediction(req: GenerationRequest): Promise<ReplicatePrediction> {
    const { model, body, async: preferAsync } = this.buildPredictionParams(req);
    const [owner, name] = model.split("/");
    if (!owner || !name) {
      throw new Error(`Replicate model must be in owner/name format. Received: ${model}`);
    }

    const res = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        "Content-Type": "application/json",
        Prefer: preferAsync ? "respond-async" : "wait",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`Replicate create prediction ${res.status}: ${await res.text()}`);
    }

    // HACK: fetch JSON parse
    return (await res.json()) as ReplicatePrediction;
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const prediction = await this.createPrediction(req);
    const isCloneVideo =
      req.modality === "video" &&
      !!req.faceReferenceImageUrl &&
      !!req.drivingAudioUrl &&
      !!req.cloneConsentGranted;

    if (prediction.status === "succeeded") {
      const outputRef = outputToUrl(prediction.output);
      if (!outputRef) {
        throw new Error("Replicate prediction succeeded but no output URL was returned.");
      }
      const mimeType = req.modality === "image" ? "image/png" : req.modality === "audio" ? "audio/mpeg" : "video/mp4";
      const meta: Record<string, string | number | boolean> = {};
      if (isCloneVideo && req.drivingAudioUrl) meta.audioRef = req.drivingAudioUrl;
      return { outputRef, mimeType, provider: this.id, ...(Object.keys(meta).length ? { meta } : {}) };
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? "unknown error"}`);
    }

    const getUrl = prediction.urls?.get;
    if (!getUrl) {
      throw new Error("Replicate prediction is pending but no poll URL is available.");
    }

    const pollResult = await pollForCompletion<ReplicatePrediction>({
      pollUrl: getUrl,
      headers: { Authorization: `Bearer ${this.config.apiToken}` },
      isComplete: (body) => body.status === "succeeded" || body.status === "canceled",
      extractResult: (body) => {
        if (body.status === "canceled") {
          throw new Error(`Replicate prediction canceled: ${body.error ?? "unknown"}`);
        }
        const outRef = outputToUrl(body.output);
        if (!outRef) throw new Error("Replicate prediction succeeded but no output URL was returned.");
        return { outputRef: outRef, provider: this.id };
      },
      intervalMs: POLL_INTERVAL_MS,
      maxPolls: MAX_POLLS,
      signal: AbortSignal.timeout(30000),
    });

    const mimeType = req.modality === "image" ? "image/png" : req.modality === "audio" ? "audio/mpeg" : "video/mp4";
    const meta: Record<string, string | number | boolean> = {};
    if (isCloneVideo && req.drivingAudioUrl) meta.audioRef = req.drivingAudioUrl;
    return {
      outputRef: pollResult.outputRef,
      mimeType,
      provider: this.id,
      ...(Object.keys(meta).length ? { meta } : {}),
    };
  }
}
