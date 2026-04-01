import {
  listWorkspaces as wsListWorkspaces,
  workspaceExists as wsWorkspaceExists,
  loadWorkspace as wsLoadWorkspace,
  createWorkspace as wsCreateWorkspace,
  getCurrentWorkspaceId,
  getCurrentWorkspace as wsGetCurrentWorkspace,
  setCurrentWorkspace as wsSetCurrentWorkspace,
  touchWorkspace as wsTouchWorkspace,
  workspaceContextExists,
  loadWorkspaceContext,
  saveWorkspaceContext,
  loadTypedMemory as wsLoadTypedMemory,
  appendTypedMemory as wsAppendTypedMemory,
  loadSources as wsLoadSources,
  appendSources as wsAppendSources,
  getSeenUrls as wsGetSeenUrls,
  saveSeenUrls as wsSaveSeenUrls,
} from "./workspaces.js";
import {
  loadLatestHarvest as structsLoadLatest,
  latestHarvestExists as structsLatestExists,
  saveHarvestOutput as structsSaveHarvest,
  saveDraft as structsSaveDraft,
  saveCurationState as structsSaveCurationState,
  listLocalDrafts as structsListLocalDrafts,
  type DraftSummary,
} from "./output/structures.js";
import {
  TypedMemorySchema,
  HarvestBundleSchema,
  UserContextSchema,
  WorkspaceMetadataSchema,
  CardInputSchema,
  type UserContext,
  type TypedMemory,
  type HarvestBundle,
  type CardInput,
  type WorkspaceMetadata,
  type StructureCard,
  type CurationStatus,
} from "./types.js";
import { db as defaultDb, createDb, type QuillbyDb } from "./db.js";
import {
  hostedUserState,
  hostedWorkspace as hostedWorkspaceTable,
  hostedWorkspaceContext,
  hostedWorkspaceMemory,
  hostedWorkspaceSources,
  hostedWorkspaceSeenUrls,
  hostedWorkspaceHarvest,
  hostedWorkspaceDraft,
  hostedWorkspaceAccess,
} from "./db/schema.js";
import { eq, and } from "drizzle-orm";
import { ensureHostedTables } from "./db/migrate-hosted.js";
import { randomUUID } from "node:crypto";

const DEFAULT_QUILLBY_HOME = `${process.env.HOME ?? ""}/.quillby`;
const DEFAULT_WORKSPACE_ID = "default";

type HostedPlan = "free" | "pro";
type PlanLimits = {
  maxOwnedWorkspaces: number | null;
  maxDraftsPerWorkspace: number | null;
  harvestCooldownMs: number | null;
};

const PLAN_LIMITS: Record<HostedPlan, PlanLimits> = {
  free: {
    maxOwnedWorkspaces: 3,
    maxDraftsPerWorkspace: 20,
    harvestCooldownMs: 30 * 60 * 1000,
  },
  pro: {
    maxOwnedWorkspaces: null,
    maxDraftsPerWorkspace: null,
    harvestCooldownMs: null,
  },
};

