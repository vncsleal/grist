#!/usr/bin/env node
/**
 * Quillby API key management CLI.
 *
 * In a Docker deployment, run this with:
 *   docker exec -it <container> node /app/dist/cli/keys.js <command> [args]
 *
 * In a local monorepo, run:
 *   pnpm --filter @vncsleal/quillby keys <command> [args]
 *   (or: npx tsx tooling/scripts/manage-keys.ts <command> [args])
 *
 * Commands:
 *   create-user <email> <password> <name>
 *   create      <userId> <keyName> [rateLimitMax]
 *   list        <userId>
 *   revoke      <keyId>
 *
 * Environment variables:
 *   QUILLBY_AUTH_DB_URL  — defaults to file:./quillby-auth.db
 *   LIBSQL_AUTH_TOKEN    — only required for remote Turso connections
 *   BETTER_AUTH_SECRET   — required
 */

import "dotenv/config";
import { auth } from "../auth.js";

const [, , command, ...args] = process.argv;

// ── Type-unsafe but runtime-correct wrappers for @better-auth/api-key methods.
// These methods exist at runtime via the plugin but are not reflected in the typed API.

const createApiKey = (userId: string, name: string, rateLimitMax: number) =>
  (auth.api as unknown as {
    createApiKey(input: {
      body: {
        userId: string;
        name: string;
        prefix: string;
        rateLimitEnabled: boolean;
        rateLimitTimeWindow: number;
        rateLimitMax: number;
      };
    }): Promise<{ id: string; key: string }>;
  }).createApiKey({
    body: { userId, name, prefix: "qb", rateLimitEnabled: true, rateLimitTimeWindow: 60_000, rateLimitMax },
  });

interface ListedApiKey { id: string; name?: string | null; start?: string | null }

const listApiKeys = (userId: string): Promise<ListedApiKey[]> =>
  (auth.api as unknown as {
    listApiKeys(input: { body: { userId: string } }): Promise<ListedApiKey[]>;
  }).listApiKeys({ body: { userId } });

const deleteApiKey = (keyId: string): Promise<void> =>
  (auth.api as unknown as {
    deleteApiKey(input: { body: { keyId: string } }): Promise<void>;
  }).deleteApiKey({ body: { keyId } });

async function main(): Promise<void> {
  switch (command) {
    case "create-user": {
      const [email, password, name] = args;
      if (!email || !password || !name) {
        console.error("Usage: keys create-user <email> <password> <name>");
        process.exit(1);
      }
      const result = await auth.api.signUpEmail({ body: { email, password, name } });
      console.log("Created user:");
      console.log(JSON.stringify({ id: result.user.id, email: result.user.email, name: result.user.name }, null, 2));
      break;
    }

    case "create": {
      const [userId, keyName, limitArg] = args;
      if (!userId || !keyName) {
        console.error("Usage: keys create <userId> <keyName> [rateLimitMax]");
        process.exit(1);
      }
      const rateLimitMax = limitArg
        ? parseInt(limitArg, 10)
        : parseInt(process.env.QUILLBY_RATE_LIMIT ?? "60", 10);
      const result = await createApiKey(userId, keyName, rateLimitMax);
      console.log("Created API key (shown only once — save it now):");
      console.log(JSON.stringify({ key: result.key, id: result.id, name: keyName, userId, rateLimitMax }, null, 2));
      break;
    }

    case "list": {
      const [userId] = args;
      if (!userId) {
        console.error("Usage: keys list <userId>");
        process.exit(1);
      }
      const keys = await listApiKeys(userId);
      if (!keys || (Array.isArray(keys) && keys.length === 0)) {
        console.log("No keys found for user:", userId);
      } else {
        console.log(JSON.stringify(keys, null, 2));
      }
      break;
    }

    case "revoke": {
      const [keyId] = args;
      if (!keyId) {
        console.error("Usage: keys revoke <keyId>");
        process.exit(1);
      }
      await deleteApiKey(keyId);
      console.log(`Revoked key: ${keyId}`);
      break;
    }

    default:
      console.error(
        [
          "Quillby key manager",
          "",
          "Commands:",
          "  create-user <email> <password> <name>",
          "  create      <userId> <keyName> [rateLimitMax]",
          "  list        <userId>",
          "  revoke      <keyId>",
        ].join("\n"),
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
