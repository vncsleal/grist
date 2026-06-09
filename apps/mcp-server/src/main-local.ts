import "dotenv/config";
import * as path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpSamplingAdapter } from "@quillby/providers";
import type { SamplingHost } from "@quillby/providers";
import { storage } from "@quillby/storage-fs";
import { CONFIG } from "@quillby/config";
import { slog, logInfo, logWarn } from "./logger.js";
import { createMcpServer, registerMcpHandlers, recoverOrphanedJobs, runScheduledHarvest, scheduleDaily, validateEnv, providerRouter } from "./mcp/server.js";

async function main(): Promise<void> {
  validateEnv();
  const server = createMcpServer();
  registerMcpHandlers(server, storage);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const assetsDir = path.join(CONFIG.DATA_DIR, "assets");
  if (!server.server || typeof server.server.createMessage !== "function") {
    logWarn("MCP server does not support sampling");
  } else {
    // ARD: MCP SDK Server type doesn't expose createMessage
    providerRouter.setTier1(new McpSamplingAdapter(server.server as unknown as SamplingHost, assetsDir));
  }
  const recovered = await recoverOrphanedJobs(storage);
  if (recovered > 0) logInfo("Recovered orphaned jobs", { count: recovered });
  process.on("SIGTERM", () => { slog("info", "stdio_shutdown", { signal: "SIGTERM" }); server.close().catch((e) => logWarn("stdio_server_close_error", { error: String(e) })); });
  process.on("SIGINT", () => { slog("info", "stdio_shutdown", { signal: "SIGINT" }); server.close().catch((e) => logWarn("stdio_server_close_error", { error: String(e) })); });
  const sched = process.env.QUILLBY_SCHEDULE;
  if (sched) scheduleDaily(sched, () => runScheduledHarvest(storage));
}

main().catch((err) => { slog("fatal", "startup_error", { error: err instanceof Error ? err.message : String(err) }); process.exit(1); });
