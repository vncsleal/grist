import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuth, parseRateLimit } from "@quillby/auth";
import { db } from "./db.js";
import * as schema from "./db/schema.js";
import { sendVerificationEmail, sendResetPasswordEmail } from "./email.js";
import { slog } from "./logger.js";

const corsOrigin = process.env.QUILLBY_CORS_ORIGIN;
const trustedOrigins = corsOrigin && corsOrigin !== "*"
  ? corsOrigin.split(",").map((o) => o.trim()).filter(Boolean)
  : [];
const authBaseUrl = process.env.BETTER_AUTH_URL ?? undefined;

export const auth = createAuth({
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
    sendVerificationEmail: (data) => sendVerificationEmail(data.user, data.url),
    sendResetPassword: (data) => sendResetPasswordEmail(data.user, data.url),
  },
  rateLimitMax: parseRateLimit(process.env.QUILLBY_RATE_LIMIT),
  trustedOrigins,
  baseUrl: authBaseUrl,
});

if (process.env.QUILLBY_SMTP_HOST) {
  slog("info", "SMTP configured — email verification and password reset enabled");
} else {
  slog("info", "SMTP not configured — email verification and password reset will log URLs only");
}
