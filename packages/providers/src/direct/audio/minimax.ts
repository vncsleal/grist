import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";
import type { ProviderAdapter, GenerationRequest, GenerationResult } from "../../router.js";
import type { GenerationModality } from "@quillby/core";

const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), ".quillby", "assets");
const MODEL = "speech-2.8-hd";

export type MiniMaxConfig = {
  apiKey: string;
  /** MiniMax group ID, required for some account tiers. */
  groupId?: string;
  /** Voice ID. Defaults to "Wise_Woman" — calm, authoritative. */
  voiceId?: string;
};

type MiniMaxT2AResponse = {
  /** MiniMax v2 returns hex-encoded audio inline. */
  data?: { audio?: string };
  /** Some response shapes return base64 directly. */
  audio_file?: string;
  base_resp?: { status_code: number; status_msg: string };
};

export class MiniMaxAdapter implements ProviderAdapter {
  readonly id = `minimax/${MODEL}`;
  readonly supportedModalities: GenerationModality[] = ["audio"];

  constructor(private readonly config: MiniMaxConfig) {}

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const outputDir = req.outputDir ?? DEFAULT_OUTPUT_DIR;
    const voiceId = this.config.voiceId ?? "Wise_Woman";
    let text = req.prompt;
    if (req.voiceProfile) {
      text = `[Voice direction: ${req.voiceProfile}]\n\n${text}`;
    }

    const url = this.config.groupId
      ? `https://api.minimax.io/v1/t2a_v2?GroupId=${encodeURIComponent(this.config.groupId)}`
      : "https://api.minimax.io/v1/t2a_v2";

    const submit = async (withReference: boolean): Promise<Response> => {
      const payload: Record<string, unknown> = {
        model: MODEL,
        text,
        voice_setting: { voice_id: voiceId, speed: 1.0, vol: 1.0, pitch: 0 },
        output_format: "hex",
      };
      if (withReference && req.voiceReferenceAudioUrl && req.cloneConsentGranted) {
        // Best-effort native voice cloning hint where supported by account/model configuration.
        payload.voice_clone = { audio_url: req.voiceReferenceAudioUrl };
      }
      return fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });
    };

    let response = await submit(true);
    if (!response.ok && req.voiceReferenceAudioUrl) {
      response = await submit(false);
    }
    if (!response.ok) {
      throw new Error(`MiniMax TTS ${response.status}: ${await response.text()}`);
    }

    // HACK: External HTTP API JSON response typing
    const json = await response.json() as MiniMaxT2AResponse;

    if (json.base_resp && json.base_resp.status_code !== 0) {
      throw new Error(`MiniMax TTS error: ${json.base_resp.status_msg}`);
    }

    // MiniMax v2: hex-encoded audio in data.audio; some shapes return base64 in audio_file.
    const hexAudio = json.data?.audio ?? json.audio_file;
    if (!hexAudio) throw new Error("MiniMax TTS returned no audio data.");

    fs.mkdirSync(outputDir, { recursive: true });
    const filePath = path.join(outputDir, `${randomUUID()}.mp3`);
    fs.writeFileSync(filePath, Buffer.from(hexAudio, "hex"));

    return { outputRef: filePath, mimeType: "audio/mpeg", provider: this.id };
  }
}
