import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { logWarn } from "../logger.js";
import { getDeploymentMode } from "../config.js";
import { ProviderRouter } from "@quillby/providers";
import { buildDirectAdaptersFromConfig } from "../provider-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _pkgCandidates = [path.resolve(__dirname, "package.json"), path.resolve(__dirname, "../package.json"), path.resolve(__dirname, "../../package.json"), path.resolve(__dirname, "../../../package.json")];
const _pkgPath = _pkgCandidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
if (!_pkgPath) throw new Error(`Cannot find package.json. Tried: ${_pkgCandidates.join(", ")}`);

export const PKG = JSON.parse(fs.readFileSync(_pkgPath!, "utf-8")) as { version: string };

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
