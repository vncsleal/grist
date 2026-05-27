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
  updateWorkspaceMetadata as wsUpdateWorkspaceMetadata,
  loadTypedMemory as wsLoadTypedMemory,
  appendTypedMemory as wsAppendTypedMemory,
  saveTypedMemory as wsSaveTypedMemory,
  loadSources as wsLoadSources,
  replaceSources as wsReplaceSources,
  appendSources as wsAppendSources,
  getSeenUrls as wsGetSeenUrls,
  saveSeenUrls as wsSaveSeenUrls,
  type CreateWorkspaceInput,
  type DraftSummary,
  type WorkspaceStorage,
  type JobStorage,
  type PlanStorage,
  type SessionStore,
  type CampaignStore,
} from "@quillby/workspace";
import {
  loadLatestHarvest as structsLoadLatest,
  latestHarvestExists as structsLatestExists,
  saveHarvestOutput as structsSaveHarvest,
  saveDraft as structsSaveDraft,
  saveCurationState as structsSaveCurationState,
  listLocalDrafts as structsListLocalDrafts,
} from "./structures.js";
import {
  saveJob as jobsSaveJob,
  loadJob as jobsLoadJob,
  listJobs as jobsListJobs,
  updateJob as jobsUpdateJob,
} from "./jobs.js";
import {
  type UserContext,
  type TypedMemory,
  type CardInput,
  type WorkspaceMetadata,
  type CurationStatus,
  type GenerationJob,
  type GenerationModality,
} from "@quillby/core";
import {
  type ContentPlan,
  type ContentPlanStatus,
  type ContentTask,
  type Session,
  type Campaign,
  type CampaignStatus,
  type Blueprint,
} from "@quillby/content";
import * as planStore from "./plans.js";
import * as sessionStore from "./sessions.js";
import * as campaignStore from "./campaigns.js";

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

export type { CreateWorkspaceInput, DraftSummary, WorkspaceStorage, JobStorage, PlanStorage, SessionStore, CampaignStore };
export {
  loadLatestHarvest,
  latestHarvestExists,
  saveHarvestOutput,
  saveDraft,
  saveCurationState,
  listLocalDrafts,
} from "./structures.js";
export {
  saveJob,
  loadJob,
  listJobs,
  updateJob,
} from "./jobs.js";
export {
  createPlan,
  loadPlan,
  listPlans,
  updatePlan,
  deletePlan,
  createTask,
  loadTask,
  listTasks,
  updateTask,
  deleteTask,
  getTodayQueue,
  getCalendar,
} from "./plans.js";
export {
  createSession,
  loadSession,
  listSessions,
  updateSession,
  closeSession,
  findStaleSessions,
} from "./sessions.js";
export {
  createCampaign,
  loadCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
  saveBlueprint,
  loadBlueprint,
  listBlueprints,
  deleteBlueprint,
} from "./campaigns.js";

// ── Local filesystem storage (stdio mode and local CLI) ──────────────────────
// TODO: Encrypt biometric PII (faceReferenceImageUrl, voiceReferenceAudioUrl)
// at rest. For now, the local filesystem is inherently local-only so the risk
// is lower than hosted DB storage (which has AES-256-GCM encryption applied).

