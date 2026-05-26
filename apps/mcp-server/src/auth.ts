import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey } from "@better-auth/api-key";
import { db } from "./db.js";
import * as schema from "./db/schema.js";
import { sendVerificationEmail, sendResetPasswordEmail } from "./email.js";
import { slog } from "./logger.js";

// QUILLBY_RATE_LIMIT sets the default max requests per minute for new API keys.
// Individual keys can override this at creation time via manage-keys.ts.
export function parseRateLimit(raw?: string): number {
  const value = parseInt(raw ?? "60", 10);
  if (Number.isNaN(value) || value < 1) return 60;
  return value;
}

const defaultRateLimitMax = parseRateLimit(process.env.QUILLBY_RATE_LIMIT);
type BetterAuthOptions = Parameters<typeof betterAuth>[0];

const apiKeyPlugin = apiKey({
  // Keys are validated on every /mcp request — enableSessionForAPIKeys
  // is OFF to avoid the per-request double-hit on rate limit counters.
  enableSessionForAPIKeys: false,

  // Default rate-limit window: 60 requests per 60 seconds.
  // These defaults apply when a key is created without explicit limits.
  rateLimit: {
    enabled: true,
    maxRequests: defaultRateLimitMax,
    timeWindow: 60_000,
  },
}) as unknown as NonNullable<BetterAuthOptions["plugins"]>[number];

const corsOrigin = process.env.QUILLBY_CORS_ORIGIN;
const trustedOrigins = corsOrigin && corsOrigin !== "*"
  ? corsOrigin.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      apikey: schema.apikey,
    },
  }),

  emailAndPassword: {
    enabled: true,
    sendEmailVerification: true,
    async sendVerificationEmail(data: { user: { email: string; name?: string }; url: string }) {
      await sendVerificationEmail(data.user, data.url);
    },
    async sendResetPassword(data: { user: { email: string; name?: string }; url: string }) {
      await sendResetPasswordEmail(data.user, data.url);
    },
  },

  // Allow the app origin (e.g. http://localhost:5173 in dev) to make
  // credentialed auth requests without Better Auth's CSRF 403 rejection.
  ...(trustedOrigins.length > 0 ? { trustedOrigins } : {}),

  plugins: [
    apiKeyPlugin,
  ],
});

if (process.env.QUILLBY_SMTP_HOST) {
  slog("info", "SMTP configured — email verification and password reset enabled");
} else {
  slog("info", "SMTP not configured — email verification and password reset will log URLs only");
}
