import { describe, expect, it } from "vitest";

import { parseRateLimit } from "@quillby/auth";

describe("parseRateLimit", () => {
  it("defaults to 60 when undefined", () => {
    expect(parseRateLimit(undefined)).toBe(60);
  });

  it("defaults to 60 when empty string", () => {
    expect(parseRateLimit("")).toBe(60);
  });

  it("parses a valid number", () => {
    expect(parseRateLimit("120")).toBe(120);
  });

  it("defaults to 60 when NaN", () => {
    expect(parseRateLimit("abc")).toBe(60);
  });

  it("defaults to 60 when less than 1", () => {
    expect(parseRateLimit("0")).toBe(60);
    expect(parseRateLimit("-5")).toBe(60);
  });

  it("parses edge value of 1", () => {
    expect(parseRateLimit("1")).toBe(1);
  });
});
