import type { ProviderAdapter, GenerationRequest, GenerationResult } from "../../router.js";
import type { GenerationModality } from "@quillby/core";
import { pollForCompletion } from "../../polling.js";

// Veo 3 via Google AI Studio (Generative Language API).
// Submits an async video generation operation and polls until done.
const DEFAULT_MODEL = "veo-3.0-generate-preview";
const AI_STUDIO_BASE = "https://generativelanguage.googleapis.com/v1beta";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 180; // ~15 minutes (Veo 3 can take up to 10+ minutes)

export type VeoConfig = {
  apiKey: string;
  /** Override the model slug if a newer version is available. */
  model?: string;
};

type GenerateVideoOp = { name?: string };

type OperationResult = {
  done?: boolean;
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: { uri?: string; mimeType?: string };
      }>;
    };
  };
  error?: { message?: string; code?: number };
};

export class VeoAdapter implements ProviderAdapter {
  readonly id: string;
  readonly supportedModalities: GenerationModality[] = ["video"];

  constructor(private readonly config: VeoConfig) {
    this.id = `google/${config.model ?? DEFAULT_MODEL}`;
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const model = this.config.model ?? DEFAULT_MODEL;
    const parts: string[] = [req.prompt];
    if (req.visualStyle) parts.push(`Style: ${req.visualStyle}`);
    if (req.faceProfile) parts.push(`Subject appearance: ${req.faceProfile}`);
    const prompt = parts.join(". ");

    const aspectRatio =
      req.aspectRatio === "portrait" ? "9:16"
      : req.aspectRatio === "16:9" || req.aspectRatio === "landscape" ? "16:9"
      : "1:1";

    const submit = async (withReference: boolean): Promise<Response> => {
      const parameters: Record<string, unknown> = { aspectRatio, durationSeconds: 8 };
      if (withReference && req.faceReferenceImageUrl && req.cloneConsentGranted) {
        parameters.referenceImageUri = req.faceReferenceImageUrl;
      }
      return fetch(
        `${AI_STUDIO_BASE}/models/${model}:generateVideo`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.config.apiKey,
          },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters,
          }),
          signal: AbortSignal.timeout(30000),
        }
      );
    };

    let submitRes = await submit(true);
    if (!submitRes.ok && req.faceReferenceImageUrl) {
      submitRes = await submit(false);
    }
    if (!submitRes.ok) {
      throw new Error(`Veo 3 submit ${submitRes.status}: ${await submitRes.text()}`);
    }

    const op = await submitRes.json() as GenerateVideoOp;
    const opName = op.name;
    if (!opName) throw new Error("Veo 3 did not return an operation name.");

    // Poll operation
    const pollResult = await pollForCompletion<OperationResult>({
      pollUrl: `${AI_STUDIO_BASE}/${opName}`,
      headers: { "X-Goog-Api-Key": this.config.apiKey },
      isComplete: (body) => body.done === true,
      extractResult: (body) => {
        if (body.error) {
          throw new Error(`Veo 3 error: ${body.error.message ?? "unknown"}`);
        }
        const samples = body.response?.generateVideoResponse?.generatedSamples;
        const videoUri = samples?.[0]?.video?.uri;
        if (!videoUri) throw new Error("Veo 3 completed but no video URI in response.");
        return { outputRef: videoUri, provider: this.id };
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
