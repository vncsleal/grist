/**
 * Unit tests — ElevenLabs persistent voice clone ID storage lifecycle.
 *
 * Covers:
 *  - elevenlabsClonedVoiceId persists through updateWorkspaceMetadata (hosted DB)
 *  - clearing the voice ID sets it back to undefined
 *  - update is scoped to the correct user (isolation)
 *  - cloneConsentGranted gate round-trips correctly alongside the voice ID
 */
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createDb, HostedDbWorkspaceStorage } from "../../src/storage.js";

let tempDir = "";
let tempDbPath = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-voice-clone-"));
  tempDbPath = path.join(tempDir, "test.db");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("voice clone storage (hosted DB)", () => {
  it("persists elevenlabsClonedVoiceId after updateWorkspaceMetadata", async () => {
    const { db } = createDb(`file:${tempDbPath}`);
    const user = new HostedDbWorkspaceStorage("user-A", db);

    // Bootstrap the default workspace.
    const ws = await user.getCurrentWorkspace();
    expect(ws.elevenlabsClonedVoiceId).toBeUndefined();

    // Store a fake cloned voice ID.
    const updated = await user.updateWorkspaceMetadata({
      elevenlabsClonedVoiceId: "eleven_voice_abc123",
      cloneConsentGranted: true,
    });
    expect(updated.elevenlabsClonedVoiceId).toBe("eleven_voice_abc123");
    expect(updated.cloneConsentGranted).toBe(true);

    // Reload from DB to confirm persistence.
    const reloaded = await user.getCurrentWorkspace();
    expect(reloaded.elevenlabsClonedVoiceId).toBe("eleven_voice_abc123");
    expect(reloaded.cloneConsentGranted).toBe(true);
  });

  it("clears elevenlabsClonedVoiceId when set to empty string (explicit clear signal)", async () => {
    const { db } = createDb(`file:${tempDbPath}`);
    const user = new HostedDbWorkspaceStorage("user-B", db);

    await user.updateWorkspaceMetadata({
      elevenlabsClonedVoiceId: "eleven_voice_to_delete",
      cloneConsentGranted: true,
    });

    // Empty string is the clear signal — maps to DB NULL, rowToMetadata returns undefined.
    await user.updateWorkspaceMetadata({ elevenlabsClonedVoiceId: "" });
    const reloaded = await user.getCurrentWorkspace();
    expect(reloaded.elevenlabsClonedVoiceId).toBeUndefined();
  });

  it("is scoped per user — voice ID does not leak across users", async () => {
    const { db } = createDb(`file:${tempDbPath}`);
    const userA = new HostedDbWorkspaceStorage("user-A", db);
    const userB = new HostedDbWorkspaceStorage("user-B", db);

    await userA.updateWorkspaceMetadata({ elevenlabsClonedVoiceId: "voice_A" });

    const wsA = await userA.getCurrentWorkspace();
    const wsB = await userB.getCurrentWorkspace();

    expect(wsA.elevenlabsClonedVoiceId).toBe("voice_A");
    expect(wsB.elevenlabsClonedVoiceId).toBeUndefined();
  });

  it("revoking consent does not wipe the voice ID (can re-enable consent and reuse)", async () => {
    const { db } = createDb(`file:${tempDbPath}`);
    const user = new HostedDbWorkspaceStorage("user-C", db);

    await user.updateWorkspaceMetadata({
      elevenlabsClonedVoiceId: "persistent_voice",
      cloneConsentGranted: true,
    });

    // Revoke consent.
    await user.updateWorkspaceMetadata({ cloneConsentGranted: false });
    const reloaded = await user.getCurrentWorkspace();

    // Voice ID is still stored but consent is false — generation will block.
    expect(reloaded.elevenlabsClonedVoiceId).toBe("persistent_voice");
    expect(reloaded.cloneConsentGranted).toBe(false);
  });
});
