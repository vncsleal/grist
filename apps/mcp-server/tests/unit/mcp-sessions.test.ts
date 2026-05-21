import { describe, expect, it, vi } from "vitest";
import {
  handleSessionStart,
  handleSessionStatus,
  handleSessionClose,
} from "../../src/mcp/sessions.js";
import type { SessionStore, PlanStorage } from "@quillby/workspace";

function mockStore(): SessionStore & PlanStorage {
  return {
    createSession: vi.fn(),
    loadSession: vi.fn(),
    listSessions: vi.fn(),
    updateSession: vi.fn(),
    closeSession: vi.fn(),
    findStaleSessions: vi.fn().mockResolvedValue([]),
    createPlan: vi.fn(),
    loadPlan: vi.fn(),
    listPlans: vi.fn(),
    updatePlan: vi.fn(),
    deletePlan: vi.fn(),
    createTask: vi.fn(),
    loadTask: vi.fn(),
    listTasks: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    getCalendar: vi.fn(),
    getTodayQueue: vi.fn(),
  };
}

describe("handleSessionStart", () => {
  it("creates a session with auto-generated id", async () => {
    const store = mockStore();
    const result = await handleSessionStart(store, store, {
      goal: "Research weekly topics",
    });
    const data = result.structuredContent as Record<string, unknown>;
    expect((data.session as { id: string }).id).toContain("session-");
    expect((data.session as { state: string }).state).toBe("planning");
  });

  it("auto-closes stale sessions before creating new one", async () => {
    const store = mockStore();
    (store.findStaleSessions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "stale-1" },
    ]);
    await handleSessionStart(store, store, {
      goal: "New session",
    });
    expect(store.findStaleSessions).toHaveBeenCalledOnce();
    expect(store.closeSession).toHaveBeenCalledWith("stale-1");
  });

  it("applies weekly_linkedin template", async () => {
    const store = mockStore();
    const result = await handleSessionStart(store, store, {
      goal: "Write posts",
      template: "weekly_linkedin",
    });
    const session = (result.structuredContent as { session: { scope: { constraints: string[] } } }).session;
    expect(session.scope.constraints).toContain("LinkedIn only");
  });
});

describe("handleSessionStatus", () => {
  it("returns active session info with degradation", async () => {
    const store = mockStore();
    (store.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "s1", state: "executing", lastActivityAt: new Date().toISOString(), degradation: { warnings: [] } },
    ]);
    const result = await handleSessionStatus(store, store, {});
    const data = result.structuredContent as { session: { id: string } };
    expect(data.session.id).toBe("s1");
  });

  it("returns no active when no sessions exist", async () => {
    const store = mockStore();
    (store.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const result = await handleSessionStatus(store, store, {});
    const data = result.structuredContent as { active: boolean };
    expect(data.active).toBe(false);
  });
});

describe("handleSessionClose", () => {
  it("closes most recent active session", async () => {
    const store = mockStore();
    (store.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "s1", state: "executing", lastActivityAt: new Date().toISOString() },
    ]);
    const result = await handleSessionClose(store, store, { summary: "Done" });
    const data = result.structuredContent as { closed: boolean; summary: string };
    expect(data.closed).toBe(true);
    expect(data.summary).toBe("Done");
  });

  it("returns closed:false when no active session", async () => {
    const store = mockStore();
    (store.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const result = await handleSessionClose(store, store, {});
    const data = result.structuredContent as { closed: boolean };
    expect(data.closed).toBe(false);
  });
});
