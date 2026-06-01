import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { toNodeHandler } from "better-auth/node";
import { slog, logInfo, logWarn, logError, logFatal } from "../logger.js";
import { auth } from "../auth.js";
import { AuthApi, serializeApiKey, listApiKeysFromDb, deleteApiKeyFromDb, type ListedApiKey } from "@quillby/auth";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  type Tool,
  type Resource,
  type Prompt,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8")) as { version: string };
const DRIZZLE_MIGRATIONS_DIR = path.resolve(__dirname, "../../drizzle");

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) &&
  (process.argv.includes("--version") || process.argv.includes("-v"))
) {
  console.log(PKG.version);
  process.exit(0);
}

// ── Global error handlers ──────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  slog("fatal", "uncaught_exception", { error: err.message, stack: err.stack ?? undefined });
  // Give 5s for stderr/log drain, then force exit
  setTimeout(() => process.exit(1), 5_000).unref();
});

process.on("unhandledRejection", (reason) => {
  slog("error", "unhandled_rejection", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack ?? undefined : undefined,
  });
});
// ───────────────────────────────────────────────────────────────────────

import { UserContextSchema, CardInputSchema } from "../types.js";
import {
  contextToPromptText,
  ONBOARDING_PROMPT,
} from "../agents/onboard.js";
import { fetchArticles, preScoreArticles } from "../agents/harvest.js";
import { PLATFORM_GUIDES } from "../agents/compose.js";
import { enrichArticle } from "../extractors/content.js";
import { getHostedUserStorage, storage, type WorkspaceStorage, type JobStorage } from "../storage.js";
import { client, db, apikey as apikeyTable } from "../db.js";
import {
  applyStripeWebhookEvent,
  getBillingActionUrl,
  getBillingPortalUrl,
  getPlanLimits,
  isCloudMode,
  isPlanEnforcementEnabled,
} from "../billing.js";
import { CONFIG, getDeploymentMode } from "../config.js";
import {
  ProviderRouter,
  McpSamplingAdapter,
  initCloudAdapters,
  getProviderPolicyReport,
  validateUrl,
} from "@quillby/providers";
import type { SamplingHost } from "@quillby/providers";
import type { GenerationModality } from "@quillby/core";
import {
  GenerateImageArgsSchema,
  GenerateAudioArgsSchema,
  GenerateVideoArgsSchema,
  GetJobArgsSchema,
  ListJobsArgsSchema,
  GetProvidersArgsSchema, // eslint-disable-line @typescript-eslint/no-unused-vars
  SetProviderArgsSchema,
  ClearProviderArgsSchema,
  DeleteVoiceCloneArgsSchema, // eslint-disable-line @typescript-eslint/no-unused-vars
  PlanCreateArgsSchema, // eslint-disable-line @typescript-eslint/no-unused-vars
  PlanListArgsSchema, // eslint-disable-line @typescript-eslint/no-unused-vars
  PlanTodayArgsSchema, // eslint-disable-line @typescript-eslint/no-unused-vars
  TaskCreateArgsSchema, // eslint-disable-line @typescript-eslint/no-unused-vars
  TaskMoveArgsSchema, // eslint-disable-line @typescript-eslint/no-unused-vars
  TaskDeleteArgsSchema, // eslint-disable-line @typescript-eslint/no-unused-vars
  CalendarArgsSchema, // eslint-disable-line @typescript-eslint/no-unused-vars
  GetPlanArgsSchema, // eslint-disable-line @typescript-eslint/no-unused-vars
  GetPricingArgsSchema, // eslint-disable-line @typescript-eslint/no-unused-vars
  BillingActionArgsSchema,
  ConnectBodySchema,
  SelectWorkspaceBodySchema,
  CurateCardBodySchema,
  SaveProfileBodySchema,
  MemoryDeleteBodySchema,
  FeedUrlBodySchema,
  CreateApiKeyBodySchema,
  DeleteApiKeyBodySchema,
  SaveProviderConfigBodySchema,
  ClearProviderConfigBodySchema,
  AssetFileQuerySchema,
  CardsQuerySchema,
  JobsQuerySchema,
  AssetsQuerySchema,
} from "./schemas.js";
import {
  checkRateLimit,
  validateMethod,
  validateContentType,
  applySecurityHeaders,
  sendJsonError,
  sendJsonSuccess,
  validateBody,
  validateQuery,
} from "./middleware.js";
import {
  handlePlanCreate,
  handlePlanList,
  handlePlanToday,
  handleTaskCreate,
  handleTaskMove,
  handleTaskDelete,
  handleCalendar,
} from "./planning.js";
import {
  handleSessionStart,
  handleSessionStatus,
  handleSessionClose,
} from "./sessions.js";
import {
  toolDefinitions as profileToolDefinitions,
  handleProfileTool,
  PROFILE_TOOL_NAMES,
} from "./tools/profile.js";
import {
  toolDefinitions as feedToolDefinitions,
  handleFeedTool,
  FEED_TOOL_NAMES,
} from "./tools/feeds.js";
import {
  AGENT_TOOL_NAMES,
  handleAgentTool,
} from "./agents/index.js";
import {
  campaignToolDefinitions,
  handleCampaignTool,
  CAMPAIGN_TOOL_NAMES,
} from "./tools/campaigns.js";
import {
  contentToolDefinitions,
  CONTENT_TOOL_NAMES,
} from "./tools/content.js";
import type { PlanStorage, SessionStore } from "@quillby/workspace";
import {
  buildDirectAdaptersFromConfig,
  clearProviderConfig,
  getStoredProviderConfigSummary,
  saveProviderConfig,
  verifyProviderEnv,
} from "../provider-config.js";

const MEMORY_TYPES = {
  voice_examples: "voiceExamples",
  style_rules: "styleRules",
  audience_insights: "audienceInsights",
  do_not_say: "doNotSay",
  successful_posts: "successfulPosts",
  campaign_context: "campaignContext",
  source_preferences: "sourcePreferences",
  // v2: one-time setup for generation
  visual_style: "visualStyle",
  voice_profile: "voiceProfile",
  face_profile: "faceProfile",
} as const;

type MemoryTypeInput = keyof typeof MEMORY_TYPES;

const activeJobCounts: Record<string, number> = {};
function safeParseInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === null) return fallback;
  const val = parseInt(raw, 10);
  return Number.isNaN(val) || val < 1 ? fallback : val;
}

const JOB_CONCURRENCY_LIMITS = {
  image: safeParseInt(process.env.QUILLBY_MAX_CONCURRENT_IMAGE, 5),
  audio: safeParseInt(process.env.QUILLBY_MAX_CONCURRENT_AUDIO, 3),
  video: safeParseInt(process.env.QUILLBY_MAX_CONCURRENT_VIDEO, 2),
};

/** Singleton provider router — tier1 is wired after connect in stdio mode; tier2 from cloud env vars. */
const providerRouter = new ProviderRouter();
const deploymentMode = getDeploymentMode();
refreshProviderRouter();

for (const warning of verifyProviderEnv()) {
    logWarn("env", { warning });
}

const SERVER_INFO = { name: "quillby-mcp", version: PKG.version } as const;

const authApi = new AuthApi(auth);

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    logFatal(`Missing required env: ${name}`);
    process.exit(1);
  }
  return value;
}

function validateEnv(): void {
  const mode = getDeploymentMode();

  if (mode === "self-hosted" || mode === "cloud") {
    requireEnv("BETTER_AUTH_SECRET");

    const dbUrl = process.env.QUILLBY_AUTH_DB_URL?.trim() ?? "file:./quillby-auth.db";
    if (!dbUrl.startsWith("file:") && !dbUrl.startsWith("libsql://")) {
      logFatal(`QUILLBY_AUTH_DB_URL must start with 'file:' or 'libsql://' — got: ${dbUrl}`);
      process.exit(1);
    }

    if (process.env.BETTER_AUTH_URL) {
      try {
        new URL(process.env.BETTER_AUTH_URL);
      } catch {
        logFatal(`BETTER_AUTH_URL is not a valid URL: ${process.env.BETTER_AUTH_URL}`);
        process.exit(1);
      }
    } else {
      logWarn("BETTER_AUTH_URL not set — OAuth callback URL resolution may fail");
    }

    if (mode === "cloud") {
      if (!process.env.QUILLBY_STRIPE_WEBHOOK_SECRET?.trim()) {
        logWarn("QUILLBY_STRIPE_WEBHOOK_SECRET not set — Stripe webhooks will fail");
      }
      if (!process.env.QUILLBY_STRIPE_PRO_PRICE_ID?.trim()) {
        logWarn("QUILLBY_STRIPE_PRO_PRICE_ID not set — Pro plan upgrades will fail");
      }
    }

    if (mode === "self-hosted") {
      if (!process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY?.trim()) {
        logWarn("QUILLBY_PROVIDER_ENCRYPTION_KEY not set — provider config via Settings UI will fail");
      }
    }
  }

  if (process.env.QUILLBY_SMTP_HOST) {
    if (!process.env.QUILLBY_SMTP_PORT) {
      logWarn("QUILLBY_SMTP_HOST is set but QUILLBY_SMTP_PORT is missing — defaulting to 587");
    }
    if (process.env.QUILLBY_SMTP_USER && !process.env.QUILLBY_SMTP_PASS) {
      logWarn("QUILLBY_SMTP_USER is set but QUILLBY_SMTP_PASS is missing — SMTP auth will fail");
    }
  }
}

async function validateDbConnection(): Promise<void> {
  try {
    await client.execute("SELECT 1");
  } catch (err) {
    logWarn("startup_db_unreachable", { error: err instanceof Error ? err.message : String(err) });
  }
}

function createMcpServer(): McpServer {
  return new McpServer(
    SERVER_INFO,
    { capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} } }
  );
}

function refreshProviderRouter(): void {
  if (isCloudMode()) {
    providerRouter.setTier2(initCloudAdapters());
    providerRouter.setTier3({});
  } else {
    providerRouter.setTier3(buildDirectAdaptersFromConfig(deploymentMode));
  }
}

function providerUnavailableMessage(modality: GenerationModality): string {
  refreshProviderRouter();
  const report = getProviderPolicyReport(deploymentMode, providerRouter);
  const capability = report.capabilities.find((entry) => entry.modality === modality);
  if (!capability) return `No provider configured for ${modality}.`;
  return capability.message;
}

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

async function recoverOrphanedJobs(storage: import("@quillby/workspace").JobStorage): Promise<number> {
  const jobs = await storage.listJobs();
  const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes ago in ms
  let recovered = 0;
  for (const job of jobs) {
    const updated = new Date(job.updatedAt).getTime();
    if ((job.status === "running" || job.status === "queued") && updated < cutoff) {
      await storage.updateJob(job.id, {
        status: "failed",
        error: "Job runner recovered: orphaned job was abandoned.",
      });
      recovered++;
    }
  }
  return recovered;
}

/**
 * Ask the host model to run inference via MCP Sampling.
 * Returns null if the host does not support Sampling — callers degrade gracefully.
 */
async function sample(server: McpServer, prompt: string, maxTokens = 4096): Promise<string | null> {
  const caps = server.server.getClientCapabilities();
  if (!caps?.sampling) return null;
  try {
    const result = await server.server.createMessage({
      messages: [{ role: "user", content: { type: "text", text: prompt } }],
      maxTokens,
    });
    if (result.content.type === "text") return result.content.text;
    return null;
  } catch (e) {
    logWarn("MCP Sampling createMessage failed", { error: String(e) });
    return null;
  }
}

