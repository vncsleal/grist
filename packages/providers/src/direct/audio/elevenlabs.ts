import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";
import type { ProviderAdapter, GenerationRequest, GenerationResult } from "../../router.js";
import { safeFetch } from "../../ssrf.js";
import type { GenerationModality } from "@quillby/core";

const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), ".quillby", "assets");
const MODEL_ID = "eleven_v3";
// Default voice: "Rachel" — natural, calm, professional narration voice.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export type ElevenLabsConfig = {
  apiKey: string;
  /** ElevenLabs voice ID. Defaults to "Rachel" if not set. */
  voiceId?: string;
  /** Model ID. Defaults to "eleven_v3". */
  modelId?: string;
};

export class ElevenLabsAdapter implements ProviderAdapter {
  readonly id = "elevenlabs/eleven_v3";
  readonly supportedModalities: GenerationModality[] = ["audio"];

  constructor(private readonly config: ElevenLabsConfig) {}

  /**
   * Create a persistent ElevenLabs voice clone from a publicly reachable audio URL.
   * Returns the cloned voiceId which should be stored in workspace metadata for reuse.
   */
  static async createVoiceClone(
    apiKey: string,
    voiceReferenceAudioUrl: string,
    name: string
  ): Promise<string> {
    const audioRes = await safeFetch(voiceReferenceAudioUrl);
    if (!audioRes.ok) {
      throw new Error(`Failed to fetch voice reference audio: ${audioRes.status}`);
    }
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    const contentType = audioRes.headers.get("content-type") ?? "audio/mpeg";
    const ext = contentType.includes("wav") ? "wav" : contentType.includes("ogg") ? "ogg" : "mp3";

    const formData = new FormData();
    formData.append("name", name);
    formData.append(
      "files",
      new Blob([audioBuffer], { type: contentType }),
      `reference.${ext}`
    );

    const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      throw new Error(`ElevenLabs voice clone ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { voice_id?: string };
    if (!json.voice_id) {
      throw new Error("ElevenLabs voice clone: no voice_id in response");
    }
    return json.voice_id;
  }

  /**
   * Delete a previously cloned ElevenLabs voice.
   * Safe to call even if the voice no longer exists (404 is silently ignored).
   */
  static async deleteVoiceClone(apiKey: string, voiceId: string): Promise<void> {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
      { method: "DELETE", headers: { "xi-api-key": apiKey }, signal: AbortSignal.timeout(30000) }
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`ElevenLabs delete voice ${res.status}: ${await res.text()}`);
    }
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    // Prefer persistent cloned voice ID when consent is granted; fall back to config/default.
    const voiceId =
      req.elevenlabsClonedVoiceId && req.cloneConsentGranted
        ? req.elevenlabsClonedVoiceId
        : (this.config.voiceId ?? DEFAULT_VOICE_ID);
    const modelId = this.config.modelId ?? MODEL_ID;
    const outputDir = req.outputDir ?? DEFAULT_OUTPUT_DIR;

    // Prepend voice direction if a voiceProfile is set in workspace memory.
    let text = req.prompt;
    if (req.voiceProfile) {
      text = `[Voice direction: ${req.voiceProfile}]\n\n${text}`;
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.config.apiKey,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.5 },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs TTS ${response.status}: ${await response.text()}`);
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const filePath = path.join(outputDir, `${randomUUID()}.mp3`);
    fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));

    return { outputRef: filePath, mimeType: "audio/mpeg", provider: this.id };
  }
}
