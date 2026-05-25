import { sql } from "drizzle-orm";
import type { QuillbyDb } from "../index.js";

/**
 * Check whether a column exists in a table using SQLite pragma introspection.
 */
export async function columnExists(
  db: QuillbyDb,
  table: string,
  column: string,
): Promise<boolean> {
  try {
    const rows = await db.get<{ count: number }>(
      sql.raw(
        `SELECT COUNT(*) as count FROM pragma_table_info('${table}') WHERE name = '${column}'`,
      ),
    );
    return (rows?.count ?? 0) > 0;
  } catch {
    // Query failed — safer to assume column does not exist
    return false;
  }
}

/**
 * Return the highest applied schema version (0 if none).
 */
export async function getSchemaVersion(db: QuillbyDb): Promise<number> {
  try {
    const row = await db.get<{ v: number | null }>(
      sql.raw(`SELECT MAX(version) as v FROM _schema_version`),
    );
    return row?.v ?? 0;
  } catch {
    // Query failed — assume no migrations applied
    return 0;
  }
}

/**
 * Record a migration version so we never re-apply it.
 */
export async function recordMigration(
  db: QuillbyDb,
  version: number,
  name: string,
): Promise<void> {
  await db.run(
    sql.raw(
      `INSERT OR IGNORE INTO _schema_version (version, name) VALUES (${version}, '${name}')`,
    ),
  );
}

/**
 * Ensure hosted workspace storage tables exist.
 * Safe to call multiple times — uses schema version tracking and column-level
 * introspection instead of fragile error-string matching.
 *
 * NOTE: The core auth tables (user, session, account, verification, apikey) are
 * NOT created here. Better Auth bootstraps those automatically via its Drizzle
 * adapter on first server startup. See apps/mcp-server/src/auth.ts.
 */
