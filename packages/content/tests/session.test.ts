import { describe, expect, it } from "vitest";
import {
  SessionScopeTypeSchema,
  SessionScopeSchema,
  SessionStateSchema,
  DegradationInfoSchema,
  SessionSchema,
} from "../src/index.js";

describe("SessionScopeTypeSchema", () => {
  it("accepts valid scope types", () => {
    expect(SessionScopeTypeSchema.parse("campaign")).toBe("campaign");
    expect(SessionScopeTypeSchema.parse("plan")).toBe("plan");
    expect(SessionScopeTypeSchema.parse("task")).toBe("task");
    expect(SessionScopeTypeSchema.parse("freeform")).toBe("freeform");
  });

  it("rejects invalid scope type", () => {
    expect(() => SessionScopeTypeSchema.parse("invalid")).toThrow();
  });
});

describe("SessionScopeSchema", () => {
  it("validates a scope with defaults", () => {
    const result = SessionScopeSchema.parse({
      type: "freeform",
      goal: "Review content",
    });
    expect(result.constraints).toEqual([]);
  });

  it("accepts a campaign-scoped session", () => {
    const result = SessionScopeSchema.parse({
      type: "campaign",
      goal: "Launch campaign",
      campaignId: "camp-1",
    });
    expect(result.campaignId).toBe("camp-1");
  });
});

describe("SessionStateSchema", () => {
  it("accepts valid states", () => {
    expect(SessionStateSchema.parse("planning")).toBe("planning");
    expect(SessionStateSchema.parse("executing")).toBe("executing");
    expect(SessionStateSchema.parse("reviewing")).toBe("reviewing");
    expect(SessionStateSchema.parse("closing")).toBe("closing");
  });
});

describe("DegradationInfoSchema", () => {
  it("provides empty defaults", () => {
    const result = DegradationInfoSchema.parse({});
    expect(result.warnings).toEqual([]);
    expect(result.tokenBudget).toBeUndefined();
  });
});

describe("SessionSchema", () => {
  it("validates a complete session", () => {
    const result = SessionSchema.parse({
      id: "sess-1",
      workspaceId: "ws-1",
      scope: { type: "freeform", goal: "Draft posts" },
      state: "executing",
      startedAt: "2026-06-01T00:00:00.000Z",
      lastActivityAt: "2026-06-01T01:00:00.000Z",
    });
    expect(result.state).toBe("executing");
    expect(result.degradation.warnings).toEqual([]);
  });

  it("rejects missing required fields", () => {
    expect(() => SessionSchema.parse({})).toThrow();
  });
});
