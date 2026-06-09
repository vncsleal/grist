import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import * as schema from "./db/schema.js";

// QUILLBY_AUTH_DB_URL accepts any libSQL connection string:
//   file:./quillby-auth.db            — local SQLite (default, zero setup)
//   libsql://<db>.turso.io            — Turso remote  (production)
//   https://<db>.turso.io             — Turso via HTTP
//
// Production Turso configuration:
//   QUILLBY_AUTH_DB_URL=libsql://<db>.turso.io
//   LIBSQL_AUTH_TOKEN=<token>
//   QUILLBY_DB_CONCURRENCY=20         (optional, default 20)
//
// The concurrency option controls parallel request throughput to Turso.
// Increase to 50-100 for high-traffic deployments. For local SQLite files
// concurrency has no effect — the file handle is serialized by SQLite.

export interface DbPoolConfig {
  /** Max concurrent requests for remote libSQL/Turso. Default: 20. Maps to
   * the libSQL `concurrency` option. */
  concurrency?: number;
  /** Max retry attempts on query failure for remote connections.
   * Uses exponential backoff: 100ms, 200ms, 400ms, ... Default: 3. */
  maxRetries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse a positive integer from an environment variable.
 * Returns `undefined` for empty, invalid, or non-positive values.
 */
function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) return undefined;
  return n;
}

/**
 * Create a libSQL database client with configurable concurrency.
 *
 * For local SQLite (`file:` URLs) the client uses a single-file handle.
 * For remote Turso (`libsql:` / `https:` URLs) the `concurrency` option
 * limits parallel HTTP requests (default: 20, set via
 * `QUILLBY_DB_CONCURRENCY` env var).
 *
 * Client creation is synchronous — the libSQL client connects lazily on
 * the first query. For query-level retry with exponential backoff, use
 * the exported `withRetry` wrapper.
 */
export function createDb(url: string, authToken?: string, poolConfig?: DbPoolConfig) {
  const concurrency = poolConfig?.concurrency;

  const c = createClient({
    url,
    authToken,
    ...(concurrency != null ? { concurrency } : {}),
  });

  const db = drizzle(c, { schema });
  return { client: c, db };
}

export type QuillbyDb = ReturnType<typeof drizzle<typeof schema>>;

let _db: QuillbyDb | undefined;
let _client: ReturnType<typeof createClient> | undefined;

function ensureDb(): { client: ReturnType<typeof createClient>; db: QuillbyDb } {
  if (!_client) {
    const url = process.env.QUILLBY_AUTH_DB_URL ?? "file:./quillby-auth.db";
    const concurrency = parsePositiveInt(process.env.QUILLBY_DB_CONCURRENCY);
    const created = createDb(url, process.env.LIBSQL_AUTH_TOKEN, concurrency != null ? { concurrency } : undefined);
    _client = created.client;
    // ARD: Assignment to let variable with different initial type
    _db = created.db as QuillbyDb;
  }
  return { client: _client!, db: _db! };
}

// ARD: Proxy target placeholder object
export const client = new Proxy({} as ReturnType<typeof createClient>, {
  get(_, prop) { return Reflect.get(ensureDb().client, prop); },
});

// ARD: Proxy target placeholder object
export const db = new Proxy({} as QuillbyDb, {
  get(_, prop) { return Reflect.get(ensureDb().db, prop); },
});

/**
 * Execute a function against the database with retry logic.
 * Retries on failure with exponential backoff.
 * Useful for handling transient Turso failures.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; timeoutMs?: number },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const backoff = 100 * Math.pow(2, attempt);
        await sleep(backoff);
      }
    }
  }
  throw lastError ?? new Error("withRetry: all attempts failed");
}

/**
 * Health check: runs SELECT 1 against the database.
 * Returns true if the query succeeds, false otherwise.
 * Never throws. Errors are logged to stderr for observability.
 */
export async function checkDbHealth(dbClient: QuillbyDb): Promise<boolean> {
  try {
    const result = await dbClient.run(sql.raw("SELECT 1"));
    return result.rows.length === 1;
  } catch (err) {
    process.stderr.write(`[db] Health check failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return false;
  }
}

export * from "./db/schema.js";
export { runHostedMigrations, pushHostedSchema } from "./db/migrate-hosted.js";
