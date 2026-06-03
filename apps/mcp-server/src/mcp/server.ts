import "dotenv/config";
import { slog, logInfo, logWarn, logError, logFatal } from "../logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { storage, type WorkspaceStorage, type JobStorage } from "@quillby/storage-fs";
import { getDeploymentMode } from "../config.js";
import { ProviderRouter } from "@quillby/providers";
import type { PlanStorage, SessionStore } from "@quillby/workspace";
import type { ToolResult } from "./tools/index.js";
import { PKG, refreshProviderRouter, setProviderRouter } from "./shared.js";

import { tool as sessionTool, handleTool as handleSessionTool } from "./tools/session.js";
import { tool as draftsTool, handleTool as handleDraftsTool } from "./tools/drafts.js";
import { tool as memoryTool, handleTool as handleMemoryTool } from "./tools/memory.js";
import { tool as feedsTool, handleTool as handleFeedsTool } from "./tools/feeds.js";
import { tool as workspaceTool, handleTool as handleWorkspaceTool } from "./tools/workspace.js";
import { tool as briefingTool, handleTool as handleBriefingTool } from "./tools/briefing.js";
import { tool as cardsTool, handleTool as handleCardsTool } from "./tools/cards.js";
import { tool as campaignTool, handleTool as handleCampaignTool } from "./tools/campaign.js";
import { tool as planningTool, handleTool as handlePlanningTool } from "./tools/planning.js";
import { tool as generateTool, handleTool as handleGenerateTool } from "./tools/generate.js";
import { tool as serverTool, handleTool as handleServerTool } from "./tools/server.js";

process.on("uncaughtException", (err) => {
  slog("fatal", "uncaught_exception", { error: err.message, stack: err.stack ?? undefined });
  setTimeout(() => process.exit(1), 5_000).unref();
});
process.on("unhandledRejection", (reason) => {
  slog("error", "unhandled_rejection", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack ?? undefined : undefined,
  });
});

export type SampleResult =
  | { ok: true; text: string }
  | { ok: false; reason: "unsupported" | "non_text_response" | "error"; error?: string };

async function sample(server: McpServer, prompt: string, maxTokens = 4096): Promise<SampleResult> {
  const caps = server.server.getClientCapabilities();
  if (!caps?.sampling) return { ok: false, reason: "unsupported" };
  try {
    const result = await server.server.createMessage({
      messages: [{ role: "user", content: { type: "text", text: prompt } }],
      maxTokens,
    });
    if (result.content.type === "text") return { ok: true, text: result.content.text };
    return { ok: false, reason: "non_text_response" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logWarn("MCP Sampling createMessage failed", { error: msg });
    return { ok: false, reason: "error", error: msg };
  }
}

const providerRouter = new ProviderRouter();
setProviderRouter(providerRouter);
const deploymentMode = getDeploymentMode();
const SERVER_INFO = { name: "quillby-mcp", version: PKG.version } as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) { logFatal(`Missing required env: ${name}`); process.exit(1); }
  return value;
}

function validateEnv(): void {
  const mode = getDeploymentMode();
  if (mode === "self-hosted" || mode === "cloud") {
    requireEnv("BETTER_AUTH_SECRET");
    const dbUrl = process.env.QUILLBY_AUTH_DB_URL?.trim() ?? "file:./quillby-auth.db";
    if (!dbUrl.startsWith("file:") && !dbUrl.startsWith("libsql://")) { logFatal(`QUILLBY_AUTH_DB_URL must start with 'file:' or 'libsql://'`); process.exit(1); }
  }
}

function createMcpServer(): McpServer {
  return new McpServer(SERVER_INFO, { capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} } });
}

async function recoverOrphanedJobs(storage: import("@quillby/workspace").JobStorage): Promise<number> {
  const jobs = await storage.listJobs();
  const cutoff = Date.now() - 5 * 60 * 1000;
  let recovered = 0;
  for (const job of jobs) {
    if ((job.status === "running" || job.status === "queued") && new Date(job.updatedAt).getTime() < cutoff) {
      await storage.updateJob(job.id, { status: "failed", error: "Job runner recovered: orphaned job was abandoned." });
      recovered++;
    }
  }
  return recovered;
}

async function runScheduledHarvest(): Promise<void> {
  const tag = "[quillby-schedule]";
  if (!await storage.contextExists()) { logInfo("No profile saved — skipping harvest", { tag }); return; }
  const ctx = (await storage.loadContext())!;
  const sources = await storage.loadSources();
  if (sources.length === 0) { logInfo("No feeds configured — skipping harvest", { tag }); return; }
  const { fetchArticles, preScoreArticles } = await import("../agents/harvest.js");
  const { CardInputSchema } = await import("../types.js");
  const topN = parseInt(process.env.QUILLBY_SCHEDULE_TOP_N ?? "15", 10);
  try {
    const { articles, seenUrls } = await fetchArticles(sources, await storage.getSeenUrls(), (msg) => logInfo(msg, { tag }), true);
    await storage.saveSeenUrls(seenUrls);
    if (articles.length === 0) { logInfo("No new articles", { tag }); return; }
    const top = preScoreArticles(articles, ctx.topics).slice(0, topN);
    const cards = top.map((a) => CardInputSchema.parse({
      title: a.title ?? "Untitled",
      source: (() => { try { return new URL(a.link).hostname; } catch { return a.link; } })(),
      link: a.link, thesis: a.snippet ?? a.title ?? "", trendTags: [],
    }));
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
  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) { logError("Invalid QUILLBY_SCHEDULE format", { timeStr }); return; }
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

async function handleToolCall(server: McpServer, storage: WorkspaceStorage, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  try {
    const ctx = { server, storage, deploymentMode, providerRouter, sample: (prompt: string, maxTokens?: number) => sample(server, prompt, maxTokens) };
    switch (name) {
      case "workspace": return handleWorkspaceTool(args, ctx);
      case "feeds": return handleFeedsTool(args, ctx);
      case "briefing": return handleBriefingTool(args, ctx);
      case "cards": return handleCardsTool(args, ctx);
      case "drafts": return handleDraftsTool(args, ctx);
      case "memory": return handleMemoryTool(args, ctx);
      case "campaign": return handleCampaignTool(args, ctx);
      case "planning": return handlePlanningTool(args, ctx);
      case "generate": return handleGenerateTool(args, ctx);
      case "session": return handleSessionTool(args, ctx);
      case "server": return handleServerTool(args, ctx);
      default: return { content: [{ type: "text" as const, text: `Unknown tool: ${name}` }], isError: true, structuredContent: { error: "unknown_tool", toolName: name } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true, structuredContent: { error: message } };
  }
}

const TOOLS = [sessionTool, draftsTool, memoryTool, feedsTool, workspaceTool, briefingTool, cardsTool, campaignTool, planningTool, generateTool, serverTool] as const;

function registerMcpHandlers(server: McpServer, storage: WorkspaceStorage & JobStorage & PlanStorage & SessionStore): void {
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema as never) as Record<string, unknown>,
    })),
  }));
  server.server.setRequestHandler(CallToolRequestSchema, async (req) => handleToolCall(server, storage, req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>));
}

export { createMcpServer, registerMcpHandlers, handleToolCall, sample, refreshProviderRouter, recoverOrphanedJobs, runScheduledHarvest, scheduleDaily, validateEnv, providerRouter, deploymentMode, PKG, TOOLS };
