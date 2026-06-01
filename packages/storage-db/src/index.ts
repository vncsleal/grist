import {
  TypedMemorySchema,
  HarvestBundleSchema,
  UserContextSchema,
  WorkspaceMetadataSchema,
  CardInputSchema,
  GenerationJobSchema,
  type UserContext,
  type TypedMemory,
  type HarvestBundle,
  type CardInput,
  type WorkspaceMetadata,
  type StructureCard,
  type CurationStatus,
  type GenerationJob,
  type GenerationModality,
} from "@quillby/core";
import {
  ContentPlanSchema,
  ContentTaskSchema,
  SessionSchema,
  type ContentPlan,
  type ContentPlanStatus,
  type ContentTask,
  type CalendarEntry,
  type Session,
} from "@quillby/content";
import {
  DEFAULT_WORKSPACE_ID,
  slugifyWorkspaceId,
  type CreateWorkspaceInput,
  type DraftSummary,
  type WorkspaceStorage,
  type JobStorage,
  type PlanStorage,
  type SessionStore,
} from "@quillby/workspace";
import { db as defaultDb, createDb, type QuillbyDb } from "@quillby/database";
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
  hostedWorkspaceJob,
  hostedPlan,
  hostedTask,
  hostedSession,
} from "@quillby/database";
import { eq, and, or, sql, desc, asc, count, gte, lte, lt, ne, isNull, inArray, type SQL } from "drizzle-orm";
import { runHostedMigrations, pushHostedSchema } from "@quillby/database";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import {
  getPlanLimits,
  isPlanEnforcementEnabled,
  type PlanLimits,
} from "@quillby/billing";


export type { CreateWorkspaceInput, DraftSummary, WorkspaceStorage, JobStorage };

type JobPatch = { status: GenerationJob["status"] } & Partial<Pick<GenerationJob, "provider" | "outputRef" | "error" | "meta">>;

// ── PII encryption utilities (AES-256-GCM) ─────────────────────────────────────
// Encrypts biometric data (face/voice reference URLs) at rest in the DB.
// Uses QUILLBY_PROVIDER_ENCRYPTION_KEY (self-hosted) or QUILLBY_KEYRING_SECRET (cloud).
// Falls back to plaintext if no key is configured (backward compatibility).

function getPiiEncryptionKey(): Buffer | null {
  const secret = process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY?.trim()
    ?? process.env.QUILLBY_KEYRING_SECRET?.trim();
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
}

function encryptPiiValue(plaintext: string): string | null {
  const key = getPiiEncryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString("base64") + "." + ciphertext.toString("base64") + "." + tag.toString("base64");
}

function decryptPiiValue(encrypted: string): string | null {
  try {
    const key = getPiiEncryptionKey();
    if (!key) return null;
    const parts = encrypted.split(".");
    if (parts.length !== 3) return null;
    const [ivRaw, ciphertextRaw, tagRaw] = parts;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64")), decipher.final()]).toString("utf8");
  } catch (e) {
    process.stderr.write(`[quillby] DecryptPiiValue failed: ${e}\n`);
    return null;
  }
}

// ── Database-backed hosted storage (HTTP mode, v0.8+) ────────────────────────
// All data is partitioned by userId — each user's workspaces, context, memory,
// sources, harvests, and drafts are completely isolated in the shared DB.

export class HostedDbWorkspaceStorage implements WorkspaceStorage, JobStorage, PlanStorage, SessionStore {
  private initPromise: Promise<void> | null = null;
  /** Set by withWorkspace() to override the active workspace without mutating DB state. */
  _workspaceIdOverride?: string;
  /** Set by withWorkspace() when the pinned workspace belongs to another user (shared access). */
  _ownerUserId?: string;

  constructor(
    private readonly userId: string,
    private readonly db: QuillbyDb = defaultDb,
    private readonly migrationsFolder?: string,
  ) {}

  /** The user whose data rows are read/written for content operations. */
  private get _effectiveUserId(): string { return this._ownerUserId ?? this.userId; }

