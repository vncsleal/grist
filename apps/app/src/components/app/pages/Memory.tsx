import React, { useCallback, useEffect, useState } from "react";
import { getMemory, deleteMemoryEntry, type MemoryBuckets } from "../api";
import { Layout, Spinner } from "../Layout";
import { useWorkspace } from "../WorkspaceContext";

const BUCKET_LABELS: Record<keyof MemoryBuckets, string> = {
  voiceExamples: "Voice",
  styleRules: "Style",
  audienceInsights: "Audience",
  doNotSay: "Avoid",
  successfulPosts: "What worked",
  campaignContext: "Campaigns",
  sourcePreferences: "Sources",
  visualStyle: "Visual style",
  voiceProfile: "Voice profile",
};

const BUCKET_KEYS: (keyof MemoryBuckets)[] = [
  "voiceExamples",
  "styleRules",
  "audienceInsights",
  "doNotSay",
  "successfulPosts",
  "campaignContext",
  "sourcePreferences",
  "visualStyle",
  "voiceProfile",
];

function MemoryDeleteAction({
  onClick,
  disabled,
}: {
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="forget this"
      style={{
        font: "inherit",
        fontSize: "0.75rem",
        fontFamily: "var(--font-mono, monospace)",
        color: "var(--muted)",
        background: "none",
        border: "none",
        padding: 0,
        cursor: disabled ? "default" : "pointer",
        textDecorationLine: "underline",
        textDecorationColor: "color-mix(in oklch, var(--danger) 35%, transparent)",
        textUnderlineOffset: "3px",
        opacity: disabled ? 0.4 : 0.7,
        flexShrink: 0,
      }}
    >
      forget
    </button>
  );
}

export function Memory() {
  const { activeWsId } = useWorkspace();
  const [memory, setMemory] = useState<MemoryBuckets | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (wsId?: string) => {
    setError(null);
    setLoading(true);
    try {
      const mem = await getMemory(wsId);
      setMemory(mem);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(activeWsId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWsId]);

  async function handleDelete(bucket: keyof MemoryBuckets, index: number) {
    const key = `${bucket}:${index}`;
    setDeletingKey(key);
    setError(null);
    try {
      const updated = await deleteMemoryEntry(bucket, index, activeWsId);
      setMemory(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingKey(null);
    }
  }

  const totalEntries = memory
    ? BUCKET_KEYS.reduce((sum, k) => sum + (memory[k]?.length ?? 0), 0)
    : 0;

  const activeBuckets = memory
    ? BUCKET_KEYS.filter((k) => (memory[k]?.length ?? 0) > 0)
    : [];

  function headlineText(): string {
    if (loading && !memory) return "Loading memory…";
    if (totalEntries === 0) return "Memory is empty.";
    if (totalEntries === 1) return "One note in memory.";
    return `${totalEntries} notes in memory.`;
  }

  return (
    <Layout>
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: `radial-gradient(ellipse 60% 40% at 20% 10%, color-mix(in oklch, var(--accent) 6%, transparent), transparent)`,
        }}
      />

      {/* Header */}
      <div className="mb-10">
        <div
          className="mb-3 font-mono text-[0.68rem] tracking-[0.14em] uppercase"
          style={{ color: "var(--accent)" }}
        >
          <span
            className="inline-block mr-2 w-4 h-px opacity-60"
            style={{ background: "var(--accent)", verticalAlign: "middle" }}
          />
          Context
        </div>
        <h1
          className="text-3xl font-bold leading-tight"
          style={{
            fontFamily: "var(--font-display, serif)",
            letterSpacing: "-0.025em",
            color: "var(--foreground)",
          }}
        >
          {headlineText()}
        </h1>
        {!loading && totalEntries > 0 && (
          <p
            className="mt-2 font-mono text-[0.72rem]"
            style={{ color: "var(--muted)" }}
          >
            {activeBuckets.map((k) => BUCKET_LABELS[k]).join(" · ")}
          </p>
        )}
      </div>

      {error && (
        <p className="mb-8 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {loading && !memory ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : totalEntries === 0 ? (
        <p
          className="text-base leading-relaxed"
          style={{ fontFamily: "var(--font-display, serif)", color: "var(--muted)" }}
        >
          Ask me to remember things about your voice, audience, or style and they'll appear here.
        </p>
      ) : (
        <div>
          {activeBuckets.map((bucket, bucketIdx) => {
            const entries = memory![bucket] ?? [];

            return (
              <div key={bucket}>
                {bucketIdx > 0 && (
                  <div
                    className="my-8 h-px"
                    style={{ background: "linear-gradient(to right, var(--border), transparent)" }}
                  />
                )}

                {/* Bucket heading */}
                <div
                  className="mb-4 font-mono text-[0.68rem] tracking-[0.12em] uppercase"
                  style={{ color: "var(--accent)", opacity: 0.8 }}
                >
                  {BUCKET_LABELS[bucket]}
                </div>

                {/* Entries */}
                <div className="flex flex-col gap-4">
                  {entries.map((entry, i) => {
                    const key = `${bucket}:${i}`;
                    const isDeleting = deletingKey === key;

                    return (
                      <div key={i} className="flex items-start gap-4">
                        <p
                          className="flex-1 leading-relaxed"
                          style={{
                            fontFamily: "var(--font-display, serif)",
                            fontSize: "0.9375rem",
                            color: "var(--foreground)",
                          }}
                        >
                          {entry}
                        </p>
                        {isDeleting ? (
                          <Spinner />
                        ) : (
                          <MemoryDeleteAction
                            onClick={() => void handleDelete(bucket, i)}
                            disabled={loading}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
