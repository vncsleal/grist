import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ReplicateAdapter } from "@quillby/providers";
import {
  buildDirectAdaptersFromConfig,
  clearProviderConfig,
  getStoredProviderConfigSummary,
  saveProviderConfig,
} from "../../src/provider-config.js";

const ORIGINAL_ENV = { ...process.env };

let tempHome = "";

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-provider-config-"));
  process.env.QUILLBY_HOME = tempHome;
  process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY = "test-encryption-key";

  delete process.env.QUILLBY_REPLICATE_API_TOKEN;
  delete process.env.QUILLBY_OPENAI_API_KEY;
  delete process.env.QUILLBY_BFL_API_KEY;
  delete process.env.QUILLBY_ELEVENLABS_API_KEY;
  delete process.env.QUILLBY_MINIMAX_API_KEY;
  delete process.env.QUILLBY_GOOGLE_AI_API_KEY;
  delete process.env.QUILLBY_FAL_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  fs.rmSync(tempHome, { recursive: true, force: true });
});

describe("provider config - replicate single hub", () => {
  it("saving replicate for one modality applies to all modalities", () => {
    saveProviderConfig(
      {
        modality: "image",
        provider: "replicate",
        apiKey: "r8_test_token",
      },
      "self-hosted",
    );

    const summary = getStoredProviderConfigSummary("self-hosted");
    expect(summary.image.configured).toBe(true);
    expect(summary.audio.configured).toBe(true);
    expect(summary.video.configured).toBe(true);

    expect(summary.image.provider).toBe("replicate");
    expect(summary.audio.provider).toBe("replicate");
    expect(summary.video.provider).toBe("replicate");
  });

  it("buildDirectAdaptersFromConfig resolves one replicate adapter for all modalities", () => {
    saveProviderConfig(
      {
        modality: "audio",
        provider: "replicate",
        apiKey: "r8_test_token",
      },
      "self-hosted",
    );

    const adapters = buildDirectAdaptersFromConfig("self-hosted");

    expect(adapters.image).toBeInstanceOf(ReplicateAdapter);
    expect(adapters.audio).toBeInstanceOf(ReplicateAdapter);
    expect(adapters.video).toBeInstanceOf(ReplicateAdapter);

    expect(adapters.image).toBe(adapters.audio);
    expect(adapters.audio).toBe(adapters.video);
  });

  it("clearing replicate from one modality clears all mirrored replicate entries", () => {
    saveProviderConfig(
      {
        modality: "video",
        provider: "replicate",
        apiKey: "r8_test_token",
      },
      "self-hosted",
    );

    clearProviderConfig("audio");

    const summary = getStoredProviderConfigSummary("self-hosted");
    expect(summary.image.configured).toBe(false);
    expect(summary.audio.configured).toBe(false);
    expect(summary.video.configured).toBe(false);
  });
});
