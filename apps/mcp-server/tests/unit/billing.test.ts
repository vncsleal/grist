import { describe, expect, it } from "vitest";
import {
  getBillingActionUrl,
  getBillingPortalUrl,
  isCloudMode,
  isPlanEnforcementEnabled,
  isSubscriptionEvent,
} from "../../src/billing.js";

describe("billing mode separation", () => {
  it("disables cloud billing behavior outside cloud mode", () => {
    process.env.QUILLBY_DEPLOYMENT_MODE = "self-hosted";
    process.env.QUILLBY_ENFORCE_PLAN_LIMITS = "1";
    process.env.QUILLBY_CLOUD_BILLING_PORTAL_URL = "https://billing.example.com/portal";

    expect(isCloudMode()).toBe(false);
    expect(isPlanEnforcementEnabled()).toBe(false);
    expect(getBillingPortalUrl()).toBeNull();
  });

  it("identifies subscription events", () => {
    expect(isSubscriptionEvent("checkout.session.completed")).toBe(true);
    expect(isSubscriptionEvent("customer.subscription.created")).toBe(true);
    expect(isSubscriptionEvent("customer.subscription.updated")).toBe(true);
    expect(isSubscriptionEvent("customer.subscription.deleted")).toBe(true);
    expect(isSubscriptionEvent("invoice.payment_succeeded")).toBe(true);
    expect(isSubscriptionEvent("invoice.payment_failed")).toBe(true);
    expect(isSubscriptionEvent("charge.succeeded")).toBe(false);
    expect(isSubscriptionEvent("payment_intent.succeeded")).toBe(false);
  });

  it("returns null for billing URLs when env vars are not set", () => {
    process.env.QUILLBY_DEPLOYMENT_MODE = "cloud";
    delete process.env.QUILLBY_STRIPE_CHECKOUT_URL_PRO;
    delete process.env.QUILLBY_CLOUD_BILLING_PORTAL_URL;

    expect(getBillingPortalUrl()).toBeNull();
    expect(getBillingActionUrl("upgrade", "free", "user-1")).toBeNull();
    expect(getBillingActionUrl("manage", "pro", "user-1")).toBeNull();
  });
});
