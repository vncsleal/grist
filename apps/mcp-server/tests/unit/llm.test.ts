import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../../src/llm.js";

describe("mapWithConcurrency", () => {
  it("processes all items and preserves order", async () => {
    const result = await mapWithConcurrency(
      [1, 2, 3],
      async (n) => n * 2,
      2,
    );
    expect(result).toEqual([2, 4, 6]);
  });

  it("handles empty array", async () => {
    const result = await mapWithConcurrency([], async (n: number) => n, 2);
    expect(result).toEqual([]);
  });

  it("respects concurrency limit (runs in batches)", async () => {
    let running = 0;
    let maxRunning = 0;
    const result = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      async (n) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 10));
        running--;
        return n;
      },
      2,
    );
    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles concurrency larger than item count", async () => {
    const result = await mapWithConcurrency(
      [1, 2],
      async (n) => n * 2,
      10,
    );
    expect(result).toEqual([2, 4]);
  });

  it("passes index to the worker function", async () => {
    const indices: number[] = [];
    await mapWithConcurrency([10, 20, 30], async (_item, index) => {
      indices.push(index);
    }, 2);
    expect(indices).toEqual([0, 1, 2]);
  });

  it("re-throws errors from the worker", async () => {
    await expect(
      mapWithConcurrency(
        [1, 2, 3],
        async () => { throw new Error("worker error"); },
        2,
      ),
    ).rejects.toThrow("worker error");
  });
});
