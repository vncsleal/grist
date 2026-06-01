import { defineConfig } from "drizzle-kit";

const url = process.env.QUILLBY_AUTH_DB_URL ?? "file:./quillby-auth.db";

export default defineConfig({
  schema: "../../packages/database/src/db/migration-schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url,
    authToken: process.env.LIBSQL_AUTH_TOKEN,
  },
});
