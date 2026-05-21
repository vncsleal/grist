import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ReplicateAdapter, ElevenLabsAdapter, OpenAiGptImageAdapter } from "@quillby/providers";
import {
  buildDirectAdaptersFromConfig,
  clearProviderConfig,
  getStoredProviderConfigSummary,
  resolveElevenLabsApiKey,
  saveProviderConfig,
  verifyProviderEnv,
} from "../../src/provider-config.js";

const ORIGINAL_ENV = { ...process.env };
let tempHome = "";

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-provider-storage-"));
  process.env.QUILLBY_HOME = tempHome;
  process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY = "test-encryption-key-for-storage";

  delete process.env.QUILLBY_REPLICATE_API_TOKEN;
  delete process.env.QUILLBY_OPENAI_API_KEY;
  delete process.env.QUILLBY_BFL_API_KEY;
  delete process.env.QUILLBY_ELEVENLABS_API_KEY;
  delete process.env.QUILLBY_MINIMAX_API_KEY;
  delete process.env.QUILLBY_GOOGLE_AI_API_KEY;
  delete process.env.QUILLBY_FAL_API_KEY;
  delete process.env.QUILLBY_ELEVENLABS_DEFAULT_VOICE_ID;
  delete process.env.QUILLBY_MINIMAX_GROUP_ID;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  fs.rmSync(tempHome, { recursive: true, force: true });
});

