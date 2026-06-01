import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import * as schema from "./db/schema.js";

// QUILLBY_AUTH_DB_URL accepts any libSQL connection string:
//   file:./quillby-auth.db         — local SQLite (default, zero setup)
//   libsql://<db>.turso.io         — Turso remote  (v0.8+ production)
//   libsql://localhost:8080?tls=0  — local sqld instance

export interface DbPoolConfig {
  /** Max concurrent connections for remote libSQL/Turso. Default: 10. */
  maxConnections?: number;
  /** Connection timeout in ms. Default: 5000. */
  connectTimeoutMs?: number;
}

export function createDb(url: string, authToken?: string, poolConfig?: DbPoolConfig) {
  const c = createClient({
    url,
    authToken,
    ...(poolConfig?.maxConnections ? { maxSize: poolConfig.maxConnections } : {}),
    ...(poolConfig?.connectTimeoutMs ? { connectTimeoutMs: poolConfig.connectTimeoutMs } : {}),
  });
  return { client: c, db: drizzle(c, { schema }) };
}

const defaultUrl = process.env.QUILLBY_AUTH_DB_URL ?? "file:./quillby-auth.db";
export const { client, db } = createDb(defaultUrl, process.env.LIBSQL_AUTH_TOKEN);
export type QuillbyDb = typeof db;

/**
 * Lightweight health check: runs SELECT 1 against the database.
 * Returns true if the query succeeds within the timeout.
 */
export async function checkDbHealth(dbClient: QuillbyDb): Promise<boolean> {
  try {
    await dbClient.run(sql.raw("SELECT 1"));
    return true;
  } catch {
    return false;
  }
}

export * from "./db/schema.js";
export * from "./db/migrate-hosted.js";
