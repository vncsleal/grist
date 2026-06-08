import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { logWarn } from "../logger.js";
import { getDeploymentMode } from "../config.js";
import { ProviderRouter } from "@quillby/providers";
import { buildDirectAdaptersFromConfig } from "../provider-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readVersion(): string {
  if (process.env.QUILLBY_VERSION) return process.env.QUILLBY_VERSION;
  if (process.env.npm_package_version) return process.env.npm_package_version;
  const candidates = [
    path.resolve(__dirname, "package.json"),
    path.resolve(__dirname, "../package.json"),
    path.resolve(__dirname, "../../package.json"),
    path.resolve(__dirname, "../../../package.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.statSync(p).isFile()) {
        return JSON.parse(fs.readFileSync(p, "utf-8")).version;
      }
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") throw err;
    }
  }
  return "0.0.0";
}

export const PKG = { version: readVersion() };

let _router: ProviderRouter | null = null;
export function setProviderRouter(r: ProviderRouter): void { _router = r; }
export function getProviderRouter(): ProviderRouter {
  if (!_router) throw new Error("ProviderRouter not initialized — call setProviderRouter first");
  return _router;
}

export function refreshProviderRouter(): void {
  if (!_router) { logWarn("refreshProviderRouter called before ProviderRouter initialized"); return; }
  const mode = getDeploymentMode();
  if (mode !== "cloud") {
    _router.setTier3(buildDirectAdaptersFromConfig(mode));
  }
}
