// ─────────────────────────────────────────────────────────────────────────────
// Quillby App — browser-side API client
//
// Self-hosted connections use a session cookie issued by POST /api/app/connect.
// The API key is exchanged once (never stored in localStorage), after which
// all requests authenticate via the HttpOnly cookie. Cloud sessions rely
// on the Better Auth cookie set during sign-in.
// ─────────────────────────────────────────────────────────────────────────────

import { getDefaultApiBaseUrl } from "./auth";

const STORAGE_KEY = "quillby_connection";

export interface Connection {
  serverUrl: string; // e.g. "https://quillby.cloud" or "http://localhost:3000"
  // NOTE: apiKey is intentionally absent — it is exchanged for an HttpOnly
  // server session on connect and never written to localStorage.
}

function getApiBaseUrl(): string {
  return (getConnection()?.serverUrl ?? getDefaultApiBaseUrl()).replace(/\/$/, "");
}

export function getResolvedApiBaseUrl(): string {
  return getApiBaseUrl();
}

async function callAppApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401) {
    // Session expired (e.g. server restarted) — clear connection so the
    // user is redirected to the connect flow on next navigation.
    clearConnection();
    throw new Error("Session expired — please reconnect.");
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // fall back to status text
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export function getConnection(): Connection | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Connection;
  } catch {
    return null;
  }
}

export function saveConnection(conn: Connection): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
}

export function clearConnection(): void {
  const conn = getConnection();
  localStorage.removeItem(STORAGE_KEY);
  if (conn) {
    // Revoke the server-side session cookie. Fire-and-forget: if the server
    // is unreachable the cookie simply expires at its natural TTL.
    fetch(`${conn.serverUrl.replace(/\/$/, "")}/api/app/connect`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {});
  }
}

/**
 * Exchange an API key for an HttpOnly session cookie.
 * The key is sent once in a POST body and never written to localStorage.
 */
