import * as fs from "fs";
import * as path from "path";
import { CONFIG, ensureDataDir, ensureDir } from "@quillby/config";
import { logWarn } from "./log.js";
import { TypedMemorySchema, UserContextSchema, WorkspaceMetadataSchema, NotFoundError, ValidationError } from "@quillby/core";

import type { TypedMemory, UserContext, WorkspaceMetadata } from "@quillby/core";

export const DEFAULT_WORKSPACE_ID = "default";

export function slugifyWorkspaceId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || DEFAULT_WORKSPACE_ID;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function getWorkspaceDir(workspaceId: string): string {
  return path.join(CONFIG.FILES.WORKSPACES_DIR, workspaceId);
}

export function getWorkspacePaths(workspaceId: string) {
  const root = getWorkspaceDir(workspaceId);
  return {
    root,
    meta: path.join(root, "workspace.json"),
    context: path.join(root, "context.json"),
    sources: path.join(root, "rss_sources.txt"),
    outputDir: path.join(root, "output"),
    cacheDir: path.join(root, ".cache"),
    cache: path.join(root, ".cache", "seen_urls.json"),
    latestHarvestPointer: path.join(root, ".cache", "latest_harvest_path.txt"),
    memoryDir: path.join(root, "memory"),
    typedMemory: path.join(root, "memory", "typed-memory.json"),
    plansDir: path.join(root, "plans"),
    sessionsDir: path.join(root, "memory", "sessions"),
    campaignsDir: path.join(root, "campaigns"),
  };
}

function ensureWorkspaceDirs(workspaceId: string) {
  const paths = getWorkspacePaths(workspaceId);
  ensureDataDir();
  ensureDir(paths.root);
  ensureDir(paths.outputDir);
  ensureDir(paths.cacheDir);
  ensureDir(paths.memoryDir);
  ensureDir(paths.plansDir);
  ensureDir(paths.sessionsDir);
  ensureDir(paths.campaignsDir);
}

function writeWorkspaceMeta(meta: WorkspaceMetadata) {
  const parsed = WorkspaceMetadataSchema.parse(meta);
  const paths = getWorkspacePaths(parsed.id);
  ensureWorkspaceDirs(parsed.id);
  fs.writeFileSync(paths.meta, JSON.stringify(parsed, null, 2));
}

export function ensureWorkspaceSystem() {
  ensureDataDir();
  if (listWorkspaces().length === 0) {
    createWorkspace({
      id: DEFAULT_WORKSPACE_ID,
      name: "Default Workspace",
      description: "Primary Quillby workspace.",
      makeCurrent: true,
    });
  }
}

