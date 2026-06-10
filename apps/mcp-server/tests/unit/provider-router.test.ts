import { describe, expect, it, vi } from "vitest";
import { ProviderRouter } from "@quillby/providers";
import type { ProviderAdapter, GenerationResult } from "@quillby/providers";
import type { GenerationModality } from "@quillby/core";

function makeAdapter(
  id: string,
  modalities: GenerationModality[],
  result?: Partial<GenerationResult>,
): ProviderAdapter {
  return {
    id,
    supportedModalities: modalities,
    generate: vi.fn().mockResolvedValue({
      outputRef: `https://${id}/result`,
      mimeType: "image/png",
      provider: id,
      ...result,
    }),
  };
}

describe("ProviderRouter.resolvesTier()", () => {
  it("returns null when no adapters configured", () => {
    const router = new ProviderRouter();
    expect(router.resolvesTier("image")).toBeNull();
    expect(router.resolvesTier("audio")).toBeNull();
    expect(router.resolvesTier("video")).toBeNull();
  });

  it('returns "sampling" when Tier 1 set', () => {
    const router = new ProviderRouter();
    router.setTier1(makeAdapter("sampling", ["image", "audio"]));

    expect(router.resolvesTier("image")).toBe("sampling");
    expect(router.resolvesTier("audio")).toBe("sampling");
  });

  it('returns "cloud" when only Tier 2 set', () => {
    const router = new ProviderRouter();
    router.setTier2({ image: makeAdapter("cloud/img", ["image"]) });

    expect(router.resolvesTier("image")).toBe("cloud");
  });

  it('returns "direct" when only Tier 3 set', () => {
    const router = new ProviderRouter();
    router.setTier3({ video: makeAdapter("direct/vid", ["video"]) });

    expect(router.resolvesTier("video")).toBe("direct");
  });

  it("prefers higher tier (sampling > cloud > direct)", () => {
    const router = new ProviderRouter();
    router.setTier1(makeAdapter("sampling", ["image"]));
    router.setTier2({ image: makeAdapter("cloud/img", ["image"]) });
    router.setTier3({ image: makeAdapter("direct/img", ["image"]) });

    expect(router.resolvesTier("image")).toBe("sampling");
  });

  it("prefers cloud over direct when no sampling", () => {
    const router = new ProviderRouter();
    router.setTier2({ image: makeAdapter("cloud/img", ["image"]) });
    router.setTier3({ image: makeAdapter("direct/img", ["image"]) });

    expect(router.resolvesTier("image")).toBe("cloud");
  });

  it("returns null when modality not in any tier", () => {
    const router = new ProviderRouter();
    router.setTier1(makeAdapter("sampling", ["image"]));
    router.setTier2({ image: makeAdapter("cloud/img", ["image"]) });

    expect(router.resolvesTier("audio")).toBeNull();
    expect(router.resolvesTier("video")).toBeNull();
  });
});

describe("ProviderRouter.generate()", () => {
  it("delegates to correct tier in order", async () => {
    const t1 = makeAdapter("sampling", ["image"], {
      outputRef: "t1-result",
      provider: "sampling",
    });

    const router = new ProviderRouter({
      tier1: t1,
    });

    const result = await router.generate({ modality: "image", prompt: "test" });
    expect(result.tier).toBe("sampling");
    expect(result.outputRef).toBe("t1-result");
  });

  it("falls through tiers when a tier is unavailable", async () => {
    const t2 = makeAdapter("cloud/img", ["image"], {
      outputRef: "t2-result",
      provider: "cloud",
    });

    const router = new ProviderRouter({
      tier2: { image: t2 },
    });

    const result = await router.generate({ modality: "image", prompt: "test" });
    expect(result.tier).toBe("cloud");
    expect(result.outputRef).toBe("t2-result");
  });

  it("falls through to tier 3 when tiers 1 and 2 unavailable", async () => {
    const t3 = makeAdapter("direct/img", ["image"], {
      outputRef: "t3-result",
      provider: "direct",
    });

    const router = new ProviderRouter({
      tier3: { image: t3 },
    });

    const result = await router.generate({ modality: "image", prompt: "test" });
    expect(result.tier).toBe("direct");
    expect(result.outputRef).toBe("t3-result");
  });

  it("throws when all tiers checked but none support the modality", async () => {
    const t1 = makeAdapter("sampling", ["audio"]);
    const t2 = makeAdapter("cloud/aud", ["audio"]);
    const t3 = makeAdapter("direct/aud", ["audio"]);

    const router = new ProviderRouter({
      tier1: t1,
      tier2: { audio: t2 },
      tier3: { audio: t3 },
    });

    await expect(
      router.generate({ modality: "image", prompt: "test" }),
    ).rejects.toThrow("No provider configured for modality");

    expect(t1.generate).not.toHaveBeenCalled();
    expect(t2.generate).not.toHaveBeenCalled();
    expect(t3.generate).not.toHaveBeenCalled();
  });

  it("throws when no tier is available", async () => {
    const router = new ProviderRouter();

    await expect(
      router.generate({ modality: "image", prompt: "test" }),
    ).rejects.toThrow("No provider configured for modality");
  });

  it("throws for modality not covered by any tier", async () => {
    const t1 = makeAdapter("sampling", ["image"]);

    const router = new ProviderRouter({ tier1: t1 });

    await expect(
      router.generate({ modality: "video", prompt: "test" }),
    ).rejects.toThrow('No provider configured for modality "video"');
  });
});

describe("ProviderRouter.setTier1/2/3()", () => {
  it("setTier1 updates tier correctly", () => {
    const router = new ProviderRouter();
    expect(router.resolvesTier("image")).toBeNull();

    router.setTier1(makeAdapter("sampling", ["image"]));
    expect(router.resolvesTier("image")).toBe("sampling");
  });

  it("setTier2 updates tiers correctly", () => {
    const router = new ProviderRouter();
    router.setTier2({ audio: makeAdapter("cloud/aud", ["audio"]) });

    expect(router.resolvesTier("audio")).toBe("cloud");
  });

  it("setTier3 updates tiers correctly", () => {
    const router = new ProviderRouter();
    router.setTier3({ video: makeAdapter("direct/vid", ["video"]) });

    expect(router.resolvesTier("video")).toBe("direct");
  });
});

describe("ProviderRouter.supportedModalities", () => {
  it("reports supportedModalities from available adapters", () => {
    const router = new ProviderRouter({
      tier1: makeAdapter("sampling", ["image"]),
      tier2: { audio: makeAdapter("cloud/aud", ["audio"]) },
    });

    expect(router.resolvesTier("image")).toBe("sampling");
    expect(router.resolvesTier("audio")).toBe("cloud");
    expect(router.resolvesTier("video")).toBeNull();
  });

  it("handles constructor injection of all tiers", () => {
    const t1 = makeAdapter("sampling", ["image"]);
    const t2 = { audio: makeAdapter("cloud/aud", ["audio"]) };
    const t3 = { video: makeAdapter("direct/vid", ["video"]) };

    const router = new ProviderRouter({ tier1: t1, tier2: t2, tier3: t3 });

    expect(router.resolvesTier("image")).toBe("sampling");
    expect(router.resolvesTier("audio")).toBe("cloud");
    expect(router.resolvesTier("video")).toBe("direct");
  });
});
