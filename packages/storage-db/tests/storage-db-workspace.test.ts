import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createDb } from "@quillby/database";
import { HostedDbWorkspaceStorage } from "../src/index.js";

let tempDir = "";
let tempDbPath = "";

function makeStorage(userId = "test-user"): HostedDbWorkspaceStorage {
  const { db } = createDb(`file:${tempDbPath}`);
  return new HostedDbWorkspaceStorage(userId, db);
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-db-ws-"));
  tempDbPath = path.join(tempDir, "test.db");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("HostedDbWorkspaceStorage — Workspace CRUD", () => {
  describe("createWorkspace", () => {
    it("creates and lists a workspace", async () => {
      const storage = makeStorage();
      const meta = await storage.createWorkspace({ name: "My Workspace", id: "my-ws", makeCurrent: true });
      expect(meta.name).toBe("My Workspace");
      const workspaces = await storage.listWorkspaces();
      expect(workspaces.length).toBeGreaterThanOrEqual(1);
      expect(workspaces.some((w) => w.id === "my-ws")).toBe(true);
    });

    it("throws on duplicate workspace id", async () => {
      const storage = makeStorage();
      await storage.createWorkspace({ name: "A", id: "ws", makeCurrent: true });
      await expect(storage.createWorkspace({ name: "B", id: "ws" })).rejects.toThrow("already exists");
    });

    it("auto-creates default workspace on first use", async () => {
      const storage = makeStorage("new-user");
      const workspaces = await storage.listWorkspaces();
      expect(workspaces.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("workspaceExists", () => {
    it("returns true for existing workspace", async () => {
      const storage = makeStorage();
      await storage.createWorkspace({ name: "Test", id: "test-ws", makeCurrent: true });
      expect(await storage.workspaceExists("test-ws")).toBe(true);
    });

    it("returns false for missing workspace", async () => {
      const storage = makeStorage();
      expect(await storage.workspaceExists("nonexistent")).toBe(false);
    });
  });

  describe("loadWorkspace", () => {
    it("loads a created workspace", async () => {
      const storage = makeStorage();
      await storage.createWorkspace({ name: "Loaded", id: "load-ws", makeCurrent: true });
      const loaded = await storage.loadWorkspace("load-ws");
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("Loaded");
    });

    it("returns null for missing workspace", async () => {
      const storage = makeStorage();
      expect(await storage.loadWorkspace("nonexistent")).toBeNull();
    });
  });

  describe("updateWorkspaceMetadata", () => {
    it("updates clone consent", async () => {
      const wsStorage = makeStorage("user-upd");
      await wsStorage.createWorkspace({ name: "WS", id: "ws", makeCurrent: true });
      await wsStorage.updateWorkspaceMetadata({ cloneConsentGranted: true, cloneConsentAt: new Date().toISOString() });
      const loaded = await wsStorage.loadWorkspace("ws");
      expect(loaded!.cloneConsentGranted).toBe(true);
    });
  });

  describe("getCurrentWorkspaceId / setCurrentWorkspace", () => {
    it("returns the current workspace id", async () => {
      const storage = makeStorage();
      await storage.createWorkspace({ name: "A", id: "ws-a", makeCurrent: false });
      await storage.createWorkspace({ name: "B", id: "ws-b", makeCurrent: true });
      const id = await storage.getCurrentWorkspaceId();
      expect(id).toBe("ws-b");
    });

    it("switches current workspace", async () => {
      const storage = makeStorage();
      await storage.createWorkspace({ name: "A", id: "ws-a", makeCurrent: true });
      await storage.createWorkspace({ name: "B", id: "ws-b", makeCurrent: false });
      await storage.setCurrentWorkspace("ws-b");
      expect(await storage.getCurrentWorkspaceId()).toBe("ws-b");
    });
  });
});

// Jobs are tested via MCP server integration tests
// (the hosted_workspace_job table has a FK to user(id) from Better Auth schema)

describe("HostedDbWorkspaceStorage — Plan info", () => {
  it("returns free plan by default", async () => {
    const storage = makeStorage();
    const plan = await storage.getPlan();
    expect(plan).toBe("free");
  });
});
