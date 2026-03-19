import * as fs from "fs";
import { ensureDir, readTextFile } from "../config.js";
import { getCurrentWorkspaceId, getWorkspacePaths, touchWorkspace } from "../workspaces.js";

/**
 * Load current RSS sources from file. Returns empty array if file missing.
 */
export function loadSources(): string[] {
  try {
    return readTextFile(getWorkspacePaths(getCurrentWorkspaceId()).sources)
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#"));
  } catch {
    return [];
  }
}

/**
 * Append new feed URLs to the sources file, deduplicating against existing entries.
 */
export function appendSources(newUrls: string[]): { added: number; skipped: number } {
  const sourcesFile = getWorkspacePaths(getCurrentWorkspaceId()).sources;
  const existing = new Set(loadSources());
  const toAdd = newUrls.filter((u) => u.trim() && !existing.has(u.trim()));

  if (toAdd.length === 0) return { added: 0, skipped: newUrls.length };

  ensureDir(getWorkspacePaths(getCurrentWorkspaceId()).root);
  const header = !fs.existsSync(sourcesFile)
    ? "# Quillby RSS Sources\n\n"
    : "";

  fs.appendFileSync(sourcesFile, header + toAdd.join("\n") + "\n");
  touchWorkspace(getCurrentWorkspaceId());

  return { added: toAdd.length, skipped: newUrls.length - toAdd.length };
}

/**
 * Replace the entire sources file with a new list.
 */
export function replaceSources(urls: string[]): void {
  const sourcesFile = getWorkspacePaths(getCurrentWorkspaceId()).sources;
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  ensureDir(getWorkspacePaths(getCurrentWorkspaceId()).root);
  fs.writeFileSync(sourcesFile, "# Quillby RSS Sources\n\n" + unique.join("\n") + "\n");
  touchWorkspace(getCurrentWorkspaceId());
}
