import { describe, expect, it, vi } from "vitest";
import { handleCampaignTool, CAMPAIGN_TOOL_NAMES } from "../../src/mcp/tools/campaigns.js";
import type { CampaignStore } from "@quillby/workspace";
import type { ToolContext } from "../../src/mcp/tools/index.js";
import type { Campaign, Blueprint } from "@quillby/content";

function mockStore(): CampaignStore {
  const campaigns = new Map<string, Campaign>();
  const blueprints = new Map<string, Blueprint>();
  return {
    createCampaign: vi.fn(async (c: Campaign) => { campaigns.set(c.id, c); }),
    loadCampaign: vi.fn(async (id: string) => campaigns.get(id) ?? null),
    listCampaigns: vi.fn(async (status?: string) =>
      [...campaigns.values()].filter((c) => !status || c.status === status),
    ),
    updateCampaign: vi.fn(async (id: string, patch: Partial<Campaign>) => {
      const existing = campaigns.get(id);
      if (!existing) throw new Error(`Campaign "${id}" not found.`);
      campaigns.set(id, { ...existing, ...patch, updatedAt: new Date().toISOString() });
    }),
    deleteCampaign: vi.fn(async (id: string) => { campaigns.delete(id); }),
    saveBlueprint: vi.fn(async (b: Blueprint) => { blueprints.set(b.id, b); }),
    loadBlueprint: vi.fn(async (id: string) => blueprints.get(id) ?? null),
    listBlueprints: vi.fn(async () => [...blueprints.values()]),
    deleteBlueprint: vi.fn(async (id: string) => { blueprints.delete(id); }),
  };
}

function mockContext(store: CampaignStore): ToolContext {
  const storeWithOverrides = Object.assign(store, {
    getCurrentWorkspaceId: vi.fn().mockResolvedValue("default"),
    withWorkspace: vi.fn().mockResolvedValue(store),
  }) satisfies CampaignStore;
  return {
    server: {} as ToolContext["server"],
    storage: storeWithOverrides as unknown as ToolContext["storage"],
    deploymentMode: "local" as const,
    providerRouter: {} as ToolContext["providerRouter"],
    sample: vi.fn().mockResolvedValue(null),
  };
}

function ts(): string {
  return new Date().toISOString();
}

describe("CAMPAIGN_TOOL_NAMES", () => {
  it("contains all expected tool names", () => {
    expect(CAMPAIGN_TOOL_NAMES.has("campaign_create")).toBe(true);
    expect(CAMPAIGN_TOOL_NAMES.has("campaign_start")).toBe(true);
    expect(CAMPAIGN_TOOL_NAMES.has("campaign_status")).toBe(true);
    expect(CAMPAIGN_TOOL_NAMES.has("campaign_pause")).toBe(true);
    expect(CAMPAIGN_TOOL_NAMES.has("campaign_stage_complete")).toBe(true);
    expect(CAMPAIGN_TOOL_NAMES.has("campaign_stage_fail")).toBe(true);
    expect(CAMPAIGN_TOOL_NAMES.has("campaign_stage_retry")).toBe(true);
    expect(CAMPAIGN_TOOL_NAMES.has("campaign_blueprint_create")).toBe(true);
    expect(CAMPAIGN_TOOL_NAMES.has("campaign_blueprint_list")).toBe(true);
    expect(CAMPAIGN_TOOL_NAMES.has("campaign_list")).toBe(true);
    expect(CAMPAIGN_TOOL_NAMES.size).toBe(10);
  });
});

describe("handleCampaignTool — campaign_create", () => {
  it("creates a campaign from inline stages", async () => {
    const store = mockStore();
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_create", {
      name: "Test Campaign",
      blueprint: [{ name: "research", tool: "gather" }],
    }, ctx);
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as { campaign: Campaign };
    expect(data.campaign.name).toBe("Test Campaign");
    expect(data.campaign.status).toBe("planning");
    expect(data.campaign.stages).toHaveLength(1);
  });

  it("creates a campaign from a saved blueprint", async () => {
    const store = mockStore();
    await store.saveBlueprint({
      id: "bp-1", name: "BP", description: "", stages: [
        { name: "research", tool: "gather", params: {}, dependsOn: [], retryCount: 0 },
      ], tags: [], createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_create", {
      name: "From Blueprint",
      blueprintId: "bp-1",
    }, ctx);
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { campaign: Campaign }).campaign.stages).toHaveLength(1);
  });

  it("returns error when blueprint not found", async () => {
    const store = mockStore();
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_create", {
      name: "Missing BP",
      blueprintId: "bp-nonexistent",
    }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  it("returns error for invalid args", async () => {
    const store = mockStore();
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_create", {}, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Invalid arguments");
  });
});