const TOOLS: Tool[] = [
  // ── Server Info ────────────────────────────────────────────────────────────
  {
    name: "quillby_server_info",
    description:
      "Returns Quillby MCP server metadata: name, version, deployment mode, and uptime. Useful for client auto-detection and debugging.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: { type: "object", properties: {} },
  },

  // ── Agent Delegation ───────────────────────────────────────────────────────
  {
    name: "agent_delegate",
    description:
      "Delegate a task to a sub-agent (@researcher, @writer, @strategist, @analyst). The agent processes the task using its scoped tool access and returns results. Requires: agent (role or label), task (description string).",
    annotations: { idempotentHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Agent role or label: @researcher, @writer, @strategist, @analyst" },
        task: { type: "string", description: "Description of the task to delegate" },
        workspaceId: { type: "string", description: "Optional workspace override" },
        context: { type: "string", description: "Optional additional context for the agent prompt" },
        maxTokens: { type: "number", description: "Optional max tokens for Sampling call" },
      },
      required: ["agent", "task"],
    },
  },
  {
    name: "agent_handoff",
    description:
      "Transfer context and state between sub-agents. Records the handoff chain for traceability. Useful for multi-step workflows (e.g., @researcher → @writer).",
    annotations: { idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Source agent role" },
        to: { type: "string", description: "Target agent role" },
        reason: { type: "string", description: "Why the handoff is needed" },
        workspaceId: { type: "string", description: "Optional workspace override" },
        context: { type: "object", description: "Optional context snapshot to transfer" },
      },
      required: ["from", "to", "reason"],
    },
  },
  {
    name: "agent_status",
    description:
      "Check the current agent system state: active locks, available agents, stale lock cleanup.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: { type: "object", properties: { workspaceId: { type: "string", description: "Optional workspace override" } } },
  },

  ...profileToolDefinitions,
  ...feedToolDefinitions,
  ...campaignToolDefinitions,
  ...contentToolDefinitions,



  // ── v2: Multimodal generation ────────────────────────────────────────────
  {
    name: "generate_image",
    description:
      "Generate an image asset for a card or post. Reads visual_style and optional face_profile from workspace memory automatically. Resolution order depends on deployment mode: local prefers MCP Sampling and can fall back to user-configured providers; self-hosted uses admin-configured providers; cloud uses fully managed providers. Returns a job ID immediately; image is available once the job reaches 'done' status.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Image description. Be specific: subject, mood, colours, composition." },
        cardId: { type: "number", description: "Associate image with a specific card (optional)." },
        aspectRatio: { type: "string", description: "square | portrait | landscape | 16:9 | 9:16. Defaults to square." },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "generate_audio",
    description:
      "Generate an audio clip (podcast intro, voice-over, read-aloud post) in the user's voice profile. Reads voice_profile from workspace memory automatically. If voice clone reference is configured, clone consent must be granted before generation. Local mode requires a connected provider or host support; self-hosted uses admin-configured providers; cloud uses managed providers. Returns a job ID; audio is available once status is 'done'.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Script or text to narrate." },
        cardId: { type: "number", description: "Associate audio with a specific card (optional)." },
        cloneVoice: { type: "boolean", description: "If true, use the workspace voice reference / cloned voice path. Requires clone consent and voice reference setup." },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "generate_video",
    description:
      "Generate a short-form video (Reels/Shorts/TikTok). Always async — returns a job ID immediately; video takes 30s–5min. Poll with get_job. Video uses managed providers in cloud or configured direct providers in local/self-hosted deployments. Visual style and optional face profile from memory are applied automatically; if a face clone reference is configured, clone consent must be granted.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Scene description + narrative direction for the video." },
        cardId: { type: "number", description: "Associate video with a specific card (optional)." },
        aspectRatio: { type: "string", description: "9:16 (Reels/TikTok) | 16:9 (YouTube) | 1:1 (square). Defaults to 9:16." },
        cloneAvatar: { type: "boolean", description: "If true, generate a talking-head clone from face reference + driving audio. Requires clone consent and face reference setup." },
        drivingAudioUrl: { type: "string", description: "Public audio URL used to drive talking-head motion when cloneAvatar=true." },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
      required: ["prompt"],
    },
  },

  // ── v2: Job management ───────────────────────────────────────────────────
  {
    name: "get_job",
    description: "Check the status of a generation job (image, audio, or video). Returns status: queued | running | done | failed, and outputRef once done.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string", description: "Job ID returned by a generate tool." },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
      required: ["jobId"],
    },
  },
  {
    name: "list_jobs",
    description: "List generation jobs for the current workspace, newest first. Filter by modality to see only images, audio, or videos.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        modality: { type: "string", enum: ["image", "audio", "video"], description: "Filter to one modality. Omit to list all." },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
    },
  },
  {
    name: "get_providers",
    description: "Inspect multimodal setup for the current deployment. Returns which setup model applies per modality and whether image, audio, and video are currently available.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "set_provider",
    description: "Configure a direct provider for local or self-hosted deployments. Local stores secrets in the OS keychain when available; self-hosted stores them encrypted on the server. Cloud mode does not allow manual provider setup.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        modality: { type: "string", enum: ["image", "audio", "video"] },
        provider: { type: "string", description: "replicate (all modalities) | image: openai_gpt_image|bfl_flux | audio: elevenlabs|minimax | video: google_veo|fal_kling" },
        apiKey: { type: "string", description: "Provider API key or token." },
        voiceId: { type: "string", description: "Optional ElevenLabs voice ID." },
        groupId: { type: "string", description: "Optional MiniMax group ID." },
      },
      required: ["modality", "provider", "apiKey"],
    },
  },
  {
    name: "clear_provider",
    description: "Remove a saved direct provider configuration for one modality in local or self-hosted deployments.",
    annotations: { destructiveHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        modality: { type: "string", enum: ["image", "audio", "video"] },
      },
      required: ["modality"],
    },
  },

  // ── Content Planning ───────────────────────────────────────────────────────
  {
    name: "plan_create",
    description: "Create a content plan with optional date range. Returns the created plan with auto-generated ID.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Plan name" },
        description: { type: "string", description: "Optional description" },
        dateStart: { type: "string", description: "ISO date (YYYY-MM-DD) for plan start" },
        dateEnd: { type: "string", description: "ISO date (YYYY-MM-DD) for plan end" },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
      required: ["name"],
    },
  },
  {
    name: "plan_list",
    description: "List content plans with optional status filter.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "completed", "archived"], description: "Filter by status" },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
    },
  },
  {
    name: "plan_today",
    description: "View the today queue: tasks that are todo/doing with due dates up to today.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
    },
  },
  {
    name: "task_create",
    description: "Add a new content task to a plan. Task starts in 'todo' status.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        planId: { type: "string", description: "Plan ID to add the task to" },
        title: { type: "string", description: "Task title" },
        type: { type: "string", enum: ["compose", "curate", "review", "research", "publish", "design", "other"], description: "Task type" },
        priority: { type: "string", enum: ["p1", "p2", "p3"], description: "Priority" },
        actor: { type: "string", description: "Who should do this task" },
        platform: { type: "string", description: "Target platform" },
        dueDate: { type: "string", description: "ISO date (YYYY-MM-DD)" },
        description: { type: "string", description: "Optional description" },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
      required: ["planId", "title"],
    },
  },
  {
    name: "task_move",
    description: "Transition a task to a new status: todo → doing → review → done. Can also cancel.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID" },
        status: { type: "string", enum: ["todo", "doing", "review", "done", "cancelled"], description: "Target status" },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
      required: ["taskId", "status"],
    },
  },
  {
    name: "task_delete",
    description: "Delete a task from its plan.",
    annotations: { destructiveHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to delete" },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
      required: ["taskId"],
    },
  },
  {
    name: "calendar",
    description: "View the content calendar for a date range. Returns tasks grouped by date.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        dateStart: { type: "string", description: "ISO date (YYYY-MM-DD) for range start" },
        dateEnd: { type: "string", description: "ISO date (YYYY-MM-DD) for range end" },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
      required: ["dateStart", "dateEnd"],
    },
  },

  // ── Billing & Plan Management (cloud mode only) ────────────────────────────
  {
    name: "get_plan",
    description:
      "Check your current subscription plan and usage limits. Only available in cloud mode. Returns plan name, enforcement status, and per-modality credit limits.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_pricing",
    description:
      "View available Quillby subscription plans and pricing. Only available in cloud mode. Returns plan tiers with features, monthly credits, and limits.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "billing_action",
    description:
      "Redirect to Stripe billing flow: upgrade to Pro, downgrade to Free, or manage your subscription via the customer portal. Only available in cloud mode. Returns a redirect URL.",
    annotations: { readOnlyHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["upgrade", "downgrade", "manage"],
          description: "upgrade = subscribe to Pro, downgrade = revert to Free, manage = open customer billing portal",
        },
      },
      required: ["action"],
    },
  },

  // ── Session Lifecycle ──────────────────────────────────────────────────────
  {
    name: "session_start",
    description: "Start a new content session with a declared scope and optional auto-scoping template. Returns the created session with a unique ID.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "What this session aims to accomplish" },
        type: { type: "string", enum: ["campaign", "plan", "task", "freeform"], description: "Scope type" },
        constraints: { type: "array", items: { type: "string" }, description: "Scope boundaries" },
        campaignId: { type: "string" },
        planId: { type: "string" },
        taskId: { type: "string" },
        tokenBudget: { type: "number", description: "Optional token budget for degradation tracking" },
        template: { type: "string", enum: ["weekly_linkedin", "daily_brief", "campaign_review"], description: "Auto-scoping template" },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
      required: ["goal"],
    },
  },
  {
    name: "session_status",
    description: "Check the current session state with degradation warnings (stale activity, token budget). Returns the most recent active session if no sessionId is provided.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID (defaults to most recent active session)" },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
    },
  },
  {
    name: "session_close",
    description: "Close the active session with an optional summary. Triggers degradation checks and context finalization.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Session summary / outcomes" },
        workspaceId: { type: "string", description: "Optional workspace override." },
      },
    },
  },
];

const RESOURCES: Resource[] = [
  {
    uri: "quillby://workspace/current",
    name: "Active Workspace",
    description: "Current Quillby workspace metadata.",
    mimeType: "application/json",
  },
  {
    uri: "quillby://context",
    name: "User Content Profile",
    description: "The user content creator profile: role, industry, topics, voice, audience, goals, platforms.",
    mimeType: "application/json",
  },
  {
    uri: "quillby://memory",
    name: "User Memory",
    description: "Typed memory for the active workspace.",
    mimeType: "application/json",
  },
  {
    uri: "quillby://harvest/latest",
    name: "Latest Harvest Cards",
    description: "Structure cards from the most recent fetch+analysis session.",
    mimeType: "application/json",
  },
  {
    uri: "quillby://feeds",
    name: "RSS Feed Sources",
    description: "All configured RSS feed URLs.",
    mimeType: "text/plain",
  },
  {
    uri: "quillby://jobs",
    name: "Generation Jobs",
    description: "All generation jobs (image / audio / video) for the active workspace, newest first.",
    mimeType: "application/json",
  },
  {
    uri: "quillby://assets/latest",
    name: "Latest Assets",
    description: "The 20 most recently completed generation assets (outputRef + metadata).",
    mimeType: "application/json",
  },
  {
    uri: "quillby://billing/plan",
    name: "Billing Plan",
    description: "Current subscription plan, credit enforcement status, and per-modality limits. Only available in cloud mode.",
    mimeType: "application/json",
  },
];

const PROMPTS: Prompt[] = [
  {
    name: "onboarding",
    description: "Guide the user through initial Quillby setup to collect their content creator profile.",
  },
  {
    name: "session_start",
    description: "Open Quillby the Claude-native way: onboarding if needed, otherwise create or update the Briefing artifact.",
  },
  {
    name: "briefing",
    description: "How Claude should create and update the Quillby Briefing artifact.",
  },
  {
    name: "story",
    description: "How Claude should open and update a Quillby Story artifact from a ranked item.",
  },
  {
    name: "voice_system",
    description: "How Claude should open and update the Quillby Voice System artifact from workspace memory.",
  },
  {
    name: "projects_playbook",
    description: "How to align Quillby workspaces, Claude Projects, and native Artifacts.",
  },
];

