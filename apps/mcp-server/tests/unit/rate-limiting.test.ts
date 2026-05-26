import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { parseRateLimit } from "@quillby/auth";

function getConcurrencyLimits(overrides?: {
  image?: string;
  audio?: string;
  video?: string;
}) {
  return {
    image: parseInt(overrides?.image ?? "5", 10),
    audio: parseInt(overrides?.audio ?? "3", 10),
    video: parseInt(overrides?.video ?? "2", 10),
  };
}

describe("concurrency limit defaults", () => {
  it("defaults image concurrency to 5", () => {
    const limits = getConcurrencyLimits();
    expect(limits.image).toBe(5);
  });

  it("defaults audio concurrency to 3", () => {
    const limits = getConcurrencyLimits();
    expect(limits.audio).toBe(3);
  });

  it("defaults video concurrency to 2", () => {
    const limits = getConcurrencyLimits();
    expect(limits.video).toBe(2);
  });
});

describe("concurrency limit env var overrides", () => {
  let previousImage: string | undefined;
  let previousAudio: string | undefined;
  let previousVideo: string | undefined;

  beforeEach(() => {
    previousImage = process.env.QUILLBY_MAX_CONCURRENT_IMAGE;
    previousAudio = process.env.QUILLBY_MAX_CONCURRENT_AUDIO;
    previousVideo = process.env.QUILLBY_MAX_CONCURRENT_VIDEO;
  });

  afterEach(() => {
    if (previousImage !== undefined) {
      process.env.QUILLBY_MAX_CONCURRENT_IMAGE = previousImage;
    } else {
      delete process.env.QUILLBY_MAX_CONCURRENT_IMAGE;
    }
    if (previousAudio !== undefined) {
      process.env.QUILLBY_MAX_CONCURRENT_AUDIO = previousAudio;
    } else {
      delete process.env.QUILLBY_MAX_CONCURRENT_AUDIO;
    }
    if (previousVideo !== undefined) {
      process.env.QUILLBY_MAX_CONCURRENT_VIDEO = previousVideo;
    } else {
      delete process.env.QUILLBY_MAX_CONCURRENT_VIDEO;
    }
  });

  it("QUILLBY_MAX_CONCURRENT_IMAGE overrides image default", () => {
    const limits = getConcurrencyLimits({ image: "10" });
    expect(limits.image).toBe(10);
  });

  it("QUILLBY_MAX_CONCURRENT_AUDIO overrides audio default", () => {
    const limits = getConcurrencyLimits({ audio: "8" });
    expect(limits.audio).toBe(8);
  });

  it("QUILLBY_MAX_CONCURRENT_VIDEO overrides video default", () => {
    const limits = getConcurrencyLimits({ video: "4" });
    expect(limits.video).toBe(4);
  });

  it("handles partial overrides keeping other defaults", () => {
    const limits = getConcurrencyLimits({ image: "1" });
    expect(limits.image).toBe(1);
    expect(limits.audio).toBe(3);
    expect(limits.video).toBe(2);
  });
});

describe("parseRateLimit", () => {
  it("defaults to 60 when no env var is set", () => {
    expect(parseRateLimit(undefined)).toBe(60);
  });

  it("defaults to 60 when env var is empty string", () => {
    expect(parseRateLimit("")).toBe(60);
  });

  it("reads and parses a valid env var", () => {
    expect(parseRateLimit("120")).toBe(120);
  });

  it("defaults to 60 when env var is NaN", () => {
    expect(parseRateLimit("not-a-number")).toBe(60);
  });

  it("defaults to 60 when env var is less than 1", () => {
    expect(parseRateLimit("0")).toBe(60);
    expect(parseRateLimit("-5")).toBe(60);
  });
});
