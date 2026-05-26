import * as fs from "node:fs";
import * as path from "node:path";
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { CONFIG, ensureDataDir, getDeploymentMode, type DeploymentMode } from "@quillby/config";
import type { GenerationModality } from "@quillby/core";
import { logWarn } from "./logger.js";
import type { ProviderAdapter } from "@quillby/providers";
import {
  OpenAiGptImageAdapter,
  BflFluxAdapter,
  ElevenLabsAdapter,
  MiniMaxAdapter,
  VeoAdapter,
  KlingAdapter,
  ReplicateAdapter,
} from "@quillby/providers";

type ImageProviderId = "replicate" | "openai_gpt_image" | "bfl_flux";
type AudioProviderId = "replicate" | "elevenlabs" | "minimax";
type VideoProviderId = "replicate" | "google_veo" | "fal_kling";

type StoredProviderEntry = {
  provider: ImageProviderId | AudioProviderId | VideoProviderId;
  secretStorage: "keychain" | "encrypted-file";
  secretRef?: string;
  encryptedApiKey?: string;
  voiceId?: string;
  groupId?: string;
  updatedAt: string;
};

type ProviderConfigFile = {
  image?: StoredProviderEntry;
  audio?: StoredProviderEntry;
  video?: StoredProviderEntry;
};

const ALL_MODALITIES: GenerationModality[] = ["image", "audio", "video"];

export type ProviderConfigSummaryEntry = {
  configured: boolean;
  provider?: string;
  secretStorage?: "keychain" | "encrypted-file";
  voiceId?: string;
  groupId?: string;
  source: "stored" | "environment" | "none";
};

export type ProviderConfigSummary = Record<GenerationModality, ProviderConfigSummaryEntry>;

export type SaveProviderConfigInput = {
  modality: GenerationModality;
  provider: string;
  apiKey: string;
  voiceId?: string;
  groupId?: string;
};

function providerConfigPath(): string {
  return path.join(CONFIG.DATA_DIR, "provider-config.json");
}

function loadConfigFile(): ProviderConfigFile {
  ensureDataDir();
  const file = providerConfigPath();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as ProviderConfigFile;
  } catch (e) {
    logWarn("Corrupt provider config file, starting fresh", { error: String(e) });
    return {};
  }
}

function saveConfigFile(config: ProviderConfigFile): void {
  ensureDataDir();
  fs.writeFileSync(providerConfigPath(), JSON.stringify(config, null, 2));
}

function keychainService(modality: GenerationModality): string {
  return `quillby.provider.${modality}`;
}

function resolveEncryptionSecret(mode: DeploymentMode): string {
  const secret = (
    mode === "self-hosted"
      ? process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY
      : process.env.QUILLBY_KEYRING_SECRET ?? process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY
  )?.trim();
  if (!secret) {
    throw new Error(
      mode === "self-hosted"
        ? "Self-hosted provider configuration requires QUILLBY_PROVIDER_ENCRYPTION_KEY."
        : "Local provider configuration on this OS requires QUILLBY_KEYRING_SECRET or QUILLBY_PROVIDER_ENCRYPTION_KEY."
    );
  }
  return secret;
}

function deriveKey(secret: string, salt?: Buffer): { keyBytes: Buffer; saltHex: string } {
  const s = salt ?? randomBytes(16);
  return {
    keyBytes: pbkdf2Sync(secret, s, 100_000, 32, "sha512"),
    saltHex: s.toString("hex"),
  };
}

