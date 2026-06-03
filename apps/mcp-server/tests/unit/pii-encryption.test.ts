import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { eq } from "drizzle-orm";
import { createDb, HostedDbWorkspaceStorage } from "@quillby/storage-db";
import { hostedWorkspace } from "../../src/db/schema.js";

const ORIGINAL_ENV = { ...process.env };
let tempDir = "";
let tempDbPath = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-pii-encryption-"));
  tempDbPath = path.join(tempDir, "test.db");
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("PII encryption (indirect through updateWorkspaceMetadata)", () => {
  it("encrypts faceReferenceImageUrl when encryption key is set", async () => {
    process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY = "test-pii-encryption-key";

    const { db } = createDb(`file:${tempDbPath}`);
    const storage = new HostedDbWorkspaceStorage("user-pii-enc", db);
    await storage.getCurrentWorkspace();

    const plaintextUrl = "https://example.com/face-reference.jpg";
    await storage.updateWorkspaceMetadata({ faceReferenceImageUrl: plaintextUrl });

    const ws = await storage.getCurrentWorkspace();
    expect(ws.faceReferenceImageUrl).toBe(plaintextUrl);

    const row = await db
      .select({ stored: hostedWorkspace.faceReferenceImageUrl })
      .from(hostedWorkspace)
      .where(eq(hostedWorkspace.userId, "user-pii-enc"))
      .limit(1);
    expect(row[0]?.stored).not.toBe(plaintextUrl);
    expect(row[0]?.stored).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
  });

  it("encrypts voiceReferenceAudioUrl when encryption key is set", async () => {
    process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY = "test-pii-encryption-key";

    const { db } = createDb(`file:${tempDbPath}`);
    const storage = new HostedDbWorkspaceStorage("user-pii-voice", db);
    await storage.getCurrentWorkspace();

    const plaintextUrl = "https://example.com/voice-reference.wav";
    await storage.updateWorkspaceMetadata({ voiceReferenceAudioUrl: plaintextUrl });

    const ws = await storage.getCurrentWorkspace();
    expect(ws.voiceReferenceAudioUrl).toBe(plaintextUrl);

    const row = await db
      .select({ stored: hostedWorkspace.voiceReferenceAudioUrl })
      .from(hostedWorkspace)
      .where(eq(hostedWorkspace.userId, "user-pii-voice"))
      .limit(1);
    expect(row[0]?.stored).not.toBe(plaintextUrl);
    expect(row[0]?.stored).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
  });

  it("stores plaintext when no encryption key is set (backward compat)", async () => {
    delete process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY;
    delete process.env.QUILLBY_KEYRING_SECRET;

    const { db } = createDb(`file:${tempDbPath}`);
    const storage = new HostedDbWorkspaceStorage("user-pii-plain", db);
    await storage.getCurrentWorkspace();

    const plaintextUrl = "https://example.com/unencrypted-face.jpg";
    await storage.updateWorkspaceMetadata({ faceReferenceImageUrl: plaintextUrl });

    const ws = await storage.getCurrentWorkspace();
    expect(ws.faceReferenceImageUrl).toBe(plaintextUrl);

    const row = await db
      .select({ stored: hostedWorkspace.faceReferenceImageUrl })
      .from(hostedWorkspace)
      .where(eq(hostedWorkspace.userId, "user-pii-plain"))
      .limit(1);
    expect(row[0]?.stored).toBe(plaintextUrl);
  });

  it("encrypts both face and voice simultaneously", async () => {
    process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY = "test-pii-encryption-key";

    const { db } = createDb(`file:${tempDbPath}`);
    const storage = new HostedDbWorkspaceStorage("user-pii-both", db);
    await storage.getCurrentWorkspace();

    await storage.updateWorkspaceMetadata({
      faceReferenceImageUrl: "https://example.com/face.png",
      voiceReferenceAudioUrl: "https://example.com/voice.mp3",
    });

    const ws = await storage.getCurrentWorkspace();
    expect(ws.faceReferenceImageUrl).toBe("https://example.com/face.png");
    expect(ws.voiceReferenceAudioUrl).toBe("https://example.com/voice.mp3");

    const row = await db
      .select({
        faceStored: hostedWorkspace.faceReferenceImageUrl,
        voiceStored: hostedWorkspace.voiceReferenceAudioUrl,
      })
      .from(hostedWorkspace)
      .where(eq(hostedWorkspace.userId, "user-pii-both"))
      .limit(1);
    expect(row[0]?.faceStored).not.toBe("https://example.com/face.png");
    expect(row[0]?.voiceStored).not.toBe("https://example.com/voice.mp3");
  });

  it("handles clearing faceReferenceImageUrl to null", async () => {
    process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY = "test-pii-encryption-key";

    const { db } = createDb(`file:${tempDbPath}`);
    const storage = new HostedDbWorkspaceStorage("user-pii-clear", db);
    await storage.getCurrentWorkspace();

    await storage.updateWorkspaceMetadata({ faceReferenceImageUrl: "https://example.com/face.jpg" });
    await storage.updateWorkspaceMetadata({ faceReferenceImageUrl: "" });

    const ws = await storage.getCurrentWorkspace();
    expect(ws.faceReferenceImageUrl).toBeUndefined();
  });

  it("uses QUILLBY_KEYRING_SECRET as fallback encryption key", async () => {
    delete process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY;
    process.env.QUILLBY_KEYRING_SECRET = "fallback-keyring-secret";

    const { db } = createDb(`file:${tempDbPath}`);
    const storage = new HostedDbWorkspaceStorage("user-pii-fallback", db);
    await storage.getCurrentWorkspace();

    const plaintextUrl = "https://example.com/fallback-key.jpg";
    await storage.updateWorkspaceMetadata({ faceReferenceImageUrl: plaintextUrl });

    const ws = await storage.getCurrentWorkspace();
    expect(ws.faceReferenceImageUrl).toBe(plaintextUrl);

    const row = await db
      .select({ stored: hostedWorkspace.faceReferenceImageUrl })
      .from(hostedWorkspace)
      .where(eq(hostedWorkspace.userId, "user-pii-fallback"))
      .limit(1);
    expect(row[0]?.stored).not.toBe(plaintextUrl);
  });
});