export class LocalWorkspaceStorage implements WorkspaceStorage, JobStorage, PlanStorage, SessionStore, CampaignStore {
  async listWorkspaces() { return wsListWorkspaces(); }
  async workspaceExists(id: string) { return wsWorkspaceExists(id); }
  async loadWorkspace(id: string) { return wsLoadWorkspace(id); }
  async createWorkspace(input: CreateWorkspaceInput) { return wsCreateWorkspace(input); }
  async getCurrentWorkspaceId() { return getCurrentWorkspaceId(); }
  async getCurrentWorkspace() { return wsGetCurrentWorkspace(); }
  async setCurrentWorkspace(id: string) { return wsSetCurrentWorkspace(id); }
  async touchWorkspace(id: string) { wsTouchWorkspace(id); }
  async updateWorkspaceMetadata(patch: Partial<WorkspaceMetadata>) {
    return wsUpdateWorkspaceMetadata(getCurrentWorkspaceId(), patch);
  }
  async contextExists() { return workspaceContextExists(getCurrentWorkspaceId()); }
  async loadContext() { return loadWorkspaceContext(getCurrentWorkspaceId()); }
  async saveContext(ctx: UserContext) { saveWorkspaceContext(getCurrentWorkspaceId(), ctx); }
  async loadTypedMemory() { return wsLoadTypedMemory(getCurrentWorkspaceId()); }
  async appendTypedMemory(type: keyof TypedMemory, entries: string[], limit?: number) {
    wsAppendTypedMemory(getCurrentWorkspaceId(), type, entries, limit);
  }
  async replaceTypedMemory(mem: TypedMemory) { wsSaveTypedMemory(getCurrentWorkspaceId(), mem); }
  async loadSources() { return wsLoadSources(getCurrentWorkspaceId()); }
  async appendSources(urls: string[]) { return wsAppendSources(getCurrentWorkspaceId(), urls); }
  async replaceSources(urls: string[]) { wsReplaceSources(getCurrentWorkspaceId(), urls); }
  async getSeenUrls() { return wsGetSeenUrls(getCurrentWorkspaceId()); }
  async saveSeenUrls(urls: Set<string>) { wsSaveSeenUrls(getCurrentWorkspaceId(), urls); }
  async loadLatestHarvest() { return structsLoadLatest(); }
  async latestHarvestExists() { return structsLatestExists(); }
  async saveHarvestOutput(cards: CardInput[], seenUrls: Set<string>) { return structsSaveHarvest(cards, seenUrls); }
  async saveDraft(content: string, platform: string, cardId?: number) { return structsSaveDraft(content, platform, cardId); }
  async saveCurationState(state: Record<string, CurationStatus>) { structsSaveCurationState(state); }
  async listDrafts() { return structsListLocalDrafts(); }

  async saveJob(job: GenerationJob) { jobsSaveJob(job); }
  async loadJob(jobId: string) { return jobsLoadJob(jobId); }
  async listJobs(modality?: GenerationModality) { return jobsListJobs(modality); }
  async updateJob(jobId: string, patch: Partial<GenerationJob>) { jobsUpdateJob(jobId, patch); }
  async getMonthlyJobCount(_modality: GenerationModality): Promise<number> { return 0; }

  // ── PlanStorage ────────────────────────────────────────────────────────
  async createPlan(plan: ContentPlan) { planStore.createPlan(plan); }
  async loadPlan(planId: string) { return planStore.loadPlan(planId); }
  async listPlans(status?: ContentPlanStatus) { return planStore.listPlans(status); }
  async updatePlan(planId: string, patch: Partial<ContentPlan>) { planStore.updatePlan(planId, patch); }
  async deletePlan(planId: string) { planStore.deletePlan(planId); }
  async createTask(task: ContentTask) { planStore.createTask(task); }
  async loadTask(taskId: string) { return planStore.loadTask(taskId); }
  async listTasks(planId: string) { return planStore.listTasks(planId); }
  async updateTask(taskId: string, patch: Partial<ContentTask>) { planStore.updateTask(taskId, patch); }
  async deleteTask(taskId: string) { planStore.deleteTask(taskId); }
  async getCalendar(dateStart: string, dateEnd: string) { return planStore.getCalendar(dateStart, dateEnd); }
  async getTodayQueue() { return planStore.getTodayQueue(); }

  // ── SessionStore ──────────────────────────────────────────────────────
  async createSession(session: Session) { sessionStore.createSession(session); }
  async loadSession(sessionId: string) { return sessionStore.loadSession(sessionId); }
  async listSessions() { return sessionStore.listSessions(); }
  async updateSession(sessionId: string, patch: Partial<Session>) { sessionStore.updateSession(sessionId, patch); }
  async closeSession(sessionId: string) { sessionStore.closeSession(sessionId); }
  async findStaleSessions(olderThanMs: number) { return sessionStore.findStaleSessions(olderThanMs); }

  // ── CampaignStore ─────────────────────────────────────────────────────
  async createCampaign(campaign: Campaign) { campaignStore.createCampaign(campaign); }
  async loadCampaign(campaignId: string) { return campaignStore.loadCampaign(campaignId); }
  async listCampaigns(status?: CampaignStatus) { return campaignStore.listCampaigns(status); }
  async updateCampaign(campaignId: string, patch: Partial<Campaign>) { campaignStore.updateCampaign(campaignId, patch); }
  async deleteCampaign(campaignId: string) { campaignStore.deleteCampaign(campaignId); }
  async saveBlueprint(blueprint: Blueprint) { campaignStore.saveBlueprint(blueprint); }
  async loadBlueprint(blueprintId: string) { return campaignStore.loadBlueprint(blueprintId); }
  async listBlueprints() { return campaignStore.listBlueprints(); }
  async deleteBlueprint(blueprintId: string) { campaignStore.deleteBlueprint(blueprintId); }

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

class LocalPinnedStorage implements WorkspaceStorage, JobStorage, PlanStorage, SessionStore, CampaignStore {
  constructor(private readonly pinnedId: string) {}