async function handleToolCall(
  server: McpServer,
  storage: WorkspaceStorage,
  name: string,
  args: Record<string, unknown> = {}
) {
    const log = (message: string) => {
    server.sendLoggingMessage({ level: "info", data: message }).catch(() => logWarn("MCP logging message delivery failed"));
  };

  try {
    const resolveStorage = async (): Promise<WorkspaceStorage & JobStorage> => {
      const workspaceId = typeof args.workspaceId === "string" ? args.workspaceId : undefined;
      if (!workspaceId) return storage as WorkspaceStorage & JobStorage;
      return storage.withWorkspace(workspaceId) as Promise<WorkspaceStorage & JobStorage>;
    };

    if (PROFILE_TOOL_NAMES.has(name)) {
      return handleProfileTool(name, args, { server, storage, deploymentMode, providerRouter, sample: (prompt, maxTokens) => sample(server, prompt, maxTokens) });
    }

    if (FEED_TOOL_NAMES.has(name)) {
      return handleFeedTool(name, args, { server, storage, deploymentMode, providerRouter, sample: (prompt, maxTokens) => sample(server, prompt, maxTokens) });
    }

    if (AGENT_TOOL_NAMES.has(name)) {
      return handleAgentTool(name, args, { server, storage, deploymentMode, providerRouter, sample: (prompt, maxTokens) => sample(server, prompt, maxTokens) });
    }

    if (CAMPAIGN_TOOL_NAMES.has(name)) {
      return handleCampaignTool(name, args, { server, storage, deploymentMode, providerRouter, sample: (prompt, maxTokens) => sample(server, prompt, maxTokens) });
    }

    if (CONTENT_TOOL_NAMES.has(name)) {
      // TODO: extract handler to tools/content.ts
    }

    switch (name) {
      case "quillby_server_info": {
        return {
          content: [{ type: "text" as const, text: `Quillby MCP Server ${PKG.version} — mode: ${deploymentMode}, uptime: ${Math.floor(process.uptime())}s` }],
          structuredContent: {
            name: "quillby-mcp",
            version: PKG.version,
            deploymentMode,
            uptime: Math.floor(process.uptime()),
            node: process.version,
            platform: process.platform,
          },
        };
      }

      case "onboard": {
        const caps = server.server.getClientCapabilities();
        if (!caps?.elicitation?.form) {
          // Client doesn't support form elicitation — return the static onboarding prompt
          return {
            content: [{ type: "text" as const, text: ONBOARDING_PROMPT }],
            structuredContent: { elicitationAvailable: false, message: ONBOARDING_PROMPT },
          };
        }

        // Step 1 — Identity
        const s1 = await server.server.elicitInput({
          message: "Let's set up your Quillby profile. Step 1 of 3: who are you?",
          requestedSchema: {
            type: "object" as const,
            properties: {
              name: { type: "string" as const, title: "Your name", description: "Optional — used to personalize prompts" },
              role: { type: "string" as const, title: "Your role", description: "e.g. founder, marketer, software engineer, researcher" },
              industry: { type: "string" as const, title: "Industry or niche", description: "e.g. SaaS, healthcare, fintech, creator economy" },
            },
            required: ["role", "industry"],
          },
        });
        if (s1.action !== "accept" || !s1.content) {
          return {
            content: [{ type: "text" as const, text: "Onboarding cancelled." }],
            structuredContent: { cancelled: true, message: "Onboarding cancelled." },
          };
        }

        // Step 2 — Topics & audience
        const s2 = await server.server.elicitInput({
          message: "Step 2 of 3: what do you write about, and who reads it?",
          requestedSchema: {
            type: "object" as const,
            properties: {
              topics: { type: "string" as const, title: "Topics to cover", description: "Comma-separated: e.g. AI, developer tools, startup fundraising" },
              audienceDescription: { type: "string" as const, title: "Your audience", description: "e.g. senior engineers at B2B SaaS companies" },
              contentGoals: { type: "string" as const, title: "Content goals", description: "Comma-separated: e.g. build authority, grow newsletter, drive inbound leads" },
            },
            required: ["topics", "audienceDescription", "contentGoals"],
          },
        });
        if (s2.action !== "accept" || !s2.content) {
          return {
            content: [{ type: "text" as const, text: "Onboarding cancelled." }],
            structuredContent: { cancelled: true, message: "Onboarding cancelled." },
          };
        }

        // Step 3 — Voice & platforms
        const s3 = await server.server.elicitInput({
          message: "Step 3 of 3: how do you write, and where do you publish?",
          requestedSchema: {
            type: "object" as const,
            properties: {
              voice: { type: "string" as const, title: "Writing voice", description: "e.g. direct and analytical, no corporate speak, sardonic, data-heavy" },
              platforms: {
                type: "array" as const,
                title: "Publishing platforms",
                description: "Select all platforms you use",
                items: { type: "string" as const, enum: ["linkedin", "x", "blog", "newsletter", "medium", "instagram", "threads"] },
              },
              excludeTopics: { type: "string" as const, title: "Topics to avoid (optional)", description: "Comma-separated topics Quillby should filter out" },
            },
            required: ["voice", "platforms"],
          },
        });
        if (s3.action !== "accept" || !s3.content) {
          return {
            content: [{ type: "text" as const, text: "Onboarding cancelled." }],
            structuredContent: { cancelled: true, message: "Onboarding cancelled." },
          };
        }

        const splitCSV = (v: unknown): string[] =>
          typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const toStrArr = (v: unknown): string[] =>
          Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : splitCSV(v);

        const onboardCtx = UserContextSchema.parse({
          name: s1.content.name || undefined,
          role: s1.content.role,
          industry: s1.content.industry,
          topics: splitCSV(s2.content.topics),
          audienceDescription: s2.content.audienceDescription,
          contentGoals: splitCSV(s2.content.contentGoals),
          voice: s3.content.voice,
          platforms: toStrArr(s3.content.platforms),
          excludeTopics: s3.content.excludeTopics ? splitCSV(s3.content.excludeTopics) : [],
        });
        await storage.saveContext(onboardCtx);

        const onboardWs = await storage.getCurrentWorkspace();
        const summary = `Workspace: ${onboardWs.name}\n\nRole: ${onboardCtx.role} in ${onboardCtx.industry}\nTopics: ${onboardCtx.topics.join(", ")}\nPlatforms: ${onboardCtx.platforms.join(", ")}\nVoice: ${onboardCtx.voice}\n\nNext: call discover_feeds to set up your RSS sources.`;
        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: { saved: true, profile: onboardCtx as Record<string, unknown> },
        };
      }

      case "open_briefing": {
        const activeStorage = await resolveStorage();
        const [workspace, hasBriefing] = await Promise.all([
          activeStorage.getCurrentWorkspace(),
          activeStorage.latestHarvestExists(),
        ]);
        if (!hasBriefing) {
          return {
            content: [{ type: "text" as const, text: `No Briefing saved yet for workspace "${workspace.name}". Run daily_brief to generate one.` }],
            structuredContent: { error: "no_briefing", workspace: workspace.name, workspaceId: workspace.id },
          };
        }
        const [bundle, ctx] = await Promise.all([
          activeStorage.loadLatestHarvest(),
          activeStorage.loadContext(),
        ]);
        const curation = bundle.curationState ?? {};
        const sorted = [...bundle.cards].sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

        const mapCard = (c: typeof sorted[0]) => ({
          id: c.id,
          score: c.relevanceScore,
          title: c.title,
          source: c.source,
          thesis: c.thesis,
          topAngle: c.angleOptions?.[0] ?? null,
          topHook: c.hookOptions?.[0] ?? null,
          trendTags: c.trendTags,
          curationStatus: curation[String(c.id)] ?? null,
        });

        const shortlisted = sorted.filter((c) => curation[String(c.id)] === "shortlisted").map(mapCard);
        const skipped = sorted.filter((c) => curation[String(c.id)] === "skipped").map(mapCard);
        const uncurated = sorted.filter((c) => !curation[String(c.id)]).map(mapCard);

        const briefing = {
          workspace: workspace.name,
          workspaceId: workspace.id,
          generatedAt: bundle.generatedAt,
          totalCards: bundle.cards.length,
          profile: ctx ? { role: ctx.role, industry: ctx.industry, topics: ctx.topics } : null,
          curationSummary: {
            shortlisted: shortlisted.length,
            skipped: skipped.length,
            uncurated: uncurated.length,
          },
          shortlisted,
          skipped,
          uncurated,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(briefing, null, 2) }],
          structuredContent: briefing as Record<string, unknown>,
        };
      }

      case "save_cards": {
        const activeStorage = await resolveStorage();
        const { cards: rawCards } = args as { cards: unknown[] };
        const cards = rawCards.map((c) => CardInputSchema.parse(c));
        if (cards.length === 0) {
          return { content: [{ type: "text" as const, text: "No cards provided." }], structuredContent: { saved: 0 } };
        }
        const outputDir = await activeStorage.saveHarvestOutput(cards, new Set());
        return { content: [{ type: "text" as const, text: `Saved ${cards.length} card(s) to ${outputDir}.` }], structuredContent: { saved: cards.length, outputDir } };
      }

      case "list_cards": {
        const activeStorage = await resolveStorage();
        if (!await activeStorage.latestHarvestExists()) {
          return { content: [{ type: "text" as const, text: "No harvest found. Fetch articles and save cards first." }], structuredContent: { error: "no_harvest" } };
        }
        const { limit, minScore } = args as { limit?: number; minScore?: number };
        const bundle = await activeStorage.loadLatestHarvest();
        let cards = bundle.cards;
        if (minScore != null) {
          cards = cards.filter((c) => (c.relevanceScore ?? 0) >= minScore);
        }
        if (limit) cards = cards.slice(0, limit);
        const listCardsResult = { generatedAt: bundle.generatedAt, total: bundle.cards.length, showing: cards.length, cards: cards.map((c) => ({ id: c.id, title: c.title, source: c.source, relevanceScore: c.relevanceScore, thesis: c.thesis, trendTags: c.trendTags, curationStatus: (bundle.curationState ?? {})[String(c.id)] ?? null })) };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(listCardsResult, null, 2) }],
          structuredContent: listCardsResult as Record<string, unknown>,
        };
      }

      case "daily_brief": {
        const { topN: rawTopN } = args as { topN?: number };
        const topN = rawTopN ?? 10;
        if (!await storage.contextExists()) {
          return { content: [{ type: "text" as const, text: "No context saved for this workspace yet. Set up Quillby first." }], structuredContent: { error: "no_context" } };
        }
        const ctx = (await storage.loadContext())!;
        const sources = await storage.loadSources();
        if (sources.length === 0) {
          return { content: [{ type: "text" as const, text: "No RSS sources configured. Use discover_feeds first." }], structuredContent: { error: "no_sources" } };
        }
        const samplingAvailable = !!(server.server.getClientCapabilities()?.sampling);

        // Pass 1: headlines only — fast, no content fetching
        log(`Daily brief: fetching headlines from ${sources.length} feeds...`);
        const { articles: slimArticles, seenUrls } = await fetchArticles(sources, await storage.getSeenUrls(), log, true);
        await storage.saveSeenUrls(seenUrls);
        if (slimArticles.length === 0) {
          return { content: [{ type: "text" as const, text: "No new articles found. All items have been seen before." }], structuredContent: { error: "no_new_articles" } };
        }

        // Pass 1b: Sampling-based semantic scoring (not keyword matching)
        log(`Scoring ${slimArticles.length} headlines semantically via Sampling...`);
        const headlineList = slimArticles
          .map((a, i) => `${i}: ${a.title} — ${a.snippet ?? ""}`)
          .join("\n");
        const scorePrompt = `You are scoring news headlines for a ${ctx.role} in ${
          ctx.industry ?? "their industry"
        }.

User topics: ${ctx.topics.join(", ")}
Audience: ${ctx.audienceDescription ?? "general"}
Goals: ${ctx.contentGoals.join(", ")}
Avoid: ${ctx.excludeTopics?.length ? ctx.excludeTopics.join(", ") : "nothing specified"}

Headlines (index: title — snippet):
${headlineList}

Return ONLY a JSON array of integers — the indices of the top ${topN} most relevant headlines, ordered best first. No explanation.`;

        const scoreRaw = await sample(server, scorePrompt, 400);
        let topIndices: number[] = [];
        if (scoreRaw) {
          try {
            const match = scoreRaw.match(/\[[\s\S]*\]/);
            if (match) {
              const parsed = JSON.parse(match[0]) as unknown[];
              topIndices = parsed
                .filter((x): x is number => typeof x === "number" && x >= 0 && x < slimArticles.length)
                .slice(0, topN);
            }
          } catch (e) {
            logWarn("Sampling score parse failed, falling back to keyword pre-scoring", { error: String(e) });
          }
        }
        if (topIndices.length === 0) {
          const keywordScored = preScoreArticles(slimArticles, ctx.topics);
          topIndices = keywordScored
            .slice(0, topN)
            .map((a) => slimArticles.findIndex((s) => s.link === a.link))
            .filter((i) => i >= 0);
        }

        const topSlim = topIndices.map((i) => slimArticles[i]).filter(Boolean);

        // Pass 2: deep-read only the selected articles
        log(`Deep-reading ${topSlim.length} selected articles...`);
        const enriched: { title: string; source: string; link: string; snippet: string; content: string | null }[] = [];
        for (const article of topSlim) {
          const content = await enrichArticle(article.link, article.title ?? "");
          enriched.push({
            title: article.title ?? "",
            source: article.source ?? article.link,
            link: article.link,
            snippet: article.snippet ?? "",
            content,
          });
        }

        // Pass 3: Sampling generates full cards in one call
        log("Generating content cards via Sampling...");
        const typedMemory3 = await storage.loadTypedMemory();
        const voiceBlock3 = typedMemory3.voiceExamples.length
          ? `\n\nVoice examples — match this style, amplify the strongest quirks:\n${typedMemory3.voiceExamples.map((e, i) => `[${i + 1}]\n${e}`).join("\n\n")}`
          : `\n\nVoice: ${ctx.voice ?? "direct and authentic"}`;
        const articleBlobs = enriched
          .map((a, i) => `## Article ${i + 1}: ${a.title}\nURL: ${a.link}\n\n${a.content ?? a.snippet}`)
          .join("\n\n---\n\n");
        const cardPrompt = `You are a content strategist. Analyze these articles for a ${ctx.role} in ${
          ctx.industry ?? "their industry"
        }.

${contextToPromptText(ctx, typedMemory3)}${voiceBlock3}

${articleBlobs}

For each article produce a JSON object with these exact fields:
- title (string)
- source (string — domain of URL)
- link (string — article URL exactly as provided above)
- thesis (string — one sharp sentence: the single most important takeaway)
- relevanceScore (number 0-10)
- relevanceReason (string — one sentence why this is useful for the user)
- keyInsights (array of 2-3 specific facts or data points from the article)
- angleOptions (array of 3 distinct post angles matching the user voice and platforms)
- hookOptions (array of 3 opening lines — specific, no filler openers, no rhetorical questions that give away the answer)
- trendTags (array of 3-5 short tags)
- transposabilityHint (string — how to make this universal beyond just the news hook)

Return ONLY a valid JSON array of these objects, no prose.`;

        if (!samplingAvailable) {
          return {
            content: [{ type: "text" as const, text: `Quillby fetched ${slimArticles.length} headlines, selected the top ${enriched.length}, and deep-read each one. Generate the content cards now, then call save_cards to persist the Briefing.\n\n${cardPrompt}` }],
            structuredContent: { deferred: true, headlinesSeen: slimArticles.length, deepRead: enriched.length },
          };
        }
        const cardRaw = await sample(server, cardPrompt, 4000);
        if (!cardRaw) {
          // Sampling reported as available but returned nothing (e.g. VS Code Copilot).
          // Fall through to deferred mode: return the prompt for the AI client to fulfill.
          return {
            content: [{ type: "text" as const, text: `Quillby fetched ${slimArticles.length} headlines, selected the top ${enriched.length}, and deep-read each one. Generate the content cards now, then call save_cards to persist the Briefing.\n\n${cardPrompt}` }],
            structuredContent: { deferred: true, headlinesSeen: slimArticles.length, deepRead: enriched.length },
          };
        }
        let rawBriefCards: unknown[];
        try {
          const match = cardRaw.match(/\[[\s\S]*\]/);
          if (!match) throw new Error("No JSON array in response");
          rawBriefCards = JSON.parse(match[0]) as unknown[];
        } catch {
          return { content: [{ type: "text" as const, text: `Card generation returned malformed JSON.\nRaw:\n${cardRaw}` }], structuredContent: { error: "malformed_json", raw: cardRaw } };
        }

        const briefCards = rawBriefCards.map((c) => CardInputSchema.parse(c));
        await storage.saveHarvestOutput(briefCards, seenUrls);
        const savedBundle = await storage.loadLatestHarvest();
        const briefResult = {
          date: new Date().toISOString().split("T")[0],
          feedsChecked: sources.length,
          headlinesSeen: slimArticles.length,
          deepRead: enriched.length,
          cardsGenerated: savedBundle.cards.length,
          brief: savedBundle.cards
            .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
            .map((c) => ({
              id: c.id,
              score: c.relevanceScore,
              title: c.title,
              thesis: c.thesis,
              topAngle: c.angleOptions?.[0] ?? null,
              topHook: c.hookOptions?.[0] ?? null,
              trendTags: c.trendTags,
            })),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(briefResult, null, 2) }],
          structuredContent: briefResult as Record<string, unknown>,
        };
      }

      case "get_card": {
        const activeStorage = await resolveStorage();
        if (!await activeStorage.latestHarvestExists()) {
          return { content: [{ type: "text" as const, text: "No harvest found." }], structuredContent: { error: "no_harvest" } };
        }
        const { cardId } = args as { cardId: number };
        const bundle = await activeStorage.loadLatestHarvest();
        const card = bundle.cards.find((c) => c.id === cardId);
        if (!card) {
          return { content: [{ type: "text" as const, text: `Card #${cardId} not found. Available: ${bundle.cards.map((c) => c.id).join(", ")}.` }], structuredContent: { error: "not_found", cardId } };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(card, null, 2) }], structuredContent: card as Record<string, unknown> };
      }

      case "save_draft": {
        const activeStorage = await resolveStorage();
        const { content, platform, cardId, addToVoiceExamples } = args as { content: string; platform: string; cardId?: number; addToVoiceExamples?: boolean };
        const filePath = await activeStorage.saveDraft(content, platform, cardId);
        if (addToVoiceExamples) await activeStorage.appendTypedMemory("voiceExamples", [content], 10);
        const savedMsg = addToVoiceExamples
          ? `Draft saved to ${filePath}. Added to voice memory.`
          : `Draft saved to ${filePath}.`;
        return { content: [{ type: "text" as const, text: savedMsg }], structuredContent: { saved: true, platform, filePath, voiceExampleAdded: addToVoiceExamples ?? false } };
      }

      case "list_drafts": {
        const activeStorage = await resolveStorage();
        const drafts = await activeStorage.listDrafts();
        const listDraftsResult = { count: drafts.length, drafts };
        return {
          content: [{ type: "text" as const, text: drafts.length ? JSON.stringify(listDraftsResult, null, 2) : "No saved drafts for this workspace yet." }],
          structuredContent: listDraftsResult as Record<string, unknown>,
        };
      }

      case "curate_card": {
        const activeStorage = await resolveStorage();
        const { cardId: curateId, action } = args as { cardId: number; action: "shortlist" | "skip" | "clear" };
        if (!await activeStorage.latestHarvestExists()) {
          return { content: [{ type: "text" as const, text: "No harvest found. Save cards first." }], structuredContent: { error: "no_harvest" } };
        }
        const curateBundle = await activeStorage.loadLatestHarvest();
        const curateCard = curateBundle.cards.find((c) => c.id === curateId);
        if (!curateCard) {
          return { content: [{ type: "text" as const, text: `Card #${curateId} not found. Available: ${curateBundle.cards.map((c) => c.id).join(", ")}.` }], structuredContent: { error: "not_found", cardId: curateId } };
        }
        const statusMap: Record<"shortlist" | "skip", "shortlisted" | "skipped"> = {
          shortlist: "shortlisted",
          skip: "skipped",
        };
        const key = String(curateId);
        if (action === "clear") {
          const cleared = { ...(curateBundle.curationState ?? {}) };
          delete cleared[key];
          await activeStorage.saveCurationState(cleared as Record<string, "shortlisted" | "skipped">);
        } else {
          await activeStorage.saveCurationState({ [key]: statusMap[action] });
        }
        const newStatus = action === "clear" ? "cleared" : statusMap[action];
        return {
          content: [{ type: "text" as const, text: `Card #${curateId} "${curateCard.title}" — status set to ${newStatus}.` }],
          structuredContent: { cardId: curateId, title: curateCard.title, status: newStatus },
        };
      }

      case "generate_post": {
        const { cardId: rawGenCardId, platform: rawGenPlatform, angle } = args as { cardId?: number; platform?: string; angle?: string };
        if (!await storage.latestHarvestExists()) {
          return { content: [{ type: "text" as const, text: "No Briefing is available for this workspace yet. Refresh Quillby first." }], structuredContent: { error: "no_harvest" } };
        }
        if (!await storage.contextExists()) {
          return { content: [{ type: "text" as const, text: "No context saved for this workspace yet. Set up Quillby first." }], structuredContent: { error: "no_context" } };
        }
        const genSamplingAvailable = !!(server.server.getClientCapabilities()?.sampling);
        const genBundle = await storage.loadLatestHarvest();
        const genCtxForPlatform = await storage.loadContext();
        const genPlatform = rawGenPlatform ?? genCtxForPlatform?.platforms?.[0] ?? "linkedin";

        // Resolve which card to use: explicit ID > shortlisted > highest-scored
        let genCardId = rawGenCardId;
        if (genCardId == null) {
          const curation = genBundle.curationState ?? {};
          const sorted = [...genBundle.cards].sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
          const shortlisted = sorted.find((c) => curation[String(c.id)] === "shortlisted");
          const picked = shortlisted ?? sorted[0];
          if (!picked) {
            return { content: [{ type: "text" as const, text: "No cards available. Refresh the Briefing first." }], structuredContent: { error: "no_cards" } };
          }
          genCardId = picked.id;
        }

        const genCard = genBundle.cards.find((c) => c.id === genCardId);
        if (!genCard) {
          return { content: [{ type: "text" as const, text: `Card #${genCardId} not found. Available: ${genBundle.cards.map((c) => c.id).join(", ")}.` }], structuredContent: { error: "not_found", cardId: genCardId } };
        }
        const genCtx = genCtxForPlatform!;
        const typedMemoryGen = await storage.loadTypedMemory();
        const guide = PLATFORM_GUIDES[genPlatform];
        if (!guide) {
          return { content: [{ type: "text" as const, text: `Unknown platform: "${genPlatform}". Available: ${Object.keys(PLATFORM_GUIDES).join(", ")}.` }], structuredContent: { error: "unknown_platform", platform: genPlatform } };
        }
        const chosenAngle = angle ?? genCard.angleOptions?.[0] ?? genCard.thesis;
        const genVoiceBlock = typedMemoryGen.voiceExamples.length
          ? `Voice examples — read these carefully. Match the register, rhythm, and vocabulary exactly. Oversteer on the strongest quirks:\n${typedMemoryGen.voiceExamples.map((e, i) => `[${i + 1}]\n${e}`).join("\n\n")}`
          : `Voice description: ${genCtx.voice ?? "direct and authentic"}`;
        const generatePrompt = `You are writing a ${genPlatform} post for ${
          genCtx.name ?? "a content creator"
        } — a ${genCtx.role} in ${genCtx.industry ?? "their industry"}.

## User profile
${contextToPromptText(genCtx, typedMemoryGen)
  .split("\n")
  .map((line) => `- ${line}`)
  .join("\n")}

## ${genVoiceBlock}

## Source card
Title: ${genCard.title}
Thesis: ${genCard.thesis}
Angle to use: ${chosenAngle}
Key insights: ${genCard.keyInsights?.join(" | ") ?? ""}
Trend tags: ${genCard.trendTags?.join(", ") ?? ""}
Transposability hint: ${genCard.transposabilityHint ?? ""}
Hook options (pick the best or write a stronger one): ${genCard.hookOptions?.join(" | ") ?? ""}

## Platform guide
${guide}

## Absolute rules — any violation produces an unusable draft
- NEVER use: "It's not X, it's Y" contrasts, em-dash clusters (1 max per post), bullet lists masquerading as prose
- NEVER use these words: "game-changer", "transformative", "innovative", "powerful", "exciting", "impactful", "leverage", "unlock", "dive into"
- NEVER use filler openers: "In today's world", "In an era of", "Let's talk about", "Here's the thing:", "The truth is:"
- NEVER use rhetorical question openers that give away the answer
- NEVER use motivational closings: "Remember: X matters", "Don't forget to X"
- NEVER smooth out the rough edges — the rough edges are the voice
- Write the post only. No intro sentence, no commentary, no "Here is the post:".`;
        log(`Generating ${genPlatform} post for card #${genCardId}...`);
        if (!genSamplingAvailable) {
          return {
            content: [{ type: "text" as const, text: `${generatePrompt}\n\n---\nWrite the post above, then call save_draft with content="<your post>", platform="${genPlatform}", cardId=${genCardId}.` }],
            structuredContent: { deferred: true, platform: genPlatform, cardId: genCardId },
          };
        }
        const draft = await sample(server, generatePrompt, 2000);
        if (!draft) {
          // Sampling reported available but returned nothing — fall through to deferred mode.
          return {
            content: [{ type: "text" as const, text: `${generatePrompt}\n\n---\nWrite the post above, then call save_draft with content="<your post>", platform="${genPlatform}", cardId=${genCardId}.` }],
            structuredContent: { deferred: true, platform: genPlatform, cardId: genCardId },
          };
        }
        const draftPath = await storage.saveDraft(draft.trim(), genPlatform, genCardId);
        const generateResult = { platform: genPlatform, cardId: genCardId, angle: chosenAngle, savedTo: draftPath, draft: draft.trim() };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(generateResult, null, 2) }],
          structuredContent: generateResult,
        };
      }

      case "remember": {
        const activeStorage = await resolveStorage();
        const { entries, memoryType = "voice_examples" } = args as {
          entries: string[];
          memoryType?: MemoryTypeInput;
        };
        const resolvedType = MEMORY_TYPES[memoryType];
        await activeStorage.appendTypedMemory(
          resolvedType,
          entries,
          resolvedType === "voiceExamples" ? 10 : undefined
        );
        const remWs = await activeStorage.getCurrentWorkspace();
        return {
          content: [{ type: "text" as const, text: `Added ${entries.length} item(s) to ${memoryType} in workspace "${remWs.name}".` }],
          structuredContent: { added: entries.length, memoryType, workspaceId: remWs.id },
        };
      }

      case "get_memory": {
        const activeStorage = await resolveStorage();
        const { memoryType } = args as { memoryType?: MemoryTypeInput };
        const [typedMemoryGet, getMemWs] = await Promise.all([activeStorage.loadTypedMemory(), activeStorage.getCurrentWorkspace()]);
        if (!memoryType) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ workspace: getMemWs, memory: typedMemoryGet }, null, 2) }],
            structuredContent: { workspace: getMemWs, memory: typedMemoryGet },
          };
        }
        const resolvedType = MEMORY_TYPES[memoryType];
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ workspace: getMemWs, memoryType, entries: typedMemoryGet[resolvedType] }, null, 2) }],
          structuredContent: { workspace: getMemWs, memoryType, entries: typedMemoryGet[resolvedType] },
        };
      }

      // ── v2: Multimodal generation ────────────────────────────────────────

      case "generate_image":
      case "generate_audio":
      case "generate_video": {
        refreshProviderRouter();
        const modality = name === "generate_image" ? "image" : name === "generate_audio" ? "audio" : "video" as GenerationModality;
        const genSchema = modality === "image" ? GenerateImageArgsSchema : modality === "audio" ? GenerateAudioArgsSchema : GenerateVideoArgsSchema;
        const parsedGen = genSchema.parse(args);
        const {
          prompt,
          cardId,
          aspectRatio = "square",
          cloneVoice = false,
          cloneAvatar = false,
          drivingAudioUrl,
          workspaceId: genWsId,
        } = parsedGen as {
          prompt: string;
          cardId?: number;
          aspectRatio?: string;
          cloneVoice?: boolean;
          cloneAvatar?: boolean;
          drivingAudioUrl?: string;
          workspaceId?: string;
        };
        const genStorage: WorkspaceStorage & JobStorage = genWsId ? await (await resolveStorage()).withWorkspace(genWsId) as WorkspaceStorage & JobStorage : await resolveStorage();
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
            content: [{ type: "text" as const, text: `${modality} generation at capacity (${JOB_CONCURRENCY_LIMITS[modalKey]} concurrent limit). Try again later.` }],
            isError: true,
          };
        }
        // Plan credit enforcement
        if (isPlanEnforcementEnabled()) {
          const plan = await genStorage.getPlan();
          const limits = getPlanLimits(plan);
          const limitKey = `${modality}CreditsPerMonth` as keyof typeof limits;
          const limit = limits[limitKey];
          if (limit !== null && limit >= 0) {
            const monthlyCount = await genStorage.getMonthlyJobCount?.(modality) ?? 0;
            if (monthlyCount >= limit) {
              return {
                content: [{ type: "text" as const, text: `Monthly ${modality} generation limit reached (${monthlyCount}/${limit}). Upgrade your plan for more capacity.` }],
                isError: true,
              };
            }
          }
        }

        const jobId = randomUUID();
        const now = new Date().toISOString();
        const job = {
          id: jobId,
          workspaceId: genWs.id,
          modality,
          prompt,
          status: "queued" as const,
          cardId,
          createdAt: now,
          updatedAt: now,
        };
        await genStorage.saveJob(job);

        // Check which tier is available and update the job status hint
        const tier = providerRouter.resolvesTier(modality);
        const tierLabel = tier === "sampling" ? "MCP Sampling" : tier === "cloud" ? "Cloud" : tier === "direct" ? "Direct" : "unavailable";

        if (!tier) {
          await genStorage.updateJob(jobId, {
            status: "failed",
            error: providerUnavailableMessage(modality),
          });
          return {
            content: [{ type: "text" as const, text: `No ${modality} provider available. ${providerUnavailableMessage(modality)}` }],
            structuredContent: { jobId, status: "failed", modality },
          };
        }

        // Enqueue the job — the background worker will process it
        activeJobCounts[modalKey] = (activeJobCounts[modalKey] ?? 0) + 1;
        void runGenerationJob(genStorage, jobId, modality, prompt, memory, genWs, {
          aspectRatio,
          cloneVoice,
          cloneAvatar,
          drivingAudioUrl,
        });

        return {
          content: [{ type: "text" as const, text: `${modality} generation queued (job: ${jobId}, tier: ${tierLabel}${cloneVoice ? ", cloneVoice" : ""}${cloneAvatar ? ", cloneAvatar" : ""}). Use get_job to check status.` }],
          structuredContent: { jobId, status: "queued", modality, tier: tierLabel, workspaceId: genWs.id, cloneVoice, cloneAvatar },
        };
      }

      case "get_job": {
        const parsedGj = GetJobArgsSchema.parse(args);
        const { jobId, workspaceId: gjWsId } = parsedGj;
        const gjStorage: WorkspaceStorage & JobStorage = gjWsId ? await (await resolveStorage()).withWorkspace(gjWsId) as WorkspaceStorage & JobStorage : await resolveStorage();
        const job = await gjStorage.loadJob(jobId);
        if (!job) {
          return {
            content: [{ type: "text" as const, text: `Job "${jobId}" not found.` }],
            structuredContent: { error: "not_found", jobId },
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(job, null, 2) }],
          structuredContent: { job },
        };
      }

      case "list_jobs": {
        const parsedLj = ListJobsArgsSchema.parse(args);
        const { modality: ljModality, workspaceId: ljWsId } = parsedLj;
        const ljStorage: WorkspaceStorage & JobStorage = ljWsId ? await (await resolveStorage()).withWorkspace(ljWsId) as WorkspaceStorage & JobStorage : await resolveStorage();
        const jobs = await ljStorage.listJobs(ljModality);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(jobs, null, 2) }],
          structuredContent: { jobs, count: jobs.length },
        };
      }

      case "get_providers": {
        refreshProviderRouter();
        const report = getProviderPolicyReport(deploymentMode, providerRouter);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ ...report, configured: getStoredProviderConfigSummary() }, null, 2) }],
          structuredContent: { ...report, configured: getStoredProviderConfigSummary() } as Record<string, unknown>,
        };
      }

      case "set_provider": {
        const parsedSp = SetProviderArgsSchema.parse(args);
        const { modality, provider, apiKey, voiceId, groupId } = parsedSp;
        const saved = saveProviderConfig({ modality, provider, apiKey, voiceId, groupId }, deploymentMode);
        refreshProviderRouter();
        return {
          content: [{ type: "text" as const, text: `${modality} provider saved: ${saved.provider}.` }],
          structuredContent: { modality, saved },
        };
      }

      case "clear_provider": {
        const parsedCp = ClearProviderArgsSchema.parse(args);
        const { modality } = parsedCp;
        clearProviderConfig(modality);
        refreshProviderRouter();
        return {
          content: [{ type: "text" as const, text: `${modality} provider configuration cleared.` }],
          structuredContent: { modality, cleared: true },
        };
      }

      // ── Content Planning ────────────────────────────────────────────────
      case "plan_create": {
        const planStorage = await resolveStorage() as unknown as PlanStorage;
        return handlePlanCreate(planStorage, args);
      }
      case "plan_list": {
        const planStorage = await resolveStorage() as unknown as PlanStorage;
        return handlePlanList(planStorage, args);
      }
      case "plan_today": {
        const planStorage = await resolveStorage() as unknown as PlanStorage;
        return handlePlanToday(planStorage, args);
      }
      case "task_create": {
        const planStorage = await resolveStorage() as unknown as PlanStorage;
        return handleTaskCreate(planStorage, args);
      }
      case "task_move": {
        const planStorage = await resolveStorage() as unknown as PlanStorage;
        return handleTaskMove(planStorage, args);
      }
      case "task_delete": {
        const planStorage = await resolveStorage() as unknown as PlanStorage;
        return handleTaskDelete(planStorage, args);
      }
      case "calendar": {
        const planStorage = await resolveStorage() as unknown as PlanStorage;
        return handleCalendar(planStorage, args);
      }

      // ── Billing & Plan Management ───────────────────────────────────────
      case "get_plan": {
        if (!isCloudMode()) {
          return {
            content: [{ type: "text" as const, text: "Plan management is only available in cloud mode." }],
            structuredContent: { error: "not_cloud_mode" },
          };
        }
        const plan = await storage.getPlan();
        const limits = getPlanLimits(plan);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ plan, limits, enforcementEnabled: isPlanEnforcementEnabled() }, null, 2) }],
          structuredContent: { plan, limits, enforcementEnabled: isPlanEnforcementEnabled() },
        };
      }

      case "get_pricing": {
        if (!isCloudMode()) {
          return {
            content: [{ type: "text" as const, text: "Pricing is only available in cloud mode." }],
            structuredContent: { error: "not_cloud_mode" },
          };
        }
        const plans = [
          {
            name: "free",
            price: "$0/mo",
            description: "Get started with basic content tools",
            limits: getPlanLimits("free"),
          },
          {
            name: "pro",
            price: "$29/mo",
            description: "Unlimited workspaces, drafts, and AI generation credits",
            limits: getPlanLimits("pro"),
          },
        ];
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ plans }, null, 2) }],
          structuredContent: { plans },
        };
      }

      case "billing_action": {
        if (!isCloudMode()) {
          return {
            content: [{ type: "text" as const, text: "Billing is only available in cloud mode." }],
            structuredContent: { error: "not_cloud_mode" },
          };
        }
        const parsedBa = BillingActionArgsSchema.parse(args);
        const currentPlan = await storage.getPlan();
        const url = getBillingActionUrl(parsedBa.action, currentPlan);
        if (!url) {
          return {
            content: [{ type: "text" as const, text: `Billing action "${parsedBa.action}" is not configured. Ensure Stripe environment variables are set.` }],
            structuredContent: { error: "not_configured", action: parsedBa.action },
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ action: parsedBa.action, url, plan: currentPlan }, null, 2) }],
          structuredContent: { action: parsedBa.action, url, plan: currentPlan },
        };
      }

      // ── Session Lifecycle ───────────────────────────────────────────────
      case "session_start": {
        const store = await resolveStorage() as unknown as SessionStore & PlanStorage;
        return handleSessionStart(store, store, args);
      }
      case "session_status": {
        const store = await resolveStorage() as unknown as SessionStore & PlanStorage;
        return handleSessionStatus(store, store, args);
      }
      case "session_close": {
        const store = await resolveStorage() as unknown as SessionStore & PlanStorage;
        return handleSessionClose(store, store, args);
      }

      default:
        return { content: [{ type: "text" as const, text: `Unknown tool: ${name}` }], isError: true, structuredContent: { error: "unknown_tool", toolName: name } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true, structuredContent: { error: message } };
  }
}

