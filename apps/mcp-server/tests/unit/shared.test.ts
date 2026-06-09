import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGINAL_NPM_VERSION = process.env.npm_package_version;
const ORIGINAL_QUILLBY_VERSION = process.env.QUILLBY_VERSION;

beforeEach(() => {
  delete process.env.npm_package_version;
  delete process.env.QUILLBY_VERSION;
});

afterEach(() => {
  if (ORIGINAL_NPM_VERSION) process.env.npm_package_version = ORIGINAL_NPM_VERSION;
  if (ORIGINAL_QUILLBY_VERSION) process.env.QUILLBY_VERSION = ORIGINAL_QUILLBY_VERSION;
});

describe("PKG.version", () => {
  it("should read version from package.json when no env vars are set", async () => {
    vi.resetModules();
    const pkgPath = resolve(__dirname, "../../package.json");
    const expected = JSON.parse(readFileSync(pkgPath, "utf-8")).version;
    const { PKG } = await import("../../src/mcp/shared.js");
    expect(PKG.version).toBe(expected);
  });

  it("should use QUILLBY_VERSION env var when set", async () => {
    process.env.QUILLBY_VERSION = "99.99.99-build";
    vi.resetModules();
    const { PKG } = await import("../../src/mcp/shared.js");
    expect(PKG.version).toBe("99.99.99-build");
  });

  it("should use npm_package_version env var when set", async () => {
    process.env.npm_package_version = "88.88.88-npm";
    vi.resetModules();
    const { PKG } = await import("../../src/mcp/shared.js");
    expect(PKG.version).toBe("88.88.88-npm");
  });

  it("should prefer QUILLBY_VERSION over npm_package_version", async () => {
    process.env.QUILLBY_VERSION = "1.0.0-defined";
    process.env.npm_package_version = "2.0.0-npm";
    vi.resetModules();
    const { PKG } = await import("../../src/mcp/shared.js");
    expect(PKG.version).toBe("1.0.0-defined");
  });
});
