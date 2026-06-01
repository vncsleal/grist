import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import os from "os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-test-"));
const sessionsDir = path.join(tmpDir, "sessions");

vi.mock("@quillby/workspace", () => ({
  getCurrentWorkspaceId: () => "test-ws",
  getWorkspacePaths: () => ({
    sessionsDir,
  }),
}));

beforeEach(() => {
  fs.mkdirSync(sessionsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

import {
  createSession,
  loadSession,
  listSessions,
  updateSession,
  closeSession,
  findStaleSessions,
} from "../src/sessions.js";

const now = new Date().toISOString();

const sampleSession = {
  id: "sess-1",
  workspaceId: "test-ws",
  scope: { type: "freeform" as const, goal: "Test session", constraints: [] },
  state: "planning" as const,
  degradation: { warnings: [] },
  startedAt: now,
  lastActivityAt: now,
};

describe("sessions CRUD", () => {
  it("creates and loads a session", () => {
    createSession(sampleSession);
    const loaded = loadSession("sess-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.state).toBe("planning");
  });

  it("returns null for missing session", () => {
    expect(loadSession("nonexistent")).toBeNull();
  });

  it("lists sessions", () => {
    createSession(sampleSession);
    createSession({ ...sampleSession, id: "sess-2" });
    expect(listSessions()).toHaveLength(2);
  });

  it("updates a session", () => {
    createSession(sampleSession);
    updateSession("sess-1", { state: "executing" });
    const loaded = loadSession("sess-1");
    expect(loaded!.state).toBe("executing");
  });

  it("throws on updating missing session", () => {
    expect(() => updateSession("nonexistent", { state: "executing" })).toThrow();
  });

  it("closes a session", () => {
    createSession(sampleSession);
    closeSession("sess-1");
    const loaded = loadSession("sess-1");
    expect(loaded!.state).toBe("closing");
    expect(loaded!.closedAt).toBeDefined();
  });

  it("throws on closing missing session", () => {
    expect(() => closeSession("nonexistent")).toThrow();
  });

  it("finds stale sessions", () => {
    const oldTime = new Date(Date.now() - 60_000).toISOString();
    createSession({ ...sampleSession, id: "sess-old", lastActivityAt: oldTime });
    createSession({ ...sampleSession, id: "sess-fresh" });
    const stale = findStaleSessions(30_000);
    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe("sess-old");
  });

  it("does not return closed sessions as stale", () => {
    const oldTime = new Date(Date.now() - 60_000).toISOString();
    createSession({
      ...sampleSession,
      id: "sess-closed",
      state: "closing",
      closedAt: oldTime,
      lastActivityAt: oldTime,
    });
    const stale = findStaleSessions(30_000);
    expect(stale.find((s) => s.id === "sess-closed")).toBeUndefined();
  });
});