async function readResource(uri: string, storage: WorkspaceStorage & JobStorage) {
  switch (uri) {
    case "quillby://workspace/current": {
      const text = JSON.stringify(await storage.getCurrentWorkspace(), null, 2);
      return { contents: [{ uri, mimeType: "application/json", text }] };
    }
    case "quillby://context": {
      const text = await storage.contextExists()
        ? JSON.stringify(await storage.loadContext(), null, 2)
        : JSON.stringify({ error: "No context saved for this workspace yet. Set up Quillby first." });
      return { contents: [{ uri, mimeType: "application/json", text }] };
    }
    case "quillby://memory": {
      const text = JSON.stringify(await storage.loadTypedMemory(), null, 2);
      return { contents: [{ uri, mimeType: "application/json", text }] };
    }
    case "quillby://harvest/latest": {
      const text = await storage.latestHarvestExists()
        ? JSON.stringify(await storage.loadLatestHarvest(), null, 2)
        : JSON.stringify({ error: "No Briefing has been generated for this workspace yet." });
      return { contents: [{ uri, mimeType: "application/json", text }] };
    }
    case "quillby://feeds": {
      const sources = await storage.loadSources();
      return { contents: [{ uri, mimeType: "text/plain", text: sources.length ? sources.join("\n") : "# No feeds configured." }] };
    }
    case "quillby://jobs": {
      const jobs = await storage.listJobs();
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(jobs, null, 2) }] };
    }
    case "quillby://assets/latest": {
      const allJobs = await storage.listJobs();
      const assets = allJobs
        .filter((j) => j.status === "done" && j.outputRef)
        .slice(0, 20)
        .map((j) => ({ jobId: j.id, modality: j.modality, outputRef: j.outputRef, createdAt: j.createdAt, meta: j.meta }));
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(assets, null, 2) }] };
    }
    case "quillby://billing/plan": {
      if (!isCloudMode()) {
        return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ error: "Billing is only available in cloud mode." }) }] };
      }
      const plan = await storage.getPlan();
      const limits = getPlanLimits(plan);
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ plan, limits, enforcementEnabled: isPlanEnforcementEnabled() }, null, 2) }] };
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}

