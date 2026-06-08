/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

function makeStorage(overrides = {}): any {
  return {
    getCurrentWorkspaceId: vi.fn().mockReturnValue("ws-1"),
    getCurrentWorkspace: vi.fn().mockResolvedValue({ id: "ws-1", name: "Test" }),
    loadContext: vi.fn().mockResolvedValue({ name: "Test", role: "writer", topics: ["marketing"], industry: "tech" }),
    contextExists: vi.fn().mockResolvedValue(true),
    loadSources: vi.fn().mockResolvedValue([]),
    loadTypedMemory: vi.fn().mockResolvedValue({}),
    listWorkspaces: vi.fn().mockResolvedValue([]),
    getWorkspace: vi.fn().mockResolvedValue({ id: "ws-1", name: "Test" }),
    getPlan: vi.fn().mockResolvedValue({ plan: "free" }),
    loadJob: vi.fn().mockResolvedValue(null),
    listJobs: vi.fn().mockResolvedValue([]),
    updateJob: vi.fn(),
    saveJob: vi.fn(),
    getMonthlyJobCount: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

const mockServer = {
  server: {
    getClientCapabilities: vi.fn(),
    createMessage: vi.fn(),
  },
} as any;

describe("handleToolCall", () => {
  beforeEach(() => { vi.resetModules(); });

  it("dispatches workspace tool", async () => {
    const { handleToolCall } = await import("../../src/mcp/server.js");
    const result = await handleToolCall(mockServer, makeStorage(), "workspace", { action: "list" });
    expect(result).toBeDefined();
    expect(result.content?.[0]?.text).toBeDefined();
  });

  it("dispatches server tool", async () => {
    const { handleToolCall } = await import("../../src/mcp/server.js");
    const result = await handleToolCall(mockServer, makeStorage(), "server", { action: "info" });
    expect(result).toBeDefined();
    expect(result.content?.[0]?.text).toBeDefined();
  });

  it("returns error for unknown tool", async () => {
    const { handleToolCall } = await import("../../src/mcp/server.js");
    const result = await handleToolCall(mockServer, makeStorage(), "nonexistent", {});
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain("Unknown tool");
  });
});

describe("sample", () => {
  beforeEach(() => { vi.resetModules(); });

  it("returns unsupported when client lacks sampling", async () => {
    const srv = { server: { getClientCapabilities: () => ({}), createMessage: vi.fn() } } as any;
    const { sample } = await import("../../src/mcp/server.js");
    const r = await sample(srv, "test");
    expect((r as any).ok).toBe(false);
    expect((r as any).reason).toBe("unsupported");
  });

  it("returns text on success", async () => {
    const srv = { server: { getClientCapabilities: () => ({ sampling: {} }), createMessage: vi.fn().mockResolvedValue({ content: { type: "text", text: "ok" } }) } } as any;
    const { sample } = await import("../../src/mcp/server.js");
    const r = await sample(srv, "test");
    expect((r as any).ok).toBe(true);
    expect((r as any).text).toBe("ok");
  });

  it("handles sampling error", async () => {
    const srv = { server: { getClientCapabilities: () => ({ sampling: {} }), createMessage: vi.fn().mockRejectedValue(new Error("fail")) } } as any;
    const { sample } = await import("../../src/mcp/server.js");
    const r = await sample(srv, "test");
    expect((r as any).ok).toBe(false);
    expect((r as any).reason).toBe("error");
  });
});

describe("recoverOrphanedJobs", () => {
  beforeEach(() => { vi.resetModules(); });

  it("recovers stale jobs", async () => {
    const storage = makeStorage({
      listJobs: vi.fn().mockResolvedValue([
        { id: "1", status: "running", updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() },
      ]),
    });
    const { recoverOrphanedJobs } = await import("../../src/mcp/server.js");
    expect(await recoverOrphanedJobs(storage)).toBe(1);
    expect(storage.updateJob).toHaveBeenCalledTimes(1);
  });

  it("skips recent jobs", async () => {
    const storage = makeStorage({
      listJobs: vi.fn().mockResolvedValue([{ id: "1", status: "running", updatedAt: new Date().toISOString() }]),
    });
    const { recoverOrphanedJobs } = await import("../../src/mcp/server.js");
    expect(await recoverOrphanedJobs(storage)).toBe(0);
  });

  it("handles empty job list", async () => {
    const storage = makeStorage({ listJobs: vi.fn().mockResolvedValue([]) });
    const { recoverOrphanedJobs } = await import("../../src/mcp/server.js");
    expect(await recoverOrphanedJobs(storage)).toBe(0);
  });
});

describe("PKG.version", () => {
  it("is a non-empty string", async () => {
    const { PKG } = await import("../../src/mcp/server.js");
    expect(typeof PKG.version).toBe("string");
    expect(PKG.version.length).toBeGreaterThan(0);
  });
});

describe("TOOLS", () => {
  it("exports 11 tools", async () => {
    const { TOOLS } = await import("../../src/mcp/server.js");
    expect(TOOLS.length).toBe(11);
  });
});

describe("validateEnv", () => {
  it("is a function", async () => {
    const { validateEnv } = await import("../../src/mcp/server.js");
    expect(typeof validateEnv).toBe("function");
  });
});
