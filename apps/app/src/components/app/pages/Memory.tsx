import React, { useCallback, useEffect, useState } from "react";
import { Separator } from "@heroui/react/separator";
import { Alert } from "@heroui/react/alert";
import { Skeleton } from "@heroui/react/skeleton";
import { getMemory, deleteMemoryEntry, type MemoryBuckets } from "../api";
import { Layout } from "../Layout";
import { useWorkspace } from "../WorkspaceContext";
import { Eyebrow, InlineAction, PageEmptyState } from "../primitives";

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
  "voiceExamples", "styleRules", "audienceInsights", "doNotSay",
  "successfulPosts", "campaignContext", "sourcePreferences",
  "visualStyle", "voiceProfile",
];

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
  }, [activeWsId, load]);

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
    ? BUCKET_KEYS.reduce((sum, k) => sum + (memory[k]?.length ?? 0), 0) : 0;

  const activeBuckets = memory
    ? BUCKET_KEYS.filter((k) => (memory[k]?.length ?? 0) > 0) : [];

  function headlineText(): string {
    if (loading && !memory) return "Loading memory\u2026";
    if (totalEntries === 0) return "Memory is empty.";
    if (totalEntries === 1) return "One note in memory.";
    return `${totalEntries} notes in memory.`;
  }

  return (
    <Layout>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_60%_40%_at_20%_10%,color-mix(in_oklch,var(--accent)_6%,transparent),transparent)]" />

      <div className="mb-10">
        <Eyebrow>Context</Eyebrow>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
          {headlineText()}
        </h1>
        {!loading && totalEntries > 0 && (
          <p className="mt-2 text-xs text-muted">
            {activeBuckets.map((k) => BUCKET_LABELS[k]).join(" \u00b7 ")}
          </p>
        )}
      </div>

      {error && (
        <Alert status="danger" className="mb-8">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {loading && !memory ? (
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24 rounded-lg" />
            <Skeleton className="h-5 w-full rounded" />
            <Skeleton className="h-5 w-3/4 rounded" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24 rounded-lg" />
            <Skeleton className="h-5 w-2/3 rounded" />
          </div>
        </div>
      ) : totalEntries === 0 ? (
        <PageEmptyState message="Ask me to remember things about your voice, audience, or style and they'll appear here." />
      ) : (
        <div>
          {activeBuckets.map((bucket, bucketIdx) => {
            const entries = memory![bucket] ?? [];
            return (
              <div key={bucket}>
                {bucketIdx > 0 && <Separator variant="tertiary" className="my-4" />}
                <div className="mb-4 text-xs tracking-wider uppercase text-accent/80">
                  {BUCKET_LABELS[bucket]}
                </div>
                <div className="flex flex-col gap-4">
                  {entries.map((entry, i) => {
                    const key = `${bucket}:${i}`;
                    const isDeleting = deletingKey === key;
                    return (
                      <div key={i} className="flex items-start gap-4">
                        <p className="flex-1 leading-relaxed text-sm text-foreground">
                          {entry}
                        </p>
                        {isDeleting ? (
                          <Skeleton className="h-4 w-10 rounded" />
                        ) : (
                          <InlineAction onClick={() => void handleDelete(bucket, i)}>
                            forget
                          </InlineAction>
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
