import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  getBillingPortalUrl,
  isCloudMode,
  isPlanEnforcementEnabled,
  verifyStripeWebhookSignature,
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

  it("verifies stripe webhook signatures", () => {
    process.env.QUILLBY_DEPLOYMENT_MODE = "cloud";
    process.env.QUILLBY_STRIPE_WEBHOOK_SECRET = "whsec_test";

    const rawBody = JSON.stringify({ type: "customer.subscription.updated" });
    const timestamp = "1712000000";
    const signedPayload = `${timestamp}.${rawBody}`;
    const digest = createHmac("sha256", "whsec_test").update(signedPayload).digest("hex");
    const header = `t=${timestamp},v1=${digest}`;

    expect(verifyStripeWebhookSignature(rawBody, header)).toBe(true);
    expect(verifyStripeWebhookSignature(rawBody, `t=${timestamp},v1=bad`)).toBe(false);
  });
});
