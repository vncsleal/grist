import "dotenv/config";
import * as path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpSamplingAdapter } from "@quillby/providers";
import type { SamplingHost } from "@quillby/providers";
import { storage } from "@quillby/storage-fs";
import type { WorkspaceStorage, JobStorage, PlanStorage, SessionStore, CampaignStore } from "@quillby/storage-fs";
import { CONFIG } from "@quillby/config";
import { slog, logInfo, logWarn } from "./logger.js";
import { createMcpServer, registerMcpHandlers, recoverOrphanedJobs, runScheduledHarvest, scheduleDaily, validateEnv, providerRouter } from "./mcp/server.js";

const combinedStorage = storage as WorkspaceStorage & JobStorage & PlanStorage & SessionStore & CampaignStore;

async function main(): Promise<void> {
  validateEnv();
  const server = createMcpServer();
  registerMcpHandlers(server, combinedStorage);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  try {
    const assetsDir = path.join(CONFIG.DATA_DIR, "assets");
    providerRouter.setTier1(new McpSamplingAdapter(server.server as unknown as SamplingHost, assetsDir));
  } catch (e) {
    logWarn("McpSamplingAdapter init failed", { error: String(e) });
  }
  const recovered = await recoverOrphanedJobs(combinedStorage);
  if (recovered > 0) logInfo("Recovered orphaned jobs", { count: recovered });
  process.on("SIGTERM", () => { slog("info", "stdio_shutdown", { signal: "SIGTERM" }); server.close().catch((e) => logWarn("stdio_server_close_error", { error: String(e) })); });
  process.on("SIGINT", () => { slog("info", "stdio_shutdown", { signal: "SIGINT" }); server.close().catch((e) => logWarn("stdio_server_close_error", { error: String(e) })); });
  const sched = process.env.QUILLBY_SCHEDULE;
  if (sched) scheduleDaily(sched, runScheduledHarvest);
}

main().catch((err) => { slog("fatal", "startup_error", { error: err instanceof Error ? err.message : String(err) }); process.exit(1); });
