import type {
  GenerationJob,
  GenerationModality,
  WorkspaceMetadata,
  UserContext,
  TypedMemory,
  HarvestBundle,
  CardInput,
  CurationStatus,
} from "./index.js";

// ─── Billing ports ──────────────────────────────────────────────────────────

export type HostedPlan = "free" | "pro";

export type PlanLimits = {
  imageCreditsPerMonth: number | null;
  audioCreditsPerMonth: number | null;
  videoCreditsPerMonth: number | null;
  maxWorkspaces: number | null;
};

export type BillingAction = "upgrade" | "downgrade" | "manage";

export interface BillingPort {
  isCloudMode(): boolean;
  isPlanEnforcementEnabled(): boolean;
  getPlanLimits(plan: HostedPlan): PlanLimits | null;
  getBillingActionUrl(action: BillingAction, currentPlan: HostedPlan, userId?: string): string | null;
  getBillingPortalUrl(): string | null;
}

// ─── Storage ports ────────────────────────────────────────────────────────────

export type CreateWorkspaceInput = {
  id?: string;
  name: string;
  description?: string;
  makeCurrent?: boolean;
};

export type DraftSummary = {
  id: string;
  platform: string;
  cardId?: number;
  createdAt: string;
  preview: string;
  content: string;
};

export interface PlanStorage {
  createPlan(plan: import("@quillby/content").ContentPlan): Promise<void>;
  loadPlan(planId: string): Promise<import("@quillby/content").ContentPlan | null>;
  listPlans(status?: import("@quillby/content").ContentPlanStatus): Promise<import("@quillby/content").ContentPlan[]>;
  updatePlan(planId: string, patch: Partial<import("@quillby/content").ContentPlan>): Promise<void>;
  deletePlan(planId: string): Promise<void>;
  createTask(task: import("@quillby/content").ContentTask): Promise<void>;
  loadTask(taskId: string): Promise<import("@quillby/content").ContentTask | null>;
  listTasks(planId: string): Promise<import("@quillby/content").ContentTask[]>;
  updateTask(taskId: string, patch: Partial<import("@quillby/content").ContentTask>): Promise<void>;
  deleteTask(taskId: string): Promise<void>;
  getCalendar(dateStart: string, dateEnd: string): Promise<import("@quillby/content").CalendarEntry[]>;
  getTodayQueue(): Promise<import("@quillby/content").ContentTask[]>;
}

export interface SessionStore {
  createSession(session: import("@quillby/content").Session): Promise<void>;
  loadSession(sessionId: string): Promise<import("@quillby/content").Session | null>;
  listSessions(): Promise<import("@quillby/content").Session[]>;
  updateSession(sessionId: string, patch: Partial<import("@quillby/content").Session>): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  findStaleSessions(olderThanMs: number): Promise<import("@quillby/content").Session[]>;
}

export interface CampaignStore {
  createCampaign(campaign: import("@quillby/content").Campaign): Promise<void>;
  loadCampaign(campaignId: string): Promise<import("@quillby/content").Campaign | null>;
  listCampaigns(status?: import("@quillby/content").CampaignStatus): Promise<import("@quillby/content").Campaign[]>;
  updateCampaign(campaignId: string, patch: Partial<import("@quillby/content").Campaign>): Promise<void>;
  deleteCampaign(campaignId: string): Promise<void>;
  saveBlueprint(blueprint: import("@quillby/content").Blueprint): Promise<void>;
  loadBlueprint(blueprintId: string): Promise<import("@quillby/content").Blueprint | null>;
  listBlueprints(): Promise<import("@quillby/content").Blueprint[]>;
  deleteBlueprint(blueprintId: string): Promise<void>;
}

export interface JobStorage {
  saveJob(job: GenerationJob): Promise<void>;
  loadJob(jobId: string): Promise<GenerationJob | null>;
  listJobs(modality?: GenerationModality): Promise<GenerationJob[]>;
  updateJob(jobId: string, patch: Partial<GenerationJob>): Promise<void>;
  getMonthlyJobCount?(modality: GenerationModality): Promise<number>;
}

export interface WorkspaceStorage {
  listWorkspaces(): Promise<WorkspaceMetadata[]>;
  workspaceExists(id: string): Promise<boolean>;
  loadWorkspace(id: string): Promise<WorkspaceMetadata | null>;
  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceMetadata>;
  getCurrentWorkspaceId(): Promise<string>;
  getCurrentWorkspace(): Promise<WorkspaceMetadata>;
  setCurrentWorkspace(id: string): Promise<WorkspaceMetadata>;
  touchWorkspace(id: string): Promise<void>;
  updateWorkspaceMetadata(patch: Partial<WorkspaceMetadata>): Promise<WorkspaceMetadata>;
  contextExists(): Promise<boolean>;
  loadContext(): Promise<UserContext | null>;
  saveContext(ctx: UserContext): Promise<void>;
  loadTypedMemory(): Promise<TypedMemory>;
  appendTypedMemory(type: keyof TypedMemory, entries: string[], limit?: number): Promise<void>;
  replaceTypedMemory(mem: TypedMemory): Promise<void>;
  loadSources(): Promise<string[]>;
  appendSources(urls: string[]): Promise<{ added: number; skipped: number }>;
  replaceSources(urls: string[]): Promise<void>;
  getSeenUrls(): Promise<Set<string>>;
  saveSeenUrls(urls: Set<string>): Promise<void>;
  loadLatestHarvest(): Promise<HarvestBundle>;
  latestHarvestExists(): Promise<boolean>;
  saveHarvestOutput(cards: CardInput[], seenUrls: Set<string>): Promise<string>;
  saveDraft(content: string, platform: string, cardId?: number): Promise<string>;
  saveCurationState(state: Record<string, CurationStatus>): Promise<void>;
  listDrafts(): Promise<DraftSummary[]>;
  withWorkspace(workspaceId: string): Promise<FullStorage>;
  getPlan(): Promise<HostedPlan>;
  shareWorkspace(workspaceId: string, granteeUserId: string, role: "viewer" | "editor"): Promise<void>;
  revokeAccess(workspaceId: string, granteeUserId: string): Promise<void>;
  listWorkspaceAccess(workspaceId: string): Promise<Array<{ userId: string; role: string }>>;
}

export type FullStorage = WorkspaceStorage & JobStorage & PlanStorage & SessionStore & CampaignStore;