export async function exchangeApiKey(serverUrl: string, apiKey: string): Promise<void> {
  const base = serverUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/app/connect`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}: ${res.statusText}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  createdAt?: string;
  isActive?: boolean;
}

export interface Card {
  id: string;
  title: string;
  source?: string;
  url?: string;
  score?: number;
  summary?: string;
  curationStatus?: "pending" | "shortlisted" | "skipped";
  createdAt?: string;
  workspaceId?: string;
}

export interface Draft {
  id: string;
  format?: string;
  title?: string;
  content?: string;
  createdAt?: string;
  workspaceId?: string;
}

export interface GenerationJobInfo {
  id: string;
  workspaceId: string;
  modality: "image" | "audio" | "video";
  prompt: string;
  provider?: string;
  status: "queued" | "running" | "done" | "failed";
  outputRef?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  cardId?: number;
  meta?: string;
}

export interface AssetInfo {
  id: string;
  modality: "image" | "audio" | "video";
  provider?: string;
  outputRef: string;
  createdAt: string;
  updatedAt: string;
  mimeType: string;
  assetUrl: string;
}

export interface PlanInfo {
  plan: string;
  mode: string;
  planEnforcementEnabled: boolean;
  limits?: PlanLimitsInfo;
  billingPortalUrl?: string;
}

export interface PlanLimitsInfo {
  maxOwnedWorkspaces: number | null;
  maxDraftsPerWorkspace: number | null;
  harvestCooldownMs: number | null;
  imageCreditsPerMonth: number | null;
  audioCreditsPerMonth: number | null;
  videoCreditsPerMonth: number | null;
}

export interface UsageInfo {
  imageCreditsUsed: number;
  audioCreditsUsed: number;
  videoCreditsUsed: number;
}

export interface ProviderCapability {
  modality: "image" | "audio" | "video";
  available: boolean;
  tier: "sampling" | "cloud" | "direct" | null;
  setupMode: "host-client" | "user-env" | "admin-env" | "managed-cloud";
  message: string;
}

export interface ProviderPolicyInfo {
  deploymentMode: "local" | "self-hosted" | "cloud";
  recommendedPrimarySetup: "host-client" | "user-env" | "admin-env" | "managed-cloud";
  capabilities: ProviderCapability[];
  plan: string;
}

export interface ProviderConfigEntry {
  configured: boolean;
  provider?: string;
  secretStorage?: "keychain" | "encrypted-file";
  voiceId?: string;
  groupId?: string;
  source: "stored" | "environment" | "none";
}

export interface ProviderConfigInfo {
  config: {
    image: ProviderConfigEntry;
    audio: ProviderConfigEntry;
    video: ProviderConfigEntry;
  };
}

export interface ConnectorApiKey {
  id: string;
  name: string;
  prefix?: string | null;
  start?: string | null;
  enabled?: boolean;
  createdAt?: string;
  expiresAt?: string | null;
  rateLimitMax?: number | null;
  rateLimitTimeWindow?: number | null;
}

export async function ping(serverUrl?: string): Promise<string> {
  const base = (serverUrl ?? getApiBaseUrl()).replace(/\/$/, "");
  const res = await fetch(`${base}/health`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { status: string; version?: string };
  return data.version ?? data.status;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const result = await callAppApi<{
    workspaces?: Workspace[];
  }>("/api/app/workspaces");
  return result?.workspaces ?? [];
}

export async function selectWorkspace(workspaceId: string): Promise<void> {
  await callAppApi("/api/app/workspaces/select", {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });
}

export async function listCards(
  workspaceId?: string,
  status?: string
): Promise<Card[]> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (status && status !== "all") params.set("status", status);
  const result = await callAppApi<{
    cards?: Card[];
  }>(`/api/app/cards${params.size ? `?${params}` : ""}`);
  return result?.cards ?? [];
}

export async function curateCard(
  cardId: string,
  status: "shortlisted" | "skipped",
  workspaceId?: string
): Promise<void> {
  await callAppApi("/api/app/cards/curate", {
    method: "POST",
    body: JSON.stringify({ cardId, status, workspaceId }),
  });
}

export async function listDrafts(workspaceId?: string): Promise<Draft[]> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  const result = await callAppApi<{
    drafts?: Draft[];
  }>(`/api/app/drafts${params.size ? `?${params}` : ""}`);
  return result?.drafts ?? [];
}

export async function listJobs(
  workspaceId?: string,
  modality?: "image" | "audio" | "video"
): Promise<GenerationJobInfo[]> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (modality) params.set("modality", modality);
  const result = await callAppApi<{ jobs?: GenerationJobInfo[] }>(`/api/app/jobs${params.size ? `?${params}` : ""}`);
  return result.jobs ?? [];
}

export async function listAssets(
  workspaceId?: string,
  modality?: "image" | "audio" | "video"
): Promise<AssetInfo[]> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (modality) params.set("modality", modality);
  const result = await callAppApi<{ assets?: AssetInfo[] }>(`/api/app/assets${params.size ? `?${params}` : ""}`);
  return result.assets ?? [];
}

export async function getPlan(): Promise<PlanInfo> {
  const result = await callAppApi<PlanInfo>("/api/app/plan");
  return result as PlanInfo;
}

export async function getFullPlanInfo(): Promise<PlanInfo & { usage: UsageInfo }> {
  const plan = await getPlan();
  const jobs = plan.mode === "cloud" ? await listJobs() : [];
  const now = new Date();
  const currentMonth = jobs.filter((j) => {
    const d = new Date(j.createdAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const usage: UsageInfo = {
    imageCreditsUsed: currentMonth.filter((j) => j.modality === "image").length,
    audioCreditsUsed: currentMonth.filter((j) => j.modality === "audio").length,
    videoCreditsUsed: currentMonth.filter((j) => j.modality === "video").length,
  };
  return { ...plan, usage };
}

export async function listConnectorApiKeys(): Promise<ConnectorApiKey[]> {
  const result = await callAppApi<{ keys?: ConnectorApiKey[] }>("/api/app/api-keys");
  return result.keys ?? [];
}

export async function createConnectorApiKey(name: string, rateLimitMax?: number): Promise<{ key: string; meta: ConnectorApiKey }> {
  return await callAppApi<{ key: string; meta: ConnectorApiKey }>("/api/app/api-keys", {
    method: "POST",
    body: JSON.stringify({ name, rateLimitMax }),
  });
}

export async function revokeConnectorApiKey(keyId: string): Promise<void> {
  await callAppApi("/api/app/api-keys", {
    method: "DELETE",
    body: JSON.stringify({ keyId }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile (UserContext)
// ─────────────────────────────────────────────────────────────────────────────

export interface UserContextData {
  name?: string;
  role?: string;
  industry?: string;
  topics?: string[];
  voice?: string;
  audienceDescription?: string;
  contentGoals?: string[];
  excludeTopics?: string[];
  platforms?: string[];
}

export async function getProfile(): Promise<UserContextData | null> {
  const result = await callAppApi<{ profile?: UserContextData }>("/api/app/profile");
  return result.profile ?? null;
}

export async function updateProfile(updates: Partial<UserContextData>): Promise<UserContextData> {
  const result = await callAppApi<{ profile: UserContextData }>("/api/app/profile", {
    method: "PUT",
    body: JSON.stringify(updates),
  });
  return result.profile;
}

// ─────────────────────────────────────────────────────────────────────────────
// Memory
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryBuckets {
  voiceExamples: string[];
  styleRules: string[];
  audienceInsights: string[];
  doNotSay: string[];
  successfulPosts: string[];
  campaignContext: string[];
  sourcePreferences: string[];
  visualStyle: string[];
  voiceProfile: string[];
}

export async function getProviderPolicy(): Promise<ProviderPolicyInfo> {
  return await callAppApi<ProviderPolicyInfo>("/api/app/provider-policy");
}

export async function getProviderConfig(): Promise<ProviderConfigInfo> {
  return await callAppApi<ProviderConfigInfo>("/api/app/providers-config");
}

export async function saveProviderConfig(input: {
  modality: "image" | "audio" | "video";
  provider: string;
  apiKey: string;
  voiceId?: string;
  groupId?: string;
}): Promise<ProviderConfigInfo> {
  return await callAppApi<ProviderConfigInfo>("/api/app/providers-config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function clearProviderConfig(modality: "image" | "audio" | "video"): Promise<ProviderConfigInfo> {
  return await callAppApi<ProviderConfigInfo>("/api/app/providers-config", {
    method: "DELETE",
    body: JSON.stringify({ modality }),
  });
}

export async function getMemory(workspaceId?: string): Promise<MemoryBuckets> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  const result = await callAppApi<{ memory: MemoryBuckets }>(
    `/api/app/memory${params.size ? `?${params}` : ""}`
  );
  return result.memory;
}

export async function deleteMemoryEntry(
  memoryType: keyof MemoryBuckets,
  index: number,
  workspaceId?: string
): Promise<MemoryBuckets> {
  const result = await callAppApi<{ memory: MemoryBuckets }>("/api/app/memory/delete", {
    method: "POST",
    body: JSON.stringify({ memoryType, index, workspaceId }),
  });
  return result.memory;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feeds
// ─────────────────────────────────────────────────────────────────────────────

export async function listFeeds(workspaceId?: string): Promise<string[]> {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspaceId", workspaceId);
  const result = await callAppApi<{ feeds: string[] }>(
    `/api/app/feeds${params.size ? `?${params}` : ""}`
  );
  return result.feeds ?? [];
}

export async function addFeed(url: string, workspaceId?: string): Promise<string[]> {
  const result = await callAppApi<{ feeds: string[] }>("/api/app/feeds", {
    method: "POST",
    body: JSON.stringify({ url, workspaceId }),
  });
  return result.feeds ?? [];
}

export async function deleteFeed(url: string, workspaceId?: string): Promise<string[]> {
  const result = await callAppApi<{ feeds: string[] }>("/api/app/feeds", {
    method: "DELETE",
    body: JSON.stringify({ url, workspaceId }),
  });
  return result.feeds ?? [];
}