describe("handleCampaignTool — campaign_start", () => {
  it("starts a planning campaign", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Test", status: "planning",
      stages: [{ name: "s1", tool: "t", params: {}, dependsOn: [], retryCount: 0 }],
      executions: [{ stageName: "s1", status: "pending", retryAttempt: 0 }],
      createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_start", { campaignId: "camp-1" }, ctx);
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as { status: string };
    expect(data.status).toBe("active");
  });

  it("returns error when campaign not found", async () => {
    const store = mockStore();
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_start", { campaignId: "nonexistent" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  it("starts a paused campaign", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Paused", status: "paused",
      stages: [{ name: "s1", tool: "t", params: {}, dependsOn: [], retryCount: 0 }],
      executions: [{ stageName: "s1", status: "pending", retryAttempt: 0 }],
      createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_start", { campaignId: "camp-1" }, ctx);
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { status: string }).status).toBe("active");
  });

  it("starts a failed campaign", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Failed", status: "failed",
      stages: [{ name: "s1", tool: "t", params: {}, dependsOn: [], retryCount: 0 }],
      executions: [{ stageName: "s1", status: "failed", retryAttempt: 0, error: "E" }],
      createdAt: ts(), updatedAt: ts(), error: "E",
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_start", { campaignId: "camp-1" }, ctx);
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { status: string }).status).toBe("active");
  });

  it("returns error when campaign is already active", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Active", status: "active",
      stages: [{ name: "s1", tool: "t", params: {}, dependsOn: [], retryCount: 0 }],
      executions: [{ stageName: "s1", status: "running", retryAttempt: 0 }],
      createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_start", { campaignId: "camp-1" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Cannot start");
  });
});

describe("handleCampaignTool — campaign_status", () => {
  it("returns campaign status", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Test", status: "active",
      stages: [{ name: "s1", tool: "t", params: {}, dependsOn: [], retryCount: 0 }],
      executions: [{ stageName: "s1", status: "running", retryAttempt: 0 }],
      createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_status", { campaignId: "camp-1" }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("active");
    expect(result.structuredContent).toBeDefined();
  });

  it("returns error for missing campaign", async () => {
    const store = mockStore();
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_status", { campaignId: "nonexistent" }, ctx);
    expect(result.isError).toBe(true);
  });
});

describe("handleCampaignTool — campaign_pause", () => {
  it("pauses an active campaign", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Active", status: "active",
      stages: [{ name: "s1", tool: "t", params: {}, dependsOn: [], retryCount: 0 }],
      executions: [{ stageName: "s1", status: "running", retryAttempt: 0 }],
      createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_pause", { campaignId: "camp-1" }, ctx);
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { status: string }).status).toBe("paused");
  });

  it("returns error when campaign is not active", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Planning", status: "planning",
      stages: [], executions: [], createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_pause", { campaignId: "camp-1" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Cannot pause");
  });
});

describe("handleCampaignTool — campaign_stage_complete", () => {
  it("completes an already-completed stage", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Test", status: "active",
      stages: [{ name: "s1", tool: "t", params: {}, dependsOn: [], retryCount: 0 }],
      executions: [{ stageName: "s1", status: "completed", retryAttempt: 0 }],
      createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_stage_complete", {
      campaignId: "camp-1", stageName: "s1",
    }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("All stages complete");
  });

  it("completes a stage", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Test", status: "active",
      stages: [{ name: "research", tool: "gather", params: {}, dependsOn: [], retryCount: 0 }],
      executions: [{ stageName: "research", status: "running", retryAttempt: 0 }],
      createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_stage_complete", {
      campaignId: "camp-1", stageName: "research", result: { data: "ok" },
    }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("All stages complete");
  });

  it("returns error for nonexistent stage", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Test", status: "active",
      stages: [{ name: "real", tool: "t", params: {}, dependsOn: [], retryCount: 0 }],
      executions: [{ stageName: "real", status: "running", retryAttempt: 0 }],
      createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_stage_complete", {
      campaignId: "camp-1", stageName: "imaginary",
    }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });
});

