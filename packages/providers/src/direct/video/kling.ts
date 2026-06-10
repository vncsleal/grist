import type { ProviderAdapter, GenerationRequest, GenerationResult } from "../../router.js";
import type { GenerationModality } from "@quillby/core";
import { pollForCompletion } from "../../polling.js";

// Kling 2 via fal.ai queue API.
const DEFAULT_MODEL = "fal-ai/kling-video/v2/master/text-to-video";
const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 120; // ~6 minutes

export type KlingConfig = {
  apiKey: string;
  /** Override the fal.ai model path. */
  model?: string;
};

type FalQueueResponse = {
  request_id: string;
  response_url?: string;
  status_url?: string;
};

type FalStatusResponse = {
  status: "completed" | "failed" | "in_queue" | "in_progress" | "processing";
  output?: {
    video?: { url: string } | Array<{ url: string }>;
  };
  error?: string;
};

function extractVideoUrl(output: FalStatusResponse["output"]): string | undefined {
  const video = output?.video;
  if (!video) return undefined;
  if (Array.isArray(video)) return video[0]?.url;
  return video.url;
}

export class KlingAdapter implements ProviderAdapter {
  readonly id: string;
  readonly supportedModalities: GenerationModality[] = ["video"];

  constructor(private readonly config: KlingConfig) {
    this.id = `fal/${config.model ?? DEFAULT_MODEL}`;
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const model = this.config.model ?? DEFAULT_MODEL;
    const parts: string[] = [req.prompt];
    if (req.visualStyle) parts.push(`Style: ${req.visualStyle}`);
    if (req.faceProfile) parts.push(`Subject appearance: ${req.faceProfile}`);
    const prompt = parts.join(". ");

    const ratio =
      req.aspectRatio === "portrait" ? "9:16"
      : req.aspectRatio === "16:9" || req.aspectRatio === "landscape" ? "16:9"
      : "1:1";

    const submit = async (withReference: boolean): Promise<Response> => {
      const payload: Record<string, unknown> = {
        prompt,
        aspect_ratio: ratio,
        duration: "5",
      };
      if (withReference && req.faceReferenceImageUrl && req.cloneConsentGranted) {
        // Best-effort native reference image passthrough for providers that support identity-consistent I2V controls.
        payload.reference_image_url = req.faceReferenceImageUrl;
      }
      return fetch(`https://queue.fal.run/${model}`, {
        method: "POST",
        headers: {
          "Authorization": `Key ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });
    };

    let submitRes = await submit(true);
    if (!submitRes.ok && req.faceReferenceImageUrl) {
      submitRes = await submit(false);
    }
    if (!submitRes.ok) {
      throw new Error(`fal.ai Kling submit ${submitRes.status}: ${await submitRes.text()}`);
    }

    // HACK: External HTTP API JSON response typing
    const queued = await submitRes.json() as FalQueueResponse;
    const pollUrl =
      queued.status_url ??
      `https://queue.fal.run/${model}/requests/${queued.request_id}/status`;

    // Poll for completion
    const pollResult = await pollForCompletion<FalStatusResponse>({
      pollUrl,
      headers: { "Authorization": `Key ${this.config.apiKey}` },
      isComplete: (body) => body.status === "completed",
      extractResult: (body) => {
        const videoUrl = extractVideoUrl(body.output);
        if (!videoUrl) throw new Error("Kling: completed but no video URL in output.");
        return { outputRef: videoUrl, provider: this.id };
      },
      intervalMs: POLL_INTERVAL_MS,
      maxPolls: MAX_POLLS,
      signal: AbortSignal.timeout(30000),
    });

    return {
      outputRef: pollResult.outputRef,
      mimeType: "video/mp4",
      provider: pollResult.provider ?? this.id,
    };
  }
}
