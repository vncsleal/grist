import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { ProviderAdapter, GenerationRequest, GenerationResult } from "./router.js";
import type { GenerationModality } from "@quillby/core";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

const SUPPORTED: GenerationModality[] = ["image", "audio"];

/**
 * Tier 1 adapter: delegates generation to the connected MCP host client via
 * the `sampling/createMessage` protocol method.
 *
 * The host AI client (Claude Desktop, VS Code Copilot, etc.) receives the
 * sampling request and uses its own model to fulfill it — no API keys required
 * on Quillby's side.
 *
 * Note: video is NOT included here. MCP Sampling does not define a video
 * content type; video always uses Tier 2/3 cloud adapters.
 */
export class McpSamplingAdapter implements ProviderAdapter {
  readonly id = "mcp/sampling";
  readonly supportedModalities: GenerationModality[] = SUPPORTED;

  constructor(
    private readonly server: Server,
    private readonly outputDir: string
  ) {}

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const systemPrompt = buildSystemPrompt(req);
    const userMessage = buildUserMessage(req);

    const response = await this.server.createMessage({
      messages: [{ role: "user", content: userMessage }],
      systemPrompt,
      maxTokens: 1024,
    });

    const content = response?.content;
    const outputRef = await this._extractAndSave(content, req.modality, req.outputDir ?? this.outputDir);
    return {
      outputRef,
      mimeType: req.modality === "image" ? "image/png" : "audio/mpeg",
      provider: this.id,
    };
  }

  private async _extractAndSave(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: any,
    modality: GenerationModality,
    outputDir: string
  ): Promise<string> {
    if (!content) throw new Error("MCP Sampling returned empty content.");

    const items: unknown[] = Array.isArray(content) ? content : [content];

    for (const item of items) {
      if (typeof item !== "object" || item === null) continue;
      const c = item as Record<string, unknown>;

      // Image: { type: "image", data: "<base64>", mimeType: "image/..." }
      if (modality === "image" && c["type"] === "image" && typeof c["data"] === "string") {
        const ext = String(c["mimeType"] ?? "image/png").split("/").pop() ?? "png";
        const filename = `${randomUUID()}.${ext}`;
        const filePath = path.join(outputDir, filename);
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(filePath, Buffer.from(c["data"] as string, "base64"));
        return filePath;
      }

      // Audio: { type: "audio", data: "<base64>", mimeType: "audio/..." }
      if (modality === "audio" && c["type"] === "audio" && typeof c["data"] === "string") {
        const ext = String(c["mimeType"] ?? "audio/mpeg").split("/").pop() ?? "mp3";
        const filename = `${randomUUID()}.${ext}`;
        const filePath = path.join(outputDir, filename);
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(filePath, Buffer.from(c["data"] as string, "base64"));
        return filePath;
      }

      // Text fallback: sampling didn't produce a binary asset but returned a URL
      if (typeof c["text"] === "string") {
        const text = c["text"].trim();
        if (text.startsWith("http://") || text.startsWith("https://")) return text;
      }
    }

    throw new Error(
      `MCP Sampling response did not contain a ${modality} asset. ` +
      `The connected AI client may not support ${modality} generation via sampling.`
    );
  }
}

function buildSystemPrompt(req: GenerationRequest): string {
  const parts: string[] = [];
  if (req.modality === "image") {
    parts.push("You are a professional visual content creator.");
    if (req.visualStyle) parts.push(`Visual style: ${req.visualStyle}`);
    if (req.faceProfile) parts.push(`Subject appearance: ${req.faceProfile}`);
    if (req.aspectRatio) parts.push(`Aspect ratio: ${req.aspectRatio}`);
  } else if (req.modality === "audio") {
    parts.push("You are a professional voice artist and audio producer.");
    if (req.voiceProfile) parts.push(`Voice profile: ${req.voiceProfile}`);
  }
  return parts.join("\n");
}

function buildUserMessage(req: GenerationRequest): { type: "text"; text: string } {
  return { type: "text", text: req.prompt };
}