  async listWorkspaces() { return wsListWorkspaces(); }
  async workspaceExists(id: string) { return wsWorkspaceExists(id); }
  async loadWorkspace(id: string) { return wsLoadWorkspace(id); }
  async createWorkspace(input: CreateWorkspaceInput) { return wsCreateWorkspace(input); }
  async getCurrentWorkspaceId() { return this.pinnedId; }
  async getCurrentWorkspace() { return wsLoadWorkspace(this.pinnedId) ?? wsGetCurrentWorkspace(); }
  async setCurrentWorkspace(): Promise<WorkspaceMetadata> { throw new Error("Cannot switch workspace on a pinned storage view."); }
  async touchWorkspace(id: string) { wsTouchWorkspace(id); }
  async updateWorkspaceMetadata(patch: Partial<WorkspaceMetadata>) {
    return wsUpdateWorkspaceMetadata(this.pinnedId, patch);
  }
  async contextExists() { return workspaceContextExists(this.pinnedId); }
  async loadContext() { return loadWorkspaceContext(this.pinnedId); }
  async saveContext(ctx: UserContext) { saveWorkspaceContext(this.pinnedId, ctx); }
  async loadTypedMemory() { return wsLoadTypedMemory(this.pinnedId); }
  async appendTypedMemory(type: keyof TypedMemory, entries: string[], limit?: number) {
    wsAppendTypedMemory(this.pinnedId, type, entries, limit);
  }
  async replaceTypedMemory(mem: TypedMemory) { wsSaveTypedMemory(this.pinnedId, mem); }
  async loadSources() { return wsLoadSources(this.pinnedId); }
  async appendSources(urls: string[]) { return wsAppendSources(this.pinnedId, urls); }
  async replaceSources(urls: string[]) { wsReplaceSources(this.pinnedId, urls); }
  async getSeenUrls() { return wsGetSeenUrls(this.pinnedId); }
  async saveSeenUrls(urls: Set<string>) { wsSaveSeenUrls(this.pinnedId, urls); }
  async loadLatestHarvest() { return structsLoadLatest(this.pinnedId); }
  async latestHarvestExists() { return structsLatestExists(this.pinnedId); }
  async saveHarvestOutput(cards: CardInput[], seenUrls: Set<string>) { return structsSaveHarvest(cards, seenUrls, this.pinnedId); }
  async saveDraft(content: string, platform: string, cardId?: number) { return structsSaveDraft(content, platform, cardId, this.pinnedId); }
  async saveCurationState(state: Record<string, CurationStatus>) { structsSaveCurationState(state, this.pinnedId); }
  async listDrafts() { return structsListLocalDrafts(this.pinnedId); }

  async saveJob(job: GenerationJob) { jobsSaveJob(job, this.pinnedId); }
  async loadJob(jobId: string) { return jobsLoadJob(jobId, this.pinnedId); }
  async listJobs(modality?: GenerationModality) { return jobsListJobs(modality, this.pinnedId); }
  async updateJob(jobId: string, patch: Partial<GenerationJob>) { jobsUpdateJob(jobId, patch, this.pinnedId); }
  async getMonthlyJobCount(_modality: GenerationModality): Promise<number> { return 0; }

  // ── PlanStorage ────────────────────────────────────────────────────────
  async createPlan(plan: ContentPlan) { planStore.createPlan(plan, this.pinnedId); }
  async loadPlan(planId: string) { return planStore.loadPlan(planId, this.pinnedId); }
  async listPlans(status?: ContentPlanStatus) { return planStore.listPlans(status, this.pinnedId); }
  async updatePlan(planId: string, patch: Partial<ContentPlan>) { planStore.updatePlan(planId, patch, this.pinnedId); }
  async deletePlan(planId: string) { planStore.deletePlan(planId, this.pinnedId); }
  async createTask(task: ContentTask) { planStore.createTask(task, this.pinnedId); }
  async loadTask(taskId: string) { return planStore.loadTask(taskId, this.pinnedId); }
  async listTasks(planId: string) { return planStore.listTasks(planId, this.pinnedId); }
  async updateTask(taskId: string, patch: Partial<ContentTask>) { planStore.updateTask(taskId, patch, this.pinnedId); }
  async deleteTask(taskId: string) { planStore.deleteTask(taskId, this.pinnedId); }
  async getCalendar(dateStart: string, dateEnd: string) { return planStore.getCalendar(dateStart, dateEnd, this.pinnedId); }
  async getTodayQueue() { return planStore.getTodayQueue(this.pinnedId); }

