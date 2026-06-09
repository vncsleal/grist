import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ToolContext, ToolResult, FullStorage } from "./index.js";
import type { GenerationModality, TypedMemory, WorkspaceMetadata } from "@quillby/core";
import type { ProviderRouter } from "@quillby/providers";
import { validateUrl, getProviderPolicyReport } from "@quillby/providers";
import { refreshProviderRouter } from "../shared.js";
import { getStoredProviderConfigSummary, saveProviderConfig, clearProviderConfig } from "../../provider-config.js";
import { logWarn } from "../../logger.js";

const JOB_CONCURRENCY_LIMITS = {
  image: safeParseInt(process.env.QUILLBY_MAX_CONCURRENT_IMAGE, 5),
  audio: safeParseInt(process.env.QUILLBY_MAX_CONCURRENT_AUDIO, 3),
  video: safeParseInt(process.env.QUILLBY_MAX_CONCURRENT_VIDEO, 2),
};

function safeParseInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === null) return fallback;
  const val = parseInt(raw, 10);
  return Number.isNaN(val) || val < 1 ? fallback : val;
}

const activeJobCounts: Record<string, number> = {};

function guessMimeType(modality: GenerationModality, outputRef: string, meta?: string): string {
  try {
    if (meta) {
      const parsed = JSON.parse(meta) as { mimeType?: string };
      if (parsed.mimeType) return parsed.mimeType;
    }
  } catch {
    logWarn("malformed meta JSON in guessMimeType");
  }
  const lower = outputRef.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return modality === "image" ? "image/png" : modality === "audio" ? "audio/mpeg" : "video/mp4";
}

const GenerateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("image"),
    prompt: z.string().min(1).max(5000),
    cardId: z.number().int().optional(),
    aspectRatio: z.enum(["square", "portrait", "landscape", "16:9", "9:16"]).optional(),
    workspaceId: z.string().optional(),
  }),
  z.object({
    action: z.literal("audio"),
    prompt: z.string().min(1).max(10000),
    cardId: z.number().int().optional(),
    cloneVoice: z.boolean().optional(),
    workspaceId: z.string().optional(),
  }),
  z.object({
    action: z.literal("video"),
    prompt: z.string().min(1).max(5000),
    cardId: z.number().int().optional(),
    aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
    cloneAvatar: z.boolean().optional(),
    drivingAudioUrl: z.string().url().optional(),
    workspaceId: z.string().optional(),
  }),
  z.object({ action: z.literal("get_job"), jobId: z.string(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("list_jobs"), modality: z.enum(["image", "audio", "video"]).optional(), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("get_providers") }),
  z.object({ action: z.literal("set_provider"), modality: z.enum(["image", "audio", "video"]), provider: z.string(), apiKey: z.string(), voiceId: z.string().optional(), groupId: z.string().optional() }),
  z.object({ action: z.literal("clear_provider"), modality: z.enum(["image", "audio", "video"]) }),
]);

export const tool = {
  name: "generate" as const,
  description: "Generate image/audio/video assets, check job status, list jobs, and manage provider configuration.",
  inputSchema: GenerateSchema,
};

