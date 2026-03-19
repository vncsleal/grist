import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { CONFIG, ensureDataDir, ensureDir } from "./config.js";
import {
  TypedMemorySchema,
  UserContextSchema,
  WorkspaceMetadataSchema,
  type TypedMemory,
  type UserContext,
  type WorkspaceMetadata,
} from "./types.js";

const DEFAULT_WORKSPACE_ID = "default";

function slugifyWorkspaceId(value: string): string {
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
  };
}

function ensureWorkspaceDirs(workspaceId: string) {
  const paths = getWorkspacePaths(workspaceId);
  ensureDataDir();
  ensureDir(paths.root);
  ensureDir(paths.outputDir);
  ensureDir(paths.cacheDir);
  ensureDir(paths.memoryDir);
}

function writeWorkspaceMeta(meta: WorkspaceMetadata) {
  const parsed = WorkspaceMetadataSchema.parse(meta);
  const paths = getWorkspacePaths(parsed.id);
  ensureWorkspaceDirs(parsed.id);
  fs.writeFileSync(paths.meta, JSON.stringify(parsed, null, 2));
}

function migrateLegacyStateIntoDefaultWorkspace() {
  const legacyFiles = [
    CONFIG.FILES.CONTEXT,
    CONFIG.FILES.MEMORY,
    CONFIG.FILES.SOURCES,
    CONFIG.FILES.CACHE,
  ];
  const hasLegacyState = legacyFiles.some((file) => fs.existsSync(file));
  if (!hasLegacyState || listWorkspaces().length > 0) return;

  const createdAt = nowIso();
  createWorkspace({
    id: DEFAULT_WORKSPACE_ID,
    name: "Default Workspace",
    description: "Migrated from Quillby's legacy single-profile storage.",
    makeCurrent: true,
    createdAt,
  });

  const paths = getWorkspacePaths(DEFAULT_WORKSPACE_ID);
  if (fs.existsSync(CONFIG.FILES.CONTEXT) && !fs.existsSync(paths.context)) {
    fs.copyFileSync(CONFIG.FILES.CONTEXT, paths.context);
  }
  if (fs.existsSync(CONFIG.FILES.SOURCES) && !fs.existsSync(paths.sources)) {
    fs.copyFileSync(CONFIG.FILES.SOURCES, paths.sources);
  }
  if (fs.existsSync(CONFIG.FILES.CACHE) && !fs.existsSync(paths.cache)) {
    ensureDir(path.dirname(paths.cache));
    fs.copyFileSync(CONFIG.FILES.CACHE, paths.cache);
  }

  if (fs.existsSync(CONFIG.FILES.MEMORY) && !fs.existsSync(paths.typedMemory)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CONFIG.FILES.MEMORY, "utf-8"));
      const legacy = z.object({ voiceExamples: z.array(z.string()).default([]) }).parse(raw);
      saveTypedMemory(DEFAULT_WORKSPACE_ID, {
        voiceExamples: legacy.voiceExamples,
      });
    } catch {
      saveTypedMemory(DEFAULT_WORKSPACE_ID, {});
    }
  }

  const legacyOutputDir = path.join(CONFIG.DATA_DIR, "output");
  if (fs.existsSync(legacyOutputDir) && fs.readdirSync(paths.outputDir).length === 0) {
    for (const entry of fs.readdirSync(legacyOutputDir, { withFileTypes: true })) {
      const source = path.join(legacyOutputDir, entry.name);
      const target = path.join(paths.outputDir, entry.name);
      if (entry.isDirectory()) {
        fs.cpSync(source, target, { recursive: true });
      } else if (entry.isSymbolicLink()) {
        try {
          const linked = fs.readlinkSync(source);
          fs.symlinkSync(linked, target);
        } catch {
          // ignore unreadable legacy symlinks
        }
      } else if (entry.isFile()) {
        fs.copyFileSync(source, target);
      }
    }
  }

  const legacyLatest = path.join(paths.outputDir, "latest", "structures.json");
  if (fs.existsSync(legacyLatest) && !fs.existsSync(paths.latestHarvestPointer)) {
    ensureDir(paths.cacheDir);
    fs.writeFileSync(paths.latestHarvestPointer, legacyLatest);
  }
}

export function ensureWorkspaceSystem() {
  ensureDataDir();
  migrateLegacyStateIntoDefaultWorkspace();
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
          // fall through to rebuild minimal metadata
        }
      }
      const fallback: WorkspaceMetadata = {
        id: entry.name,
        name: entry.name,
        description: "",
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
    throw new Error(`Workspace "${workspaceId}" does not exist.`);
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
    throw new Error(`Workspace "${workspaceId}" already exists.`);
  }
  const createdAt = input.createdAt ?? nowIso();
  const meta: WorkspaceMetadata = {
    id: workspaceId,
    name: input.name.trim() || workspaceId,
    description: input.description?.trim() ?? "",
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

export function loadWorkspaceContext(workspaceId: string): UserContext | null {
  const file = getWorkspacePaths(workspaceId).context;
  if (!fs.existsSync(file)) return null;
  try {
    return UserContextSchema.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    return null;
  }
}

export function saveWorkspaceContext(workspaceId: string, ctx: UserContext) {
  const file = getWorkspacePaths(workspaceId).context;
  ensureWorkspaceDirs(workspaceId);
  fs.writeFileSync(file, JSON.stringify(UserContextSchema.parse(ctx), null, 2));
  touchWorkspace(workspaceId);
}

export function loadTypedMemory(workspaceId: string): TypedMemory {
  const file = getWorkspacePaths(workspaceId).typedMemory;
  if (!fs.existsSync(file)) return TypedMemorySchema.parse({});
  try {
    return TypedMemorySchema.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
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
  saveTypedMemory(workspaceId, { [memoryType]: next } as Partial<TypedMemory>);
}