async function getPrompt(name: string, storage: WorkspaceStorage, args?: Record<string, string>) {
  void args;
  switch (name) {
    case "onboarding": {
      const exists = await storage.contextExists();
      const existing = exists ? await storage.loadContext() : null;
      const typedMemory = await storage.loadTypedMemory();
      const currentWorkspace = await storage.getCurrentWorkspace();
      return {
        description: "Quillby onboarding",
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: exists
                ? `I have a saved profile in workspace "${currentWorkspace.name}":\n\n${contextToPromptText(existing!, typedMemory)}\n\nUpdate it?`
                : "Set up Quillby for my content workflow.",
            },
          },
          {
            role: "assistant" as const,
            content: {
              type: "text" as const,
              text: exists
                ? "I can see your profile. Tell me what to change and I will call set_context."
                : ONBOARDING_PROMPT,
            },
          },
        ],
      };
    }

    case "session_start": {
      const workspace = await storage.getCurrentWorkspace();
      const hasContext = await storage.contextExists();
      const hasFeeds = (await storage.loadSources()).length > 0;
      const hasBriefing = await storage.latestHarvestExists();
      const hasDrafts = hasContext && (await storage.listDrafts()).length > 0;
      const sessionText = `## Quillby Session Start

Workspace: ${workspace.name} (${workspace.id})

Open Quillby as a Claude-native editorial workspace, not as a menu of tools.

Behavior contract:
- Treat the user's first Quillby-related message as intent to open Quillby.
- Keep tool names invisible unless the user is explicitly debugging.
- Prefer native Claude Artifacts over long chat replies.
- Reuse or update an existing Quillby artifact in the current conversation when it already matches the active workspace.
- For requests like "Open Quillby", "Open my daily brief", or "Show me my briefing", prefer open_briefing over daily_brief.
- Do not improvise a manual tool-by-tool fallback in chat.
- Do not narrate tool execution with phrases like "Let me...", "I'll fetch...", or "I'll work around this manually."

Session flow:
1. Inspect the active workspace state.
2. If no profile exists yet, guide setup conversationally, save it, and make sure sources are configured.
3. ${hasDrafts ? "Saved drafts exist. Before opening the Briefing, ask the user one short question: \"Anything you posted recently that landed well?\" If yes, ask them to paste it or describe it, then save it using remember with memoryType=\"successful_posts\", and a second time with memoryType=\"voice_examples\". Then proceed to the Briefing." : "If a profile and saved brief already exist, call open_briefing immediately so the user gets a stable Briefing UI without waiting."}
4. Refresh the Briefing only when it is stale, missing, or the user explicitly asks for a fresh run.
5. If there is no saved Briefing and Sampling is unavailable, explain that Quillby cannot generate a fresh Briefing in this client and stop. Do not simulate the pipeline manually.
6. Let the user move naturally from Briefing to Story, Draft, or Voice System through plain-language requests.

Current workspace state:
- Profile saved: ${hasContext ? "yes" : "no"}
- Feeds configured: ${hasFeeds ? "yes" : "no"}
- Briefing available: ${hasBriefing ? "yes" : "no"}
- Saved drafts: ${hasDrafts ? "yes" : "no"}

User-facing expectations:
- The user should be able to say things like "Open Quillby", "What's worth writing about today?", "Draft the second one for LinkedIn", or "Show me my Voice System".
- Do not answer with a command list.
- Do not ask the user to memorize tool names.`;

      return {
        description: "Quillby session start",
        messages: [
          { role: "user" as const, content: { type: "text" as const, text: "Open Quillby for this workspace." } },
          { role: "assistant" as const, content: { type: "text" as const, text: sessionText } },
        ],
      };
    }

    case "briefing": {
      const workspace = await storage.getCurrentWorkspace();
      const briefingText = `## Quillby Briefing Artifact

Use the Briefing as Quillby's default opening artifact.

Artifact rules:
- Create or update a native Claude Artifact called "Briefing".
- If a matching Briefing artifact for workspace "${workspace.name}" is already active in this conversation, update it instead of creating a duplicate.
- Keep the interaction natural. The artifact is the surface; chat is the control layer.

What the Briefing should show:
- active workspace
- editorial focus and audience
- source freshness
- strongest current opportunities
- whether drafts or memory need attention
- clear next actions the user can ask for in plain language

How to drive it:
- Use Quillby's saved workspace state and latest harvest data.
- For "open" intents, use open_briefing first so the UI appears immediately from cached local state.
- Present top opportunities as editorial decisions, not raw database rows.
- When the user asks to go deeper, transition into a Story artifact or produce a Draft directly.
- If Briefing generation is not possible in the current host, explain the capability gap plainly and stop instead of listing workaround steps or simulating the pipeline manually.

Tone rules:
- No emojis.
- No progress narration.
- No operator language such as "Let me", "Now I'll", or "I'm going to fetch".
- Speak as Quillby opening an editorial surface, not as an assistant running commands.`;

      return {
        description: "Quillby Briefing artifact",
        messages: [
          { role: "user" as const, content: { type: "text" as const, text: "Show me the Quillby Briefing." } },
          { role: "assistant" as const, content: { type: "text" as const, text: briefingText } },
        ],
      };
    }

    case "story": {
      const storyText = `## Quillby Story Artifact

Open a Story artifact when the user chooses one opportunity from the Briefing or asks for detail on a specific idea.

Artifact rules:
- Create or update a native Claude Artifact called "Story".
- Reuse the active Story artifact when the user is iterating on the same item.
- Keep tool details hidden; the user should feel like they are exploring one editorial opportunity, not querying a database.

What the Story artifact should show:
- source and why it matters now
- thesis
- relevance to the workspace
- best angles and hooks
- what would make a strong draft

How to move forward:
- If the user asks to write, transition directly into a Draft.
- If the user asks why it ranked highly, explain the editorial reasoning in natural language.
- If the user asks to save a learning, update the Voice System memory behind the scenes.`;

      return {
        description: "Quillby Story artifact",
        messages: [
          { role: "user" as const, content: { type: "text" as const, text: "Open the strongest Quillby story." } },
          { role: "assistant" as const, content: { type: "text" as const, text: storyText } },
        ],
      };
    }

    case "voice_system": {
      const voiceSystemText = `## Quillby Voice System Artifact

Open the Voice System artifact when the user asks how Quillby writes, what it has learned, or wants to adjust voice memory.

Artifact rules:
- Create or update a native Claude Artifact called "Voice System".
- Reuse the active Voice System artifact when the user is editing rules or reviewing examples.
- Keep the artifact editorial and practical, not diagnostic.

What the Voice System should show:
- workspace role and audience
- current voice summary
- approved voice examples
- style rules
- banned phrasing
- audience insights
- campaign context when present

How to use it:
- When the user says "remember this", save it in the right memory bucket behind the scenes.
- When the user asks why a draft feels wrong, compare the draft against the Voice System and explain the mismatch clearly.
- When the user improves a rule, update the artifact so it stays current in the conversation.`;

      return {
        description: "Quillby Voice System artifact",
        messages: [
          { role: "user" as const, content: { type: "text" as const, text: "Show me the Quillby Voice System." } },
          { role: "assistant" as const, content: { type: "text" as const, text: voiceSystemText } },
        ],
      };
    }

    case "projects_playbook": {
      const playbook = `## Quillby + Claude Projects + Artifacts

1. Create one Quillby workspace per Claude Project, client, brand, or campaign.
2. Keep structured profile, feeds, typed memory, harvests, and drafts in Quillby.
3. Keep long background documents inside Claude Project knowledge.
4. Let Claude render Quillby's working surfaces as native Artifacts:
   - Briefing for the daily opening view
   - Story for one ranked opportunity
   - Voice System for editorial memory and rules
5. Use memory buckets deliberately:
   - voice_examples for approved writing samples
   - style_rules for positive editorial constraints
   - do_not_say for banned phrasing
   - audience_insights for what readers care about
   - campaign_context for temporary initiative-specific context
   - source_preferences for preferred publications or communities`;
      return {
        description: "Quillby Projects playbook",
        messages: [
          { role: "user" as const, content: { type: "text" as const, text: "How should I use Quillby with Claude Projects?" } },
          { role: "assistant" as const, content: { type: "text" as const, text: playbook } },
        ],
      };
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

function registerMcpHandlers(server: McpServer, storage: WorkspaceStorage & JobStorage & PlanStorage & SessionStore): void {
  for (const tool of TOOLS) {
    server.registerTool(tool.name, {
      description: tool.description,
      annotations: tool.annotations,
      _meta: (tool as Tool & { _meta?: Record<string, unknown> })._meta,
    }, (args: unknown) => handleToolCall(server, storage, tool.name, (args ?? {}) as Record<string, unknown>));
  }

  // Override tools/list to expose the full JSON inputSchema for each tool.
  // McpServer.registerTool only accepts Zod schemas; omitting one causes the
  // SDK to emit empty properties:{} and also strips incoming args to {}.
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      annotations: t.annotations,
      inputSchema: t.inputSchema,
    })),
  }));

  // Override tools/call to bypass the SDK's Zod validation (which would strip
  // all fields when no schema was provided to registerTool).
  server.server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: callArgs } = req.params;
    return handleToolCall(server, storage, name, (callArgs ?? {}) as Record<string, unknown>);
  });

  for (const resource of RESOURCES) {
    server.registerResource(resource.name, resource.uri, {
      description: resource.description,
      mimeType: resource.mimeType,
    }, async () => readResource(resource.uri, storage));
  }

  for (const prompt of PROMPTS) {
    server.registerPrompt(prompt.name, {
      description: prompt.description,
    }, (args) => getPrompt(prompt.name, storage, args as Record<string, string> | undefined));
  }
}