export async function handleTool(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = GenerateSchema.parse(raw);
  const action = parsed.action;

  switch (action) {
    case "image":
    case "audio":
    case "video": {
      const modality = action as GenerationModality;
      refreshProviderRouter();

      const {
        prompt,
        cardId,
        aspectRatio = "square",
        cloneVoice = false,
        cloneAvatar = false,
        drivingAudioUrl,
        workspaceId: genWsId,
      } = parsed as {
        action: typeof action;
        prompt: string;
        cardId?: number;
        aspectRatio?: string;
        cloneVoice?: boolean;
        cloneAvatar?: boolean;
        drivingAudioUrl?: string;
        workspaceId?: string;
      };

      const genStorage: FullStorage = genWsId
        ? await ctx.storage.withWorkspace(genWsId)
        : ctx.storage;
      const genWs = await genStorage.getCurrentWorkspace();
      const memory = await genStorage.loadTypedMemory();

      if (modality === "audio" && cloneVoice) {
        if (!genWs.cloneConsentGranted) {
          throw new Error("Voice clone generation requires consent. Call set_clone_identity with cloneConsentGranted=true first.");
        }
        if (!genWs.voiceReferenceAudioUrl) {
          throw new Error("Voice clone generation requires voiceReferenceAudioUrl. Set it via set_clone_identity first.");
        }
      }

      if (modality === "video" && cloneAvatar) {
        if (!genWs.cloneConsentGranted) {
          throw new Error("Avatar clone generation requires consent. Call set_clone_identity with cloneConsentGranted=true first.");
        }
        if (!genWs.faceReferenceImageUrl) {
          throw new Error("Avatar clone generation requires faceReferenceImageUrl. Set it via set_clone_identity first.");
        }
        if (!drivingAudioUrl) {
          throw new Error("Avatar clone generation requires drivingAudioUrl.");
        }
        try {
          await validateUrl(drivingAudioUrl);
        } catch (err) {
          throw new Error(`drivingAudioUrl validation failed: ${err instanceof Error ? err.message : "invalid URL"}`);
        }
      }

      const modalKey = modality;
      const currentCount = activeJobCounts[modalKey] ?? 0;
      if (currentCount >= JOB_CONCURRENCY_LIMITS[modalKey]) {
        return {
          content: [{ type: "text", text: `${modality} generation at capacity (${JOB_CONCURRENCY_LIMITS[modalKey]} concurrent limit). Try again later.` }],
          isError: true,
        };
      }

      if (ctx.deploymentMode === "cloud") {
        const b = await import("../../billing.js");
        if (b.isPlanEnforcementEnabled()) {
          const plan = await ctx.storage.getPlan();
          const limits = b.getPlanLimits(plan);
          const limitKey = `${modality}CreditsPerMonth` as keyof typeof limits;
          const limit = limits[limitKey as keyof typeof limits];
          if (limit !== null && limit >= 0) {
            const monthlyCount = await genStorage.getMonthlyJobCount?.(modality) ?? 0;
            if (monthlyCount >= limit) {
              return {
                content: [{ type: "text", text: `Monthly ${modality} generation limit reached (${monthlyCount}/${limit}). Upgrade your plan for more capacity.` }],
                isError: true,
              };
            }
          }
        }
      }

      const jobId = randomUUID();
      const now = new Date().toISOString();
      const job = {
        id: jobId,
        workspaceId: genWs.id ?? "",
        modality,
        prompt,
        status: "queued" as const,
        cardId,
        createdAt: now,
        updatedAt: now,
      };
      await genStorage.saveJob(job);
      activeJobCounts[modalKey] = (activeJobCounts[modalKey] ?? 0) + 1;

      const tier = ctx.providerRouter.resolvesTier(modality);
      const tierLabel = tier === "sampling" ? "MCP Sampling" : tier === "cloud" ? "Cloud" : tier === "direct" ? "Direct" : "unavailable";
      const cap = getProviderPolicyReport(ctx.deploymentMode, ctx.providerRouter).capabilities.find((entry) => entry.modality === modality);

      if (!tier) {
        await genStorage.updateJob(jobId, {
          status: "failed",
          error: cap?.message ?? `No ${modality} provider available.`,
        });
        return {
          content: [{ type: "text", text: `No ${modality} provider available. ${cap?.message ?? ""}` }],
          structuredContent: { jobId, status: "failed", modality },
        };
      }

      void runGenerationJob(genStorage, jobId, modality, prompt, memory, genWs, ctx.providerRouter, {
        aspectRatio,
        cloneVoice,
        cloneAvatar,
        drivingAudioUrl,
      });

      return {
        content: [{ type: "text", text: `${modality} generation queued (job: ${jobId}, tier: ${tierLabel}${cloneVoice ? ", cloneVoice" : ""}${cloneAvatar ? ", cloneAvatar" : ""}). Use get_job to check status.` }],
        structuredContent: { jobId, status: "queued", modality, tier: tierLabel, workspaceId: genWs.id, cloneVoice, cloneAvatar },
      };
    }

    case "get_job": {
      const { jobId, workspaceId: gjWsId } = parsed;
      const gjStorage: FullStorage = gjWsId
        ? await ctx.storage.withWorkspace(gjWsId)
        : ctx.storage;
      const job = await gjStorage.loadJob(jobId);
      if (!job) {
        return {
          content: [{ type: "text", text: `Job "${jobId}" not found.` }],
          structuredContent: { error: "not_found", jobId },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Job "${jobId}": ${job.status}.${job.status === "done" && job.outputRef ? ` Output: ${job.outputRef}.` : ""}${job.error ? ` Error: ${job.error}.` : ""}` }],
        structuredContent: { job },
      };
    }

    case "list_jobs": {
      const { modality: ljModality, workspaceId: ljWsId } = parsed;
      const ljStorage: FullStorage = ljWsId
        ? await ctx.storage.withWorkspace(ljWsId)
        : ctx.storage;
      const jobs = await ljStorage.listJobs(ljModality);
      return {
        content: [{ type: "text", text: `${jobs.length} generation job(s).${jobs.slice(0, 5).map(j => `\n  [${j.modality}] ${j.id}: ${j.status}`).join("")}${jobs.length > 5 ? `\n  ... +${jobs.length - 5} more` : ""}` }],
        structuredContent: { jobs, count: jobs.length },
      };
    }

    case "get_providers": {
      refreshProviderRouter();
      const report = getProviderPolicyReport(ctx.deploymentMode, ctx.providerRouter);
      return {
        content: [{ type: "text", text: `Provider capabilities: ${report.capabilities ? report.capabilities.map((c: { modality: string; available: boolean; message?: string }) => `${c.modality}: ${c.available ? "available" : c.message ?? "unavailable"}`).join(", ") : "none"}. Configured providers: ${Object.keys(getStoredProviderConfigSummary()).join(", ") || "none"}.` }],
        structuredContent: { ...report, configured: getStoredProviderConfigSummary() },
      };
    }

    case "set_provider": {
      const { modality, provider, apiKey, voiceId, groupId } = parsed;
      const saved = saveProviderConfig({ modality, provider, apiKey, voiceId, groupId }, ctx.deploymentMode);
      refreshProviderRouter();
      return {
        content: [{ type: "text", text: `${modality} provider saved: ${saved.provider}.` }],
        structuredContent: { modality, saved },
      };
    }

    case "clear_provider": {
      const { modality } = parsed;
      clearProviderConfig(modality);
      refreshProviderRouter();
      return {
        content: [{ type: "text", text: `${modality} provider configuration cleared.` }],
        structuredContent: { modality, cleared: true },
      };
    }
  }
}

async function runGenerationJob(
  jobStorage: FullStorage,
  jobId: string,
  modality: GenerationModality,
  prompt: string,
  memory: TypedMemory,
  workspace: WorkspaceMetadata,
  providerRouter: ProviderRouter,
  options?: {
    aspectRatio?: string;
    cloneVoice?: boolean;
    cloneAvatar?: boolean;
    drivingAudioUrl?: string;
  }
): Promise<void> {
  await jobStorage.updateJob(jobId, { status: "running" });
  try {
    const cloneVoice = options?.cloneVoice === true;
    const cloneAvatar = options?.cloneAvatar === true;
    const req = {
      modality,
      prompt,
      visualStyle: memory.visualStyle?.join?.(". ") || undefined,
      voiceProfile: memory.voiceProfile?.join?.(". ") || undefined,
      faceProfile: memory.faceProfile?.join?.(". ") || undefined,
      faceReferenceImageUrl: cloneAvatar ? workspace.faceReferenceImageUrl : undefined,
      voiceReferenceAudioUrl: cloneVoice ? workspace.voiceReferenceAudioUrl : undefined,
      cloneConsentGranted: cloneVoice || cloneAvatar ? workspace.cloneConsentGranted : undefined,
      elevenlabsClonedVoiceId: cloneVoice ? workspace.elevenlabsClonedVoiceId : undefined,
      drivingAudioUrl: cloneAvatar ? options?.drivingAudioUrl : undefined,
      aspectRatio: options?.aspectRatio,
    };
    const result = await providerRouter.generate(req);
    await jobStorage.updateJob(jobId, {
      status: "done",
      outputRef: result.outputRef,
      provider: result.provider,
      meta: JSON.stringify({ mimeType: result.mimeType ?? guessMimeType(modality, result.outputRef), ...(result.meta ?? {}) }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await jobStorage.updateJob(jobId, { status: "failed", error: msg });
  } finally {
    const m = modality;
    if (activeJobCounts[m] !== undefined) activeJobCounts[m] = Math.max(0, activeJobCounts[m] - 1);
  }
}
