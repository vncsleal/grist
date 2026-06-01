import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const hostedUserState = sqliteTable("hosted_user_state", {
  userId: text("user_id").primaryKey(),
  currentWorkspaceId: text("current_workspace_id").notNull(),
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
}, (t) => [index("hosted_draft_user_ws_idx").on(t.userId, t.workspaceId)]);

export const hostedWorkspaceAccess = sqliteTable("hosted_workspace_access", {
  ownerUserId: text("owner_user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  granteeUserId: text("grantee_user_id").notNull(),
  role: text("role").notNull().default("viewer"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [
  primaryKey({ columns: [t.ownerUserId, t.workspaceId, t.granteeUserId] }),
  index("hosted_access_grantee_idx").on(t.granteeUserId),
  index("hosted_access_workspace_idx").on(t.ownerUserId, t.workspaceId),
]);

export const hostedWorkspaceJob = sqliteTable("hosted_workspace_job", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  modality: text("modality", { enum: ["image", "audio", "video"] }).notNull(),
  prompt: text("prompt").notNull(),
  provider: text("provider"),
  status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
  outputRef: text("output_ref"),
  error: text("error"),
  cardId: integer("card_id"),
  meta: text("meta"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
}, (t) => [
  index("hosted_job_user_workspace_idx").on(t.userId, t.workspaceId),
  index("hosted_job_user_ws_modality_idx").on(t.userId, t.workspaceId, t.modality),
  index("hosted_job_status_idx").on(t.status),
]);

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