// ---------------------------------------------------------------------------
// v2: Generation job runner
// ---------------------------------------------------------------------------

async function runGenerationJob(
  jobStorage: JobStorage,
  jobId: string,
  modality: GenerationModality,
  prompt: string,
  memory: import("@quillby/core").TypedMemory,
  workspace: import("@quillby/core").WorkspaceMetadata,
  options?: {
    aspectRatio?: string;
    cloneVoice?: boolean;
    cloneAvatar?: boolean;
    drivingAudioUrl?: string;
  }
): Promise<void> {
  refreshProviderRouter();
  await jobStorage.updateJob(jobId, { status: "running" });
  try {
    const cloneVoice = options?.cloneVoice === true;
    const cloneAvatar = options?.cloneAvatar === true;

    if (cloneVoice) {
      if (!workspace.cloneConsentGranted) {
        throw new Error("Voice clone blocked: clone consent is not granted.");
      }
      if (!workspace.voiceReferenceAudioUrl) {
        throw new Error("Voice clone blocked: voice reference audio is not configured.");
      }
    }

    if (cloneAvatar) {
      if (!workspace.cloneConsentGranted) {
        throw new Error("Avatar clone blocked: clone consent is not granted.");
      }
      if (!workspace.faceReferenceImageUrl) {
        throw new Error("Avatar clone blocked: face reference image is not configured.");
      }
      if (!options?.drivingAudioUrl) {
        throw new Error("Avatar clone blocked: drivingAudioUrl is required.");
      }
      try {
        await validateUrl(options.drivingAudioUrl);
      } catch (err) {
        throw new Error(`Avatar clone blocked: drivingAudioUrl ${err instanceof Error ? err.message : "invalid"}`);
      }
    }

    const req = {
      modality,
      prompt,
      visualStyle: memory.visualStyle.join(". ") || undefined,
      voiceProfile: memory.voiceProfile.join(". ") || undefined,
      faceProfile: memory.faceProfile.join(". ") || undefined,
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
      meta: JSON.stringify({ mimeType: result.mimeType, ...(result.meta ?? {}) }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await jobStorage.updateJob(jobId, { status: "failed", error: msg });
  } finally {
    const m = modality;
    if (activeJobCounts[m] !== undefined) activeJobCounts[m] = Math.max(0, activeJobCounts[m] - 1);
  }
}

// ---------------------------------------------------------------------------
// Scheduled autonomous harvest
// ---------------------------------------------------------------------------

async function runScheduledHarvest(): Promise<void> {
  const tag = "[quillby-schedule]";
  if (!await storage.contextExists()) {
    logInfo("No profile saved — skipping harvest", { tag });
    return;
  }
  const ctx = (await storage.loadContext())!;
  const sources = await storage.loadSources();
  if (sources.length === 0) {
    logInfo("No feeds configured — skipping harvest", { tag });
    return;
  }
  const topN = parseInt(process.env.QUILLBY_SCHEDULE_TOP_N ?? "15", 10);
  logInfo("Fetching articles", { tag, count: sources.length });
  try {
    const { articles, seenUrls } = await fetchArticles(
      sources,
      await storage.getSeenUrls(),
      (msg) => logInfo(msg, { tag }),
      true,
    );
    await storage.saveSeenUrls(seenUrls);
    if (articles.length === 0) {
      logInfo("No new articles", { tag });
      return;
    }
    const top = preScoreArticles(articles, ctx.topics).slice(0, topN);
    const cards = top.map((a) =>
      CardInputSchema.parse({
        title: a.title ?? "Untitled",
        source: (() => { try { return new URL(a.link).hostname; } catch { logWarn("malformed URL in card source"); return a.link; } })(),
        link: a.link,
        thesis: a.snippet ?? a.title ?? "",
        trendTags: [],
      })
    );
    const outputDir = await storage.saveHarvestOutput(cards, seenUrls);
    logInfo("Harvest complete", { tag, cards: cards.length, outputDir });
  } catch (err) {
    logError("Harvest failed", { tag, error: err instanceof Error ? err.message : String(err) });
  }
}

function scheduleDaily(timeStr: string, fn: () => Promise<void>): void {
  const parts = timeStr.split(":");
  const hour = parseInt(parts[0] ?? "", 10);
  const minute = parseInt(parts[1] ?? "0", 10);
  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    logError("Invalid QUILLBY_SCHEDULE format", { timeStr });
    return;
  }
  const msUntilNext = (): number => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  };
  const tick = (): void => {
    const delay = msUntilNext();
    logInfo("Next harvest scheduled", { time: timeStr, delayMin: Math.round(delay / 60000) });
    setTimeout(async () => { await fn(); tick(); }, delay).unref();
  };
  tick();
}

// ---------------------------------------------------------------------------

const TRANSPORT_MODE = process.env.QUILLBY_TRANSPORT ?? "stdio";
validateEnv();



const HTTP_BODY_LIMIT = 1 * 1024 * 1024; // 1 MiB

