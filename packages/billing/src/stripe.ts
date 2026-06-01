import Stripe from "stripe";

let _client: Stripe | null = null;

const API_VERSION = "2026-05-27.dahlia";
const SUBSCRIPTION_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

function getSecretKey(): string {
  const key = process.env.QUILLBY_STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("QUILLBY_STRIPE_SECRET_KEY is not set.");
  }
  return key;
}

export function getStripeClient(): Stripe {
  if (!_client) {
    _client = new Stripe(getSecretKey(), {
      apiVersion: API_VERSION as "2026-05-27.dahlia",
      maxNetworkRetries: 2,
    });
  }
  return _client;
}

export function resetStripeClient(): void {
  _client = null;
}

export async function createCheckoutSession(
  customerId: string | undefined,
  userId: string,
  successUrl: string,
  cancelUrl: string,
) {
  const stripe = getStripeClient();
  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [
      {
        price: process.env.QUILLBY_STRIPE_PRO_PRICE_ID?.trim() ?? "",
        quantity: 1,
      },
    ],
    ...(customerId ? { customer: customerId } : { customer_email: userId }),
    client_reference_id: userId,
    metadata: { quillbyUserId: userId },
    subscription_data: {
      metadata: { quillbyUserId: userId },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string,
) {
  const stripe = getStripeClient();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

export async function getOrCreateCustomer(email: string, userId: string) {
  const stripe = getStripeClient();
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length > 0) {
    return customers.data[0];
  }
  return stripe.customers.create({
    email,
    metadata: { quillbyUserId: userId },
  });
}

export function constructWebhookEvent(
  rawBody: string | Buffer,
  signature: string,
) {
  const stripe = getStripeClient();
  const secret = process.env.QUILLBY_STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("QUILLBY_STRIPE_WEBHOOK_SECRET is not set.");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

export function isSubscriptionEvent(eventType: string): boolean {
  return SUBSCRIPTION_EVENTS.has(eventType);
}

export function resolvePlanFromSubscription(
  subscription: Stripe.Subscription,
): "free" | "pro" | null {
  if (
    subscription.status === "canceled" ||
    subscription.status === "incomplete_expired"
  ) {
    return "free";
  }
  if (subscription.cancel_at_period_end) {
    return "free";
  }

  const proPriceId = process.env.QUILLBY_STRIPE_PRO_PRICE_ID?.trim();
  if (!proPriceId) return null;

  const hasProPrice = subscription.items?.data?.some(
    (item) => item.price.id === proPriceId,
  );
  return hasProPrice ? "pro" : "free";
}

export type SubscriptionMetadata = {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
  trialEndsAt: Date | null;
};

function getSubscriptionNumericField(
  sub: Stripe.Subscription,
  field: "current_period_end" | "trial_end",
): number | null {
  return (sub as unknown as Record<string, unknown>)[field] as number | null;
}

export function extractSubscriptionMetadata(
  subscription: Stripe.Subscription | null | undefined,
): SubscriptionMetadata {
  if (!subscription) return DEFAULT_SUBSCRIPTION_METADATA;

  return {
    stripeCustomerId: (subscription.customer as string | null) ?? null,
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    currentPeriodEnd: getSubscriptionNumericField(subscription, "current_period_end")
      ? new Date(getSubscriptionNumericField(subscription, "current_period_end")! * 1000)
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    trialEndsAt: getSubscriptionNumericField(subscription, "trial_end")
      ? new Date(getSubscriptionNumericField(subscription, "trial_end")! * 1000)
      : null,
  };
}

const DEFAULT_SUBSCRIPTION_METADATA: SubscriptionMetadata = {
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  subscriptionStatus: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: null,
  trialEndsAt: null,
};

export function resolveUserIdFromEvent(event: Stripe.Event): string | null {
  const object = "object" in event.data ? event.data.object : undefined;
  if (!object || typeof object !== "object") return null;
  const obj = object as unknown as Record<string, unknown>;

  const metadata = obj.metadata as Record<string, string> | undefined;
  if (metadata?.quillbyUserId) return metadata.quillbyUserId;
  if (metadata?.userId) return metadata.userId;

  const clientRef = obj.client_reference_id;
  if (typeof clientRef === "string") return clientRef;

  return null;
}
