import React, { useEffect, useState, useCallback } from "react";
import { listCards, curateCard, type Card } from "../api";
import { Layout, Spinner } from "../Layout";
import { useWorkspace } from "../WorkspaceContext";

type CurationStatus = "all" | "pending" | "shortlisted" | "skipped";

const FILTERS: { label: string; value: CurationStatus }[] = [
  { label: "all", value: "all" },
  { label: "pending", value: "pending" },
  { label: "shortlisted", value: "shortlisted" },
  { label: "skipped", value: "skipped" },
];

export function Cards() {
  const { activeWsId } = useWorkspace();
  const [cards, setCards] = useState<Card[]>([]);
  const [filterStatus, setFilterStatus] = useState<CurationStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (wsId?: string, status?: CurationStatus) => {
    setError(null);
    setLoading(true);
    try {
      const fetched = await listCards(wsId, status ?? filterStatus);
      setCards(fetched);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    void load(activeWsId, filterStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, activeWsId]);

  async function curate(card: Card, action: "shortlisted" | "skipped") {
    setActioning(card.id);
    setError(null);
    try {
      await curateCard(card.id, action, activeWsId);
      setCards((prev) =>
        prev.map((c) => c.id === card.id ? { ...c, curationStatus: action } : c)
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActioning(null);
    }
  }

  const visibleCount = cards.length;
  const headlineText = () => {
    if (loading) return "Loading\u2026";
    if (visibleCount === 0) return filterStatus === "all" ? "Nothing here yet." : `No ${filterStatus} cards.`;
    if (filterStatus === "pending") return `${visibleCount} ${visibleCount === 1 ? "article" : "articles"} to read through.`;
    if (filterStatus === "shortlisted") return `${visibleCount} ${visibleCount === 1 ? "idea" : "ideas"} shortlisted.`;
    if (filterStatus === "skipped") return `${visibleCount} ${visibleCount === 1 ? "article" : "articles"} skipped.`;
    return `${visibleCount} ${visibleCount === 1 ? "card" : "cards"} in total.`;
  };

  return (
    <Layout>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div style={{ position: "absolute", top: "-10%", right: "0", width: "50vw", height: "50vw", borderRadius: "50%", background: "radial-gradient(circle, color-mix(in oklch, var(--accent) 8%, transparent) 0%, transparent 70%)", filter: "blur(50px)" }} />
      </div>

      {/* Header */}
      <div className="mb-12">
        <p className="font-mono text-[0.62rem] tracking-[0.22em] uppercase mb-5" style={{ color: "var(--accent)" }}>
          Reading queue
        </p>
        <h1
          className="text-4xl sm:text-5xl font-bold leading-[1.1] mb-6"
          style={{ fontFamily: "var(--font-display, serif)", letterSpacing: "-0.03em", color: "var(--foreground)" }}
        >
          {headlineText()}
        </h1>

        {/* Inline filter + workspace */}
        <p className="text-sm font-mono" style={{ color: "var(--muted)" }}>
          Show{" "}
          {FILTERS.map(({ label, value }, i, arr) => (
            <React.Fragment key={value}>
              <button
                type="button"
                onClick={() => setFilterStatus(value)}
                style={{
                  background: "none", border: "none", cursor: "pointer", font: "inherit", padding: 0,
                  color: filterStatus === value ? "var(--foreground)" : "var(--muted)",
                  fontWeight: filterStatus === value ? 600 : 400,
                  textDecoration: "underline",
                  textDecorationColor: filterStatus === value ? "color-mix(in oklch, var(--accent) 70%, transparent)" : "color-mix(in oklch, var(--accent) 30%, transparent)",
                  textUnderlineOffset: "3px",
                }}
              >
                {label}
              </button>
              {i < arr.length - 1 && <span> · </span>}
            </React.Fragment>
          ))}
        </p>
      </div>

      {error && (
        <p className="text-sm font-mono mb-8" style={{ color: "var(--danger)" }}>{error}</p>
      )}

      {loading && cards.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div>
          {cards.map((card, i) => {
            const status = card.curationStatus ?? "pending";
            const isExpanded = expandedId === card.id;
            const isActioning = actioning === card.id;
            const statusColor =
              status === "shortlisted" ? "var(--success)"
              : status === "skipped" ? "var(--danger)"
              : "var(--muted)";

            return (
              <div key={card.id}>
                {i > 0 && (
                  <div style={{ height: "1px", background: "linear-gradient(to right, var(--border), transparent 80%)", margin: "1.75rem 0" }} />
                )}
                <div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : card.id)}
                    className="text-left w-full hover:opacity-70 transition-opacity"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    <h2
                      className="text-lg sm:text-xl font-semibold leading-snug"
                      style={{ fontFamily: "var(--font-display, serif)", letterSpacing: "-0.015em", color: "var(--foreground)" }}
                    >
                      {card.title}
                    </h2>
                  </button>

                  <p
                    className="mt-3 text-base leading-relaxed"
                    style={{ fontFamily: "var(--font-display, serif)", letterSpacing: "-0.01em", color: "var(--muted)" }}
                  >
                    {(card.source || typeof card.score === "number") && (
                      <>
                        {card.source && <>This is from <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{card.source}</span></>}
                        {card.source && typeof card.score === "number" && <>, its score is <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{card.score.toFixed(1)}</span></>}
                        {!card.source && typeof card.score === "number" && <>Its score is <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{card.score.toFixed(1)}</span></>}
                        {". "}
                      </>
                    )}
                    {"This card is "}
                    <span style={{ color: statusColor, fontWeight: 600 }}>{status}</span>
                    {" — you can "}
                    {status !== "shortlisted" && (
                      <CurateLink onClick={() => void curate(card, "shortlisted")} disabled={isActioning}>shortlist it</CurateLink>
                    )}
                    {status !== "shortlisted" && status !== "skipped" && " or "}
                    {status !== "skipped" && (
                      <CurateLink onClick={() => void curate(card, "skipped")} disabled={isActioning}>skip it</CurateLink>
                    )}
                    {"."}
                  </p>

                  {isExpanded && (card.summary || card.url) && (
                    <div className="mt-4">
                      {card.summary && (
                        <p
                          className="text-base leading-relaxed"
                          style={{ fontFamily: "var(--font-display, serif)", letterSpacing: "-0.01em", color: "var(--muted)" }}
                        >
                          {card.summary}
                        </p>
                      )}
                      {card.url && (
                        <a
                          href={card.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono mt-3 block hover:opacity-60 transition-opacity"
                          style={{ color: "var(--accent)" }}
                        >
                          {card.url}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}

function CurateLink({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="hover:opacity-50 transition-opacity"
      style={{
        background: "none", border: "none", cursor: "pointer", font: "inherit",
        color: "var(--muted)", padding: 0,
        opacity: disabled ? 0.4 : undefined,
        textDecoration: "underline",
        textDecorationColor: "color-mix(in oklch, var(--accent) 40%, transparent)",
        textUnderlineOffset: "4px",
      }}
    >
      {children}
    </button>
  );
}
