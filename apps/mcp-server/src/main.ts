import { getDeploymentMode } from "@quillby/config";
import { logFatal } from "./logger.js";

const mode = getDeploymentMode();

try {
  switch (mode) {
    case "local":
      await import("./main-local.js");
      break;
    case "cloud":
      await import("./main-cloud.js");
      break;
    case "self-hosted":
      await import("./main-selfhosted.js");
      break;
    default:
      logFatal(`Unknown deployment mode: ${mode}`);
      process.exit(1);
  }
} catch (err) {
  logFatal(`Failed to load entrypoint for mode "${mode}": ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
