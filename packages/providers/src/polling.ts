export interface PollOptions<T> {
  pollUrl: string;
  headers: Record<string, string>;
  isComplete: (body: T) => boolean;
  extractResult: (body: T) => { outputRef: string; provider?: string };
  intervalMs?: number;
  maxPolls?: number;
  signal?: AbortSignal;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollForCompletion<T>(options: PollOptions<T>): Promise<{ outputRef: string; provider?: string }> {
  const { pollUrl, headers, isComplete, extractResult, intervalMs = 3000, maxPolls = 60, signal } = options;

  for (let attempt = 0; attempt < maxPolls; attempt++) {
    if (signal?.aborted) throw new Error("Polling aborted");

    const response = await fetch(pollUrl, { headers, signal });

    if (!response.ok) {
      if (response.status === 429) {
        await wait(intervalMs);
        continue;
      }
      throw new Error(`Poll request failed (${response.status}): ${await response.text().catch(() => "unknown")}`);
    }

    const body = await response.json();
    if (!body || typeof body !== "object") throw new Error("Invalid polling response");

    // ARD: Generic polling callback uses user-supplied typed check
    if (isComplete(body as T)) {
      // ARD: Generic polling callback uses user-supplied typed check
      return extractResult(body as T);
    }

    // ARD: Generic check response field access
    const b = body as Record<string, unknown>;
    const status = typeof b.status === "string" ? b.status.toLowerCase() : "";
    if (status === "failed" || status === "error") {
      throw new Error(`Poll returned status: ${status}${b.error ? `: ${b.error}` : ""}`);
    }

    await wait(intervalMs);
  }

  throw new Error(`Polling timed out after ${maxPolls * intervalMs}ms (${maxPolls} attempts)`);
}