  // ── SessionStore ──────────────────────────────────────────────────────
  async createSession(session: Session) { sessionStore.createSession(session, this.pinnedId); }
  async loadSession(sessionId: string) { return sessionStore.loadSession(sessionId, this.pinnedId); }
  async listSessions() { return sessionStore.listSessions(this.pinnedId); }
  async updateSession(sessionId: string, patch: Partial<Session>) { sessionStore.updateSession(sessionId, patch, this.pinnedId); }
  async closeSession(sessionId: string) { sessionStore.closeSession(sessionId, this.pinnedId); }
  async findStaleSessions(olderThanMs: number) { return sessionStore.findStaleSessions(olderThanMs, this.pinnedId); }

  // ── CampaignStore ─────────────────────────────────────────────────────
  async createCampaign(campaign: Campaign) { campaignStore.createCampaign(campaign, this.pinnedId); }
  async loadCampaign(campaignId: string) { return campaignStore.loadCampaign(campaignId, this.pinnedId); }
  async listCampaigns(status?: CampaignStatus) { return campaignStore.listCampaigns(status, this.pinnedId); }
  async updateCampaign(campaignId: string, patch: Partial<Campaign>) { campaignStore.updateCampaign(campaignId, patch, this.pinnedId); }
  async deleteCampaign(campaignId: string) { campaignStore.deleteCampaign(campaignId, this.pinnedId); }
  async saveBlueprint(blueprint: Blueprint) { campaignStore.saveBlueprint(blueprint, this.pinnedId); }
  async loadBlueprint(blueprintId: string) { return campaignStore.loadBlueprint(blueprintId, this.pinnedId); }
  async listBlueprints() { return campaignStore.listBlueprints(this.pinnedId); }
  async deleteBlueprint(blueprintId: string) { campaignStore.deleteBlueprint(blueprintId, this.pinnedId); }

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

export class ScopedWorkspaceStorage implements WorkspaceStorage, JobStorage, PlanStorage, SessionStore, CampaignStore {
  constructor(private readonly homeDir: string) {}

  async listWorkspaces() { return withScopedHome(this.homeDir, () => wsListWorkspaces()); }
  async workspaceExists(id: string) { return withScopedHome(this.homeDir, () => wsWorkspaceExists(id)); }
  async loadWorkspace(id: string) { return withScopedHome(this.homeDir, () => wsLoadWorkspace(id)); }
  async createWorkspace(input: CreateWorkspaceInput) { return withScopedHome(this.homeDir, () => wsCreateWorkspace(input)); }
  async getCurrentWorkspaceId() { return withScopedHome(this.homeDir, () => getCurrentWorkspaceId()); }
  async getCurrentWorkspace() { return withScopedHome(this.homeDir, () => wsGetCurrentWorkspace()); }
  async setCurrentWorkspace(id: string) { return withScopedHome(this.homeDir, () => wsSetCurrentWorkspace(id)); }
  async touchWorkspace(id: string) { withScopedHome(this.homeDir, () => wsTouchWorkspace(id)); }
  async updateWorkspaceMetadata(patch: Partial<WorkspaceMetadata>) {
    return withScopedHome(this.homeDir, () => wsUpdateWorkspaceMetadata(getCurrentWorkspaceId(), patch));
  }
  async contextExists() { return withScopedHome(this.homeDir, () => workspaceContextExists(getCurrentWorkspaceId())); }
  async loadContext() { return withScopedHome(this.homeDir, () => loadWorkspaceContext(getCurrentWorkspaceId())); }
  async saveContext(ctx: UserContext) { withScopedHome(this.homeDir, () => saveWorkspaceContext(getCurrentWorkspaceId(), ctx)); }
  async loadTypedMemory() { return withScopedHome(this.homeDir, () => wsLoadTypedMemory(getCurrentWorkspaceId())); }
  async appendTypedMemory(type: keyof TypedMemory, entries: string[], limit?: number) {
    withScopedHome(this.homeDir, () => wsAppendTypedMemory(getCurrentWorkspaceId(), type, entries, limit));
  }
  async replaceTypedMemory(mem: TypedMemory) { withScopedHome(this.homeDir, () => wsSaveTypedMemory(getCurrentWorkspaceId(), mem)); }
  async loadSources() { return withScopedHome(this.homeDir, () => wsLoadSources(getCurrentWorkspaceId())); }
  async appendSources(urls: string[]) { return withScopedHome(this.homeDir, () => wsAppendSources(getCurrentWorkspaceId(), urls)); }
  async replaceSources(urls: string[]) { withScopedHome(this.homeDir, () => wsReplaceSources(getCurrentWorkspaceId(), urls)); }
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

