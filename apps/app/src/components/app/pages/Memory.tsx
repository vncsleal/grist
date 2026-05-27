import React, { useCallback, useEffect, useState } from "react";
import { Button, Separator } from "@heroui/react";
import { getMemory, deleteMemoryEntry, type MemoryBuckets } from "../api";
import { Layout } from "../Layout";
import { Spinner } from "@heroui/react";
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
    <Button
      variant="ghost"
      size="sm"
      className="underline underline-offset-3 decoration-danger/35 text-muted/70 h-auto min-w-0 p-0"
      isDisabled={disabled}
      onPress={onClick}
      aria-label="forget this"
    >
      forget
    </Button>
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
        <div className="mb-3 font-mono text-[0.68rem] tracking-[0.14em] uppercase text-accent">
          <span className="inline-block w-4 h-px bg-accent/60 mr-2 align-middle" />
          Context
        </div>
        <h1 className="text-3xl font-bold leading-tight font-display tracking-tighter text-foreground">
          {headlineText()}
        </h1>
        {!loading && totalEntries > 0 && (
          <p className="mt-2 font-mono text-[0.72rem] text-muted">
            {activeBuckets.map((k) => BUCKET_LABELS[k]).join(" · ")}
          </p>
        )}
      </div>

      {error && (
        <p className="mb-8 text-sm text-danger">
          {error}
        </p>
      )}

      {loading && !memory ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : totalEntries === 0 ? (
        <p className="text-base leading-relaxed font-display text-muted">
          Ask me to remember things about your voice, audience, or style and they'll appear here.
        </p>
      ) : (
        <div>
          {activeBuckets.map((bucket, bucketIdx) => {
            const entries = memory![bucket] ?? [];

            return (
              <div key={bucket}>
                {bucketIdx > 0 && <Separator className="my-4" />}

                {/* Bucket heading */}
                <div className="mb-4 font-mono text-[0.68rem] tracking-[0.12em] uppercase text-accent/80">
                  {BUCKET_LABELS[bucket]}
                </div>

                {/* Entries */}
                <div className="flex flex-col gap-4">
                  {entries.map((entry, i) => {
                    const key = `${bucket}:${i}`;
                    const isDeleting = deletingKey === key;

                    return (
                      <div key={i} className="flex items-start gap-4">
                        <p className="flex-1 leading-relaxed font-display text-[0.9375rem] text-foreground">
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
