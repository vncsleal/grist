import { sql } from "drizzle-orm";
import { migrate as drizzleMigrate } from "drizzle-orm/libsql/migrator";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "./schema.js";

/**
 * Run Drizzle Kit managed migrations for hosted storage tables.
 * Uses migration files from the provided folder path.
 */
export async function runHostedMigrations(
  db: LibSQLDatabase<typeof schema>,
  migrationsFolder: string,
): Promise<void> {
  await drizzleMigrate(db, { migrationsFolder });
}

/**
 * Push all hosted tables directly via DDL (equivalent to `drizzle-kit push`).
 * Uses CREATE TABLE IF NOT EXISTS so it's safe for both fresh and existing DBs.
 * Intended for tests and bootstrap scenarios where migration files are not available.
 */
export async function pushHostedSchema(db: LibSQLDatabase<typeof schema>): Promise<void> {
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_user_state (
    user_id TEXT PRIMARY KEY,
    current_workspace_id TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT,
    current_period_end INTEGER,
    cancel_at_period_end INTEGER,
    trial_ends_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
  )`));
  // Add columns to existing databases — safe no-ops if already present.
  for (const col of [
    "stripe_customer_id TEXT",
    "stripe_subscription_id TEXT",
    "subscription_status TEXT",
    "current_period_end INTEGER",
    "cancel_at_period_end INTEGER",
    "trial_ends_at INTEGER",
  ]) {
    try {
      await db.run(sql.raw(`ALTER TABLE hosted_user_state ADD COLUMN ${col}`));
    } catch {
      // Column already exists — swallow the error.
    }
  }
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace (
    user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '', face_reference_image_url TEXT,
    voice_reference_audio_url TEXT, clone_consent_granted INTEGER NOT NULL DEFAULT 0,
    clone_consent_at INTEGER, elevenlabs_cloned_voice_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    PRIMARY KEY (user_id, workspace_id)
  )`));
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_context (
    user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, data TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    PRIMARY KEY (user_id, workspace_id)
  )`));
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_memory (
    user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, data TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    PRIMARY KEY (user_id, workspace_id)
  )`));
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_sources (
    user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, urls TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (user_id, workspace_id)
  )`));
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_seen_urls (
    user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, urls TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (user_id, workspace_id)
  )`));
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_harvest (
    user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, data TEXT NOT NULL,
    generated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    PRIMARY KEY (user_id, workspace_id)
  )`));
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_draft (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
    platform TEXT NOT NULL, card_id INTEGER, content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
  )`));
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_access (
    owner_user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
    grantee_user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    PRIMARY KEY (owner_user_id, workspace_id, grantee_user_id)
  )`));
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_job (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
    modality TEXT NOT NULL, prompt TEXT NOT NULL, provider TEXT,
    status TEXT NOT NULL DEFAULT 'queued', output_ref TEXT, error TEXT,
    card_id INTEGER, meta TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
  )`));
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_plan (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
    name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    date_start TEXT, date_end TEXT, status TEXT NOT NULL DEFAULT 'active',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
  )`));
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_task (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
    plan_id TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL,
    priority TEXT NOT NULL, status TEXT NOT NULL, actor TEXT,
    platform TEXT, card_id INTEGER, draft_id TEXT, description TEXT, due_date TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
  )`));
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_session (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
    scope TEXT NOT NULL, state TEXT NOT NULL,
    degradation TEXT NOT NULL DEFAULT '{}', context_snapshot TEXT,
    started_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    last_activity_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    closed_at INTEGER, summary TEXT
  )`));

  // ── Secondary indexes ───────────────────────────────────────────────────
  // These match the Drizzle ORM index() definitions in schema.ts.

  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_workspace_user_id_idx
    ON hosted_workspace(user_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_workspace_user_name_idx
    ON hosted_workspace(user_id, name)`));

  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_draft_user_ws_created_idx
    ON hosted_workspace_draft(user_id, workspace_id, created_at)`));

  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_access_grantee_idx
    ON hosted_workspace_access(grantee_user_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_access_grantee_ws_idx
    ON hosted_workspace_access(grantee_user_id, workspace_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_access_owner_ws_idx
    ON hosted_workspace_access(owner_user_id, workspace_id)`));

  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_job_user_ws_created_idx
    ON hosted_workspace_job(user_id, workspace_id, created_at)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_job_user_ws_modality_created_idx
    ON hosted_workspace_job(user_id, workspace_id, modality, created_at)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_job_status_idx
    ON hosted_workspace_job(status)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_job_status_updated_idx
    ON hosted_workspace_job(status, updated_at)`));

  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_plan_user_ws_created_idx
    ON hosted_plan(user_id, workspace_id, created_at)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_plan_user_ws_status_created_idx
    ON hosted_plan(user_id, workspace_id, status, created_at)`));

  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_task_user_ws_idx
    ON hosted_task(user_id, workspace_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_task_user_ws_status_idx
    ON hosted_task(user_id, workspace_id, status)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_task_plan_user_ws_idx
    ON hosted_task(plan_id, user_id, workspace_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_task_user_ws_due_date_idx
    ON hosted_task(user_id, workspace_id, due_date)`));

  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_session_user_ws_idx
    ON hosted_session(user_id, workspace_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_session_user_ws_state_idx
    ON hosted_session(user_id, workspace_id, state)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_session_user_ws_activity_idx
    ON hosted_session(user_id, workspace_id, last_activity_at)`));

  // ── Stripe webhook idempotency tracking ──────────────────────────────────
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS stripe_webhook_event (
    id TEXT PRIMARY KEY,
    stripe_event_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    user_id TEXT,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
  )`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS stripe_webhook_event_id_idx
    ON stripe_webhook_event(stripe_event_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS stripe_webhook_created_idx
    ON stripe_webhook_event(created_at)`));
}