describe("saveProviderConfig", () => {
  it("stores config for a specific modality", () => {
    saveProviderConfig(
      { modality: "image", provider: "openai_gpt_image", apiKey: "sk-test" },
      "self-hosted",
    );

    const summary = getStoredProviderConfigSummary("self-hosted");
    expect(summary.image.configured).toBe(true);
    expect(summary.image.provider).toBe("openai_gpt_image");
    expect(summary.audio.configured).toBe(false);
    expect(summary.video.configured).toBe(false);
  });

  it("with replicate provider stores for ALL modalities", () => {
    saveProviderConfig(
      { modality: "image", provider: "replicate", apiKey: "r8_test" },
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

  it("throws in cloud mode", () => {
    expect(() =>
      saveProviderConfig(
        { modality: "image", provider: "openai_gpt_image", apiKey: "sk-test" },
        "cloud",
      ),
    ).toThrow(/Cloud mode manages providers internally/i);
  });
});

describe("clearProviderConfig", () => {
  it("removes config for a specific modality", () => {
    saveProviderConfig(
      { modality: "image", provider: "openai_gpt_image", apiKey: "sk-img" },
      "self-hosted",
    );
    saveProviderConfig(
      { modality: "audio", provider: "elevenlabs", apiKey: "sk-audio" },
      "self-hosted",
    );

    clearProviderConfig("image");

    const summary = getStoredProviderConfigSummary("self-hosted");
    expect(summary.image.configured).toBe(false);
    expect(summary.audio.configured).toBe(true);
  });

  it("with replicate provider removes all modalities", () => {
    saveProviderConfig(
      { modality: "video", provider: "replicate", apiKey: "r8_clear_test" },
      "self-hosted",
    );

    clearProviderConfig("audio");

    const summary = getStoredProviderConfigSummary("self-hosted");
    expect(summary.image.configured).toBe(false);
    expect(summary.audio.configured).toBe(false);
    expect(summary.video.configured).toBe(false);
  });
});

describe("getStoredProviderConfigSummary", () => {
  it("returns unconfigured when nothing is stored and no env vars", () => {
    const summary = getStoredProviderConfigSummary("self-hosted");
    expect(summary.image.configured).toBe(false);
    expect(summary.audio.configured).toBe(false);
    expect(summary.video.configured).toBe(false);
    expect(summary.image.source).toBe("none");
    expect(summary.audio.source).toBe("none");
    expect(summary.video.source).toBe("none");
  });

  it("returns env vars when present instead of stored config", () => {
    saveProviderConfig(
      { modality: "image", provider: "bfl_flux", apiKey: "stored-key" },
      "self-hosted",
    );
    process.env.QUILLBY_OPENAI_API_KEY = "env-key";

    const summary = getStoredProviderConfigSummary("self-hosted");
    expect(summary.image.configured).toBe(true);
    expect(summary.image.provider).toBe("openai_gpt_image");
    expect(summary.image.source).toBe("environment");
  });
});

describe("buildDirectAdaptersFromConfig", () => {
  it("returns adapters from env vars", () => {
    process.env.QUILLBY_ELEVENLABS_API_KEY = "sk-eleven-env";
    process.env.QUILLBY_GOOGLE_AI_API_KEY = "sk-veo-env";

    const adapters = buildDirectAdaptersFromConfig("self-hosted");

    expect(adapters.audio).toBeInstanceOf(ElevenLabsAdapter);
    expect(adapters.video?.constructor.name).toBe("VeoAdapter");
    expect(adapters.image).toBeUndefined();
  });

  it("returns adapters from stored config when env vars are absent", () => {
    saveProviderConfig(
      { modality: "image", provider: "openai_gpt_image", apiKey: "sk-openai-stored" },
      "self-hosted",
    );

    const adapters = buildDirectAdaptersFromConfig("self-hosted");

    expect(adapters.image).toBeInstanceOf(OpenAiGptImageAdapter);
    expect(adapters.audio).toBeUndefined();
    expect(adapters.video).toBeUndefined();
  });

  it("prefers replicate for all modalities when replicate env var is set", () => {
    process.env.QUILLBY_REPLICATE_API_TOKEN = "r8_env_token";

    saveProviderConfig(
      { modality: "image", provider: "openai_gpt_image", apiKey: "sk-wont-be-used" },
      "self-hosted",
    );

    const adapters = buildDirectAdaptersFromConfig("self-hosted");

    expect(adapters.image).toBeInstanceOf(ReplicateAdapter);
    expect(adapters.audio).toBeInstanceOf(ReplicateAdapter);
    expect(adapters.video).toBeInstanceOf(ReplicateAdapter);
    expect(adapters.image).toBe(adapters.audio);
    expect(adapters.audio).toBe(adapters.video);
  });

  it("prefers replicate from stored config over individual stored providers", () => {
    saveProviderConfig(
      { modality: "image", provider: "bfl_flux", apiKey: "sk-flux" },
      "self-hosted",
    );
    saveProviderConfig(
      { modality: "video", provider: "replicate", apiKey: "r8_stored" },
      "self-hosted",
    );

    const adapters = buildDirectAdaptersFromConfig("self-hosted");

    expect(adapters.image).toBeInstanceOf(ReplicateAdapter);
    expect(adapters.audio).toBeInstanceOf(ReplicateAdapter);
    expect(adapters.video).toBeInstanceOf(ReplicateAdapter);
  });
});

describe("resolveElevenLabsApiKey", () => {
  it("returns key from env var when set", () => {
    process.env.QUILLBY_ELEVENLABS_API_KEY = "sk-eleven-from-env";

    const key = resolveElevenLabsApiKey("self-hosted");

    expect(key).toBe("sk-eleven-from-env");
  });

  it("returns key from stored config when env var is absent", () => {
    saveProviderConfig(
      { modality: "audio", provider: "elevenlabs", apiKey: "sk-eleven-stored" },
      "self-hosted",
    );

    const key = resolveElevenLabsApiKey("self-hosted");

    expect(key).toBe("sk-eleven-stored");
  });

  it("returns null when no ElevenLabs key is configured", () => {
    const key = resolveElevenLabsApiKey("self-hosted");
    expect(key).toBeNull();
  });
});

describe("verifyProviderEnv", () => {
  it("returns warnings when no provider keys are configured", () => {
    const warnings = verifyProviderEnv();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/No provider API keys configured/i);
  });

  it("returns no warnings when at least one key is configured", () => {
    process.env.QUILLBY_REPLICATE_API_TOKEN = "r8_configured";
    const warnings = verifyProviderEnv();
    expect(warnings).toHaveLength(0);
  });
});
