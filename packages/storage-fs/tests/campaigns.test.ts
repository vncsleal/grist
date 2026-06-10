import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import os from "os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-test-"));
const campaignsDir = path.join(tmpDir, "campaigns");

vi.mock("@quillby/workspace", () => ({
  getCurrentWorkspaceId: () => "test-ws",
  getWorkspacePaths: () => ({
    campaignsDir,
  }),
}));

beforeEach(() => {
  fs.mkdirSync(campaignsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

import {
  createCampaign,
  loadCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
  saveBlueprint,
  loadBlueprint,
  listBlueprints,
  deleteBlueprint,
} from "../src/campaigns.js";

const now = new Date().toISOString();

const sampleCampaign = {
  id: "camp-1",
  workspaceId: "test-ws",
  name: "Test Campaign",
  status: "planning" as const,
  blueprintId: "",
  stages: [{ name: "Research", tool: "research_agent", params: {}, dependsOn: [], retryCount: 0 }],
  executions: [],
  createdAt: now,
  updatedAt: now,
};

const sampleBlueprint = {
  id: "bp-1",
  name: "Test Blueprint",
  description: "",
  tags: [],
  stages: [{ name: "Research", tool: "research_agent", params: {}, dependsOn: [], retryCount: 0 }],
  createdAt: now,
  updatedAt: now,
};

describe("campaigns CRUD", () => {
  it("creates and loads a campaign", () => {
    createCampaign(sampleCampaign);
    const loaded = loadCampaign("camp-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Test Campaign");
  });

  it("returns null for missing campaign", () => {
    expect(loadCampaign("nonexistent")).toBeNull();
  });

  it("lists campaigns", () => {
    createCampaign(sampleCampaign);
    createCampaign({ ...sampleCampaign, id: "camp-2", name: "Second" });
    const all = listCampaigns();
    expect(all).toHaveLength(2);
  });

  it("filters campaigns by status", () => {
    createCampaign(sampleCampaign);
    createCampaign({ ...sampleCampaign, id: "camp-2", status: "active" });
    const active = listCampaigns("active");
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("camp-2");
  });

  it("updates a campaign", () => {
    createCampaign(sampleCampaign);
    updateCampaign("camp-1", { name: "Updated" });
    const loaded = loadCampaign("camp-1");
    expect(loaded!.name).toBe("Updated");
    expect(loaded!.updatedAt).not.toBe(now);
  });

  it("throws on updating missing campaign", () => {
    expect(() => updateCampaign("nonexistent", { name: "x" })).toThrow();
  });

  it("deletes a campaign", () => {
    createCampaign(sampleCampaign);
    deleteCampaign("camp-1");
    expect(loadCampaign("camp-1")).toBeNull();
  });
});

describe("blueprints CRUD", () => {
  it("saves and loads a blueprint", () => {
    saveBlueprint(sampleBlueprint);
    const loaded = loadBlueprint("bp-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Test Blueprint");
  });

  it("returns null for missing blueprint", () => {
    expect(loadBlueprint("nonexistent")).toBeNull();
  });

  it("lists blueprints", () => {
    saveBlueprint(sampleBlueprint);
    saveBlueprint({ ...sampleBlueprint, id: "bp-2", name: "Second" });
    expect(listBlueprints()).toHaveLength(2);
  });

  it("deletes a blueprint", () => {
    saveBlueprint(sampleBlueprint);
    deleteBlueprint("bp-1");
    expect(loadBlueprint("bp-1")).toBeNull();
  });
});
