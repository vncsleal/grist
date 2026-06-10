import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createDb, HostedDbWorkspaceStorage } from "@quillby/storage-db";

let tempDir = "";
let tempDbPath = "";

function makeStorage(userId = "test-user"): HostedDbWorkspaceStorage {
  const { db } = createDb(`file:${tempDbPath}`);
  return new HostedDbWorkspaceStorage(userId, db);
}

async function withWorkspace(storage: HostedDbWorkspaceStorage): Promise<string> {
  await storage.createWorkspace({ name: "Test", id: "test-ws", makeCurrent: true });
  return "test-ws";
}

function makeSession(overrides: Partial<{
  id: string; workspaceId: string; state: "planning" | "executing" | "reviewing" | "closing";
}> = {}) {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? "session-1",
    workspaceId: overrides.workspaceId ?? "test-ws",
    scope: { type: "freeform" as const, goal: "Test session", constraints: [] },
    state: overrides.state ?? ("planning" as const),
    degradation: { warnings: [] },
    startedAt: now,
    lastActivityAt: now,
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-db-sessions-"));
  tempDbPath = path.join(tempDir, "test.db");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("HostedDbWorkspaceStorage — SessionStore", () => {
  describe("createSession", () => {
    it("inserts a session with scope and degradation as JSON", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const session = makeSession();
      await storage.createSession(session);
      const loaded = await storage.loadSession("session-1");
      expect(loaded).not.toBeNull();
      expect(loaded!.scope.goal).toBe("Test session");
      expect(loaded!.degradation.warnings).toEqual([]);
    });
  });

  describe("loadSession", () => {
    it("returns null for missing session", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const result = await storage.loadSession("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listSessions", () => {
    it("returns sessions ordered by lastActivity desc", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const old = makeSession({ id: "s1" });
      const recent = makeSession({ id: "s2" });
      await storage.createSession(old);
      await new Promise((r) => setTimeout(r, 10));
      await storage.createSession(recent);
      const sessions = await storage.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0]!.id).toBe("s2");
    });

    it("returns empty when no sessions", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const sessions = await storage.listSessions();
      expect(sessions).toHaveLength(0);
    });
  });

  describe("updateSession", () => {
    it("updates state and summary", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      await storage.createSession(makeSession());
      await storage.updateSession("session-1", { state: "executing" });
      const loaded = await storage.loadSession("session-1");
      expect(loaded!.state).toBe("executing");
    });
  });

  describe("closeSession", () => {
    it("sets state to closing and adds closedAt", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      await storage.createSession(makeSession());
      await storage.closeSession("session-1");
      const loaded = await storage.loadSession("session-1");
      expect(loaded!.state).toBe("closing");
      expect(loaded!.closedAt).toBeDefined();
    });
  });

  describe("findStaleSessions", () => {
    it("finds sessions older than threshold", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const stale = makeSession({
        id: "stale",
        state: "executing",
      });
      stale.lastActivityAt = new Date(Date.now() - 60_000).toISOString();
      const recent = makeSession({ id: "recent" });
      await storage.createSession(stale);
      await storage.createSession(recent);
      const staleSessions = await storage.findStaleSessions(30_000);
      expect(staleSessions).toHaveLength(1);
      expect(staleSessions[0]!.id).toBe("stale");
    });

    it("excludes closed sessions", async () => {
      const storage = makeStorage();
      await withWorkspace(storage);
      const closed = makeSession({ id: "closed", state: "closing" });
      closed.lastActivityAt = new Date(Date.now() - 60_000).toISOString();
      await storage.createSession(closed);
      await storage.closeSession("closed");
      const stale = await storage.findStaleSessions(1);
      expect(stale).toHaveLength(0);
    });
  });
});