export function listWorkspaces(): WorkspaceMetadata[] {
  ensureDataDir();
  if (!fs.existsSync(CONFIG.FILES.WORKSPACES_DIR)) return [];
  return fs
    .readdirSync(CONFIG.FILES.WORKSPACES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const metaPath = getWorkspacePaths(entry.name).meta;
      if (fs.existsSync(metaPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          return WorkspaceMetadataSchema.parse(raw);
        } catch {
          logWarn("Corrupted workspace metadata, rebuilding", { workspaceId: entry.name });
        }
      }
      const fallback: WorkspaceMetadata = {
        id: entry.name,
        name: entry.name,
        description: "",
        cloneConsentGranted: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      writeWorkspaceMeta(fallback);
      return fallback;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function workspaceExists(workspaceId: string): boolean {
  return fs.existsSync(getWorkspacePaths(workspaceId).meta);
}

export function loadWorkspace(workspaceId: string): WorkspaceMetadata | null {
  const metaPath = getWorkspacePaths(workspaceId).meta;
  if (!fs.existsSync(metaPath)) return null;
  try {
    return WorkspaceMetadataSchema.parse(JSON.parse(fs.readFileSync(metaPath, "utf-8")));
  } catch {
    logWarn("Corrupted workspace metadata, returning null", { workspaceId });
    return null;
  }
}

export function getCurrentWorkspaceId(): string {
  ensureWorkspaceSystem();
  if (fs.existsSync(CONFIG.FILES.CURRENT_WORKSPACE)) {
    const workspaceId = fs.readFileSync(CONFIG.FILES.CURRENT_WORKSPACE, "utf-8").trim();
    if (workspaceId && workspaceExists(workspaceId)) return workspaceId;
  }
  const fallback = listWorkspaces()[0]?.id ?? DEFAULT_WORKSPACE_ID;
  setCurrentWorkspace(fallback);
  return fallback;
}

export function getCurrentWorkspace(): WorkspaceMetadata {
  return loadWorkspace(getCurrentWorkspaceId()) ?? createWorkspace({ id: DEFAULT_WORKSPACE_ID, name: "Default Workspace", makeCurrent: true });
}

export function setCurrentWorkspace(workspaceId: string): WorkspaceMetadata {
  ensureWorkspaceSystem();
  const workspace = loadWorkspace(workspaceId);
  if (!workspace) {
    throw new NotFoundError(`Workspace "${workspaceId}" not found.`, { workspaceId });
  }
  fs.writeFileSync(CONFIG.FILES.CURRENT_WORKSPACE, workspaceId);
  return workspace;
}

export function createWorkspace(input: {
  id?: string;
  name: string;
  description?: string;
  makeCurrent?: boolean;
  createdAt?: string;
}): WorkspaceMetadata {
  ensureDataDir();
  const workspaceId = slugifyWorkspaceId(input.id ?? input.name);
  if (workspaceExists(workspaceId)) {
    throw new ValidationError(`Workspace "${workspaceId}" already exists.`, { workspaceId });
  }
  const createdAt = input.createdAt ?? nowIso();
  const meta: WorkspaceMetadata = {
    id: workspaceId,
    name: input.name.trim() || workspaceId,
    description: input.description?.trim() ?? "",
    cloneConsentGranted: false,
    createdAt,
    updatedAt: createdAt,
  };
  ensureWorkspaceDirs(workspaceId);
  writeWorkspaceMeta(meta);
  saveTypedMemory(workspaceId, {});
  if (input.makeCurrent) setCurrentWorkspace(workspaceId);
  return meta;
}

export function touchWorkspace(workspaceId: string) {
  const existing = loadWorkspace(workspaceId);
  if (!existing) return;
  writeWorkspaceMeta({ ...existing, updatedAt: nowIso() });
}

// TODO: Encrypt biometric PII (faceReferenceImageUrl, voiceReferenceAudioUrl)
// at rest when writing to workspace.json. Hosted DB storage applies AES-256-GCM;
// local filesystem is inherently local-only so the risk is lower.
export function updateWorkspaceMetadata(workspaceId: string, patch: Partial<WorkspaceMetadata>): WorkspaceMetadata {
  const existing = loadWorkspace(workspaceId);
  if (!existing) {
    throw new NotFoundError(`Workspace "${workspaceId}" not found.`, { workspaceId });
  }

  const next: WorkspaceMetadata = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  };
  writeWorkspaceMeta(next);
  return next;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export function workspaceContextExists(workspaceId: string): boolean {
  return fs.existsSync(getWorkspacePaths(workspaceId).context);
}

export function loadWorkspaceContext(workspaceId: string): UserContext | null {
  const file = getWorkspacePaths(workspaceId).context;
  if (!fs.existsSync(file)) return null;
  try {
    return UserContextSchema.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    logWarn("Corrupted context file, returning null", { workspaceId });
    return null;
  }
}

export function saveWorkspaceContext(workspaceId: string, ctx: UserContext) {
  const file = getWorkspacePaths(workspaceId).context;
  ensureWorkspaceDirs(workspaceId);
  fs.writeFileSync(file, JSON.stringify(UserContextSchema.parse(ctx), null, 2));
  touchWorkspace(workspaceId);
}

// ─── Typed memory ─────────────────────────────────────────────────────────────

export function loadTypedMemory(workspaceId: string): TypedMemory {
  const file = getWorkspacePaths(workspaceId).typedMemory;
  if (!fs.existsSync(file)) return TypedMemorySchema.parse({});
  try {
    return TypedMemorySchema.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    logWarn("Corrupted typed memory file, returning empty", { workspaceId });
    return TypedMemorySchema.parse({});
  }
}

export function saveTypedMemory(workspaceId: string, partial: Partial<TypedMemory>) {
  const current = loadTypedMemory(workspaceId);
  const next = TypedMemorySchema.parse({ ...current, ...partial });
  const file = getWorkspacePaths(workspaceId).typedMemory;
  ensureWorkspaceDirs(workspaceId);
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  touchWorkspace(workspaceId);
}

export function appendTypedMemory(
  workspaceId: string,
  memoryType: keyof TypedMemory,
  entries: string[],
  limit?: number
) {
  const current = loadTypedMemory(workspaceId);
  const existing = current[memoryType];
  const deduped = [...new Set([...entries, ...existing].map((entry) => entry.trim()).filter(Boolean))];
  const next = limit != null ? deduped.slice(0, limit) : deduped;
  saveTypedMemory(workspaceId, typedMemoryPatch(memoryType, next));
}

// TypeScript cannot infer the return type from computed property keys with generics.
// This cast is necessary because `{ [key]: value }` always evaluates to `{ [x: string]: T }`,
// losing the specific key information. The type guard on `key` (K extends keyof TypedMemory)
// and `value` (TypedMemory[K]) ensures runtime type safety.
function typedMemoryPatch<K extends keyof TypedMemory>(key: K, value: TypedMemory[K]): Pick<TypedMemory, K> {
  return { [key]: value } as Pick<TypedMemory, K>;
}

// ─── Sources ──────────────────────────────────────────────────────────────────

export function loadSources(workspaceId: string): string[] {
  const file = getWorkspacePaths(workspaceId).sources;
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
}

export function appendSources(
  workspaceId: string,
  newUrls: string[]
): { added: number; skipped: number } {
  const sourcesFile = getWorkspacePaths(workspaceId).sources;
  const existing = new Set(loadSources(workspaceId));
  const toAdd = newUrls.filter((u) => u.trim() && !existing.has(u.trim()));

  if (toAdd.length === 0) return { added: 0, skipped: newUrls.length };

  ensureDir(getWorkspacePaths(workspaceId).root);
  const header = !fs.existsSync(sourcesFile) ? "# Quillby RSS Sources\n\n" : "";
  fs.appendFileSync(sourcesFile, header + toAdd.join("\n") + "\n");
  touchWorkspace(workspaceId);

  return { added: toAdd.length, skipped: newUrls.length - toAdd.length };
}

export function replaceSources(workspaceId: string, urls: string[]): void {
  const sourcesFile = getWorkspacePaths(workspaceId).sources;
  ensureDir(getWorkspacePaths(workspaceId).root);
  const filtered = urls.map((u) => u.trim()).filter((u) => u && !u.startsWith("#"));
  fs.writeFileSync(sourcesFile, "# Quillby RSS Sources\n\n" + filtered.join("\n") + (filtered.length ? "\n" : ""));
  touchWorkspace(workspaceId);
}

// ─── Seen URL cache ───────────────────────────────────────────────────────────

export function getSeenUrls(workspaceId: string): Set<string> {
  const cacheFile = getWorkspacePaths(workspaceId).cache;
  try {
    if (fs.existsSync(cacheFile)) {
      const raw = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
      const list: string[] = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
      return new Set(list);
    }
  } catch {
    logWarn("Corrupted seen-URLs cache, rebuilding from scratch", { workspaceId });
  }
  return new Set();
}

export function saveSeenUrls(workspaceId: string, urls: Set<string>) {
  const paths = getWorkspacePaths(workspaceId);
  ensureDir(paths.cacheDir);
  fs.writeFileSync(paths.cache, JSON.stringify([...urls], null, 2));
}
