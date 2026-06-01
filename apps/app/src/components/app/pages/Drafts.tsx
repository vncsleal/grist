import React, { useEffect, useState, useCallback } from "react";
import { Separator, Button, Alert, Skeleton } from "@heroui/react";
import { listDrafts, type Draft } from "../api";
import { Layout } from "../Layout";
import { useWorkspace } from "../WorkspaceContext";
import { Eyebrow, InlineAction, PageEmptyState } from "../primitives";

const FORMAT_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "Twitter / X",
  threads: "Threads",
  instagram: "Instagram",
  newsletter: "Newsletter",
  blog: "Blog",
};

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function Drafts() {
  const { activeWsId } = useWorkspace();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (wsId?: string) => {
    setError(null);
    setLoading(true);
    try {
      const fetched = await listDrafts(wsId);
      setDrafts(fetched);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(activeWsId);
  }, [activeWsId, load]);

  function headlineText(): string {
    if (loading && drafts.length === 0) return "Loading drafts\u2026";
    if (drafts.length === 0) return "Nothing written yet.";
    if (drafts.length === 1) return "One draft still brewing.";
    return `${drafts.length} drafts still brewing.`;
  }

  function handleCopy(draft: Draft) {
    navigator.clipboard.writeText(draft.content ?? "").catch(() => {});
    setCopied(draft.id);
    setTimeout(() => setCopied(null), 1800);
  }

  return (
    <Layout>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_60%_40%_at_20%_10%,color-mix(in_oklch,var(--accent)_6%,transparent),transparent)]" />

      <div className="mb-10">
        <Eyebrow>Content</Eyebrow>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
          {headlineText()}
        </h1>
      </div>

      {error && (
        <Alert status="danger" className="mb-8">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {loading && drafts.length === 0 ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-3/4 rounded-lg" />
              <Skeleton className="h-4 w-1/2 rounded" />
            </div>
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <PageEmptyState message="Ask me to generate a post from a card and it will appear here." />
      ) : (
        <div>
          {drafts.map((draft, idx) => {
            const isExpanded = expandedId === draft.id;
            const formatLabel = draft.format ? (FORMAT_LABELS[draft.format] ?? draft.format) : null;
            const dateStr = formatDate(draft.createdAt);

            return (
              <div key={draft.id}>
                {idx > 0 && <Separator variant="tertiary" className="my-6" />}

                <Button
                  variant="ghost"
                  onPress={() => setExpandedId(isExpanded ? null : draft.id)}
                  className="text-left w-full p-0 h-auto min-w-0"
                >
                  <span className="text-base font-semibold tracking-tight text-foreground">
                    {draft.title ?? `Draft ${draft.id.slice(0, 8)}\u2026`}
                  </span>
                </Button>

                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {formatLabel
                    ? <>This is a {formatLabel} draft{dateStr ? <>, written on {dateStr}</> : null}.</>
                    : <>A draft{dateStr ? <>, written on {dateStr}</> : null}.</>
                  }
                  {" "}
                  {isExpanded ? (
                    <>
                      You can{" "}
                      <InlineAction onClick={() => handleCopy(draft)}>
                        {copied === draft.id ? "copied!" : "copy it"}
                      </InlineAction>
                      {" "}or{" "}
                      <InlineAction onClick={() => setExpandedId(null)}>
                        collapse it
                      </InlineAction>.
                    </>
                  ) : (
                    <>You can <InlineAction onClick={() => setExpandedId(draft.id)}>open it</InlineAction>.</>
                  )}
                </p>

                {isExpanded && draft.content && (
                  <pre className="mt-4 text-xs leading-relaxed whitespace-pre-wrap text-muted border-l-2 border-border pl-4">
                    {draft.content}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
