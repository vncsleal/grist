import { eq } from "drizzle-orm";
import { getDeploymentMode } from "@quillby/config";
import { hostedUserState, stripeWebhookEvent, type QuillbyDb } from "@quillby/database";
import {
  constructWebhookEvent,
  isSubscriptionEvent,
  resolvePlanFromSubscription,
  resolveUserIdFromEvent,
  extractSubscriptionMetadata,
  getStripeClient,
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

export type SubscriptionInfo = {
  plan: "free" | "pro";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
  trialEndsAt: Date | null;
};

export {
  constructWebhookEvent,
  isSubscriptionEvent,
  resolvePlanFromSubscription,
  resolveUserIdFromEvent,
  extractSubscriptionMetadata,
  getOrCreateCustomer,
  createCheckoutSession,
  createCustomerPortalSession,
};

export async function getStripeSubscriptionDetails(
  db: QuillbyDb,
  userId: string,
): Promise<SubscriptionInfo | null> {
  const rows = await db
    .select({
      plan: hostedUserState.plan,
      stripeCustomerId: hostedUserState.stripeCustomerId,
      stripeSubscriptionId: hostedUserState.stripeSubscriptionId,
      subscriptionStatus: hostedUserState.subscriptionStatus,
      currentPeriodEnd: hostedUserState.currentPeriodEnd,
      cancelAtPeriodEnd: hostedUserState.cancelAtPeriodEnd,
      trialEndsAt: hostedUserState.trialEndsAt,
    })
    .from(hostedUserState)
    .where(eq(hostedUserState.userId, userId))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    plan: row.plan as "free" | "pro",
    stripeCustomerId: row.stripeCustomerId ?? null,
    stripeSubscriptionId: row.stripeSubscriptionId ?? null,
    subscriptionStatus: row.subscriptionStatus ?? null,
    currentPeriodEnd: row.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? null,
    trialEndsAt: row.trialEndsAt ?? null,
  };
}

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

  const stripeEventId = event.id;

  // ── Idempotency check ──────────────────────────────────────────────────
  const existingEvent = await db
    .select({ id: stripeWebhookEvent.id })
    .from(stripeWebhookEvent)
    .where(eq(stripeWebhookEvent.stripeEventId, stripeEventId))
    .limit(1);

  if (existingEvent.length > 0) {
    return { handled: true, updated: false };
  }

  const userId = resolveUserIdFromEvent(event);

  // ── Extract plan + subscription metadata ───────────────────────────────
  let plan: "free" | "pro" | null = null;
  let subscriptionMetadata: import("./stripe.js").SubscriptionMetadata | null = null;

  if (event.type === "customer.subscription.deleted") {
    subscriptionMetadata = null;
    plan = "free";
  } else if (
    event.type === "checkout.session.completed" ||
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const eventObj = "object" in event.data ? event.data.object : undefined;
    // ARD: Stripe webhook event type lacks index signature
    const obj = eventObj as Record<string, unknown> | undefined;
    if (obj && typeof obj.subscription === "string") {
      const subscription = await getStripeClient().subscriptions.retrieve(obj.subscription);
      plan = resolvePlanFromSubscription(subscription);
      subscriptionMetadata = extractSubscriptionMetadata(subscription);
    } else if (obj && "items" in obj) {
      // ARD: Stripe Event.data.object is untyped
      const sub = obj as unknown as Parameters<typeof resolvePlanFromSubscription>[0];
      plan = resolvePlanFromSubscription(sub);
      subscriptionMetadata = extractSubscriptionMetadata(sub);
    }
  } else if (event.type === "invoice.payment_succeeded") {
    subscriptionMetadata = null;
    plan = null;
  } else if (event.type === "invoice.payment_failed") {
    if (!userId) {
      await db.insert(stripeWebhookEvent).values({
        id: crypto.randomUUID(),
        stripeEventId,
        type: event.type,
        userId: null,
        status: "skipped",
        createdAt: new Date(),
      });
      return { handled: true, updated: false };
    }

    await db.insert(stripeWebhookEvent).values({
      id: crypto.randomUUID(),
      stripeEventId,
      type: event.type,
      userId,
      status: "processed",
      createdAt: new Date(),
    });
    return { handled: true, updated: false, userId };
  }

  if (!userId) {
    await db.insert(stripeWebhookEvent).values({
      id: crypto.randomUUID(),
      stripeEventId,
      type: event.type,
      userId: null,
      status: "skipped",
      createdAt: new Date(),
    });
    return { handled: true, updated: false };
  }

  // ── Persist plan + subscription metadata ───────────────────────────────
  const existing = await db
    .select({ userId: hostedUserState.userId })
    .from(hostedUserState)
    .where(eq(hostedUserState.userId, userId))
    .limit(1);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (plan !== null) updateData.plan = plan;
  if (subscriptionMetadata) {
    updateData.stripeCustomerId = subscriptionMetadata.stripeCustomerId;
    updateData.stripeSubscriptionId = subscriptionMetadata.stripeSubscriptionId;
    updateData.subscriptionStatus = subscriptionMetadata.subscriptionStatus;
    updateData.currentPeriodEnd = subscriptionMetadata.currentPeriodEnd?.getTime() ?? null;
    updateData.cancelAtPeriodEnd = subscriptionMetadata.cancelAtPeriodEnd;
    updateData.trialEndsAt = subscriptionMetadata.trialEndsAt?.getTime() ?? null;
  } else if (event.type === "customer.subscription.deleted") {
    updateData.stripeSubscriptionId = null;
    updateData.subscriptionStatus = null;
    updateData.currentPeriodEnd = null;
    updateData.cancelAtPeriodEnd = null;
    updateData.trialEndsAt = null;
  }

  if (existing.length === 0) {
    await db.insert(hostedUserState).values({
      userId,
      currentWorkspaceId: "default",
      ...updateData,
    } as typeof hostedUserState.$inferInsert);
  } else {
    await db
      .update(hostedUserState)
      .set(updateData as typeof hostedUserState.$inferInsert)
      .where(eq(hostedUserState.userId, userId));
  }

  // ── Record webhook event ───────────────────────────────────────────────
  await db.insert(stripeWebhookEvent).values({
    id: crypto.randomUUID(),
    stripeEventId,
    type: event.type,
    userId,
    status: "processed",
    createdAt: new Date(),
  });

  return { handled: true, updated: true, userId, plan: plan ?? undefined };
}
