import React, { useEffect, useState, useCallback } from "react";
import { Separator, Button } from "@heroui/react";
import { listDrafts, type Draft } from "../api";
import { Layout } from "../Layout";
import { Spinner } from "@heroui/react";
import { useWorkspace } from "../WorkspaceContext";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWsId]);

  function headlineText(): string {
    if (loading && drafts.length === 0) return "Loading drafts…";
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
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_60%_40%_at_20%_10%,color-mix(in_oklch,var(--accent)_6%,transparent),transparent)]"
      />

      {/* Header */}
      <div className="mb-10">
        <div className="mb-3 font-mono text-[0.68rem] tracking-[0.14em] uppercase text-accent">
          <span className="inline-block mr-2 w-4 h-px bg-accent opacity-60 align-middle" />
          Content
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-foreground">
          {headlineText()}
        </h1>
      </div>

      {error && (
        <p className="mb-8 text-sm text-danger">
          {error}
        </p>
      )}

      {loading && drafts.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : drafts.length === 0 ? (
        <p className="font-display text-base leading-relaxed text-muted">
          Ask me to generate a post from a card and it will appear here.
        </p>
      ) : (
        <div>
          {drafts.map((draft, idx) => {
            const isExpanded = expandedId === draft.id;
            const formatLabel = draft.format ? (FORMAT_LABELS[draft.format] ?? draft.format) : null;
            const dateStr = formatDate(draft.createdAt);

            return (
              <div key={draft.id}>
                {idx > 0 && (
                  <Separator className="my-6" />
                )}

                <Button
                  variant="ghost"
                  onPress={() => setExpandedId(isExpanded ? null : draft.id)}
                  className="text-left w-full p-0 h-auto min-w-0"
                >
                  <span className="font-display text-[1.0625rem] font-semibold tracking-[-0.01em] text-foreground">
                    {draft.title ?? `Draft ${draft.id.slice(0, 8)}…`}
                  </span>
                </Button>

                <p className="mt-1 font-display text-[0.9375rem] leading-relaxed text-muted">
                  {formatLabel
                    ? <>This is a {formatLabel} draft{dateStr ? <>, written on {dateStr}</> : null}.</>
                    : <>A draft{dateStr ? <>, written on {dateStr}</> : null}.</>
                  }
                  {" "}
                  {isExpanded ? (
                    <>
                      You can{" "}
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => handleCopy(draft)}
                        isDisabled={copied === draft.id}
                        className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0 text-muted font-display"
                      >
                        {copied === draft.id ? "copied!" : "copy it"}
                      </Button>
                      {" "}or{" "}
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => setExpandedId(null)}
                        className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0 text-muted font-display"
                      >
                        collapse it
                      </Button>.
                    </>
                  ) : (
                    <>You can <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => setExpandedId(draft.id)}
                      className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0 text-muted font-display"
                    >open it</Button>.</>
                  )}
                </p>

                {isExpanded && draft.content && (
                  <pre className="mt-4 font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap text-muted border-l-2 border-border pl-4">
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
