import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret } from "../../src/provider-config.js";

const TEST_KEY = "test-encryption-key-32chr!";

beforeEach(() => {
  process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  delete process.env.QUILLBY_PROVIDER_ENCRYPTION_KEY;
});

describe("PBKDF2 key derivation", () => {
  it("produces a 32-byte key with PBKDF2-SHA512 + 100k iterations", () => {
    const salt = Buffer.from("000102030405060708090a0b0c0d0e0f", "hex");
    const key = pbkdf2Sync(TEST_KEY, salt, 100_000, 32, "sha512");
    expect(key).toBeInstanceOf(Buffer);
    expect(key.byteLength).toBe(32);
  });

  it("different secrets produce different keys", () => {
    const salt = randomBytes(16);
    const keyA = pbkdf2Sync("secret-one", salt, 100_000, 32, "sha512");
    const keyB = pbkdf2Sync("secret-two", salt, 100_000, 32, "sha512");
    expect(keyA.equals(keyB)).toBe(false);
  });
});

describe("encryptSecret / decryptSecret round-trip", () => {
  it("encryptSecret produces decryptable ciphertext", () => {
    const payload = "sk-elevenlabs-abc123";
    const encrypted = encryptSecret(payload, TEST_KEY);
    expect(encrypted).toBeTruthy();
    expect(typeof encrypted).toBe("string");

    const parts = encrypted.split(".");
    expect(parts).toHaveLength(4);

    const decrypted = decryptSecret(encrypted, TEST_KEY);
    expect(decrypted).toBe(payload);
  });

  it("produces unique output each time (random IV + salt)", () => {
    const payload = "same-payload-every-time";
    const a = encryptSecret(payload, TEST_KEY);
    const b = encryptSecret(payload, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("decryptSecret handles new 4-part format (PBKDF2)", () => {
    const payload = "r8_test_token_value";
    const encrypted = encryptSecret(payload, TEST_KEY);

    const parts = encrypted.split(".");
    expect(parts).toHaveLength(4);

    const decrypted = decryptSecret(encrypted, TEST_KEY);
    expect(decrypted).toBe(payload);
  });

  it("decryptSecret handles old 3-part format (SHA-256 backward compat)", () => {
    const key = createHash("sha256").update(TEST_KEY).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    const ct = Buffer.concat([
      cipher.update("backward-compat-value", "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const oldFormat = [
      iv.toString("base64"),
      ct.toString("base64"),
      tag.toString("base64"),
    ].join(".");

    const decrypted = decryptSecret(oldFormat, TEST_KEY);
    expect(decrypted).toBe("backward-compat-value");
  });
});

describe("AAD integrity", () => {
  it("rejects decryption with wrong additional authenticated data", () => {
    const payload = "sensitive-key";
    const encrypted = encryptSecret(payload, TEST_KEY);
    const parts = encrypted.split(".");
    const [saltHex, ivRaw, ctRaw, tagRaw] = parts;
    const key = pbkdf2Sync(TEST_KEY, Buffer.from(saltHex, "hex"), 100_000, 32, "sha512");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"), { authTagLength: 16 });
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    decipher.setAAD(Buffer.from("tampered-aad", "utf8"));
    expect(() => {
      Buffer.concat([
        decipher.update(Buffer.from(ctRaw, "base64")),
        decipher.final(),
      ]);
    }).toThrow();
  });
});

describe("invalid ciphertext handling", () => {
  it("throws on corrupted ciphertext", () => {
    expect(() => decryptSecret("bad.format.string.x.y", TEST_KEY)).toThrow();
  });

  it("throws on garbage input", () => {
    expect(() => decryptSecret("not-a-valid-ciphertext-at-all", TEST_KEY)).toThrow();
  });

  it("throws on tampered base64 ciphertext segment", () => {
    const payload = "data-to-protect";
    const encrypted = encryptSecret(payload, TEST_KEY);
    const parts = encrypted.split(".");
    parts[2] = "////this-is-not-valid-base64!!!!";
    const tampered = parts.join(".");
    expect(() => decryptSecret(tampered, TEST_KEY)).toThrow();
  });
});
