import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

// ── Core better-auth tables ───────────────────────────────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now).$onUpdate(() => new Date()),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now).$onUpdate(() => new Date()),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [
  index("session_user_id_idx").on(t.userId),
  index("session_expires_at_idx").on(t.expiresAt),
]);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now).$onUpdate(() => new Date()),
}, (t) => [index("account_user_id_idx").on(t.userId)]);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now).$onUpdate(() => new Date()),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

// ── apiKey plugin table ───────────────────────────────────────────────────
// Column layout mirrors better-auth's internal model so the drizzle adapter
// resolves fields without any custom mapping.

export const apikey = sqliteTable("apikey", {
  id: text("id").primaryKey(),
  configId: text("config_id").notNull().default("default"),
  name: text("name"),
  /** First few visible chars shown to the user (never the full key). */
  start: text("start"),
  prefix: text("prefix"),
  /** SHA-256 hash of the raw token — raw token is never stored. */
  key: text("key").notNull(),
  referenceId: text("reference_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  refillInterval: integer("refill_interval"),
  refillAmount: integer("refill_amount"),
  lastRefillAt: integer("last_refill_at", { mode: "timestamp_ms" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  rateLimitEnabled: integer("rate_limit_enabled", { mode: "boolean" }),
  rateLimitTimeWindow: integer("rate_limit_time_window"),
  rateLimitMax: integer("rate_limit_max"),
  requestCount: integer("request_count").notNull().default(0),
  remaining: integer("remaining"),
  lastRequest: integer("last_request", { mode: "timestamp_ms" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now).$onUpdate(() => new Date()),
  /** JSON-encoded permissions map, e.g. `{"mcp":["read","write"]}`. */
  permissions: text("permissions"),
  /** Arbitrary JSON metadata for future use (tier, labels, etc.). */
  metadata: text("metadata"),
}, (t) => [
  index("apikey_reference_id_idx").on(t.referenceId),
  index("apikey_config_id_idx").on(t.configId),
]);

// ── Hosted workspace storage tables (v0.8) ───────────────────────────────
// All hosted user state is partitioned by user_id so each user's data
// is completely isolated in the shared database.

export const hostedUserState = sqliteTable("hosted_user_state", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  currentWorkspaceId: text("current_workspace_id").notNull(),
  /** Subscription plan: free | pro. Defaults to free. */
  plan: text("plan").notNull().default("free"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const hostedWorkspace = sqliteTable("hosted_workspace", {
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  faceReferenceImageUrl: text("face_reference_image_url"),
  voiceReferenceAudioUrl: text("voice_reference_audio_url"),
  cloneConsentGranted: integer("clone_consent_granted", { mode: "boolean" }).notNull().default(false),
  cloneConsentAt: integer("clone_consent_at", { mode: "timestamp_ms" }),
  elevenlabsClonedVoiceId: text("elevenlabs_cloned_voice_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [
  primaryKey({ columns: [t.userId, t.workspaceId] }),
  index("hosted_workspace_user_id_idx").on(t.userId),
]);

export const hostedWorkspaceContext = sqliteTable("hosted_workspace_context", {
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [primaryKey({ columns: [t.userId, t.workspaceId] })]);

export const hostedWorkspaceMemory = sqliteTable("hosted_workspace_memory", {
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [primaryKey({ columns: [t.userId, t.workspaceId] })]);

export const hostedWorkspaceSources = sqliteTable("hosted_workspace_sources", {
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  urls: text("urls").notNull().default("[]"),
}, (t) => [primaryKey({ columns: [t.userId, t.workspaceId] })]);

export const hostedWorkspaceSeenUrls = sqliteTable("hosted_workspace_seen_urls", {
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  urls: text("urls").notNull().default("[]"),
}, (t) => [primaryKey({ columns: [t.userId, t.workspaceId] })]);

export const hostedWorkspaceHarvest = sqliteTable("hosted_workspace_harvest", {
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  data: text("data").notNull(),
  generatedAt: integer("generated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [primaryKey({ columns: [t.userId, t.workspaceId] })]);

export const hostedWorkspaceDraft = sqliteTable("hosted_workspace_draft", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  platform: text("platform").notNull(),
  cardId: integer("card_id"),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [index("hosted_draft_user_workspace_idx").on(t.userId, t.workspaceId)]);

// ── Workspace sharing / team access (v1.2) ───────────────────────────────
// Tracks which users have been granted access to another user's workspace.
// ownerUserId + workspaceId identify the workspace; granteeUserId is the user
// being given access; role is "viewer" (read-only) or "editor" (read-write).

export const hostedWorkspaceAccess = sqliteTable("hosted_workspace_access", {
  ownerUserId: text("owner_user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  granteeUserId: text("grantee_user_id").notNull(),
  role: text("role").notNull().default("viewer"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [
  primaryKey({ columns: [t.ownerUserId, t.workspaceId, t.granteeUserId] }),
  index("hosted_access_grantee_idx").on(t.granteeUserId),
  index("hosted_access_owner_ws_idx").on(t.ownerUserId, t.workspaceId),
]);

// ── Generation jobs (v2) ─────────────────────────────────────────────────────
// Tracks async image/audio/video generation requests per user+workspace.

export const hostedWorkspaceJob = sqliteTable("hosted_workspace_job", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull(),
  /** "image" | "audio" | "video" */
  modality: text("modality", { enum: ["image", "audio", "video"] }).notNull(),
  prompt: text("prompt").notNull(),
  /** e.g. "openai/gpt-image-1" — null while queued */
  provider: text("provider"),
  /** "queued" | "running" | "done" | "failed" */
  status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
  /** Path or URL of the finished asset */
  outputRef: text("output_ref"),
  error: text("error"),
  cardId: integer("card_id"),
  /** Extra JSON metadata (mimeType, dimensions, duration, etc.) */
  meta: text("meta"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [
  index("hosted_job_user_workspace_idx").on(t.userId, t.workspaceId),
  index("hosted_job_user_ws_modality_idx").on(t.userId, t.workspaceId, t.modality),
  index("hosted_job_status_idx").on(t.status),
  index("hosted_job_status_updated_idx").on(t.status, t.updatedAt),
]);

// ── Content Plans (v3) ───────────────────────────────────────────────────────

export const hostedPlan = sqliteTable("hosted_plan", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  dateStart: text("date_start"),
  dateEnd: text("date_end"),
  status: text("status", { enum: ["active", "completed", "archived"] }).notNull().default("active"),
  tags: text("tags").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [
  index("hosted_plan_user_ws_idx").on(t.userId, t.workspaceId),
  index("hosted_plan_user_ws_status_idx").on(t.userId, t.workspaceId, t.status),
]);

// ── Content Tasks (v3) ───────────────────────────────────────────────────────

export const hostedTask = sqliteTable("hosted_task", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  planId: text("plan_id").notNull(),
  title: text("title").notNull(),
  type: text("type", { enum: ["compose", "curate", "review", "research", "publish", "design", "other"] }).notNull(),
  priority: text("priority", { enum: ["p1", "p2", "p3"] }).notNull(),
  status: text("status", { enum: ["todo", "doing", "review", "done", "cancelled"] }).notNull(),
  actor: text("actor"),
  platform: text("platform"),
  cardId: integer("card_id"),
  draftId: text("draft_id"),
  description: text("description"),
  dueDate: text("due_date"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [
  index("hosted_task_user_ws_idx").on(t.userId, t.workspaceId),
  index("hosted_task_user_ws_status_idx").on(t.userId, t.workspaceId, t.status),
  index("hosted_task_plan_id_idx").on(t.planId),
  index("hosted_task_user_ws_due_date_idx").on(t.userId, t.workspaceId, t.dueDate),
]);

// ── Content Sessions (v3) ────────────────────────────────────────────────────

export const hostedSession = sqliteTable("hosted_session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  scope: text("scope").notNull(),
  state: text("state", { enum: ["planning", "executing", "reviewing", "closing"] }).notNull(),
  degradation: text("degradation").notNull().default("{}"),
  contextSnapshot: text("context_snapshot"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().default(now),
  lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }).notNull().default(now),
  closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  summary: text("summary"),
}, (t) => [
  index("hosted_session_user_ws_idx").on(t.userId, t.workspaceId),
  index("hosted_session_user_ws_state_idx").on(t.userId, t.workspaceId, t.state),
  index("hosted_session_user_ws_activity_idx").on(t.userId, t.workspaceId, t.lastActivityAt),
]);