  private async _limitsForCurrentUser(): Promise<PlanLimits> {
    if (!isPlanEnforcementEnabled()) return getPlanLimits("pro");
    const plan = await this.getPlan();
    return getPlanLimits(plan);
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
        if (this.migrationsFolder) {
          await runHostedMigrations(this.db, this.migrationsFolder);
        } else {
          await pushHostedSchema(this.db);
        }
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
      cloneConsentGranted: false,
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
      cloneConsentGranted: false,
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

  private rowToMetadata(r: {
    workspaceId: string;
    name: string;
    description: string;
    faceReferenceImageUrl?: string | null;
    voiceReferenceAudioUrl?: string | null;
    cloneConsentGranted?: boolean | number | null;
    cloneConsentAt?: Date | number | null;
    elevenlabsClonedVoiceId?: string | null;
    createdAt: Date | number;
    updatedAt: Date | number;
  }): WorkspaceMetadata {
    const toIso = (v: Date | number) => (v instanceof Date ? v : new Date(v)).toISOString();
    return WorkspaceMetadataSchema.parse({
      id: r.workspaceId,
      name: r.name,
      description: r.description,
      faceReferenceImageUrl: r.faceReferenceImageUrl
        ? (decryptPiiValue(r.faceReferenceImageUrl) ?? r.faceReferenceImageUrl)
        : undefined,
      voiceReferenceAudioUrl: r.voiceReferenceAudioUrl
        ? (decryptPiiValue(r.voiceReferenceAudioUrl) ?? r.voiceReferenceAudioUrl)
        : undefined,
      cloneConsentGranted: Boolean(r.cloneConsentGranted),
      cloneConsentAt: r.cloneConsentAt ? toIso(r.cloneConsentAt) : undefined,
      elevenlabsClonedVoiceId: r.elevenlabsClonedVoiceId ?? undefined,
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
        faceReferenceImageUrl: hostedWorkspaceTable.faceReferenceImageUrl,
        voiceReferenceAudioUrl: hostedWorkspaceTable.voiceReferenceAudioUrl,
        cloneConsentGranted: hostedWorkspaceTable.cloneConsentGranted,
        cloneConsentAt: hostedWorkspaceTable.cloneConsentAt,
        elevenlabsClonedVoiceId: hostedWorkspaceTable.elevenlabsClonedVoiceId,
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

  async updateWorkspaceMetadata(patch: Partial<WorkspaceMetadata>): Promise<WorkspaceMetadata> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const current = await this.loadWorkspace(currentId);
    if (!current) {
      throw new Error(`Workspace "${currentId}" does not exist.`);
    }

    // Encrypt biometric PII before storing
    const encryptedFaceUrl = patch.faceReferenceImageUrl !== undefined
      ? (patch.faceReferenceImageUrl
          ? (encryptPiiValue(patch.faceReferenceImageUrl) ?? patch.faceReferenceImageUrl)
          : null)
      : undefined;
    const encryptedVoiceUrl = patch.voiceReferenceAudioUrl !== undefined
      ? (patch.voiceReferenceAudioUrl
          ? (encryptPiiValue(patch.voiceReferenceAudioUrl) ?? patch.voiceReferenceAudioUrl)
          : null)
      : undefined;

    const consentAt = patch.cloneConsentGranted === true
      ? (patch.cloneConsentAt ?? new Date().toISOString())
      : patch.cloneConsentGranted === false
        ? undefined
        : patch.cloneConsentAt;

    await this.db
      .update(hostedWorkspaceTable)
      .set({
        ...(encryptedFaceUrl !== undefined && { faceReferenceImageUrl: encryptedFaceUrl }),
        ...(encryptedVoiceUrl !== undefined && { voiceReferenceAudioUrl: encryptedVoiceUrl }),
        ...(patch.cloneConsentGranted !== undefined && { cloneConsentGranted: patch.cloneConsentGranted }),
        ...(consentAt !== undefined && { cloneConsentAt: consentAt ? new Date(consentAt) : null }),
        ...(patch.elevenlabsClonedVoiceId !== undefined && { elevenlabsClonedVoiceId: patch.elevenlabsClonedVoiceId || null }),
        updatedAt: new Date(),
      })
      .where(and(eq(hostedWorkspaceTable.userId, this.userId), eq(hostedWorkspaceTable.workspaceId, currentId)));

    return (await this.loadWorkspace(currentId)) ?? current;
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
    try { return UserContextSchema.parse(JSON.parse(rows[0].data)); } catch (e) {
      process.stderr.write(`[quillby] Corrupt stored data in hostedWorkspaceContext: ${e}\n`);
      return null;
    }
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
    try { return TypedMemorySchema.parse(JSON.parse(rows[0].data)); } catch (e) {
      process.stderr.write(`[quillby] Corrupt stored data in hostedWorkspaceMemory: ${e}\n`);
      return TypedMemorySchema.parse({});
    }
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
    try { return JSON.parse(rows[0].urls) as string[]; } catch (e) {
      process.stderr.write(`[quillby] Corrupt stored data in hostedWorkspaceSources: ${e}\n`);
      return [];
    }
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

  async replaceSources(newUrls: string[]): Promise<void> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const urls = JSON.stringify(newUrls.map((u) => u.trim()).filter(Boolean));
    await this.db
      .insert(hostedWorkspaceSources)
      .values({ userId: this._effectiveUserId, workspaceId: currentId, urls })
      .onConflictDoUpdate({
        target: [hostedWorkspaceSources.userId, hostedWorkspaceSources.workspaceId],
        set: { urls },
      });
    await this.touchWorkspace(currentId);
  }

  async replaceTypedMemory(memory: TypedMemory): Promise<void> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const data = JSON.stringify(TypedMemorySchema.parse(memory));
    await this.db
      .insert(hostedWorkspaceMemory)
      .values({ userId: this._effectiveUserId, workspaceId: currentId, data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [hostedWorkspaceMemory.userId, hostedWorkspaceMemory.workspaceId],
        set: { data, updatedAt: new Date() },
      });
    await this.touchWorkspace(currentId);
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
    try { return new Set(JSON.parse(rows[0].urls) as string[]); } catch (e) {
      process.stderr.write(`[quillby] Corrupt stored data in hostedWorkspaceSeenUrls: ${e}\n`);
      return new Set();
    }
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
      throw new Error("No harvest found. Run fetch_articles then save_cards first.");
    }
    return HarvestBundleSchema.parse(JSON.parse(rows[0].data));
  }

  async saveHarvestOutput(cards: CardInput[], _seenUrls?: Set<string>): Promise<string> {
    void _seenUrls;
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    await this._enforceHarvestCooldown(currentId);
    const dateLabel = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

    // Merge with existing harvest if one exists — append rather than overwrite.
    let existingCards: StructureCard[] = [];
    let existingCurationState: HarvestBundle["curationState"] = {};
    const existing = await this.db
      .select({ data: hostedWorkspaceHarvest.data })
      .from(hostedWorkspaceHarvest)
      .where(and(eq(hostedWorkspaceHarvest.userId, this._effectiveUserId), eq(hostedWorkspaceHarvest.workspaceId, currentId)))
      .limit(1);
    if (existing.length > 0) {
      try {
        const prev = HarvestBundleSchema.parse(JSON.parse(existing[0].data));
        existingCards = prev.cards;
        existingCurationState = prev.curationState ?? {};
      } catch (e) {
        process.stderr.write(`[quillby] Corrupt stored harvest data, starting fresh: ${e}\n`);
      }
    }

    const nextId = existingCards.length > 0 ? Math.max(...existingCards.map((c) => c.id)) + 1 : 1;
    const newStructCards: StructureCard[] = cards.map((raw, index) => ({
      ...CardInputSchema.parse(raw),
      id: nextId + index,
      references: [],
    }));
    const mergedCards = [...existingCards, ...newStructCards];

    const bundle: HarvestBundle = {
      generatedAt: new Date().toISOString(),
      dateLabel,
      cards: mergedCards,
      curationState: existingCurationState,
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
      content: r.content,
    })).reverse();
  }

  // ── v2: generation jobs ─────────────────────────────────────────────────

  private rowToJob(r: {
    id: string; workspaceId: string; modality: string; prompt: string;
    provider: string | null; status: string; outputRef: string | null;
    error: string | null; cardId: number | null; meta: string | null;
    createdAt: Date | number; updatedAt: Date | number;
  }): GenerationJob {
    const toIso = (v: Date | number) => (v instanceof Date ? v : new Date(v)).toISOString();
    return GenerationJobSchema.parse({
      id: r.id,
      workspaceId: r.workspaceId,
      modality: r.modality,
      prompt: r.prompt,
      provider: r.provider ?? undefined,
      status: r.status,
      outputRef: r.outputRef ?? undefined,
      error: r.error ?? undefined,
      cardId: r.cardId ?? undefined,
      meta: r.meta ?? undefined,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
    });
  }

  async saveJob(job: GenerationJob): Promise<void> {
    await this.ensureInit();
    const now = new Date();
    await this.db
      .insert(hostedWorkspaceJob)
      .values({
        id: job.id,
        userId: this._effectiveUserId,
        workspaceId: job.workspaceId,
        modality: job.modality,
        prompt: job.prompt,
        provider: job.provider ?? null,
        status: job.status,
        outputRef: job.outputRef ?? null,
        error: job.error ?? null,
        cardId: job.cardId ?? null,
        meta: job.meta ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: hostedWorkspaceJob.id,
        set: {
          status: job.status,
          provider: job.provider ?? null,
          outputRef: job.outputRef ?? null,
          error: job.error ?? null,
          meta: job.meta ?? null,
          updatedAt: now,
        },
      });
  }

  async loadJob(jobId: string): Promise<GenerationJob | null> {
    await this.ensureInit();
    const rows = await this.db
      .select()
      .from(hostedWorkspaceJob)
      .where(and(eq(hostedWorkspaceJob.id, jobId), eq(hostedWorkspaceJob.userId, this._effectiveUserId)))
      .limit(1);
    if (rows.length === 0) return null;
    return this.rowToJob(rows[0] as Parameters<typeof this.rowToJob>[0]);
  }

  async listJobs(modality?: GenerationModality): Promise<GenerationJob[]> {
    await this.ensureInit();
    const currentId = await this.getCurrentWorkspaceId();
    const conditions: SQL[] = [
      eq(hostedWorkspaceJob.userId, this._effectiveUserId),
      eq(hostedWorkspaceJob.workspaceId, currentId),
    ];
    if (modality) conditions.push(eq(hostedWorkspaceJob.modality, modality));
    const rows = await this.db
      .select()
      .from(hostedWorkspaceJob)
      .where(and(...conditions))
      .orderBy(desc(hostedWorkspaceJob.createdAt));
    return rows.map((r) => this.rowToJob(r as Parameters<typeof this.rowToJob>[0]));
  }

  async updateJob(jobId: string, patch: JobPatch): Promise<void> {
    await this.ensureInit();
    const now = new Date();
    await this.db
      .update(hostedWorkspaceJob)
      .set({
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.provider !== undefined && { provider: patch.provider }),
        ...(patch.outputRef !== undefined && { outputRef: patch.outputRef }),
        ...(patch.error !== undefined && { error: patch.error }),
        ...(patch.meta !== undefined && { meta: patch.meta }),
        updatedAt: now,
      })
      .where(and(eq(hostedWorkspaceJob.id, jobId), eq(hostedWorkspaceJob.userId, this._effectiveUserId)));
  }

  async getMonthlyJobCount(modality: GenerationModality): Promise<number> {
    await this.ensureInit();
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const currentId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select({ count: count() })
      .from(hostedWorkspaceJob)
      .where(
        and(
          eq(hostedWorkspaceJob.userId, this._effectiveUserId),
          eq(hostedWorkspaceJob.workspaceId, currentId),
          eq(hostedWorkspaceJob.modality, modality),
          gte(hostedWorkspaceJob.createdAt, startOfMonth)
        )
      );
    return rows[0]?.count ?? 0;
  }

  async withWorkspace(id: string): Promise<WorkspaceStorage> {
    await this.ensureInit();
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

  // ── Row-to-model helpers ──────────────────────────────────────────────────
  private toIso(v: Date | number): string {
    return (v instanceof Date ? v : new Date(v)).toISOString();
  }

  private rowToPlan(r: typeof hostedPlan.$inferSelect): ContentPlan {
    let tags: string[] = [];
    try { tags = JSON.parse(r.tags) as string[]; } catch { tags = []; /* Corrupted tags JSON — fall back to empty */ }
    return ContentPlanSchema.parse({
      id: r.id,
      name: r.name,
      description: r.description,
      dateStart: r.dateStart ?? undefined,
      dateEnd: r.dateEnd ?? undefined,
      status: r.status,
      tags,
      createdAt: this.toIso(r.createdAt),
      updatedAt: this.toIso(r.updatedAt),
    });
  }

  private rowToTask(r: typeof hostedTask.$inferSelect): ContentTask {
    return ContentTaskSchema.parse({
      id: r.id,
      planId: r.planId,
      title: r.title,
      type: r.type,
      priority: r.priority,
      status: r.status,
      actor: r.actor ?? undefined,
      platform: r.platform ?? undefined,
      cardId: r.cardId ?? undefined,
      draftId: r.draftId ?? undefined,
      description: r.description ?? undefined,
      dueDate: r.dueDate ?? undefined,
      createdAt: this.toIso(r.createdAt),
      updatedAt: this.toIso(r.updatedAt),
    });
  }

  private rowToSession(r: typeof hostedSession.$inferSelect): Session {
    return SessionSchema.parse({
      id: r.id,
      workspaceId: r.workspaceId,
      scope: JSON.parse(r.scope),
      state: r.state,
      degradation: JSON.parse(r.degradation),
      contextSnapshot: r.contextSnapshot ?? undefined,
      startedAt: this.toIso(r.startedAt),
      lastActivityAt: this.toIso(r.lastActivityAt),
      closedAt: r.closedAt ? this.toIso(r.closedAt) : undefined,
      summary: r.summary ?? undefined,
    });
  }

  // ── PlanStorage ──────────────────────────────────────────────────────────
  async createPlan(plan: ContentPlan): Promise<void> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    await this.db.insert(hostedPlan).values({
      id: plan.id,
      userId: this._effectiveUserId,
      workspaceId: wsId,
      name: plan.name,
      description: plan.description ?? "",
      dateStart: plan.dateStart ?? null,
      dateEnd: plan.dateEnd ?? null,
      status: plan.status,
      tags: JSON.stringify(plan.tags ?? []),
      createdAt: new Date(plan.createdAt),
      updatedAt: new Date(plan.updatedAt),
    });
    await this.touchWorkspace(wsId);
  }

  async loadPlan(planId: string): Promise<ContentPlan | null> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select()
      .from(hostedPlan)
      .where(and(
        eq(hostedPlan.id, planId),
        eq(hostedPlan.userId, this._effectiveUserId),
        eq(hostedPlan.workspaceId, wsId),
      ))
      .limit(1);
    return rows.length > 0 ? this.rowToPlan(rows[0]) : null;
  }

  async listPlans(status?: ContentPlanStatus): Promise<ContentPlan[]> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    const conditions = [
      eq(hostedPlan.userId, this._effectiveUserId),
      eq(hostedPlan.workspaceId, wsId),
    ];
    if (status) conditions.push(eq(hostedPlan.status, status));
    const rows = await this.db
      .select()
      .from(hostedPlan)
      .where(and(...conditions))
      .orderBy(desc(hostedPlan.createdAt));
    return rows.map((r) => this.rowToPlan(r));
  }

  async updatePlan(planId: string, patch: Partial<ContentPlan>): Promise<void> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    const existing = await this.loadPlan(planId);
    if (!existing) throw new Error(`Plan "${planId}" not found.`);
    const now = new Date();
    const updateData: Partial<typeof hostedPlan.$inferInsert> = { updatedAt: now };
    if (patch.name !== undefined) updateData.name = patch.name;
    if (patch.description !== undefined) updateData.description = patch.description;
    if (patch.dateStart !== undefined) updateData.dateStart = patch.dateStart ?? null;
    if (patch.dateEnd !== undefined) updateData.dateEnd = patch.dateEnd ?? null;
    if (patch.status !== undefined) updateData.status = patch.status;
    if (patch.tags !== undefined) updateData.tags = JSON.stringify(patch.tags);
    await this.db
      .update(hostedPlan)
      .set(updateData)
      .where(and(
        eq(hostedPlan.id, planId),
        eq(hostedPlan.userId, this._effectiveUserId),
        eq(hostedPlan.workspaceId, wsId),
      ));
    await this.touchWorkspace(wsId);
  }

  async deletePlan(planId: string): Promise<void> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    await this.db
      .delete(hostedTask)
      .where(and(
        eq(hostedTask.planId, planId),
        eq(hostedTask.userId, this._effectiveUserId),
        eq(hostedTask.workspaceId, wsId),
      ));
    await this.db
      .delete(hostedPlan)
      .where(and(
        eq(hostedPlan.id, planId),
        eq(hostedPlan.userId, this._effectiveUserId),
        eq(hostedPlan.workspaceId, wsId),
      ));
    await this.touchWorkspace(wsId);
  }

  async createTask(task: ContentTask): Promise<void> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    await this.db.insert(hostedTask).values({
      id: task.id,
      userId: this._effectiveUserId,
      workspaceId: wsId,
      planId: task.planId,
      title: task.title,
      type: task.type,
      priority: task.priority,
      status: task.status,
      actor: task.actor ?? null,
      platform: task.platform ?? null,
      cardId: task.cardId ?? null,
      draftId: task.draftId ?? null,
      description: task.description ?? null,
      dueDate: task.dueDate ?? null,
      createdAt: new Date(task.createdAt),
      updatedAt: new Date(task.updatedAt),
    });
    await this.touchWorkspace(wsId);
  }

  async loadTask(taskId: string): Promise<ContentTask | null> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select()
      .from(hostedTask)
      .where(and(
        eq(hostedTask.id, taskId),
        eq(hostedTask.userId, this._effectiveUserId),
        eq(hostedTask.workspaceId, wsId),
      ))
      .limit(1);
    return rows.length > 0 ? this.rowToTask(rows[0]) : null;
  }

  async listTasks(planId: string): Promise<ContentTask[]> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select()
      .from(hostedTask)
      .where(and(
        eq(hostedTask.planId, planId),
        eq(hostedTask.userId, this._effectiveUserId),
        eq(hostedTask.workspaceId, wsId),
      ))
      .orderBy(asc(hostedTask.createdAt));
    return rows.map((r) => this.rowToTask(r));
  }

  async updateTask(taskId: string, patch: Partial<ContentTask>): Promise<void> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    const existing = await this.loadTask(taskId);
    if (!existing) throw new Error(`Task "${taskId}" not found.`);
    const now = new Date();
    const updateData: Partial<typeof hostedTask.$inferInsert> = { updatedAt: now };
    if (patch.title !== undefined) updateData.title = patch.title;
    if (patch.type !== undefined) updateData.type = patch.type;
    if (patch.priority !== undefined) updateData.priority = patch.priority;
    if (patch.status !== undefined) updateData.status = patch.status;
    if (patch.actor !== undefined) updateData.actor = patch.actor ?? null;
    if (patch.platform !== undefined) updateData.platform = patch.platform ?? null;
    if (patch.cardId !== undefined) updateData.cardId = patch.cardId ?? null;
    if (patch.draftId !== undefined) updateData.draftId = patch.draftId ?? null;
    if (patch.description !== undefined) updateData.description = patch.description ?? null;
    if (patch.dueDate !== undefined) updateData.dueDate = patch.dueDate ?? null;
    await this.db
      .update(hostedTask)
      .set(updateData)
      .where(and(
        eq(hostedTask.id, taskId),
        eq(hostedTask.userId, this._effectiveUserId),
        eq(hostedTask.workspaceId, wsId),
      ));
    await this.touchWorkspace(wsId);
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    const existing = await this.loadTask(taskId);
    if (!existing) throw new Error(`Task "${taskId}" not found.`);
    await this.db
      .delete(hostedTask)
      .where(and(
        eq(hostedTask.id, taskId),
        eq(hostedTask.userId, this._effectiveUserId),
        eq(hostedTask.workspaceId, wsId),
      ));
    await this.touchWorkspace(wsId);
  }

  async getTodayQueue(): Promise<ContentTask[]> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.db
      .select()
      .from(hostedTask)
      .where(and(
        eq(hostedTask.userId, this._effectiveUserId),
        eq(hostedTask.workspaceId, wsId),
        inArray(hostedTask.status, ["todo", "doing"]),
        or(
          isNull(hostedTask.dueDate),
          lte(hostedTask.dueDate, today),
        ),
      ))
      .orderBy(asc(hostedTask.dueDate));
    return rows.map((r) => this.rowToTask(r));
  }

  async getCalendar(dateStart: string, dateEnd: string): Promise<CalendarEntry[]> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select()
      .from(hostedTask)
      .where(and(
        eq(hostedTask.userId, this._effectiveUserId),
        eq(hostedTask.workspaceId, wsId),
        sql`${hostedTask.dueDate} IS NOT NULL`,
        gte(hostedTask.dueDate, dateStart),
        lte(hostedTask.dueDate, dateEnd),
      ))
      .orderBy(asc(hostedTask.dueDate));

    const byDate = new Map<string, Array<{ taskId: string; planId: string }>>();
    for (const r of rows) {
      const date = r.dueDate!;
      const existing = byDate.get(date) ?? [];
      existing.push({ taskId: r.id, planId: r.planId });
      byDate.set(date, existing);
    }
    return Array.from(byDate.entries()).map(([date, tasks]) => ({ date, tasks }));
  }

  // ── SessionStore ─────────────────────────────────────────────────────────
  async createSession(session: Session): Promise<void> {
    await this.ensureInit();
    await this.db.insert(hostedSession).values({
      id: session.id,
      userId: this._effectiveUserId,
      workspaceId: session.workspaceId,
      scope: JSON.stringify(session.scope),
      state: session.state,
      degradation: JSON.stringify(session.degradation),
      contextSnapshot: session.contextSnapshot ?? null,
      startedAt: new Date(session.startedAt),
      lastActivityAt: new Date(session.lastActivityAt),
      closedAt: session.closedAt ? new Date(session.closedAt) : null,
      summary: session.summary ?? null,
    });
  }

  async loadSession(sessionId: string): Promise<Session | null> {
    await this.ensureInit();
    const rows = await this.db
      .select()
      .from(hostedSession)
      .where(and(
        eq(hostedSession.id, sessionId),
        eq(hostedSession.userId, this._effectiveUserId),
      ))
      .limit(1);
    return rows.length > 0 ? this.rowToSession(rows[0]) : null;
  }

  async listSessions(): Promise<Session[]> {
    await this.ensureInit();
    const wsId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select()
      .from(hostedSession)
      .where(and(
        eq(hostedSession.userId, this._effectiveUserId),
        eq(hostedSession.workspaceId, wsId),
      ))
      .orderBy(desc(hostedSession.lastActivityAt));
    return rows.map((r) => this.rowToSession(r));
  }

  async updateSession(sessionId: string, patch: Partial<Session>): Promise<void> {
    await this.ensureInit();
    const now = new Date();
    const updateData: Partial<typeof hostedSession.$inferInsert> = { lastActivityAt: now };
    if (patch.state !== undefined) updateData.state = patch.state;
    if (patch.scope !== undefined) updateData.scope = JSON.stringify(patch.scope);
    if (patch.degradation !== undefined) updateData.degradation = JSON.stringify(patch.degradation);
    if (patch.contextSnapshot !== undefined) updateData.contextSnapshot = patch.contextSnapshot ?? null;
    if (patch.closedAt !== undefined) updateData.closedAt = patch.closedAt ? new Date(patch.closedAt) : null;
    if (patch.summary !== undefined) updateData.summary = patch.summary ?? null;
    const result = await this.db
      .update(hostedSession)
      .set(updateData)
      .where(and(
        eq(hostedSession.id, sessionId),
        eq(hostedSession.userId, this._effectiveUserId),
      ));
    if (result.rowsAffected === 0) throw new Error(`Session "${sessionId}" not found.`);
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.ensureInit();
    const now = new Date();
    await this.db
      .update(hostedSession)
      .set({ state: "closing", closedAt: now, lastActivityAt: now })
      .where(and(
        eq(hostedSession.id, sessionId),
        eq(hostedSession.userId, this._effectiveUserId),
      ));
  }

  async findStaleSessions(olderThanMs: number): Promise<Session[]> {
    await this.ensureInit();
    const cutoff = new Date(Date.now() - olderThanMs);
    const wsId = await this.getCurrentWorkspaceId();
    const rows = await this.db
      .select()
      .from(hostedSession)
      .where(and(
        eq(hostedSession.userId, this._effectiveUserId),
        eq(hostedSession.workspaceId, wsId),
        ne(hostedSession.state, "closing"),
        lt(hostedSession.lastActivityAt, cutoff),
      ));
    return rows.map((r) => this.rowToSession(r));
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

const hostedStorageCache = new Map<string, WorkspaceStorage>();

export function getHostedUserStorage(userId: string, migrationsFolder?: string): WorkspaceStorage {
  const cached = hostedStorageCache.get(userId);
  if (cached) return cached;
  const instance = new HostedDbWorkspaceStorage(userId, undefined, migrationsFolder);
  hostedStorageCache.set(userId, instance);
  return instance;
}

export { createDb };
