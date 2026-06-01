import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../../packages/database/src/db/hosted-schema.ts",
  out: "./drizzle/hosted",
  dialect: "turso",
  dbCredentials: {
    url: process.env.QUILLBY_AUTH_DB_URL ?? "file:./quillby-auth.db",
    authToken: process.env.LIBSQL_AUTH_TOKEN,
  },
});
