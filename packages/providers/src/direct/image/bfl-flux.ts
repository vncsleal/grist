import type { ProviderAdapter, GenerationRequest, GenerationResult } from "../../router.js";
import type { GenerationModality } from "@quillby/core";
import { pollForCompletion } from "../../polling.js";

// BFL FLUX.2 [pro] via the Black Forest Labs async queue API.
const DEFAULT_MODEL = "flux-pro-1.1-ultra";
const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 60; // ~2 minutes

export type BflFluxConfig = {
  apiKey: string;
  /** Override the model slug, e.g. "flux-pro-1.1" (lower cost) or "flux-pro-1.1-ultra". */
  model?: string;
};

type BflResultResponse = {
  status: string;
  result?: { sample: string };
};

export class BflFluxAdapter implements ProviderAdapter {
  readonly id: string;
  readonly supportedModalities: GenerationModality[] = ["image"];

  constructor(private readonly config: BflFluxConfig) {
    this.id = `bfl/${config.model ?? DEFAULT_MODEL}`;
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

    // Submit generation request
    const submitRes = await fetch(`https://api.bfl.ai/v1/${model}`, {
      method: "POST",
      headers: {
        "x-key": this.config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, aspect_ratio: ratio, output_format: "png" }),
      signal: AbortSignal.timeout(30000),
    });

    if (!submitRes.ok) {
      throw new Error(`BFL submit ${submitRes.status}: ${await submitRes.text()}`);
    }

    const { id, polling_url } = await submitRes.json() as { id: string; polling_url?: string };
    const pollUrl = polling_url ?? `https://api.bfl.ai/v1/get_result?id=${encodeURIComponent(id)}`;

    // Poll for completion
    const pollResult = await pollForCompletion<BflResultResponse>({
      pollUrl: pollUrl,
      headers: { "x-key": this.config.apiKey },
      isComplete: (body) => body.status === "Ready" || body.status === "Error" || body.status === "Content Moderated",
      extractResult: (body) => {
        if (body.status === "Error" || body.status === "Content Moderated") {
          throw new Error(`BFL generation failed with status: ${body.status}`);
        }
        if (!body.result?.sample) throw new Error("BFL: no sample in result");
        return { outputRef: body.result.sample, provider: this.id };
      },
      intervalMs: POLL_INTERVAL_MS,
      maxPolls: MAX_POLLS,
      signal: AbortSignal.timeout(30000),
    });

    return {
      outputRef: pollResult.outputRef,
      mimeType: "image/png",
      provider: pollResult.provider ?? this.id,
    };
  }
}
