import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";
import type { ProviderAdapter, GenerationRequest, GenerationResult } from "../../router.js";
import type { GenerationModality } from "@quillby/core";

const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), ".quillby", "assets");
const DEFAULT_MODEL = "gpt-image-1.5";

function mapSize(aspectRatio?: string): string {
  switch (aspectRatio) {
    case "portrait": return "1024x1792";
    case "16:9": case "landscape": return "1792x1024";
    default: return "1024x1024";
  }
}

export type OpenAiGptImageConfig = {
  apiKey: string;
  model?: string;
};

export class OpenAiGptImageAdapter implements ProviderAdapter {
  readonly id: string;
  readonly supportedModalities: GenerationModality[] = ["image"];

  constructor(private readonly config: OpenAiGptImageConfig) {
    this.id = `openai/${config.model ?? DEFAULT_MODEL}`;
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const parts: string[] = [req.prompt];
    if (req.visualStyle) parts.push(`Style: ${req.visualStyle}`);
    if (req.faceProfile) parts.push(`Subject appearance: ${req.faceProfile}`);
    const prompt = parts.join(". ");
    const size = mapSize(req.aspectRatio);
    const outputDir = req.outputDir ?? DEFAULT_OUTPUT_DIR;
    const model = this.config.model ?? DEFAULT_MODEL;

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, prompt, n: 1, size }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`OpenAI Images API ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as { data: Array<{ b64_json?: string; url?: string }> };
    const first = data.data[0];
    if (!first) throw new Error("OpenAI Images API returned no data.");

    if (first.b64_json) {
      fs.mkdirSync(outputDir, { recursive: true });
      const filePath = path.join(outputDir, `${randomUUID()}.png`);
      fs.writeFileSync(filePath, Buffer.from(first.b64_json, "base64"));
      return { outputRef: filePath, mimeType: "image/png", provider: this.id };
    }

    if (first.url) {
      return { outputRef: first.url, mimeType: "image/png", provider: this.id };
    }

    throw new Error("OpenAI Images API returned no b64_json or url.");
  }
}
