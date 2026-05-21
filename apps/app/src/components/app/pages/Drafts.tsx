import React, { useEffect, useState, useCallback } from "react";
import { listDrafts, type Draft } from "../api";
import { Layout, Spinner } from "../Layout";
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

function DraftAction({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        font: "inherit",
        color: "var(--muted)",
        background: "none",
        border: "none",
        padding: 0,
        cursor: disabled ? "default" : "pointer",
        textDecorationLine: "underline",
        textDecorationColor: "color-mix(in oklch, var(--accent) 40%, transparent)",
        textUnderlineOffset: "3px",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
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
          Content
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

      </div>

      {error && (
        <p className="mb-8 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {loading && drafts.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : drafts.length === 0 ? (
        <p
          className="text-base leading-relaxed"
          style={{ fontFamily: "var(--font-display, serif)", color: "var(--muted)" }}
        >
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
                  <div
                    className="my-6 h-px"
                    style={{ background: "linear-gradient(to right, var(--border), transparent)" }}
                  />
                )}

                <button
                  onClick={() => setExpandedId(isExpanded ? null : draft.id)}
                  style={{
                    font: "inherit",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "block",
                    width: "100%",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-display, serif)",
                      fontSize: "1.0625rem",
                      fontWeight: "600",
                      letterSpacing: "-0.01em",
                      color: "var(--foreground)",
                    }}
                  >
                    {draft.title ?? `Draft ${draft.id.slice(0, 8)}…`}
                  </span>
                </button>

                <p
                  className="mt-1 leading-relaxed"
                  style={{
                    fontFamily: "var(--font-display, serif)",
                    fontSize: "0.9375rem",
                    color: "var(--muted)",
                  }}
                >
                  {formatLabel
                    ? <>This is a {formatLabel} draft{dateStr ? <>, written on {dateStr}</> : null}.</>
                    : <>A draft{dateStr ? <>, written on {dateStr}</> : null}.</>
                  }
                  {" "}
                  {isExpanded ? (
                    <>
                      You can{" "}
                      <DraftAction onClick={() => handleCopy(draft)}>
                        {copied === draft.id ? "copied!" : "copy it"}
                      </DraftAction>
                      {" "}or{" "}
                      <DraftAction onClick={() => setExpandedId(null)}>
                        collapse it
                      </DraftAction>.
                    </>
                  ) : (
                    <>You can <DraftAction onClick={() => setExpandedId(draft.id)}>open it</DraftAction>.</>
                  )}
                </p>

                {isExpanded && draft.content && (
                  <pre
                    className="mt-4 leading-relaxed whitespace-pre-wrap"
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "0.8125rem",
                      color: "var(--muted)",
                      borderLeft: "2px solid var(--border)",
                      paddingLeft: "1rem",
                    }}
                  >
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