export async function ensureHostedTables(dbInstance: QuillbyDb): Promise<void> {
  const run = (stmt: ReturnType<typeof sql.raw>) =>
    dbInstance.run(stmt).catch(() => {
      // Expected — table/view may already exist for CREATE/ALTER IF NOT EXISTS
    });

  // ── v1: Base tables ────────────────────────────────────────────────────────
  const baseTables = [
    sql.raw(`CREATE TABLE IF NOT EXISTS hosted_user_state (
      user_id TEXT PRIMARY KEY,
      current_workspace_id TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    )`),
    sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace (
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      face_reference_image_url TEXT,
      voice_reference_audio_url TEXT,
      clone_consent_granted INTEGER NOT NULL DEFAULT 0,
      clone_consent_at INTEGER,
      elevenlabs_cloned_voice_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      PRIMARY KEY (user_id, workspace_id)
    )`),
    sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_context (
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      PRIMARY KEY (user_id, workspace_id)
    )`),
    sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_memory (
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      PRIMARY KEY (user_id, workspace_id)
    )`),
    sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_sources (
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      urls TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (user_id, workspace_id)
    )`),
    sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_seen_urls (
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      urls TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (user_id, workspace_id)
    )`),
    sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_harvest (
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      data TEXT NOT NULL,
      generated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      PRIMARY KEY (user_id, workspace_id)
    )`),
    sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_draft (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      card_id INTEGER,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    )`),
    // v1.2: workspace sharing / team access
    sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_access (
      owner_user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      grantee_user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      PRIMARY KEY (owner_user_id, workspace_id, grantee_user_id)
    )`),
  ];

  for (const stmt of baseTables) {
    await run(stmt);
  }

  // ── Schema version tracking ────────────────────────────────────────────────
  await run(sql.raw(`CREATE TABLE IF NOT EXISTS _schema_version (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`));

  const currentVersion = await getSchemaVersion(dbInstance);

  // ── v2: Identity clone columns + generation jobs ──────────────────────────
  if (currentVersion < 2) {
    // Add identity clone columns to hosted_workspace (safe — only if missing)
    if (!(await columnExists(dbInstance, "hosted_workspace", "face_reference_image_url"))) {
      await run(
        sql.raw(`ALTER TABLE hosted_workspace ADD COLUMN face_reference_image_url TEXT`),
      );
    }
    if (!(await columnExists(dbInstance, "hosted_workspace", "voice_reference_audio_url"))) {
      await run(
        sql.raw(`ALTER TABLE hosted_workspace ADD COLUMN voice_reference_audio_url TEXT`),
      );
    }
    if (!(await columnExists(dbInstance, "hosted_workspace", "clone_consent_granted"))) {
      await run(
        sql.raw(
          `ALTER TABLE hosted_workspace ADD COLUMN clone_consent_granted INTEGER NOT NULL DEFAULT 0`,
        ),
      );
    }
    if (!(await columnExists(dbInstance, "hosted_workspace", "clone_consent_at"))) {
      await run(
        sql.raw(`ALTER TABLE hosted_workspace ADD COLUMN clone_consent_at INTEGER`),
      );
    }
    if (!(await columnExists(dbInstance, "hosted_workspace", "elevenlabs_cloned_voice_id"))) {
      await run(
        sql.raw(`ALTER TABLE hosted_workspace ADD COLUMN elevenlabs_cloned_voice_id TEXT`),
      );
    }

    // v2: Generation jobs table
    await run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_workspace_job (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL,
      modality TEXT NOT NULL,
      prompt TEXT NOT NULL,
      provider TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      output_ref TEXT,
      error TEXT,
      card_id INTEGER,
      meta TEXT,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    )`));

    // v2: Indexes
    await run(
      sql.raw(
        `CREATE INDEX IF NOT EXISTS hosted_job_user_workspace_idx ON hosted_workspace_job(user_id, workspace_id)`,
      ),
    );
    await run(
      sql.raw(
        `CREATE INDEX IF NOT EXISTS hosted_job_status_idx ON hosted_workspace_job(status)`,
      ),
    );

    await recordMigration(dbInstance, 2, "v2_multimodal_generation");
  }

  // ── v3: Content planning tables (plans, tasks, sessions) ───────────────────
  if (currentVersion < 3) {
    await run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_plan (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      date_start TEXT,
      date_end TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      tags TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    )`));
    await run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_plan_user_ws_idx ON hosted_plan(user_id, workspace_id)`));
    await run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_plan_user_ws_status_idx ON hosted_plan(user_id, workspace_id, status)`));

    await run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_task (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      actor TEXT,
      platform TEXT,
      card_id INTEGER,
      draft_id TEXT,
      description TEXT,
      due_date TEXT,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    )`));
    await run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_task_user_ws_idx ON hosted_task(user_id, workspace_id)`));
    await run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_task_user_ws_status_idx ON hosted_task(user_id, workspace_id, status)`));
    await run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_task_plan_id_idx ON hosted_task(plan_id)`));
    await run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_task_user_ws_due_date_idx ON hosted_task(user_id, workspace_id, due_date)`));

    await run(sql.raw(`CREATE TABLE IF NOT EXISTS hosted_session (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      state TEXT NOT NULL,
      degradation TEXT NOT NULL DEFAULT '{}',
      context_snapshot TEXT,
      started_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      last_activity_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      closed_at INTEGER,
      summary TEXT
    )`));
    await run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_session_user_ws_idx ON hosted_session(user_id, workspace_id)`));
    await run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_session_user_ws_state_idx ON hosted_session(user_id, workspace_id, state)`));
    await run(sql.raw(`CREATE INDEX IF NOT EXISTS hosted_session_user_ws_activity_idx ON hosted_session(user_id, workspace_id, last_activity_at)`));

    await recordMigration(dbInstance, 3, "v3_content_planning");
  }

  // ── Legacy fallback: idempotent ALTER TABLE for older deployments ──────────
  // Keeps the original try-catch approach so existing installations that lack
  // version tracking still converge safely.
  const legacyAlters: ReturnType<typeof sql.raw>[] = [
    sql.raw(`ALTER TABLE hosted_user_state ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'`),
    sql.raw(`ALTER TABLE hosted_workspace ADD COLUMN face_reference_image_url TEXT`),
    sql.raw(`ALTER TABLE hosted_workspace ADD COLUMN voice_reference_audio_url TEXT`),
    sql.raw(
      `ALTER TABLE hosted_workspace ADD COLUMN clone_consent_granted INTEGER NOT NULL DEFAULT 0`,
    ),
    sql.raw(`ALTER TABLE hosted_workspace ADD COLUMN clone_consent_at INTEGER`),
    sql.raw(`ALTER TABLE hosted_workspace ADD COLUMN elevenlabs_cloned_voice_id TEXT`),
  ];

  for (const stmt of legacyAlters) {
    await dbInstance.run(stmt).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      const causeMsg =
        typeof err === "object" && err !== null && "cause" in err
          ? String((err as { cause?: unknown }).cause)
          : "";
      const full = `${msg} ${causeMsg}`.toLowerCase();
      if (!full.includes("duplicate column")) throw err;
    });
  }
}
