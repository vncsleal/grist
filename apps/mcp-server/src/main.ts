import { getDeploymentMode } from "@quillby/config";
import { logFatal } from "./logger.js";

const mode = getDeploymentMode();

try {
  switch (mode) {
    case "local":
      await import("./main-local.js");
      break;
    default:
      logFatal(`Deployment mode "${mode}" is not implemented yet. Use local mode.`);
      process.exit(1);
  }
} catch (err) {
  logFatal(`Failed to load entrypoint for mode "${mode}": ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