function isPlanEnforcementEnabled(): boolean {
  const raw = (process.env.QUILLBY_ENFORCE_PLAN_LIMITS ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function sanitizeUserId(userId: string): string {
  return userId
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function slugifyWorkspaceId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || DEFAULT_WORKSPACE_ID;
}

function withScopedHome<T>(homeDir: string, fn: () => T): T {
  const previous = process.env.QUILLBY_HOME;
  process.env.QUILLBY_HOME = homeDir;
  try {
    return fn();
  } finally {
    if (previous == null) {
      delete process.env.QUILLBY_HOME;
    } else {
      process.env.QUILLBY_HOME = previous;
    }
  }
}

export type CreateWorkspaceInput = {
  id?: string;
  name: string;
  description?: string;
  makeCurrent?: boolean;
};

export interface WorkspaceStorage {
  listWorkspaces(): Promise<WorkspaceMetadata[]>;
  workspaceExists(id: string): Promise<boolean>;
  loadWorkspace(id: string): Promise<WorkspaceMetadata | null>;
  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceMetadata>;
  getCurrentWorkspaceId(): Promise<string>;
  getCurrentWorkspace(): Promise<WorkspaceMetadata>;
  setCurrentWorkspace(id: string): Promise<WorkspaceMetadata>;
  touchWorkspace(id: string): Promise<void>;
  contextExists(): Promise<boolean>;
  loadContext(): Promise<UserContext | null>;
  saveContext(ctx: UserContext): Promise<void>;
  loadTypedMemory(): Promise<TypedMemory>;
  appendTypedMemory(type: keyof TypedMemory, entries: string[], limit?: number): Promise<void>;
  loadSources(): Promise<string[]>;
  appendSources(urls: string[]): Promise<{ added: number; skipped: number }>;
  getSeenUrls(): Promise<Set<string>>;
  saveSeenUrls(urls: Set<string>): Promise<void>;
  loadLatestHarvest(): Promise<HarvestBundle>;
  latestHarvestExists(): Promise<boolean>;
  saveHarvestOutput(cards: CardInput[], seenUrls: Set<string>): Promise<string>;
  saveDraft(content: string, platform: string, cardId?: number): Promise<string>;
  saveCurationState(state: Record<string, CurationStatus>): Promise<void>;
  listDrafts(): Promise<DraftSummary[]>;
  /** Return a storage view scoped to a specific workspace without changing the global selection. */
  withWorkspace(workspaceId: string): Promise<WorkspaceStorage>;
  /** Subscription plan. Always "free" in local mode. */
  getPlan(): Promise<"free" | "pro">;
  /** Grant another user access to a workspace. Hosted only. */
  shareWorkspace(workspaceId: string, granteeUserId: string, role: "viewer" | "editor"): Promise<void>;
  /** Revoke another user's access to a workspace. Hosted only. */
  revokeAccess(workspaceId: string, granteeUserId: string): Promise<void>;
  /** List users who have been granted access to a workspace. Hosted only. */
  listWorkspaceAccess(workspaceId: string): Promise<Array<{ userId: string; role: string }>>;
}

export type { DraftSummary };

// ── Local filesystem storage (stdio mode and local CLI) ──────────────────────

export class LocalWorkspaceStorage implements WorkspaceStorage {
  async listWorkspaces() { return wsListWorkspaces(); }
  async workspaceExists(id: string) { return wsWorkspaceExists(id); }
  async loadWorkspace(id: string) { return wsLoadWorkspace(id); }
  async createWorkspace(input: CreateWorkspaceInput) { return wsCreateWorkspace(input); }
  async getCurrentWorkspaceId() { return getCurrentWorkspaceId(); }
  async getCurrentWorkspace() { return wsGetCurrentWorkspace(); }
  async setCurrentWorkspace(id: string) { return wsSetCurrentWorkspace(id); }
  async touchWorkspace(id: string) { wsTouchWorkspace(id); }
  async contextExists() { return workspaceContextExists(getCurrentWorkspaceId()); }
  async loadContext() { return loadWorkspaceContext(getCurrentWorkspaceId()); }
  async saveContext(ctx: UserContext) { saveWorkspaceContext(getCurrentWorkspaceId(), ctx); }
  async loadTypedMemory() { return wsLoadTypedMemory(getCurrentWorkspaceId()); }
  async appendTypedMemory(type: keyof TypedMemory, entries: string[], limit?: number) {
    wsAppendTypedMemory(getCurrentWorkspaceId(), type, entries, limit);
  }
  async loadSources() { return wsLoadSources(getCurrentWorkspaceId()); }
  async appendSources(urls: string[]) { return wsAppendSources(getCurrentWorkspaceId(), urls); }
  async getSeenUrls() { return wsGetSeenUrls(getCurrentWorkspaceId()); }
  async saveSeenUrls(urls: Set<string>) { wsSaveSeenUrls(getCurrentWorkspaceId(), urls); }
  async loadLatestHarvest() { return structsLoadLatest(); }
  async latestHarvestExists() { return structsLatestExists(); }
  async saveHarvestOutput(cards: CardInput[], seenUrls: Set<string>) { return structsSaveHarvest(cards, seenUrls); }
  async saveDraft(content: string, platform: string, cardId?: number) { return structsSaveDraft(content, platform, cardId); }
  async saveCurationState(state: Record<string, CurationStatus>) { structsSaveCurationState(state); }
  async listDrafts() { return structsListLocalDrafts(); }

  async withWorkspace(id: string): Promise<WorkspaceStorage> {
    if (!await this.workspaceExists(id)) throw new Error(`Workspace "${id}" not found.`);
    return new LocalPinnedStorage(id);
  }
  async getPlan(): Promise<"free" | "pro"> { return "free"; }
  async shareWorkspace(): Promise<void> { throw new Error("Team workspaces require hosted mode."); }
  async revokeAccess(): Promise<void> { throw new Error("Team workspaces require hosted mode."); }
  async listWorkspaceAccess(): Promise<Array<{ userId: string; role: string }>> { return []; }
}

export const storage = new LocalWorkspaceStorage();

// ── Pinned local storage (per-tool workspace override for local mode) ─────────

class LocalPinnedStorage implements WorkspaceStorage {
  constructor(private readonly pinnedId: string) {}

  async listWorkspaces() { return wsListWorkspaces(); }
  async workspaceExists(id: string) { return wsWorkspaceExists(id); }
  async loadWorkspace(id: string) { return wsLoadWorkspace(id); }
  async createWorkspace(input: CreateWorkspaceInput) { return wsCreateWorkspace(input); }
  async getCurrentWorkspaceId() { return this.pinnedId; }
  async getCurrentWorkspace() { return wsLoadWorkspace(this.pinnedId) ?? wsGetCurrentWorkspace(); }
  async setCurrentWorkspace(): Promise<WorkspaceMetadata> { throw new Error("Cannot switch workspace on a pinned storage view."); }
  async touchWorkspace(id: string) { wsTouchWorkspace(id); }
  async contextExists() { return workspaceContextExists(this.pinnedId); }
  async loadContext() { return loadWorkspaceContext(this.pinnedId); }
  async saveContext(ctx: UserContext) { saveWorkspaceContext(this.pinnedId, ctx); }
  async loadTypedMemory() { return wsLoadTypedMemory(this.pinnedId); }
  async appendTypedMemory(type: keyof TypedMemory, entries: string[], limit?: number) {
    wsAppendTypedMemory(this.pinnedId, type, entries, limit);
  }
  async loadSources() { return wsLoadSources(this.pinnedId); }
  async appendSources(urls: string[]) { return wsAppendSources(this.pinnedId, urls); }
  async getSeenUrls() { return wsGetSeenUrls(this.pinnedId); }
  async saveSeenUrls(urls: Set<string>) { wsSaveSeenUrls(this.pinnedId, urls); }
  async loadLatestHarvest() { return structsLoadLatest(this.pinnedId); }
  async latestHarvestExists() { return structsLatestExists(this.pinnedId); }
  async saveHarvestOutput(cards: CardInput[], seenUrls: Set<string>) { return structsSaveHarvest(cards, seenUrls, this.pinnedId); }
  async saveDraft(content: string, platform: string, cardId?: number) { return structsSaveDraft(content, platform, cardId, this.pinnedId); }
  async saveCurationState(state: Record<string, CurationStatus>) { structsSaveCurationState(state, this.pinnedId); }
  async listDrafts() { return structsListLocalDrafts(this.pinnedId); }

  async withWorkspace(id: string): Promise<WorkspaceStorage> {
    if (!await this.workspaceExists(id)) throw new Error(`Workspace "${id}" not found.`);
    return new LocalPinnedStorage(id);
  }
  async getPlan(): Promise<"free" | "pro"> { return "free"; }
  async shareWorkspace(): Promise<void> { throw new Error("Team workspaces require hosted mode."); }
  async revokeAccess(): Promise<void> { throw new Error("Team workspaces require hosted mode."); }
  async listWorkspaceAccess(): Promise<Array<{ userId: string; role: string }>> { return []; }
}

// ── Scoped filesystem storage (wraps each call in a QUILLBY_HOME swap) ───────
// Kept for reference but not used in hosted mode after v0.8.

class ScopedWorkspaceStorage implements WorkspaceStorage {
  constructor(private readonly homeDir: string) {}

  async listWorkspaces() { return withScopedHome(this.homeDir, () => wsListWorkspaces()); }
  async workspaceExists(id: string) { return withScopedHome(this.homeDir, () => wsWorkspaceExists(id)); }
  async loadWorkspace(id: string) { return withScopedHome(this.homeDir, () => wsLoadWorkspace(id)); }
  async createWorkspace(input: CreateWorkspaceInput) { return withScopedHome(this.homeDir, () => wsCreateWorkspace(input)); }
  async getCurrentWorkspaceId() { return withScopedHome(this.homeDir, () => getCurrentWorkspaceId()); }
  async getCurrentWorkspace() { return withScopedHome(this.homeDir, () => wsGetCurrentWorkspace()); }
  async setCurrentWorkspace(id: string) { return withScopedHome(this.homeDir, () => wsSetCurrentWorkspace(id)); }
  async touchWorkspace(id: string) { withScopedHome(this.homeDir, () => wsTouchWorkspace(id)); }
  async contextExists() { return withScopedHome(this.homeDir, () => workspaceContextExists(getCurrentWorkspaceId())); }
  async loadContext() { return withScopedHome(this.homeDir, () => loadWorkspaceContext(getCurrentWorkspaceId())); }
  async saveContext(ctx: UserContext) { withScopedHome(this.homeDir, () => saveWorkspaceContext(getCurrentWorkspaceId(), ctx)); }
  async loadTypedMemory() { return withScopedHome(this.homeDir, () => wsLoadTypedMemory(getCurrentWorkspaceId())); }
  async appendTypedMemory(type: keyof TypedMemory, entries: string[], limit?: number) {
    withScopedHome(this.homeDir, () => wsAppendTypedMemory(getCurrentWorkspaceId(), type, entries, limit));
  }
  async loadSources() { return withScopedHome(this.homeDir, () => wsLoadSources(getCurrentWorkspaceId())); }
  async appendSources(urls: string[]) { return withScopedHome(this.homeDir, () => wsAppendSources(getCurrentWorkspaceId(), urls)); }
  async getSeenUrls() { return withScopedHome(this.homeDir, () => wsGetSeenUrls(getCurrentWorkspaceId())); }
  async saveSeenUrls(urls: Set<string>) { withScopedHome(this.homeDir, () => wsSaveSeenUrls(getCurrentWorkspaceId(), urls)); }
  async loadLatestHarvest() { return withScopedHome(this.homeDir, () => structsLoadLatest()); }
  async latestHarvestExists() { return withScopedHome(this.homeDir, () => structsLatestExists()); }
  async saveHarvestOutput(cards: CardInput[], seenUrls: Set<string>) {
    return withScopedHome(this.homeDir, () => structsSaveHarvest(cards, seenUrls));
  }
  async saveDraft(content: string, platform: string, cardId?: number) {
    return withScopedHome(this.homeDir, () => structsSaveDraft(content, platform, cardId));
  }
  async saveCurationState(state: Record<string, CurationStatus>) {
    withScopedHome(this.homeDir, () => structsSaveCurationState(state));
  }
  async listDrafts() {
    return withScopedHome(this.homeDir, () => structsListLocalDrafts());
  }

  async withWorkspace(id: string): Promise<WorkspaceStorage> {
    const exists = await withScopedHome(this.homeDir, () => wsWorkspaceExists(id));
    if (!exists) throw new Error(`Workspace "${id}" not found.`);
    return new ScopedWorkspaceStorage(this.homeDir); // scoped home already pins the env; caller switches via setCurrentWorkspace
  }
  async getPlan(): Promise<"free" | "pro"> { return "free"; }
  async shareWorkspace(): Promise<void> { throw new Error("Team workspaces require hosted mode."); }
  async revokeAccess(): Promise<void> { throw new Error("Team workspaces require hosted mode."); }
  async listWorkspaceAccess(): Promise<Array<{ userId: string; role: string }>> { return []; }
}

// ── Database-backed hosted storage (HTTP mode, v0.8+) ────────────────────────
// All data is partitioned by userId — each user's workspaces, context, memory,
// sources, harvests, and drafts are completely isolated in the shared DB.

export class HostedDbWorkspaceStorage implements WorkspaceStorage {
  private initPromise: Promise<void> | null = null;
  /** Set by withWorkspace() to override the active workspace without mutating DB state. */
  _workspaceIdOverride?: string;
  /** Set by withWorkspace() when the pinned workspace belongs to another user (shared access). */
  _ownerUserId?: string;

  constructor(
    private readonly userId: string,
    private readonly db: QuillbyDb = defaultDb
  ) {}

  /** The user whose data rows are read/written for content operations. */
  private get _effectiveUserId(): string { return this._ownerUserId ?? this.userId; }

  private async _limitsForCurrentUser(): Promise<PlanLimits> {
    if (!isPlanEnforcementEnabled()) return PLAN_LIMITS.pro;
    const plan = await this.getPlan();
    return PLAN_LIMITS[plan];
  }

  private async _enforceOwnedWorkspaceLimit(): Promise<void> {
    const limits = await this._limitsForCurrentUser();
    if (limits.maxOwnedWorkspaces == null) return;
    const rows = await this.db
      .select({ id: hostedWorkspaceTable.workspaceId })
      .from(hostedWorkspaceTable)
      .where(eq(hostedWorkspaceTable.userId, this.userId));
    if (rows.length >= limits.maxOwnedWorkspaces) {
      throw new Error(
        `Free plan limit reached: ${limits.maxOwnedWorkspaces} workspaces. Upgrade to pro to create more.`
      );
    }
  }

  private async _enforceDraftLimit(workspaceId: string): Promise<void> {
    const limits = await this._limitsForCurrentUser();
    if (limits.maxDraftsPerWorkspace == null) return;
    const rows = await this.db
      .select({ id: hostedWorkspaceDraft.id })
      .from(hostedWorkspaceDraft)
      .where(
        and(
          eq(hostedWorkspaceDraft.userId, this._effectiveUserId),
          eq(hostedWorkspaceDraft.workspaceId, workspaceId)
        )
      );
    if (rows.length >= limits.maxDraftsPerWorkspace) {
      throw new Error(
        `Free plan limit reached: ${limits.maxDraftsPerWorkspace} drafts per workspace. Upgrade to pro to save more drafts.`
      );
    }
  }

  private async _enforceHarvestCooldown(workspaceId: string): Promise<void> {
    const limits = await this._limitsForCurrentUser();
    if (limits.harvestCooldownMs == null) return;
    const rows = await this.db
      .select({ generatedAt: hostedWorkspaceHarvest.generatedAt })
      .from(hostedWorkspaceHarvest)
      .where(
        and(
          eq(hostedWorkspaceHarvest.userId, this._effectiveUserId),
          eq(hostedWorkspaceHarvest.workspaceId, workspaceId)
        )
      )
      .limit(1);
    const last = rows[0]?.generatedAt;
    if (!last) return;
    const lastTs = last instanceof Date ? last.getTime() : new Date(last).getTime();
    const waitMs = lastTs + limits.harvestCooldownMs - Date.now();
    if (waitMs > 0) {
      const waitMinutes = Math.ceil(waitMs / (60 * 1000));
      throw new Error(
        `Free plan harvest cooldown active. Try again in about ${waitMinutes} minute(s), or upgrade to pro.`
      );
    }
  }

  private async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await ensureHostedTables(this.db);
        // Bootstrap the user's workspace system if this is their first access.
        const existing = await this.db
          .select({ id: hostedWorkspaceTable.workspaceId })
          .from(hostedWorkspaceTable)
          .where(eq(hostedWorkspaceTable.userId, this.userId))
          .limit(1);
        if (existing.length === 0) {
          await this._insertWorkspace(DEFAULT_WORKSPACE_ID, "Default Workspace", "Primary Quillby workspace.", true);
        }
      })();
    }
    return this.initPromise;
  }

  private async _insertWorkspace(
    workspaceId: string,
    name: string,
    description: string,
    makeCurrent: boolean
  ): Promise<WorkspaceMetadata> {
    const now = new Date();
    await this.db.insert(hostedWorkspaceTable).values({
      userId: this.userId,
      workspaceId,
      name,
      description,
      createdAt: now,
      updatedAt: now,
    });
    if (makeCurrent) {
      await this._setCurrentWorkspaceId(workspaceId);
    }
    return WorkspaceMetadataSchema.parse({
      id: workspaceId,
      name,
      description,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  private async _setCurrentWorkspaceId(workspaceId: string): Promise<void> {
    await this.db
      .insert(hostedUserState)
      .values({ userId: this.userId, currentWorkspaceId: workspaceId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: hostedUserState.userId,
        set: { currentWorkspaceId: workspaceId, updatedAt: new Date() },
      });
  }

  private rowToMetadata(r: { workspaceId: string; name: string; description: string; createdAt: Date | number; updatedAt: Date | number }): WorkspaceMetadata {
    const toIso = (v: Date | number) => (v instanceof Date ? v : new Date(v)).toISOString();
    return WorkspaceMetadataSchema.parse({
      id: r.workspaceId,
      name: r.name,
      description: r.description,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
    });
  }

  async listWorkspaces(): Promise<WorkspaceMetadata[]> {
    await this.ensureInit();
    const owned = await this.db
      .select()
      .from(hostedWorkspaceTable)
      .where(eq(hostedWorkspaceTable.userId, this.userId))
      .orderBy(hostedWorkspaceTable.name);
    // Include workspaces shared with this user by other owners.
    const shared = await this.db
      .select({
        workspaceId: hostedWorkspaceTable.workspaceId,
        name: hostedWorkspaceTable.name,
        description: hostedWorkspaceTable.description,
        createdAt: hostedWorkspaceTable.createdAt,
        updatedAt: hostedWorkspaceTable.updatedAt,
      })
      .from(hostedWorkspaceAccess)
      .innerJoin(
        hostedWorkspaceTable,
        and(
          eq(hostedWorkspaceTable.userId, hostedWorkspaceAccess.ownerUserId),
          eq(hostedWorkspaceTable.workspaceId, hostedWorkspaceAccess.workspaceId)
        )
      )
      .where(eq(hostedWorkspaceAccess.granteeUserId, this.userId));
    return [...owned, ...shared].map((r) => this.rowToMetadata(r));
  }

  async workspaceExists(id: string): Promise<boolean> {
    await this.ensureInit();
    const rows = await this.db
      .select({ id: hostedWorkspaceTable.workspaceId })
      .from(hostedWorkspaceTable)
      .where(and(eq(hostedWorkspaceTable.userId, this.userId), eq(hostedWorkspaceTable.workspaceId, id)))
      .limit(1);
    return rows.length > 0;
  }

  async loadWorkspace(id: string): Promise<WorkspaceMetadata | null> {
    await this.ensureInit();
    const rows = await this.db
      .select()
      .from(hostedWorkspaceTable)
      .where(and(eq(hostedWorkspaceTable.userId, this.userId), eq(hostedWorkspaceTable.workspaceId, id)))
      .limit(1);
    if (rows.length === 0) return null;
    return this.rowToMetadata(rows[0]);
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceMetadata> {
    await this.ensureInit();
    await this._enforceOwnedWorkspaceLimit();
    const workspaceId = slugifyWorkspaceId(input.id ?? input.name);
    if (await this.workspaceExists(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" already exists.`);
    }
    return this._insertWorkspace(
      workspaceId,
      input.name.trim() || workspaceId,
      input.description?.trim() ?? "",
      input.makeCurrent ?? false
    );
  }

  async getCurrentWorkspaceId(): Promise<string> {
    if (this._workspaceIdOverride) return this._workspaceIdOverride;
    await this.ensureInit();
    const rows = await this.db
      .select({ id: hostedUserState.currentWorkspaceId })
      .from(hostedUserState)
      .where(eq(hostedUserState.userId, this.userId))
      .limit(1);
    if (rows.length > 0) return rows[0].id;
    const workspaces = await this.listWorkspaces();
    const fallback = workspaces[0]?.id ?? DEFAULT_WORKSPACE_ID;
    await this._setCurrentWorkspaceId(fallback);
    return fallback;
  }

  async getCurrentWorkspace(): Promise<WorkspaceMetadata> {
    const id = await this.getCurrentWorkspaceId();
    const ws = await this.loadWorkspace(id);
    if (!ws) {
      return this._insertWorkspace(DEFAULT_WORKSPACE_ID, "Default Workspace", "", true);
    }
    return ws;
  }

  async setCurrentWorkspace(id: string): Promise<WorkspaceMetadata> {
    await this.ensureInit();
    const ws = await this.loadWorkspace(id);
    if (!ws) throw new Error(`Workspace "${id}" does not exist.`);
    await this._setCurrentWorkspaceId(id);
    return ws;
  }

  async touchWorkspace(id: string): Promise<void> {
    await this.ensureInit();
    await this.db
      .update(hostedWorkspaceTable)
      .set({ updatedAt: new Date() })
      .where(and(eq(hostedWorkspaceTable.userId, this.userId), eq(hostedWorkspaceTable.workspaceId, id)));
  }

  async contextExists(): Promise<boolean> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select({ data: hostedWorkspaceContext.data })
      .from(hostedWorkspaceContext)
      .where(and(eq(hostedWorkspaceContext.userId, this._effectiveUserId), eq(hostedWorkspaceContext.workspaceId, currentId)))
      .limit(1);
    return rows.length > 0;
  }

  async loadContext(): Promise<UserContext | null> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select({ data: hostedWorkspaceContext.data })
      .from(hostedWorkspaceContext)
      .where(and(eq(hostedWorkspaceContext.userId, this._effectiveUserId), eq(hostedWorkspaceContext.workspaceId, currentId)))
      .limit(1);
    if (rows.length === 0) return null;
    try { return UserContextSchema.parse(JSON.parse(rows[0].data)); } catch { return null; }
  }

  async saveContext(ctx: UserContext): Promise<void> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const data = JSON.stringify(UserContextSchema.parse(ctx));
    await this.db
      .insert(hostedWorkspaceContext)
      .values({ userId: this._effectiveUserId, workspaceId: currentId, data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [hostedWorkspaceContext.userId, hostedWorkspaceContext.workspaceId],
        set: { data, updatedAt: new Date() },
      });
    await this.touchWorkspace(currentId);
  }

  async loadTypedMemory(): Promise<TypedMemory> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select({ data: hostedWorkspaceMemory.data })
      .from(hostedWorkspaceMemory)
      .where(and(eq(hostedWorkspaceMemory.userId, this._effectiveUserId), eq(hostedWorkspaceMemory.workspaceId, currentId)))
      .limit(1);
    if (rows.length === 0) return TypedMemorySchema.parse({});
    try { return TypedMemorySchema.parse(JSON.parse(rows[0].data)); } catch { return TypedMemorySchema.parse({}); }
  }

  async appendTypedMemory(type: keyof TypedMemory, entries: string[], limit?: number): Promise<void> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const current = await this.loadTypedMemory();
    const existing = current[type];
    const deduped = [...new Set([...entries, ...existing].map((e) => e.trim()).filter(Boolean))];
    const next = limit != null ? deduped.slice(0, limit) : deduped;
    const data = JSON.stringify(TypedMemorySchema.parse({ ...current, [type]: next }));
    await this.db
      .insert(hostedWorkspaceMemory)
      .values({ userId: this._effectiveUserId, workspaceId: currentId, data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [hostedWorkspaceMemory.userId, hostedWorkspaceMemory.workspaceId],
        set: { data, updatedAt: new Date() },
      });
    await this.touchWorkspace(currentId);
  }

  async loadSources(): Promise<string[]> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select({ urls: hostedWorkspaceSources.urls })
      .from(hostedWorkspaceSources)
      .where(and(eq(hostedWorkspaceSources.userId, this._effectiveUserId), eq(hostedWorkspaceSources.workspaceId, currentId)))
      .limit(1);
    if (rows.length === 0) return [];
    try { return JSON.parse(rows[0].urls) as string[]; } catch { return []; }
  }

  async appendSources(newUrls: string[]): Promise<{ added: number; skipped: number }> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const existing = await this.loadSources();
    const existingSet = new Set(existing);
    const toAdd = newUrls.filter((u) => u.trim() && !existingSet.has(u.trim()));
    if (toAdd.length === 0) return { added: 0, skipped: newUrls.length };
    const urls = JSON.stringify([...existing, ...toAdd]);
    await this.db
      .insert(hostedWorkspaceSources)
      .values({ userId: this._effectiveUserId, workspaceId: currentId, urls })
      .onConflictDoUpdate({
        target: [hostedWorkspaceSources.userId, hostedWorkspaceSources.workspaceId],
        set: { urls },
      });
    await this.touchWorkspace(currentId);
    return { added: toAdd.length, skipped: newUrls.length - toAdd.length };
  }

  async getSeenUrls(): Promise<Set<string>> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select({ urls: hostedWorkspaceSeenUrls.urls })
      .from(hostedWorkspaceSeenUrls)
      .where(and(eq(hostedWorkspaceSeenUrls.userId, this._effectiveUserId), eq(hostedWorkspaceSeenUrls.workspaceId, currentId)))
      .limit(1);
    if (rows.length === 0) return new Set();
    try { return new Set(JSON.parse(rows[0].urls) as string[]); } catch { return new Set(); }
  }

  async saveSeenUrls(urls: Set<string>): Promise<void> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const data = JSON.stringify([...urls]);
    await this.db
      .insert(hostedWorkspaceSeenUrls)
      .values({ userId: this._effectiveUserId, workspaceId: currentId, urls: data })
      .onConflictDoUpdate({
        target: [hostedWorkspaceSeenUrls.userId, hostedWorkspaceSeenUrls.workspaceId],
        set: { urls: data },
      });
  }

  async latestHarvestExists(): Promise<boolean> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select({ id: hostedWorkspaceHarvest.workspaceId })
      .from(hostedWorkspaceHarvest)
      .where(and(eq(hostedWorkspaceHarvest.userId, this._effectiveUserId), eq(hostedWorkspaceHarvest.workspaceId, currentId)))
      .limit(1);
    return rows.length > 0;
  }

  async loadLatestHarvest(): Promise<HarvestBundle> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select({ data: hostedWorkspaceHarvest.data })
      .from(hostedWorkspaceHarvest)
      .where(and(eq(hostedWorkspaceHarvest.userId, this._effectiveUserId), eq(hostedWorkspaceHarvest.workspaceId, currentId)))
      .limit(1);
    if (rows.length === 0) {
      throw new Error("No harvest found. Run quillby_fetch_articles then quillby_save_cards first.");
    }
    return HarvestBundleSchema.parse(JSON.parse(rows[0].data));
  }

  async saveHarvestOutput(cards: CardInput[], _seenUrls?: Set<string>): Promise<string> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    await this._enforceHarvestCooldown(currentId);
    const dateLabel = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    const structCards: StructureCard[] = cards.map((raw, index) => ({
      ...CardInputSchema.parse(raw),
      id: index + 1,
      references: [],
    }));
    const bundle: HarvestBundle = {
      generatedAt: new Date().toISOString(),
      dateLabel,
      cards: structCards,
      curationState: {},
    };
    const data = JSON.stringify(bundle);
    const now = new Date();
    await this.db
      .insert(hostedWorkspaceHarvest)
      .values({ userId: this._effectiveUserId, workspaceId: currentId, data, generatedAt: now })
      .onConflictDoUpdate({
        target: [hostedWorkspaceHarvest.userId, hostedWorkspaceHarvest.workspaceId],
        set: { data, generatedAt: now },
      });
    await this.touchWorkspace(currentId);
    return `db:${currentId}:harvest`;
  }

  async saveDraft(content: string, platform: string, cardId?: number): Promise<string> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    await this._enforceDraftLimit(currentId);
    const id = randomUUID();
    await this.db.insert(hostedWorkspaceDraft).values({
      id,
      userId: this._effectiveUserId,
      workspaceId: currentId,
      platform: platform.toLowerCase(),
      cardId: cardId ?? null,
      content,
      createdAt: new Date(),
    });
    return `draft:${id}`;
  }

  async saveCurationState(state: Record<string, CurationStatus>): Promise<void> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select({ data: hostedWorkspaceHarvest.data })
      .from(hostedWorkspaceHarvest)
      .where(and(eq(hostedWorkspaceHarvest.userId, this._effectiveUserId), eq(hostedWorkspaceHarvest.workspaceId, currentId)))
      .limit(1);
    if (rows.length === 0) throw new Error("No harvest found. Save cards first before curating.");
    const bundle = HarvestBundleSchema.parse(JSON.parse(rows[0].data));
    const merged = { ...bundle.curationState, ...state };
    const updated = JSON.stringify({ ...bundle, curationState: merged });
    const now = new Date();
    await this.db
      .update(hostedWorkspaceHarvest)
      .set({ data: updated, generatedAt: now })
      .where(and(eq(hostedWorkspaceHarvest.userId, this._effectiveUserId), eq(hostedWorkspaceHarvest.workspaceId, currentId)));
  }

  async listDrafts(): Promise<DraftSummary[]> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select()
      .from(hostedWorkspaceDraft)
      .where(and(eq(hostedWorkspaceDraft.userId, this._effectiveUserId), eq(hostedWorkspaceDraft.workspaceId, currentId)))
      .orderBy(hostedWorkspaceDraft.createdAt);
    return rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      cardId: r.cardId ?? undefined,
      createdAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
      preview: r.content.slice(0, 200).replace(/\n+/g, " ").trim(),
    })).reverse();
  }

  async withWorkspace(id: string): Promise<WorkspaceStorage> {
    await this.ensureInit();
    // Check if this user owns the workspace.
    const owned = await this.workspaceExists(id);
    if (owned) {
      const scoped = new HostedDbWorkspaceStorage(this.userId, this.db);
      scoped._workspaceIdOverride = id;
      scoped.initPromise = this.initPromise;
      return scoped;
    }
    // Check if the workspace has been shared with this user.
    const access = await this.db
      .select()
      .from(hostedWorkspaceAccess)
      .where(and(eq(hostedWorkspaceAccess.workspaceId, id), eq(hostedWorkspaceAccess.granteeUserId, this.userId)))
      .limit(1);
    if (access.length === 0) throw new Error(`Workspace "${id}" not found or not accessible.`);
    const scoped = new HostedDbWorkspaceStorage(this.userId, this.db);
    scoped._workspaceIdOverride = id;
    scoped._ownerUserId = access[0].ownerUserId;
    scoped.initPromise = this.initPromise;
    return scoped;
  }

  async getPlan(): Promise<"free" | "pro"> {
    await this.ensureInit();
    const rows = await this.db
      .select({ plan: hostedUserState.plan })
      .from(hostedUserState)
      .where(eq(hostedUserState.userId, this.userId))
      .limit(1);
    return ((rows[0]?.plan ?? "free") as "free" | "pro");
  }

  async shareWorkspace(workspaceId: string, granteeUserId: string, role: "viewer" | "editor"): Promise<void> {
    await this.ensureInit();
    if (!await this.workspaceExists(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" not found or you do not own it.`);
    }
    await this.db
      .insert(hostedWorkspaceAccess)
      .values({ ownerUserId: this.userId, workspaceId, granteeUserId, role, createdAt: new Date() })
      .onConflictDoUpdate({
        target: [hostedWorkspaceAccess.ownerUserId, hostedWorkspaceAccess.workspaceId, hostedWorkspaceAccess.granteeUserId],
        set: { role },
      });
  }

  async revokeAccess(workspaceId: string, granteeUserId: string): Promise<void> {
    await this.ensureInit();
    if (!await this.workspaceExists(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" not found or you do not own it.`);
    }
    await this.db
      .delete(hostedWorkspaceAccess)
      .where(
        and(
          eq(hostedWorkspaceAccess.ownerUserId, this.userId),
          eq(hostedWorkspaceAccess.workspaceId, workspaceId),
          eq(hostedWorkspaceAccess.granteeUserId, granteeUserId)
        )
      );
  }

  async listWorkspaceAccess(workspaceId: string): Promise<Array<{ userId: string; role: string }>> {
    await this.ensureInit();
    if (!await this.workspaceExists(workspaceId)) {
      throw new Error(`Workspace "${workspaceId}" not found or you do not own it.`);
    }
    const rows = await this.db
      .select({ userId: hostedWorkspaceAccess.granteeUserId, role: hostedWorkspaceAccess.role })
      .from(hostedWorkspaceAccess)
      .where(and(eq(hostedWorkspaceAccess.ownerUserId, this.userId), eq(hostedWorkspaceAccess.workspaceId, workspaceId)));
    return rows;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

const hostedStorageCache = new Map<string, WorkspaceStorage>();

export function getHostedUserStorage(userId: string): WorkspaceStorage {
  const key = sanitizeUserId(userId);
  const cached = hostedStorageCache.get(key);
  if (cached) return cached;
  const instance = new HostedDbWorkspaceStorage(key);
  hostedStorageCache.set(key, instance);
  return instance;
}

export { createDb };