describe("handleCampaignTool — campaign_stage_fail", () => {
  it("fails an already-failed stage", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Test", status: "failed",
      stages: [{ name: "s1", tool: "t", params: {}, dependsOn: [], retryCount: 0 }],
      executions: [{ stageName: "s1", status: "failed", retryAttempt: 0, error: "Prev error" }],
      createdAt: ts(), updatedAt: ts(), error: "Prev error",
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_stage_fail", {
      campaignId: "camp-1", stageName: "s1", error: "Again",
    }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("failed");
  });

  it("fails a stage", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Test", status: "active",
      stages: [{ name: "s1", tool: "t", params: {}, dependsOn: [], retryCount: 0 }],
      executions: [{ stageName: "s1", status: "running", retryAttempt: 0 }],
      createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_stage_fail", {
      campaignId: "camp-1", stageName: "s1", error: "Something broke",
    }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("failed");
  });

  it("reports campaign-level failure when stage fails", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Test", status: "active",
      stages: [{ name: "s1", tool: "t", params: {}, dependsOn: [], retryCount: 2 }],
      executions: [{ stageName: "s1", status: "running", retryAttempt: 0 }],
      createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_stage_fail", {
      campaignId: "camp-1", stageName: "s1", error: "Retry this",
    }, ctx);
    expect(result.content[0]!.text).toContain("failed");
    expect(result.content[0]!.text).toContain("Campaign failed");
  });
});

describe("handleCampaignTool — campaign_stage_retry", () => {
  it("resets a failed stage to pending and increments retry", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Test", status: "failed",
      stages: [{ name: "s1", tool: "t", params: {}, dependsOn: [], retryCount: 2 }],
      executions: [{ stageName: "s1", status: "failed", retryAttempt: 0, error: "Error" }],
      createdAt: ts(), updatedAt: ts(), error: "Error",
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_stage_retry", {
      campaignId: "camp-1", stageName: "s1",
    }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("attempt 1");
  });

  it("returns error when retries exhausted", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "camp-1", workspaceId: "default", blueprintId: "", name: "Test", status: "failed",
      stages: [{ name: "s1", tool: "t", params: {}, dependsOn: [], retryCount: 0 }],
      executions: [{ stageName: "s1", status: "failed", retryAttempt: 0, error: "Error" }],
      createdAt: ts(), updatedAt: ts(), error: "Error",
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_stage_retry", {
      campaignId: "camp-1", stageName: "s1",
    }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("cannot be retried");
  });
});

describe("handleCampaignTool — blueprint tools", () => {
  it("creates a blueprint via campaign_blueprint_create", async () => {
    const store = mockStore();
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_blueprint_create", {
      name: "Daily Brief",
      description: "My blueprint",
      stages: [{ name: "fetch", tool: "reader" }],
      tags: ["daily"],
    }, ctx);
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as { blueprint: Blueprint };
    expect(data.blueprint.name).toBe("Daily Brief");
    expect(data.blueprint.stages).toHaveLength(1);
  });

  it("lists blueprints via campaign_blueprint_list", async () => {
    const store = mockStore();
    await store.saveBlueprint({
      id: "bp-1", name: "BP1", description: "", stages: [], tags: [],
      createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_blueprint_list", {}, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("BP1");
  });

  it("shows empty message when no blueprints", async () => {
    const store = mockStore();
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_blueprint_list", {}, ctx);
    expect(result.content[0]!.text).toBe("No blueprints saved.");
  });

  it("returns error for invalid blueprint create args", async () => {
    const store = mockStore();
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_blueprint_create", {}, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Invalid arguments");
  });
});

describe("handleCampaignTool — campaign_list", () => {
  it("lists campaigns with status filter", async () => {
    const store = mockStore();
    await store.createCampaign({
      id: "c1", workspaceId: "default", blueprintId: "", name: "Active", status: "active",
      stages: [], executions: [], createdAt: ts(), updatedAt: ts(),
    });
    await store.createCampaign({
      id: "c2", workspaceId: "default", blueprintId: "", name: "Planning", status: "planning",
      stages: [], executions: [], createdAt: ts(), updatedAt: ts(),
    });
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_list", { status: "active" }, ctx);
    expect(result.content[0]!.text).toContain("Active");
    expect(result.content[0]!.text).not.toContain("Planning");
  });

  it("shows empty message when no campaigns", async () => {
    const store = mockStore();
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_list", {}, ctx);
    expect(result.content[0]!.text).toBe("No campaigns found.");
  });
});

describe("handleCampaignTool — unknown tool", () => {
  it("returns error for unknown tool name", async () => {
    const store = mockStore();
    const ctx = mockContext(store);
    const result = await handleCampaignTool("campaign_unknown", {}, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Unknown campaign tool");
  });
});