if (TRANSPORT_MODE === "http") {
  void validateDbConnection();

  // Stateful HTTP mode: each client session gets its own transport instance.
  // A single shared Server handles all sessions via per-request transports.
  const PORT = parseInt(process.env.PORT ?? "3000", 10);
  const HOST = process.env.QUILLBY_HTTP_HOST ?? "0.0.0.0";
  const BASE_URL = process.env.QUILLBY_BASE_URL ?? `http://localhost:${PORT}`;

  // ── Bundled SPA (self-hosted Docker) ─────────────────────────────────────
  const SPA_DIR = path.join(process.cwd(), "public", "app");
  const SPA_AVAILABLE =
    process.env.QUILLBY_DEPLOYMENT_MODE === "self-hosted" &&
    fs.existsSync(path.join(SPA_DIR, "index.html"));
  const MIME_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".svg":  "image/svg+xml",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".ico":  "image/x-icon",
    ".json": "application/json; charset=utf-8",
    ".woff": "font/woff",
    ".woff2":"font/woff2",
    ".ttf":  "font/ttf",
    ".txt":  "text/plain; charset=utf-8",
  };

  const MCP_SESSION_TTL_MS = safeParseInt(process.env.QUILLBY_MCP_SESSION_TTL_MS, 24 * 60 * 60 * 1000);

  // Map of sessionId → transport, so we can route GET/DELETE back to the right session.
  const sessions = new Map<string, {
    transport: StreamableHTTPServerTransport;
    server: McpServer;
    userId: string;
    createdAt: number;
  }>();

  // Periodic MCP session cleanup — remove sessions older than TTL
  const sessionCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [sid, session] of sessions) {
      if (now - session.createdAt > MCP_SESSION_TTL_MS) {
        slog("info", "session_ttl_expired", { sessionId: sid, userId: session.userId });
        session.server.close().catch((err) => slog("warn", "session_close_error", { error: String(err) }));
        sessions.delete(sid);
      }
    }
  }, Math.min(MCP_SESSION_TTL_MS, 60_000));
  sessionCleanupTimer.unref();

  const toHeaders = (headers: http.IncomingHttpHeaders) => {
    const result = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          result.append(key, entry);
        }
      } else if (value !== undefined) {
        result.set(key, value);
      }
    }
    return result;
  };

  const readJsonBody = async <T>(req: http.IncomingMessage): Promise<T> => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      totalBytes += (chunk as Buffer).length;
      if (totalBytes > HTTP_BODY_LIMIT) {
        throw new Error("Payload too large");
      }
      chunks.push(chunk as Buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as T;
  };

  // ------------------------------------------------------------------
  // App sessions — in-memory session store for browser clients.
  // The API key is never stored; it is exchanged for a short-lived opaque
  // token that travels as an HttpOnly cookie, keeping the key out of
  // localStorage and JavaScript memory after the initial exchange.
  // ------------------------------------------------------------------
  const APP_SESSION_COOKIE = "qb-app-sess";
  const APP_SESSION_TTL_MS = safeParseInt(process.env.QUILLBY_APP_SESSION_TTL_MS, 7 * 24 * 60 * 60 * 1000);

  const appSessions = new Map<string, { userId: string; expiresAt: number }>();

  function parseCookies(req: http.IncomingMessage): Map<string, string> {
    const map = new Map<string, string>();
    for (const part of (req.headers.cookie ?? "").split(";")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      try {
        map.set(part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim()));
      } catch {
        logWarn("malformed cookie value in parseCookies");
      }
    }
    return map;
  }

  function buildSessionCookie(token: string, maxAge: number): string {
    const isSecure = BASE_URL.startsWith("https://");
    const secure = isSecure ? "; Secure" : "";
    const sameSite = isSecure ? "None" : "Lax";
    return `${APP_SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=${sameSite}; Max-Age=${maxAge}${secure}`;
  }

  const resolveAppAuth = async (req: http.IncomingMessage): Promise<{ userId: string; mode: "session" | "apiKey" } | null> => {
    // 1. App session cookie (browser clients after /api/app/connect exchange)
    const cookies = parseCookies(req);
    const sessionToken = cookies.get(APP_SESSION_COOKIE);
    if (sessionToken) {
      const appSession = appSessions.get(sessionToken);
      if (appSession && appSession.expiresAt > Date.now()) {
        // Touch — extend TTL on each access
        appSession.expiresAt = Date.now() + APP_SESSION_TTL_MS;
        return { userId: appSession.userId, mode: "session" };
      }
      // Expired or unknown — clean up lazily
      appSessions.delete(sessionToken);
    }

    // 2. Better Auth browser session (cloud mode)
    try {
      const session = await auth.api.getSession({
        headers: toHeaders(req.headers),
      });
      if (session?.user?.id) {
        return { userId: session.user.id, mode: "session" };
      }
    } catch {
      logWarn("Better Auth session check failed, falling back to API key");
    }

    // 3. Bearer API key (MCP clients and legacy)
    const authHeader = req.headers.authorization ?? "";
    const bearerMatch = authHeader.match(/^Bearer (.+)$/i);
    if (!bearerMatch) return null;

    const verification = await authApi.verifyApiKey(bearerMatch[1]);
    if (!verification.valid) return null;

    return {
      userId: verification.key?.referenceId ?? "unknown",
      mode: "apiKey",
    };
  };

  const mapCurationToAppStatus = (status?: "shortlisted" | "skipped" | "approved"): "pending" | "shortlisted" | "skipped" => {
    switch (status) {
      case "shortlisted":
      case "approved": // legacy — treat old 'approved' records as shortlisted
        return "shortlisted";
      case "skipped":
        return "skipped";
      default:
        return "pending";
    }
  };

  const mapAppStatusToCurationAction = (status: "shortlisted" | "skipped"): "shortlist" | "skip" => {
    switch (status) {
      case "shortlisted":
        return "shortlist";
      case "skipped":
      default:
        return "skip";
    }
  };

  const httpServer = http.createServer(async (req, res) => {
    const start = Date.now();
    const url = new URL(req.url ?? "/", BASE_URL);

    const finish = (status: number) =>
      slog("info", "request", { method: req.method, path: url.pathname, status, ms: Date.now() - start });

    // ------------------------------------------------------------------
    // CORS — allow browser-based MCP App to connect from any origin
    // ------------------------------------------------------------------
    const allowedOrigin = process.env.QUILLBY_CORS_ORIGIN ?? "*";
    const requestOrigin = req.headers.origin;
    const corsOrigin = allowedOrigin === "*" && requestOrigin ? requestOrigin : allowedOrigin;
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    try {
      // Security headers (applied to all responses)
      applySecurityHeaders(res, BASE_URL);

      // Method validation — reject unsupported HTTP methods early
      const methodError = validateMethod(req);
      if (methodError) {
        sendJsonError(res, 405, methodError);
        finish(405);
        return;
      }

      // Content-Type validation for POST/PUT with body
      const contentTypeError = validateContentType(req);
      if (contentTypeError) {
        sendJsonError(res, 415, contentTypeError);
        finish(415);
        return;
      }

      // Per-IP rate limiting for non-MCP routes (MCP has its own API-key rate limiting via better-auth)
      if (url.pathname !== "/mcp") {
        const clientIp = req.socket.remoteAddress ?? "unknown";
        const rateLimit = checkRateLimit(clientIp);
        if (!rateLimit.allowed) {
          const retryAfter = Math.max(1, Math.ceil(rateLimit.resetMs / 1000));
          res.setHeader("Retry-After", retryAfter.toString());
          sendJsonError(res, 429, "Too many requests");
          finish(429);
          return;
        }
        res.setHeader("X-RateLimit-Remaining", rateLimit.remaining.toString());
      }

      // ------------------------------------------------------------------
      // Health check — unauthenticated, fast
      // ------------------------------------------------------------------
      if (url.pathname === "/health" && req.method === "GET") {
        sendJsonSuccess(res, { status: "ok", version: PKG.version, uptime: Math.floor(process.uptime()), sessions: sessions.size });
        finish(200);
        return;
      }

      // ------------------------------------------------------------------
      // A2A agent card — unauthenticated, discovery
      // ------------------------------------------------------------------
      if (url.pathname === "/.well-known/agent.json" && req.method === "GET") {
        const agentCard = {
          name: "Quillby",
          description: "Guided Research & Insight Synthesis Tool — RSS content intelligence MCP server. Fetches, scores, and structures articles into content cards for social media posts.",
          url: `${BASE_URL}/mcp`,
          version: PKG.version,
          capabilities: {
            streaming: true,
            pushNotifications: false,
            stateTransitionHistory: false,
          },
          authentication: {
            schemes: ["Bearer"],
          },
          defaultInputModes: ["application/json"],
          defaultOutputModes: ["application/json"],
          skills: [
            {
              id: "content_harvest",
              name: "Content Harvest",
              description: "Open Quillby's daily editorial Briefing from the active workspace and ranked source coverage.",
              tags: ["rss", "content", "feeds", "articles"],
              examples: ["Open Quillby", "What's worth writing about today?"],
            },
            {
              id: "post_generation",
              name: "Post Generation",
              description: "Generate platform-specific social media posts from content cards using the user voice profile.",
              tags: ["linkedin", "twitter", "blog", "newsletter"],
              examples: ["Generate a LinkedIn post from card #3"],
            },
            {
              id: "feed_management",
              name: "Feed Management",
              description: "Discover, add, and list RSS feed sources.",
              tags: ["rss", "feeds", "discovery"],
              examples: ["Discover feeds for AI topics", "Add a new RSS feed"],
            },
          ],
        };
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }).end(JSON.stringify(agentCard, null, 2));
        finish(200);
        return;
      }

      // ------------------------------------------------------------------
      // better-auth route handler — sign-up, sign-in, key management
      // Mounted before /mcp so auth requests never hit the MCP auth gate.
      // ------------------------------------------------------------------
      if (url.pathname.startsWith("/api/auth")) {
        await toNodeHandler(auth)(req, res);
        finish(res.statusCode ?? 200);
        return;
      }

      // ------------------------------------------------------------------
      // Self-hosted session exchange — unauthenticated endpoints.
      // POST: validate API key, issue HttpOnly session cookie.
      // DELETE: revoke session, clear cookie.
      // These must be carved out BEFORE the authenticated /api/app block.
      // ------------------------------------------------------------------
      if (url.pathname === "/api/app/connect") {
        if (req.method === "POST") {
          const parsed = validateBody(ConnectBodySchema, await readJsonBody(req));
          if (!parsed.ok) {
            sendJsonError(res, 400, parsed.error);
            finish(400);
            return;
          }
          const body = parsed.data;
          const verification = await authApi.verifyApiKey(body.apiKey);
          if (!verification.valid) {
            sendJsonError(res, 401, "Invalid API key");
            finish(401);
            return;
          }
          const userId = verification.key?.referenceId ?? "unknown";
          // Two UUIDs concatenated for extra entropy — 256 bits total.
          const token = `${randomUUID()}-${randomUUID()}`;
          appSessions.set(token, { userId, expiresAt: Date.now() + APP_SESSION_TTL_MS });
          res.setHeader("Set-Cookie", buildSessionCookie(token, APP_SESSION_TTL_MS / 1000));
          sendJsonSuccess(res, {});
          finish(200);
          return;
        }
        if (req.method === "DELETE") {
          const cookies = parseCookies(req);
          const sessionToken = cookies.get(APP_SESSION_COOKIE);
          if (sessionToken) appSessions.delete(sessionToken);
          res.setHeader("Set-Cookie", buildSessionCookie("", 0));
          res.writeHead(204).end();
          finish(204);
          return;
        }
        res.writeHead(405).end("Method not allowed");
        finish(405);
        return;
      }

      if (url.pathname.startsWith("/api/app")) {
        const authState = await resolveAppAuth(req);
        if (!authState) {
          sendJsonError(res, 401, "Unauthorized");
          finish(401);
          return;
        }

        const storage = getHostedUserStorage(authState.userId, DRIZZLE_MIGRATIONS_DIR);
        const workspaceId = url.searchParams.get("workspaceId") ?? undefined;
        const activeStorage = workspaceId ? await storage.withWorkspace(workspaceId) : storage;

        if (url.pathname === "/api/app/workspaces" && req.method === "GET") {
          const currentWorkspaceId = await storage.getCurrentWorkspaceId();
          const workspaces = (await storage.listWorkspaces()).map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            createdAt: workspace.createdAt,
            isActive: workspace.id === currentWorkspaceId,
          }));
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ currentWorkspaceId, workspaces }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/workspaces/select" && req.method === "POST") {
          const parsed = validateBody(SelectWorkspaceBodySchema, await readJsonBody(req));
          if (!parsed.ok) {
            sendJsonError(res, 400, parsed.error);
            finish(400);
            return;
          }
          const workspace = await storage.setCurrentWorkspace(parsed.data.workspaceId);
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(workspace));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/cards" && req.method === "GET") {
          if (!await activeStorage.latestHarvestExists()) {
            res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ cards: [] }));
            finish(200);
            return;
          }

          const queryParsed = validateQuery(CardsQuerySchema, url);
          if (!queryParsed.ok) {
            sendJsonError(res, 400, queryParsed.error);
            finish(400);
            return;
          }
          const { status: requestedStatus } = queryParsed.data;
          const bundle = await activeStorage.loadLatestHarvest();
          const curation = bundle.curationState ?? {};
          const currentWorkspace = workspaceId ? null : await activeStorage.getCurrentWorkspace();
          const cards = bundle.cards
            .map((card) => ({
              id: String(card.id),
              title: card.title,
              source: card.source,
              url: card.link,
              score: card.relevanceScore,
              summary: card.thesis,
              curationStatus: mapCurationToAppStatus(curation[String(card.id)]),
              createdAt: bundle.generatedAt,
              workspaceId: workspaceId ?? currentWorkspace?.id,
            }))
            .filter((card) => !requestedStatus || requestedStatus === "all" || card.curationStatus === requestedStatus)
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ cards }));
          finish(200);
          return;
        }

          if (url.pathname === "/api/app/cards/curate" && req.method === "POST") {
          const parsed = validateBody(CurateCardBodySchema, await readJsonBody(req));
          if (!parsed.ok) {
            sendJsonError(res, 400, parsed.error);
            finish(400);
            return;
          }
          const body = parsed.data;
          const targetStorage = body.workspaceId ? await storage.withWorkspace(body.workspaceId) : storage;
          if (!await targetStorage.latestHarvestExists()) {
            sendJsonError(res, 404, "No harvest found for this workspace");
            finish(404);
            return;
          }
          const bundle = await targetStorage.loadLatestHarvest();
          const cardId = Number(body.cardId);
          const card = bundle.cards.find((entry) => entry.id === cardId);
          if (!card) {
            sendJsonError(res, 404, "Card not found");
            finish(404);
            return;
          }
          const action = mapAppStatusToCurationAction(body.status);
          const statusMap: Record<"shortlist" | "skip", "shortlisted" | "skipped"> = {
            shortlist: "shortlisted",
            skip: "skipped",
          };
          await targetStorage.saveCurationState({ [String(cardId)]: statusMap[action] });
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
            cardId: String(cardId),
            status: body.status,
            title: card.title,
          }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/drafts" && req.method === "GET") {
          const drafts = await activeStorage.listDrafts();
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
            drafts: drafts.map((d) => ({
              id: d.id,
              format: d.platform,
              content: d.content,
              createdAt: d.createdAt,
              cardId: d.cardId,
            })),
          }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/jobs" && req.method === "GET") {
          const queryParsed = validateQuery(JobsQuerySchema, url);
          if (!queryParsed.ok) {
            sendJsonError(res, 400, queryParsed.error);
            finish(400);
            return;
          }
          const { modality } = queryParsed.data;
          const storageWithJobs = activeStorage as WorkspaceStorage & JobStorage;
          const jobs = await storageWithJobs.listJobs(modality);
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ jobs }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/assets" && req.method === "GET") {
          const queryParsed = validateQuery(AssetsQuerySchema, url);
          if (!queryParsed.ok) {
            sendJsonError(res, 400, queryParsed.error);
            finish(400);
            return;
          }
          const { modality } = queryParsed.data;
          const storageWithJobs = activeStorage as WorkspaceStorage & JobStorage;
          const jobs = await storageWithJobs.listJobs(modality);
          const assets = jobs
            .filter((job) => job.status === "done" && job.outputRef)
            .map((job) => ({
              id: job.id,
              modality: job.modality,
              provider: job.provider,
              outputRef: job.outputRef,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
              mimeType: guessMimeType(job.modality, job.outputRef!, job.meta),
              assetUrl: /^https?:\/\//i.test(job.outputRef!)
                ? job.outputRef
                : `${url.origin}/api/app/assets/file?jobId=${encodeURIComponent(job.id)}${workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : ""}`,
            }))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ assets }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/assets/file" && req.method === "GET") {
          const queryParsed = validateQuery(AssetFileQuerySchema, url);
          if (!queryParsed.ok) {
            sendJsonError(res, 400, queryParsed.error);
            finish(400);
            return;
          }
          const { jobId } = queryParsed.data;
          const storageWithJobs = activeStorage as WorkspaceStorage & JobStorage;
          const job = await storageWithJobs.loadJob(jobId);
          if (!job?.outputRef) {
            sendJsonError(res, 404, "Asset not found");
            finish(404);
            return;
          }
          if (/^https?:\/\//i.test(job.outputRef)) {
            res.writeHead(302, { Location: job.outputRef }).end();
            finish(302);
            return;
          }
          // Path traversal protection — ensure outputRef resolves within data directory
          const resolvedPath = path.resolve(job.outputRef);
          const dataDir = path.resolve(CONFIG.DATA_DIR);
          if (!resolvedPath.startsWith(dataDir)) {
            sendJsonError(res, 403, "Forbidden");
            finish(403);
            return;
          }
          let realPath: string;
          try {
            realPath = fs.realpathSync(resolvedPath);
          } catch (err: unknown) {
            const isForbidden = err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "EACCES";
            if (isForbidden) {
              sendJsonError(res, 403, "Forbidden");
              finish(403);
            } else {
              sendJsonError(res, 404, "Asset file is missing");
              finish(404);
            }
            return;
          }
          if (!realPath.startsWith(dataDir)) {
            sendJsonError(res, 403, "Forbidden");
            finish(403);
            return;
          }
          const mimeType = guessMimeType(job.modality, job.outputRef, job.meta);
          res.writeHead(200, { "Content-Type": mimeType });
          fs.createReadStream(realPath).pipe(res);
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/plan" && req.method === "GET") {
          const plan = await storage.getPlan();
          const mode = deploymentMode;
          const limits = getPlanLimits(plan);
          const billingPortalUrl = getBillingPortalUrl();
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
            plan,
            mode,
            planEnforcementEnabled: isPlanEnforcementEnabled(),
            limits,
            billingPortalUrl,
          }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/provider-policy" && req.method === "GET") {
          const plan = await storage.getPlan();
          refreshProviderRouter();
          const report = getProviderPolicyReport(deploymentMode, providerRouter);
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
            ...report,
            plan,
          }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/providers-config" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
            config: getStoredProviderConfigSummary(),
          }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/providers-config" && req.method === "PUT") {
          const parsed = validateBody(SaveProviderConfigBodySchema, await readJsonBody(req));
          if (!parsed.ok) {
            sendJsonError(res, 400, parsed.error);
            finish(400);
            return;
          }
          const { modality, provider, apiKey, voiceId, groupId } = parsed.data;
          const saved = saveProviderConfig({ modality, provider, apiKey, voiceId, groupId }, deploymentMode);
          refreshProviderRouter();
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ saved, config: getStoredProviderConfigSummary() }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/providers-config" && req.method === "DELETE") {
          const parsed = validateBody(ClearProviderConfigBodySchema, await readJsonBody(req));
          if (!parsed.ok) {
            sendJsonError(res, 400, parsed.error);
            finish(400);
            return;
          }
          clearProviderConfig(parsed.data.modality);
          refreshProviderRouter();
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ config: getStoredProviderConfigSummary() }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/api-keys" && req.method === "GET") {
          const keys = await listApiKeysFromDb(db, apikeyTable, authState.userId);
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
            keys: keys.map(serializeApiKey),
          }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/api-keys" && req.method === "POST") {
          const parsed = validateBody(CreateApiKeyBodySchema, await readJsonBody(req));
          if (!parsed.ok) {
            sendJsonError(res, 400, parsed.error);
            finish(400);
            return;
          }
          const { name: keyName, rateLimitMax } = parsed.data;

          const effectiveLimit = rateLimitMax ?? parseInt(process.env.QUILLBY_RATE_LIMIT ?? "60", 10);

          const result = await authApi.createApiKey(authState.userId, keyName, effectiveLimit);
          const keys = await listApiKeysFromDb(db, apikeyTable, authState.userId);
          const meta = keys.find((entry: ListedApiKey) => entry.id === result.id);

          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
            key: result.key,
            meta: serializeApiKey(meta ?? { id: result.id, name: keyName, rateLimitMax, rateLimitTimeWindow: 60_000 }),
          }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/api-keys" && req.method === "DELETE") {
          const parsed = validateBody(DeleteApiKeyBodySchema, await readJsonBody(req));
          if (!parsed.ok) {
            sendJsonError(res, 400, parsed.error);
            finish(400);
            return;
          }
          await deleteApiKeyFromDb(db, apikeyTable, parsed.data.keyId);
          res.writeHead(204).end();
          finish(204);
          return;
        }

        // ── Profile (context) ──────────────────────────────────────────
        if (url.pathname === "/api/app/profile" && req.method === "GET") {
          const ctx = await activeStorage.loadContext();
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ profile: ctx ?? null }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/profile" && req.method === "PUT") {
          const parsed = validateBody(SaveProfileBodySchema, await readJsonBody(req));
          if (!parsed.ok) {
            sendJsonError(res, 400, parsed.error);
            finish(400);
            return;
          }
          const existing = await activeStorage.loadContext();
          const merged = { ...(existing ?? {}), ...parsed.data };
          await activeStorage.saveContext(merged as Parameters<typeof activeStorage.saveContext>[0]);
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ profile: merged }));
          finish(200);
          return;
        }

        // ── Memory ────────────────────────────────────────────────────
        if (url.pathname === "/api/app/memory" && req.method === "GET") {
          const mem = await activeStorage.loadTypedMemory();
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ memory: mem }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/memory/delete" && req.method === "POST") {
          const parsed = validateBody(MemoryDeleteBodySchema, await readJsonBody(req));
          if (!parsed.ok) {
            sendJsonError(res, 400, parsed.error);
            finish(400);
            return;
          }
          const { memoryType, index } = parsed.data;
          const mem = await activeStorage.loadTypedMemory();
          const bucket = memoryType as keyof typeof mem;
          if (!Array.isArray(mem[bucket])) {
            sendJsonError(res, 400, `Unknown memory type: ${memoryType}`);
            finish(400);
            return;
          }
          (mem[bucket] as string[]).splice(index, 1);
          await activeStorage.replaceTypedMemory(mem);
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ memory: mem }));
          finish(200);
          return;
        }

        // ── Feeds ────────────────────────────────────────────────────
        if (url.pathname === "/api/app/feeds" && req.method === "GET") {
          const urls = await activeStorage.loadSources();
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ feeds: urls }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/feeds" && req.method === "POST") {
          const parsed = validateBody(FeedUrlBodySchema, await readJsonBody(req));
          if (!parsed.ok) {
            sendJsonError(res, 400, parsed.error);
            finish(400);
            return;
          }
          const feedUrl = parsed.data.url;
          const existing = await activeStorage.loadSources();
          if (!existing.includes(feedUrl)) {
            await activeStorage.appendSources([feedUrl]);
          }
          const updated = await activeStorage.loadSources();
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ feeds: updated }));
          finish(200);
          return;
        }

        if (url.pathname === "/api/app/feeds" && req.method === "DELETE") {
          const parsed = validateBody(FeedUrlBodySchema, await readJsonBody(req));
          if (!parsed.ok) {
            sendJsonError(res, 400, parsed.error);
            finish(400);
            return;
          }
          const existing = await activeStorage.loadSources();
          await activeStorage.replaceSources(existing.filter((u) => u !== parsed.data.url));
          const updated = await activeStorage.loadSources();
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ feeds: updated }));
          finish(200);
          return;
        }

        sendJsonError(res, 404, "Not found");
        finish(404);
        return;
      }

      // ------------------------------------------------------------------
      // Cloud billing lifecycle endpoints (upgrade/downgrade/manage)
      // Requires Bearer API key; disabled outside cloud mode.
      // ------------------------------------------------------------------
      if (url.pathname.startsWith("/api/billing/") && req.method === "GET") {
        if (!isCloudMode()) {
          res.writeHead(404).end("Not found");
          finish(404);
          return;
        }
        const billingAuthState = await resolveAppAuth(req);
        if (!billingAuthState) {
          res.writeHead(401, { "WWW-Authenticate": 'Bearer realm="quillby-mcp"' }).end("Unauthorized");
          finish(401);
          return;
        }
        const userId = billingAuthState.userId;
        const userStorage = getHostedUserStorage(userId, DRIZZLE_MIGRATIONS_DIR);
        const plan = await userStorage.getPlan();

        const action = url.pathname.endsWith("/upgrade")
          ? "upgrade"
          : url.pathname.endsWith("/downgrade")
            ? "downgrade"
            : url.pathname.endsWith("/portal")
              ? "manage"
              : null;
        if (!action) {
          res.writeHead(404).end("Not found");
          finish(404);
          return;
        }

        const target = getBillingActionUrl(action, plan, userId);
        if (!target) {
          res.writeHead(501).end("Billing action not configured");
          finish(501);
          return;
        }
        res.writeHead(302, { Location: target }).end();
        finish(302);
        return;
      }

      // ------------------------------------------------------------------
      // Stripe webhook (cloud only) — syncs subscription status to plan.
      // ------------------------------------------------------------------
      if (url.pathname === "/api/billing/stripe/webhook" && req.method === "POST") {
        if (!isCloudMode()) {
          res.writeHead(404).end("Not found");
          finish(404);
          return;
        }
        const signature = req.headers["stripe-signature"];
        if (typeof signature !== "string") {
          res.writeHead(400).end("Missing stripe-signature header");
          finish(400);
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;
        for await (const chunk of req) {
          totalBytes += (chunk as Buffer).length;
          if (totalBytes > HTTP_BODY_LIMIT) {
            res.writeHead(413).end("Payload too large");
            finish(413);
            return;
          }
          chunks.push(chunk as Buffer);
        }
        const rawBody = Buffer.concat(chunks).toString("utf-8");
        const result = await applyStripeWebhookEvent(db, rawBody, signature);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ received: true, ...result }));
        finish(200);
        return;
      }

      if (url.pathname !== "/mcp") {
        // ── Bundled SPA (self-hosted mode) ──────────────────────────────────
        if (SPA_AVAILABLE && req.method === "GET") {
          const relPath = url.pathname === "/" ? "/index.html" : url.pathname;
          const candidate = path.join(SPA_DIR, relPath);
          // Defense-in-depth: ensure path resolves within SPA_DIR
          if (candidate.startsWith(SPA_DIR)) {
            let servePath = candidate;
            let isStaticFile = false;
            try { isStaticFile = fs.statSync(servePath).isFile(); } catch { logWarn("SPA file not found, serving index.html fallback"); }
            if (!isStaticFile) servePath = path.join(SPA_DIR, "index.html");
            const ext = path.extname(servePath).toLowerCase();
            const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
            res.writeHead(200, { "Content-Type": contentType }).end(fs.readFileSync(servePath));
            finish(200);
            return;
          }
        }
        res.writeHead(404).end("Not found");
        finish(404);
        return;
      }

      // ------------------------------------------------------------------
      // API key validation via better-auth
      // ------------------------------------------------------------------
      const authHeader = req.headers.authorization ?? "";
      const bearerMatch = authHeader.match(/^Bearer (.+)$/i);
      if (!bearerMatch) {
        res.writeHead(401, { "WWW-Authenticate": 'Bearer realm="quillby-mcp"' }).end("Unauthorized");
        finish(401);
        return;
      }

      const verification = await authApi.verifyApiKey(bearerMatch[1]);
      if (!verification.valid) {
        res.writeHead(401, { "WWW-Authenticate": 'Bearer realm="quillby-mcp"' }).end("Unauthorized");
        finish(401);
        return;
      }

      const userId: string = verification.key?.referenceId ?? "unknown";

      // ------------------------------------------------------------------
      // Route GET/DELETE to existing session transport
      // ------------------------------------------------------------------
      if (req.method === "GET" || req.method === "DELETE") {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (!sessionId || !sessions.has(sessionId)) {
          res.writeHead(400).end("Missing or unknown mcp-session-id");
          finish(400);
          return;
        }
        const session = sessions.get(sessionId)!;
        if (session.userId !== userId) {
          res.writeHead(403).end("Forbidden");
          finish(403);
          return;
        }
        await session.transport.handleRequest(req, res);
        finish(200);
        return;
      }

      // ------------------------------------------------------------------
      // POST — new or existing session
      // ------------------------------------------------------------------
      if (req.method === "POST") {
        // Read body with size limit
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        for await (const chunk of req) {
          totalBytes += (chunk as Buffer).length;
          if (totalBytes > HTTP_BODY_LIMIT) {
            res.writeHead(413).end("Payload too large");
            finish(413);
            return;
          }
          chunks.push(chunk as Buffer);
        }
        const body = Buffer.concat(chunks).toString("utf-8");
        let parsedBody: unknown;
        try { parsedBody = JSON.parse(body); } catch { logWarn("MCP request body is not valid JSON"); parsedBody = undefined; }

        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (sessionId && sessions.has(sessionId)) {
          const session = sessions.get(sessionId)!;
          if (session.userId !== userId) {
            res.writeHead(403).end("Forbidden");
            finish(403);
            return;
          }
          await session.transport.handleRequest(req, res, parsedBody);
          finish(200);
          return;
        }

        // New session
        const sessionServer = createMcpServer();
        const userStorage = getHostedUserStorage(userId, DRIZZLE_MIGRATIONS_DIR) as unknown as WorkspaceStorage & JobStorage & PlanStorage & SessionStore;
        registerMcpHandlers(sessionServer, userStorage);

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });
        const sid = transport.sessionId ?? randomUUID();
        sessions.set(sid, { transport, server: sessionServer, userId, createdAt: Date.now() });
        slog("info", "session_open", { sessionId: sid, userId, sessions: sessions.size });

        transport.onclose = () => {
          if (transport.sessionId) {
            const session = sessions.get(transport.sessionId);
            sessions.delete(transport.sessionId);
            session?.server.close().catch((err) => slog("warn", "session_close_error", { error: String(err) }));
            slog("info", "session_close", { sessionId: transport.sessionId, sessions: sessions.size });
          }
        };

        await sessionServer.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
        finish(200);
        return;
      }

      res.writeHead(405).end("Method not allowed");
      finish(405);
    } catch (err) {
      slog("error", "unhandled_error", { error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
      finish(500);
    }
  });

  // ------------------------------------------------------------------
  // Graceful shutdown
  // ------------------------------------------------------------------
  const shutdown = async (signal: string) => {
    slog("info", "shutdown", { signal });
    try {
      sessionCleanupTimer?.unref();
      await client.close();
      slog("info", "db_closed");
    } catch (err) {
      slog("warn", "db_close_error", { error: String(err) });
    }
    httpServer.close(() => {
      slog("info", "shutdown_complete");
      process.exit(0);
    });
    // Force exit after 10 s if connections are not drained
    setTimeout(() => {
      slog("warn", "shutdown_forced");
      process.exit(1);
    }, 10_000).unref();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  httpServer.listen(PORT, HOST, () => {
    slog("info", "listening", { host: HOST, port: PORT, url: `http://${HOST}:${PORT}/mcp` });
  });
} else {
  // Default: stdio (local MCP clients — Claude Desktop, VS Code, Cursor)
  // If QUILLBY_API_KEY is provided, verify it via Better Auth to resolve the
  // user, then use the same DB-backed storage as the HTTP server so all
  // workspaces are shared with the app. Falls back to local filesystem storage
  // when no key is provided (standalone / self-hosted use).
  // storage-fs dist typings can lag workspace interface fields; runtime object implements the required contract.
  let stdioStorage = storage as unknown as WorkspaceStorage & JobStorage & PlanStorage & SessionStore;
  if (isCloudMode()) await validateDbConnection();
  const rawApiKey = process.env.QUILLBY_API_KEY?.trim();
  if (rawApiKey && isCloudMode()) {
    const verification = await authApi.verifyApiKey(rawApiKey);
    if (!verification.valid) {
      logFatal("QUILLBY_API_KEY is invalid — aborting");
      process.exit(1);
    }
    const userId = verification.key?.referenceId;
    if (!userId) {
      logFatal("QUILLBY_API_KEY resolved no user — aborting");
      process.exit(1);
    }
    stdioStorage = getHostedUserStorage(userId, DRIZZLE_MIGRATIONS_DIR) as unknown as WorkspaceStorage & JobStorage & PlanStorage & SessionStore;
    logInfo("Authenticated via API key", { userId });
  }
  const server = createMcpServer();
  registerMcpHandlers(server, stdioStorage);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Wire Tier 1 MCP Sampling adapter now that we have a live server connection.
  // The sampling adapter delegates image/audio generation back to the host AI client
  // via the Server's createMessage() method (public API on the MCP Server class).
  try {
    const assetsDir = path.join(process.env.QUILLBY_HOME ?? process.env.HOME ?? "~", ".quillby", "assets");
    providerRouter.setTier1(new McpSamplingAdapter(server.server as SamplingHost, assetsDir));
  } catch (e) {
    logWarn("McpSamplingAdapter init failed (generation falls through to Tier 2)", { error: String(e) });
  }

  const stdioShutdown = async (signal: string) => {
    slog("info", "stdio_shutdown", { signal });
    try {
      await server.close();
    } catch (err) {
      slog("warn", "stdio_server_close_error", { error: String(err) });
    }
    try {
      await client.close();
    } catch (err) {
      slog("warn", "stdio_db_close_error", { error: String(err) });
    }
  };
  process.on("SIGTERM", () => void stdioShutdown("SIGTERM"));
  process.on("SIGINT", () => void stdioShutdown("SIGINT"));
}

// Recover orphaned jobs on startup.
{
  const recovered = await recoverOrphanedJobs(storage as import("@quillby/workspace").JobStorage);
  if (recovered > 0) logInfo("Recovered orphaned jobs", { count: recovered });
}

// Scheduled autonomous harvest — fires daily at QUILLBY_SCHEDULE (HH:MM local time).
// Runs regardless of transport mode but works best as an HTTP daemon.
// In stdio mode it only fires while an MCP client has the server open.
const QUILLBY_SCHEDULE = process.env.QUILLBY_SCHEDULE;
if (QUILLBY_SCHEDULE) {
  scheduleDaily(QUILLBY_SCHEDULE, runScheduledHarvest);
}
