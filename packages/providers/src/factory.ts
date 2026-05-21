import type { GenerationModality } from "@quillby/core";
import type { ProviderAdapter } from "./router.js";
import { CloudImageAdapter } from "./cloud/image.js";
import { CloudAudioAdapter } from "./cloud/audio.js";
import { CloudVideoAdapter } from "./cloud/video.js";
import { ReplicateAdapter } from "./direct/replicate.js";

/**
 * Initialise Tier 2 cloud adapters from environment variables.
 * Only includes adapters for which at least one API key is configured.
 * Call this at server startup when running in cloud deployment mode.
 */
export function initCloudAdapters(): Partial<Record<GenerationModality, ProviderAdapter>> {
  const adapters: Partial<Record<GenerationModality, ProviderAdapter>> = {};

  const replicateToken = process.env.QUILLBY_REPLICATE_API_TOKEN?.trim();
  if (replicateToken) {
    const replicate = new ReplicateAdapter({ apiToken: replicateToken });
    adapters.image = replicate;
    adapters.audio = replicate;
    adapters.video = replicate;
    return adapters;
  }

  const image = new CloudImageAdapter();
  if (image.isConfigured()) adapters["image"] = image;

  const audio = new CloudAudioAdapter();
  if (audio.isConfigured()) adapters["audio"] = audio;

  const video = new CloudVideoAdapter();
  if (video.isConfigured()) adapters["video"] = video;

  return adapters;
}
