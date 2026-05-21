import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sql } from "drizzle-orm";
import {
  createDb,
  columnExists,
  getSchemaVersion,
  recordMigration,
  ensureHostedTables,
} from "@quillby/database";
import type { QuillbyDb } from "@quillby/database";

let tempDir = "";
let dbPath = "";
let db: QuillbyDb;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-migration-"));
  dbPath = path.join(tempDir, "test.db");
  const created = createDb(`file:${dbPath}`);
  db = created.db;
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("columnExists", () => {
  it("returns true for existing columns", async () => {
    await db.run(sql.raw("CREATE TABLE test_table (id INTEGER)"));
    const exists = await columnExists(db, "test_table", "id");
    expect(exists).toBe(true);
  });

  it("returns false for non-existing columns", async () => {
    await db.run(sql.raw("CREATE TABLE test_table (id INTEGER)"));
    const exists = await columnExists(db, "test_table", "name");
    expect(exists).toBe(false);
  });
});

describe("getSchemaVersion", () => {
  it("returns 0 when no migrations table exists", async () => {
    const version = await getSchemaVersion(db);
    expect(version).toBe(0);
  });
});

describe("recordMigration", () => {
  it("inserts version entry and getSchemaVersion returns it", async () => {
    await db.run(
      sql.raw(`CREATE TABLE IF NOT EXISTS _schema_version (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`)
    );
    await recordMigration(db, 1, "v1_initial");
    const version = await getSchemaVersion(db);
    expect(version).toBe(1);
  });
});

describe("ensureHostedTables", () => {
  it("creates base tables", async () => {
    await ensureHostedTables(db);
    const tables = await db.get<{ count: number }>(
      sql.raw(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name LIKE 'hosted_%'"
      )
    );
    expect(tables?.count).toBeGreaterThanOrEqual(8);
  });

  it("creates v2 tables when version < 2", async () => {
    await ensureHostedTables(db);
    const jobTable = await db.get<{ count: number }>(
      sql.raw(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='hosted_workspace_job'"
      )
    );
    expect(jobTable?.count).toBe(1);

    const version = await getSchemaVersion(db);
    expect(version).toBe(3);
  });

  it("skips v2 tables when version >= 2", async () => {
    await ensureHostedTables(db);
    const version1 = await getSchemaVersion(db);
    expect(version1).toBe(3);

    await ensureHostedTables(db);
    const version2 = await getSchemaVersion(db);
    expect(version2).toBe(3);
  });
});
