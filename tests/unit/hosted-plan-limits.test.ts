import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, HostedDbWorkspaceStorage } from "../../src/storage.js";
import { hostedUserState } from "../../src/db/schema.js";

let tempDir = "";
let tempDbPath = "";
let previousEnforce = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-hosted-plan-"));
  tempDbPath = path.join(tempDir, "test.db");
  previousEnforce = process.env.QUILLBY_ENFORCE_PLAN_LIMITS ?? "";
  process.env.QUILLBY_ENFORCE_PLAN_LIMITS = "1";
});

afterEach(() => {
  if (previousEnforce) process.env.QUILLBY_ENFORCE_PLAN_LIMITS = previousEnforce;
  else delete process.env.QUILLBY_ENFORCE_PLAN_LIMITS;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("hosted plan limits", () => {
  it("enforces free workspace count limit", async () => {
    const { db } = createDb(`file:${tempDbPath}`);
    const user = new HostedDbWorkspaceStorage("free-user", db);

    // Default workspace is created during bootstrap; free limit allows 3 total.
    await user.listWorkspaces();
    await user.createWorkspace({ name: "Workspace A", id: "ws-a" });
    await user.createWorkspace({ name: "Workspace B", id: "ws-b" });

    await expect(
      user.createWorkspace({ name: "Workspace C", id: "ws-c" })
    ).rejects.toThrow(/free plan limit/i);
  });

  it("enforces free harvest cooldown", async () => {
    const { db } = createDb(`file:${tempDbPath}`);
    const user = new HostedDbWorkspaceStorage("cooldown-user", db);

    await user.saveHarvestOutput([
      { title: "T1", source: "S", link: "https://example.com/1", thesis: "X" },
    ]);

    await expect(
      user.saveHarvestOutput([
        { title: "T2", source: "S", link: "https://example.com/2", thesis: "Y" },
      ])
    ).rejects.toThrow(/cooldown/i);
  });

  it("allows pro users to bypass limits", async () => {
    const { db } = createDb(`file:${tempDbPath}`);
    const user = new HostedDbWorkspaceStorage("pro-user", db);

    // Ensure hosted_user_state exists, then upgrade to pro.
    await user.listWorkspaces();
    await db
      .update(hostedUserState)
      .set({ plan: "pro" })
      .where(eq(hostedUserState.userId, "pro-user"));

    await user.createWorkspace({ name: "One", id: "one" });
    await user.createWorkspace({ name: "Two", id: "two" });
    await user.createWorkspace({ name: "Three", id: "three" });
    await user.createWorkspace({ name: "Four", id: "four" });

    await user.saveHarvestOutput([
      { title: "A", source: "S", link: "https://example.com/a", thesis: "A" },
    ]);
    await expect(
      user.saveHarvestOutput([
        { title: "B", source: "S", link: "https://example.com/b", thesis: "B" },
      ])
    ).resolves.toBeTypeOf("string");
  });
});
