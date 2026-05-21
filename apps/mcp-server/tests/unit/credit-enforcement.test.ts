import { describe, expect, it } from "vitest";
import { getPlanLimits, PLAN_LIMITS } from "@quillby/billing";

describe("getPlanLimits", () => {
  it("returns 0 for all modalities on free plan", () => {
    const limits = getPlanLimits("free");
    expect(limits.imageCreditsPerMonth).toBe(0);
    expect(limits.audioCreditsPerMonth).toBe(0);
    expect(limits.videoCreditsPerMonth).toBe(0);
  });

  it("returns 300/500/30 for image/audio/video on pro plan", () => {
    const limits = getPlanLimits("pro");
    expect(limits.imageCreditsPerMonth).toBe(300);
    expect(limits.audioCreditsPerMonth).toBe(500);
    expect(limits.videoCreditsPerMonth).toBe(30);
  });
});

describe("PLAN_LIMITS", () => {
  it("free plan has 3 workspace limit and 30 min cooldown", () => {
    const free = PLAN_LIMITS.free;
    expect(free.maxOwnedWorkspaces).toBe(3);
    expect(free.harvestCooldownMs).toBe(30 * 60 * 1000);
    expect(free.maxDraftsPerWorkspace).toBe(20);
  });

  it("pro plan has null limits (unlimited) for workspace and cooldown", () => {
    const pro = PLAN_LIMITS.pro;
    expect(pro.maxOwnedWorkspaces).toBeNull();
    expect(pro.harvestCooldownMs).toBeNull();
    expect(pro.maxDraftsPerWorkspace).toBeNull();
  });
});