  async saveJob(job: GenerationJob) { withScopedHome(this.homeDir, () => jobsSaveJob(job)); }
  async loadJob(jobId: string) { return withScopedHome(this.homeDir, () => jobsLoadJob(jobId)); }
  async listJobs(modality?: GenerationModality) { return withScopedHome(this.homeDir, () => jobsListJobs(modality)); }
  async updateJob(jobId: string, patch: Partial<GenerationJob>) { withScopedHome(this.homeDir, () => jobsUpdateJob(jobId, patch)); }
  async getMonthlyJobCount(_modality: GenerationModality): Promise<number> { return 0; }

  // ── PlanStorage ────────────────────────────────────────────────────────
  async createPlan(plan: ContentPlan) { withScopedHome(this.homeDir, () => planStore.createPlan(plan)); }
  async loadPlan(planId: string) { return withScopedHome(this.homeDir, () => planStore.loadPlan(planId)); }
  async listPlans(status?: ContentPlanStatus) { return withScopedHome(this.homeDir, () => planStore.listPlans(status)); }
  async updatePlan(planId: string, patch: Partial<ContentPlan>) { withScopedHome(this.homeDir, () => planStore.updatePlan(planId, patch)); }
  async deletePlan(planId: string) { withScopedHome(this.homeDir, () => planStore.deletePlan(planId)); }
  async createTask(task: ContentTask) { withScopedHome(this.homeDir, () => planStore.createTask(task)); }
  async loadTask(taskId: string) { return withScopedHome(this.homeDir, () => planStore.loadTask(taskId)); }
  async listTasks(planId: string) { return withScopedHome(this.homeDir, () => planStore.listTasks(planId)); }
  async updateTask(taskId: string, patch: Partial<ContentTask>) { withScopedHome(this.homeDir, () => planStore.updateTask(taskId, patch)); }
  async deleteTask(taskId: string) { withScopedHome(this.homeDir, () => planStore.deleteTask(taskId)); }
  async getCalendar(dateStart: string, dateEnd: string) { return withScopedHome(this.homeDir, () => planStore.getCalendar(dateStart, dateEnd)); }
  async getTodayQueue() { return withScopedHome(this.homeDir, () => planStore.getTodayQueue()); }

  // ── SessionStore ──────────────────────────────────────────────────────
  async createSession(session: Session) { withScopedHome(this.homeDir, () => sessionStore.createSession(session)); }
  async loadSession(sessionId: string) { return withScopedHome(this.homeDir, () => sessionStore.loadSession(sessionId)); }
  async listSessions() { return withScopedHome(this.homeDir, () => sessionStore.listSessions()); }
  async updateSession(sessionId: string, patch: Partial<Session>) { withScopedHome(this.homeDir, () => sessionStore.updateSession(sessionId, patch)); }
  async closeSession(sessionId: string) { withScopedHome(this.homeDir, () => sessionStore.closeSession(sessionId)); }
  async findStaleSessions(olderThanMs: number) { return withScopedHome(this.homeDir, () => sessionStore.findStaleSessions(olderThanMs)); }

  // ── CampaignStore ─────────────────────────────────────────────────────
  async createCampaign(campaign: Campaign) { withScopedHome(this.homeDir, () => campaignStore.createCampaign(campaign)); }
  async loadCampaign(campaignId: string) { return withScopedHome(this.homeDir, () => campaignStore.loadCampaign(campaignId)); }
  async listCampaigns(status?: CampaignStatus) { return withScopedHome(this.homeDir, () => campaignStore.listCampaigns(status)); }
  async updateCampaign(campaignId: string, patch: Partial<Campaign>) { withScopedHome(this.homeDir, () => campaignStore.updateCampaign(campaignId, patch)); }
  async deleteCampaign(campaignId: string) { withScopedHome(this.homeDir, () => campaignStore.deleteCampaign(campaignId)); }
  async saveBlueprint(blueprint: Blueprint) { withScopedHome(this.homeDir, () => campaignStore.saveBlueprint(blueprint)); }
  async loadBlueprint(blueprintId: string) { return withScopedHome(this.homeDir, () => campaignStore.loadBlueprint(blueprintId)); }
  async listBlueprints() { return withScopedHome(this.homeDir, () => campaignStore.listBlueprints()); }
  async deleteBlueprint(blueprintId: string) { withScopedHome(this.homeDir, () => campaignStore.deleteBlueprint(blueprintId)); }

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
