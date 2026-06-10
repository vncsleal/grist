import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sql } from "drizzle-orm";
import { createDb, runHostedMigrations } from "@quillby/database";
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

describe("runHostedMigrations", () => {
  it("creates all hosted tables", async () => {
    const migrationsDir = path.resolve(import.meta.dirname, "../../drizzle");
    await runHostedMigrations(db, migrationsDir);

    const tables = await db.get<{ count: number }>(
      sql.raw(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name LIKE 'hosted_%'"
      )
    );
    expect(tables?.count).toBe(13);
  });

  it("is idempotent on second call", async () => {
    const migrationsDir = path.resolve(import.meta.dirname, "../../drizzle");
    await runHostedMigrations(db, migrationsDir);
    await runHostedMigrations(db, migrationsDir);

    const tables = await db.get<{ count: number }>(
      sql.raw(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name LIKE 'hosted_%'"
      )
    );
    expect(tables?.count).toBe(13);
  });
});
