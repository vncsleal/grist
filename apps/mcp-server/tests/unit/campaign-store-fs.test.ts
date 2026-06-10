import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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
} from "@quillby/storage-fs";
import {
  createWorkspace,
  ensureWorkspaceSystem,
} from "@quillby/workspace";

let tempHome: string;
let previousHome: string | undefined;
const wsId = "test-ws";

function ts(): string {
  return new Date().toISOString();
}

function makeCampaign(id = "camp-1"): Parameters<typeof createCampaign>[0] {
  return {
    id,
    workspaceId: wsId,
    blueprintId: "bp-1",
    name: `Campaign ${id}`,
    status: "planning",
    stages: [{ name: "research", tool: "gather", params: {}, dependsOn: [], retryCount: 0 }],
    executions: [],
    createdAt: ts(),
    updatedAt: ts(),
  };
}

function makeBlueprint(id = "bp-1"): Parameters<typeof saveBlueprint>[0] {
  return {
    id,
    name: `Blueprint ${id}`,
    description: "",
    stages: [{ name: "research", tool: "gather", params: {}, dependsOn: [], retryCount: 0 }],
    tags: [],
    createdAt: ts(),
    updatedAt: ts(),
  };
}

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-campaign-store-"));
  previousHome = process.env.QUILLBY_HOME;
  process.env.QUILLBY_HOME = tempHome;
  ensureWorkspaceSystem();
  createWorkspace({ id: wsId, name: "Test Workspace" });
});

afterEach(() => {
  if (previousHome === undefined) {
    delete process.env.QUILLBY_HOME;
  } else {
    process.env.QUILLBY_HOME = previousHome;
  }
  fs.rmSync(tempHome, { recursive: true, force: true });
});

describe("Campaign store (filesystem)", () => {
  describe("createCampaign", () => {
    it("writes a campaign file", () => {
      createCampaign(makeCampaign(), wsId);
      const loaded = loadCampaign("camp-1", wsId);
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("Campaign camp-1");
    });

    it("validates the campaign before writing", () => {
      expect(() => createCampaign(
        { ...makeCampaign(), id: "", workspaceId: wsId, name: "Bad" },
        wsId,
      )).toThrow();
    });
  });

  describe("loadCampaign", () => {
    it("returns null for missing campaign", () => {
      expect(loadCampaign("nonexistent", wsId)).toBeNull();
    });

    it("returns null for corrupted file", () => {
      const dir = path.join(tempHome, "workspaces", wsId, "campaigns");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "campaign-bad.json"), "not json");
      expect(loadCampaign("bad", wsId)).toBeNull();
    });
  });

  describe("listCampaigns", () => {
    it("returns empty list when no campaigns", () => {
      expect(listCampaigns(undefined, wsId)).toEqual([]);
    });

    it("returns all campaigns", () => {
      createCampaign(makeCampaign("c1"), wsId);
      createCampaign(makeCampaign("c2"), wsId);
      const all = listCampaigns(undefined, wsId);
      expect(all).toHaveLength(2);
    });

    it("filters by status", () => {
      const active = makeCampaign("c1");
      active.status = "active";
      createCampaign(active, wsId);
      createCampaign(makeCampaign("c2"), wsId);
      const result = listCampaigns("active", wsId);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("c1");
    });
  });

  describe("updateCampaign", () => {
    it("updates campaign fields", () => {
      createCampaign(makeCampaign(), wsId);
      updateCampaign("camp-1", { name: "Updated Name" }, wsId);
      const loaded = loadCampaign("camp-1", wsId);
      expect(loaded!.name).toBe("Updated Name");
    });

    it("updates campaign status", () => {
      createCampaign(makeCampaign(), wsId);
      updateCampaign("camp-1", { status: "active" }, wsId);
      const loaded = loadCampaign("camp-1", wsId);
      expect(loaded!.status).toBe("active");
    });

    it("throws on missing campaign", () => {
      expect(() => updateCampaign("nonexistent", { name: "X" }, wsId)).toThrow("not found");
    });
  });

  describe("deleteCampaign", () => {
    it("deletes existing campaign", () => {
      createCampaign(makeCampaign(), wsId);
      deleteCampaign("camp-1", wsId);
      expect(loadCampaign("camp-1", wsId)).toBeNull();
    });

    it("does not throw on missing campaign", () => {
      expect(() => deleteCampaign("nonexistent", wsId)).not.toThrow();
    });
  });

  describe("blueprint CRUD", () => {
    it("saves and loads a blueprint", () => {
      saveBlueprint(makeBlueprint(), wsId);
      const loaded = loadBlueprint("bp-1", wsId);
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("Blueprint bp-1");
    });

    it("returns null for missing blueprint", () => {
      expect(loadBlueprint("nonexistent", wsId)).toBeNull();
    });

    it("lists all blueprints", () => {
      saveBlueprint(makeBlueprint("bp-1"), wsId);
      saveBlueprint(makeBlueprint("bp-2"), wsId);
      expect(listBlueprints(wsId)).toHaveLength(2);
    });

    it("deletes a blueprint", () => {
      saveBlueprint(makeBlueprint(), wsId);
      deleteBlueprint("bp-1", wsId);
      expect(loadBlueprint("bp-1", wsId)).toBeNull();
    });

    it("validates blueprint before saving", () => {
      expect(() => saveBlueprint(
        { ...makeBlueprint(), stages: [] },
        wsId,
      )).toThrow();
    });
  });

  describe("data isolation", () => {
    it("isolates campaigns between workspace IDs", () => {
      createWorkspace({ id: "ws-a", name: "Workspace A" });
      createWorkspace({ id: "ws-b", name: "Workspace B" });
      createCampaign(makeCampaign("c1"), "ws-a");
      createCampaign(makeCampaign("c2"), "ws-b");
      expect(listCampaigns(undefined, "ws-a")).toHaveLength(1);
      expect(listCampaigns(undefined, "ws-b")).toHaveLength(1);
    });
  });
});