export function encryptSecret(secret: string, encryptionKey: string): string {
  const { keyBytes, saltHex } = deriveKey(encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes, iv);
  cipher.setAAD(Buffer.from("quillby-provider-config-v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [saltHex, iv.toString("base64"), ciphertext.toString("base64"), tag.toString("base64")].join(".");
}

export function decryptSecret(payload: string, encryptionKey: string): string {
  const parts = payload.split(".");

  if (parts.length === 4) {
    const [saltHex, ivRaw, ciphertextRaw, tagRaw] = parts;
    const { keyBytes } = deriveKey(encryptionKey, Buffer.from(saltHex, "hex"));
    const decipher = createDecipheriv("aes-256-gcm", keyBytes, Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    decipher.setAAD(Buffer.from("quillby-provider-config-v1", "utf8"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  const [ivRaw, ciphertextRaw, tagRaw] = parts;
  const oldKey = createHash("sha256").update(encryptionKey).digest();
  const decipher = createDecipheriv("aes-256-gcm", oldKey, Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function setKeychainSecret(modality: GenerationModality, apiKey: string): void {
  execFileSync("security", [
    "add-generic-password",
    "-U",
    "-a",
    "quillby",
    "-s",
    keychainService(modality),
    "-w",
  ], { input: apiKey });
}

function getKeychainSecret(modality: GenerationModality): string | null {
  try {
    return execFileSync("security", [
      "find-generic-password",
      "-a",
      "quillby",
      "-s",
      keychainService(modality),
      "-w",
    ], { encoding: "utf8" }).trim();
  } catch {
    logWarn("Keychain secret not found", { modality });
    return null;
  }
}

function deleteKeychainSecret(modality: GenerationModality): void {
  try {
    execFileSync("security", [
      "delete-generic-password",
      "-a",
      "quillby",
      "-s",
      keychainService(modality),
    ]);
  } catch {
    logWarn("Keychain secret not found (expected on first delete)", { modality });
  }
}

function useKeychain(mode: DeploymentMode): boolean {
  return mode === "local" && process.platform === "darwin";
}

function envSummary(): ProviderConfigSummary {
  const replicate = process.env.QUILLBY_REPLICATE_API_TOKEN?.trim();
  return {
    image: {
      configured: Boolean(replicate || process.env.QUILLBY_OPENAI_API_KEY?.trim() || process.env.QUILLBY_BFL_API_KEY?.trim()),
      provider: replicate ? "replicate" : process.env.QUILLBY_OPENAI_API_KEY?.trim() ? "openai_gpt_image" : process.env.QUILLBY_BFL_API_KEY?.trim() ? "bfl_flux" : undefined,
      source: replicate || process.env.QUILLBY_OPENAI_API_KEY?.trim() || process.env.QUILLBY_BFL_API_KEY?.trim() ? "environment" : "none",
    },
    audio: {
      configured: Boolean(replicate || process.env.QUILLBY_ELEVENLABS_API_KEY?.trim() || process.env.QUILLBY_MINIMAX_API_KEY?.trim()),
      provider: replicate ? "replicate" : process.env.QUILLBY_ELEVENLABS_API_KEY?.trim() ? "elevenlabs" : process.env.QUILLBY_MINIMAX_API_KEY?.trim() ? "minimax" : undefined,
      source: replicate || process.env.QUILLBY_ELEVENLABS_API_KEY?.trim() || process.env.QUILLBY_MINIMAX_API_KEY?.trim() ? "environment" : "none",
    },
    video: {
      configured: Boolean(replicate || process.env.QUILLBY_GOOGLE_AI_API_KEY?.trim() || process.env.QUILLBY_FAL_API_KEY?.trim()),
      provider: replicate ? "replicate" : process.env.QUILLBY_GOOGLE_AI_API_KEY?.trim() ? "google_veo" : process.env.QUILLBY_FAL_API_KEY?.trim() ? "fal_kling" : undefined,
      source: replicate || process.env.QUILLBY_GOOGLE_AI_API_KEY?.trim() || process.env.QUILLBY_FAL_API_KEY?.trim() ? "environment" : "none",
    },
  };
}

export function getStoredProviderConfigSummary(): ProviderConfigSummary {
  const env = envSummary();
  const stored = loadConfigFile();
  const storedReplicate = stored.image?.provider === "replicate"
    ? stored.image
    : stored.audio?.provider === "replicate"
      ? stored.audio
      : stored.video?.provider === "replicate"
        ? stored.video
        : undefined;

  const storedReplicateSummary = storedReplicate
    ? {
        configured: true,
        provider: "replicate",
        secretStorage: storedReplicate.secretStorage,
        source: "stored" as const,
      }
    : undefined;

  return {
    image: env.image.configured ? env.image : storedReplicateSummary ?? stored.image
      ? {
          configured: true,
          provider: storedReplicateSummary?.provider ?? stored.image?.provider,
          secretStorage: storedReplicateSummary?.secretStorage ?? stored.image?.secretStorage,
          source: "stored",
        }
      : env.image,
    audio: env.audio.configured ? env.audio : storedReplicateSummary ?? stored.audio
      ? {
          configured: true,
          provider: storedReplicateSummary?.provider ?? stored.audio?.provider,
          secretStorage: storedReplicateSummary?.secretStorage ?? stored.audio?.secretStorage,
          voiceId: stored.audio?.voiceId,
          groupId: stored.audio?.groupId,
          source: "stored",
        }
      : env.audio,
    video: env.video.configured ? env.video : storedReplicateSummary ?? stored.video
      ? {
          configured: true,
          provider: storedReplicateSummary?.provider ?? stored.video?.provider,
          secretStorage: storedReplicateSummary?.secretStorage ?? stored.video?.secretStorage,
          source: "stored",
        }
      : env.video,
  };
}

function resolveStoredApiKey(entry: StoredProviderEntry, modality: GenerationModality, mode: DeploymentMode): string | null {
  if (entry.secretStorage === "keychain") {
    return getKeychainSecret(modality);
  }
  if (!entry.encryptedApiKey) return null;
  return decryptSecret(entry.encryptedApiKey, resolveEncryptionSecret(mode));
}

export function buildDirectAdaptersFromConfig(mode: DeploymentMode = getDeploymentMode()): Partial<Record<GenerationModality, ProviderAdapter>> {
  const adapters: Partial<Record<GenerationModality, ProviderAdapter>> = {};

  if (process.env.QUILLBY_REPLICATE_API_TOKEN?.trim()) {
    const replicate = new ReplicateAdapter({ apiToken: process.env.QUILLBY_REPLICATE_API_TOKEN.trim() });
    adapters.image = replicate;
    adapters.audio = replicate;
    adapters.video = replicate;
    return adapters;
  }

  if (process.env.QUILLBY_OPENAI_API_KEY?.trim()) {
    adapters.image = new OpenAiGptImageAdapter({ apiKey: process.env.QUILLBY_OPENAI_API_KEY.trim() });
  } else if (process.env.QUILLBY_BFL_API_KEY?.trim()) {
    adapters.image = new BflFluxAdapter({ apiKey: process.env.QUILLBY_BFL_API_KEY.trim() });
  }

  if (process.env.QUILLBY_ELEVENLABS_API_KEY?.trim()) {
    adapters.audio = new ElevenLabsAdapter({
      apiKey: process.env.QUILLBY_ELEVENLABS_API_KEY.trim(),
      voiceId: process.env.QUILLBY_ELEVENLABS_DEFAULT_VOICE_ID?.trim(),
    });
  } else if (process.env.QUILLBY_MINIMAX_API_KEY?.trim()) {
    adapters.audio = new MiniMaxAdapter({
      apiKey: process.env.QUILLBY_MINIMAX_API_KEY.trim(),
      groupId: process.env.QUILLBY_MINIMAX_GROUP_ID?.trim(),
    });
  }

  if (process.env.QUILLBY_GOOGLE_AI_API_KEY?.trim()) {
    adapters.video = new VeoAdapter({ apiKey: process.env.QUILLBY_GOOGLE_AI_API_KEY.trim() });
  } else if (process.env.QUILLBY_FAL_API_KEY?.trim()) {
    adapters.video = new KlingAdapter({ apiKey: process.env.QUILLBY_FAL_API_KEY.trim() });
  }

  const stored = loadConfigFile();
  const storedReplicate = stored.image?.provider === "replicate"
    ? stored.image
    : stored.audio?.provider === "replicate"
      ? stored.audio
      : stored.video?.provider === "replicate"
        ? stored.video
        : undefined;

  if (storedReplicate) {
    const apiKey = resolveStoredApiKey(storedReplicate, "image", mode);
    if (apiKey) {
      const replicate = new ReplicateAdapter({ apiToken: apiKey });
      adapters.image = replicate;
      adapters.audio = replicate;
      adapters.video = replicate;
      return adapters;
    }
  }

  if (!adapters.image && stored.image) {
    const apiKey = resolveStoredApiKey(stored.image, "image", mode);
    if (apiKey) {
      adapters.image = stored.image.provider === "replicate"
        ? new ReplicateAdapter({ apiToken: apiKey })
        : stored.image.provider === "openai_gpt_image"
        ? new OpenAiGptImageAdapter({ apiKey })
        : new BflFluxAdapter({ apiKey });
    }
  }

  if (!adapters.audio && stored.audio) {
    const apiKey = resolveStoredApiKey(stored.audio, "audio", mode);
    if (apiKey) {
      adapters.audio = stored.audio.provider === "replicate"
        ? new ReplicateAdapter({ apiToken: apiKey })
        : stored.audio.provider === "elevenlabs"
        ? new ElevenLabsAdapter({ apiKey, voiceId: stored.audio.voiceId })
        : new MiniMaxAdapter({ apiKey, groupId: stored.audio.groupId });
    }
  }

  if (!adapters.video && stored.video) {
    const apiKey = resolveStoredApiKey(stored.video, "video", mode);
    if (apiKey) {
      adapters.video = stored.video.provider === "replicate"
        ? new ReplicateAdapter({ apiToken: apiKey })
        : stored.video.provider === "google_veo"
        ? new VeoAdapter({ apiKey })
        : new KlingAdapter({ apiKey });
    }
  }

  return adapters;
}

export function saveProviderConfig(input: SaveProviderConfigInput, mode: DeploymentMode = getDeploymentMode()): ProviderConfigSummaryEntry {
  if (mode === "cloud") {
    throw new Error("Cloud mode manages providers internally. Manual provider configuration is not available.");
  }
  const config = loadConfigFile();
  const now = new Date().toISOString();
  const useLocalKeychain = useKeychain(mode);

  let entry: StoredProviderEntry;
  if (useLocalKeychain) {
    setKeychainSecret(input.modality, input.apiKey);
    entry = {
      provider: input.provider as StoredProviderEntry["provider"],
      secretStorage: "keychain",
      secretRef: keychainService(input.modality),
      voiceId: input.voiceId,
      groupId: input.groupId,
      updatedAt: now,
    };
  } else {
    entry = {
      provider: input.provider as StoredProviderEntry["provider"],
      secretStorage: "encrypted-file",
      encryptedApiKey: encryptSecret(input.apiKey, resolveEncryptionSecret(mode)),
      voiceId: input.voiceId,
      groupId: input.groupId,
      updatedAt: now,
    };
  }

  if (entry.provider === "replicate") {
    // Replicate is the v2 single external hub: one token unlocks all modalities.
    for (const modality of ALL_MODALITIES) {
      config[modality] = {
        ...entry,
        updatedAt: now,
      };
    }
  } else {
    config[input.modality] = entry;
  }
  saveConfigFile(config);

  const auditEntry = JSON.stringify({
    timestamp: now,
    action: "save_provider_config",
    modality: input.modality,
    provider: input.provider,
  });
  fs.appendFileSync(path.join(CONFIG.DATA_DIR, "audit.log"), auditEntry + "\n");

  return {
    configured: true,
    provider: entry.provider,
    secretStorage: entry.secretStorage,
    voiceId: entry.voiceId,
    groupId: entry.groupId,
    source: "stored",
  };
}

export function clearProviderConfig(modality: GenerationModality): void {
  const config = loadConfigFile();
  const entry = config[modality];
  if (!entry) return;

  if (entry.provider === "replicate") {
    for (const m of ALL_MODALITIES) {
      const current = config[m];
      if (current?.secretStorage === "keychain") {
        deleteKeychainSecret(m);
      }
      delete config[m];
    }
    saveConfigFile(config);
    fs.appendFileSync(
      path.join(CONFIG.DATA_DIR, "audit.log"),
      JSON.stringify({ timestamp: new Date().toISOString(), action: "clear_provider_config", modality }) + "\n"
    );
    return;
  }

  if (entry?.secretStorage === "keychain") {
    deleteKeychainSecret(modality);
  }
  delete config[modality];
  saveConfigFile(config);
  fs.appendFileSync(
    path.join(CONFIG.DATA_DIR, "audit.log"),
    JSON.stringify({ timestamp: new Date().toISOString(), action: "clear_provider_config", modality }) + "\n"
  );
}

/**
 * Resolve the ElevenLabs API key from environment variables or stored config.
 * Returns null if no ElevenLabs key is configured.
 */
export function resolveElevenLabsApiKey(mode: DeploymentMode = getDeploymentMode()): string | null {
  if (process.env.QUILLBY_ELEVENLABS_API_KEY?.trim()) {
    return process.env.QUILLBY_ELEVENLABS_API_KEY.trim();
  }
  const stored = loadConfigFile();
  if (stored.audio?.provider === "elevenlabs" && stored.audio.secretStorage) {
    return resolveStoredApiKey(stored.audio, "audio", mode);
  }
  return null;
}

export function verifyProviderEnv(): string[] {
  const warnings: string[] = [];
  if (
    !process.env.QUILLBY_REPLICATE_API_TOKEN?.trim() &&
    !process.env.QUILLBY_OPENAI_API_KEY?.trim() &&
    !process.env.QUILLBY_ELEVENLABS_API_KEY?.trim()
  ) {
    warnings.push("No provider API keys configured. Generation features will fail unless configured via Settings UI.");
  }
  return warnings;
}