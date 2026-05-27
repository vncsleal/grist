import { betterAuth } from "better-auth";
import { apiKey } from "@better-auth/api-key";
import { sql } from "drizzle-orm";

type BetterAuthOptions = Parameters<typeof betterAuth>[0];

export interface VerifiedApiKey {
  valid: boolean;
  key?: {
    id?: string;
    referenceId?: string | null;
    userId?: string;
  } | null;
}

export interface ListedApiKey {
  id: string;
  name?: string | null;
  prefix?: string | null;
  start?: string | null;
  enabled?: boolean | null;
  createdAt?: Date | string | number | null;
  expiresAt?: Date | string | number | null;
  rateLimitMax?: number | null;
  rateLimitTimeWindow?: number | null;
}

export interface SerializedApiKey {
  id: string;
  name: string;
  prefix: string | null;
  start: string | null;
  enabled: boolean;
  createdAt: string | null;
  expiresAt: string | null;
  rateLimitMax: number | null;
  rateLimitTimeWindow: number | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export function parseRateLimit(raw?: string): number {
  const value = parseInt(raw ?? "60", 10);
  if (Number.isNaN(value) || value < 1) return 60;
  return value;
}

export function serializeApiKey(key: ListedApiKey): SerializedApiKey {
  return {
    id: key.id,
    name: key.name ?? "Unnamed key",
    prefix: key.prefix ?? null,
    start: key.start ?? null,
    enabled: key.enabled ?? true,
    createdAt: key.createdAt ? new Date(key.createdAt).toISOString() : null,
    expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString() : null,
    rateLimitMax: key.rateLimitMax ?? null,
    rateLimitTimeWindow: key.rateLimitTimeWindow ?? null,
  };
}

export interface AuthEmailService {
  sendVerificationEmail(data: { user: { email: string; name?: string }; url: string }): Promise<void>;
  sendResetPassword(data: { user: { email: string; name?: string }; url: string }): Promise<void>;
}

export interface AuthConfig {
  database: NonNullable<BetterAuthOptions["database"]>;
  emailAndPassword?: AuthEmailService;
  rateLimitMax?: number;
  trustedOrigins?: string[];
  baseUrl?: string;
}

export function createAuth(config: AuthConfig): ReturnType<typeof betterAuth> {
  const { database, emailAndPassword, rateLimitMax = 60, trustedOrigins = [], baseUrl } = config;

  const apiKeyPlugin = apiKey({
    enableSessionForAPIKeys: false,
    rateLimit: {
      enabled: true,
      maxRequests: rateLimitMax,
      timeWindow: 60_000,
    },
  }) as unknown as NonNullable<BetterAuthOptions["plugins"]>[number];

  const opts: Record<string, unknown> = {
    database,
    baseURL: baseUrl,
    plugins: [apiKeyPlugin],
  };

  if (emailAndPassword) {
    opts.emailAndPassword = {
      enabled: true,
      sendEmailVerification: true,
      sendVerificationEmail: emailAndPassword.sendVerificationEmail,
      sendResetPassword: emailAndPassword.sendResetPassword,
    };
    opts.emailVerification = {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      redirectTo: baseUrl,
    };
  }

  if (trustedOrigins.length > 0) {
    opts.trustedOrigins = trustedOrigins;
  }

  return betterAuth(opts as unknown as BetterAuthOptions);
}

export class AuthApi {
  constructor(private auth: ReturnType<typeof betterAuth>) {}

  async verifyApiKey(key: string): Promise<VerifiedApiKey> {
    return (this.auth.api as unknown as {
      verifyApiKey(input: { body: { key: string } }): Promise<VerifiedApiKey>;
    }).verifyApiKey({ body: { key } });
  }

  async createApiKey(
    userId: string,
    name: string,
    rateLimitMax: number,
  ): Promise<{ id: string; key: string }> {
    return (this.auth.api as unknown as {
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
      body: {
        userId,
        name,
        prefix: "qb",
        rateLimitEnabled: true,
        rateLimitTimeWindow: 60_000,
        rateLimitMax,
      },
    });
  }

  async signUpEmail(
    email: string,
    password: string,
    name: string,
  ): Promise<{ user: AuthUser }> {
    return (this.auth.api as unknown as {
      signUpEmail(input: { body: { email: string; password: string; name: string } }): Promise<{ user: AuthUser }>;
    }).signUpEmail({ body: { email, password, name } });
  }

  async getSession(headers: Record<string, string>): Promise<{ user?: { id: string } } | null> {
    const result = await (this.auth.api as unknown as {
      getSession(input: { headers: Record<string, string> }): Promise<{ user?: { id: string } } | null>;
    }).getSession({ headers });
    return result;
  }
}

export function listApiKeysFromDb(
  db: unknown,
  apikeyTable: unknown,
  userId: string,
): Promise<ListedApiKey[]> {
  const _db = db as { select(): { from(table: unknown): { where(condition: unknown): Promise<ListedApiKey[]> } } };
  const _table = apikeyTable as { referenceId: unknown; id: unknown };
  return _db.select().from(apikeyTable).where(
    sql`${_table.referenceId} = ${userId}`,
  ) as Promise<ListedApiKey[]>;
}

export async function deleteApiKeyFromDb(
  db: unknown,
  apikeyTable: unknown,
  keyId: string,
): Promise<void> {
  const _db = db as { delete(table: unknown): { where(condition: unknown): Promise<void> } };
  const _table = apikeyTable as { id: unknown };
  await (_db.delete(apikeyTable).where(sql`${_table.id} = ${keyId}`) as Promise<void>);
}
