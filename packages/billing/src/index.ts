import { eq } from "drizzle-orm";
import { getDeploymentMode } from "@quillby/config";
import { hostedUserState, type QuillbyDb } from "@quillby/database";
import {
  constructWebhookEvent,
  isSubscriptionEvent,
  resolvePlanFromSubscription,
  resolveUserIdFromEvent,
  getOrCreateCustomer,
  createCheckoutSession,
  createCustomerPortalSession,
} from "./stripe.js";

export type HostedPlan = "free" | "pro";

export type PlanLimits = {
  maxOwnedWorkspaces: number | null;
  maxDraftsPerWorkspace: number | null;
  harvestCooldownMs: number | null;
  /** Max image generation jobs per calendar month. null = unlimited. */
  imageCreditsPerMonth: number | null;
  /** Max audio generation jobs per calendar month. null = unlimited. */
  audioCreditsPerMonth: number | null;
  /** Max video generation jobs per calendar month. null = unlimited. */
  videoCreditsPerMonth: number | null;
};

export const PLAN_LIMITS: Record<HostedPlan, PlanLimits> = {
  free: {
    maxOwnedWorkspaces: 3,
    maxDraftsPerWorkspace: 20,
    harvestCooldownMs: 30 * 60 * 1000,
    imageCreditsPerMonth: 0,
    audioCreditsPerMonth: 0,
    videoCreditsPerMonth: 0,
  },
  pro: {
    maxOwnedWorkspaces: null,
    maxDraftsPerWorkspace: null,
    harvestCooldownMs: null,
    imageCreditsPerMonth: 300,
    audioCreditsPerMonth: 500,
    videoCreditsPerMonth: 30,
  },
};

export function isCloudMode(): boolean {
  return getDeploymentMode() === "cloud";
}

export function isPlanEnforcementEnabled(): boolean {
  if (!isCloudMode()) return false;
  const raw = (process.env.QUILLBY_ENFORCE_PLAN_LIMITS ?? "").trim().toLowerCase();
  if (!raw) return true;
  return raw === "1" || raw === "true" || raw === "yes";
}

export function getBillingPortalUrl(): string | null {
  if (!isCloudMode()) return null;
  const url = process.env.QUILLBY_CLOUD_BILLING_PORTAL_URL?.trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export type BillingAction = "upgrade" | "downgrade" | "manage";

function withQuery(baseUrl: string, query: Record<string, string>): string {
  const url = new URL(baseUrl);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export function getCheckoutUrlForPlan(plan: HostedPlan, userId?: string): string | null {
  if (!isCloudMode()) return null;
  const key = plan === "pro" ? "QUILLBY_STRIPE_CHECKOUT_URL_PRO" : "QUILLBY_STRIPE_CHECKOUT_URL_FREE";
  const raw = process.env[key]?.trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  return withQuery(raw, userId
    ? { quillbyUserId: userId, plan }
    : { plan });
}

export function getBillingActionUrl(action: BillingAction, currentPlan: HostedPlan, userId?: string): string | null {
  if (!isCloudMode()) return null;
  if (action === "upgrade") {
    return getCheckoutUrlForPlan("pro", userId);
  }
  const portal = getBillingPortalUrl();
  if (!portal) return null;
  return withQuery(portal, userId
    ? { quillbyUserId: userId, action, plan: currentPlan }
    : { action, plan: currentPlan });
}

export function getPlanLimits(plan: HostedPlan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export {
  constructWebhookEvent,
  isSubscriptionEvent,
  resolvePlanFromSubscription,
  resolveUserIdFromEvent,
  getOrCreateCustomer,
  createCheckoutSession,
  createCustomerPortalSession,
};

export async function applyStripeWebhookEvent(db: QuillbyDb, rawBody: string, signature: string): Promise<{
  handled: boolean;
  updated: boolean;
  userId?: string;
  plan?: "free" | "pro";
}> {
  if (!isCloudMode()) return { handled: false, updated: false };

  let event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch {
    return { handled: false, updated: false };
  }

  if (!isSubscriptionEvent(event.type)) return { handled: false, updated: false };

  const userId = resolveUserIdFromEvent(event);
  let plan: "free" | "pro" | null = null;

  if (event.type === "customer.subscription.deleted") {
    plan = "free";
  } else if (
    event.type === "checkout.session.completed" ||
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const eventObj = "object" in event.data ? event.data.object : undefined;
    const obj = eventObj as unknown as Record<string, unknown> | undefined;
    if (obj && typeof obj.subscription === "string") {
      const { getStripeClient } = await import("./stripe.js");
      const subscription = await getStripeClient().subscriptions.retrieve(obj.subscription);
      plan = resolvePlanFromSubscription(subscription);
    } else if (obj && "items" in obj) {
      plan = resolvePlanFromSubscription(obj as unknown as Parameters<typeof resolvePlanFromSubscription>[0]);
    }
  } else if (event.type === "invoice.payment_failed") {
    return { handled: true, updated: false, userId: userId ?? undefined };
  }

  if (!userId || !plan) return { handled: true, updated: false };

  const existing = await db
    .select({ userId: hostedUserState.userId })
    .from(hostedUserState)
    .where(eq(hostedUserState.userId, userId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(hostedUserState).values({
      userId,
      currentWorkspaceId: "default",
      plan,
      updatedAt: new Date(),
    });
  } else {
    await db
      .update(hostedUserState)
      .set({ plan, updatedAt: new Date() })
      .where(eq(hostedUserState.userId, userId));
  }

  return { handled: true, updated: true, userId, plan };
}
