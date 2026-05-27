import React, { useEffect, useState, useCallback } from "react";
import { Separator, Button } from "@heroui/react";
import { listCards, curateCard, type Card } from "../api";
import { Layout } from "../Layout";
import { Spinner } from "@heroui/react";
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
        <div className="absolute -top-[10%] right-0 w-[50vw] h-[50vw] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--accent)_8%,transparent),transparent_70%)] blur-[50px]" />
      </div>

      {/* Header */}
      <div className="mb-12">
        <p className="font-mono text-[0.62rem] tracking-[0.22em] uppercase mb-5 text-accent">
          Reading queue
        </p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold leading-[1.1] mb-6 tracking-[-0.03em] text-foreground">
          {headlineText()}
        </h1>

        {/* Inline filter + workspace */}
        <p className="text-sm font-mono text-muted">
          Show{" "}
          {FILTERS.map(({ label, value }, i, arr) => (
            <React.Fragment key={value}>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setFilterStatus(value)}
                className={`font-mono underline underline-offset-3 h-auto min-w-0 p-0 ${
                  filterStatus === value
                    ? "text-foreground font-semibold decoration-accent/70"
                    : "text-muted font-normal decoration-accent/30"
                }`}
              >
                {label}
              </Button>
              {i < arr.length - 1 && <span> · </span>}
            </React.Fragment>
          ))}
        </p>
      </div>

      {error && (
        <p className="text-sm font-mono mb-8 text-danger">{error}</p>
      )}

      {loading && cards.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div>
          {cards.map((card, i) => {
            const status = card.curationStatus ?? "pending";
            const isExpanded = expandedId === card.id;
            const isActioning = actioning === card.id;

            return (
              <div key={card.id}>
                {i > 0 && (
                  <Separator className="my-7" />
                )}
                <div>
                  <Button
                    variant="ghost"
                    onPress={() => setExpandedId(isExpanded ? null : card.id)}
                    className="text-left w-full hover:opacity-70 transition-opacity p-0 h-auto min-w-0"
                  >
                    <h2 className="font-display text-lg sm:text-xl font-semibold leading-snug tracking-[-0.015em] text-foreground">
                      {card.title}
                    </h2>
                  </Button>

                  <p className="mt-3 font-display text-base leading-relaxed tracking-[-0.01em] text-muted">
                    {(card.source || typeof card.score === "number") && (
                      <>
                        {card.source && <>This is from <span className="text-foreground font-semibold">{card.source}</span></>}
                        {card.source && typeof card.score === "number" && <>, its score is <span className="text-foreground font-semibold">{card.score.toFixed(1)}</span></>}
                        {!card.source && typeof card.score === "number" && <>Its score is <span className="text-foreground font-semibold">{card.score.toFixed(1)}</span></>}
                        {". "}
                      </>
                    )}
                    {"This card is "}
                    <span className={`font-semibold ${
                      status === "shortlisted" ? "text-success"
                      : status === "skipped" ? "text-danger"
                      : "text-muted"
                    }`}>{status}</span>
                    {" — you can "}
                    {status !== "shortlisted" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => void curate(card, "shortlisted")}
                        isDisabled={isActioning}
                        className="underline underline-offset-[4px] decoration-accent/40 h-auto min-w-0 p-0 text-muted font-[inherit]"
                      >
                        shortlist it
                      </Button>
                    )}
                    {status !== "shortlisted" && status !== "skipped" && " or "}
                    {status !== "skipped" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => void curate(card, "skipped")}
                        isDisabled={isActioning}
                        className="underline underline-offset-[4px] decoration-accent/40 h-auto min-w-0 p-0 text-muted font-[inherit]"
                      >
                        skip it
                      </Button>
                    )}
                    {"."}
                  </p>

                  {isExpanded && (card.summary || card.url) && (
                    <div className="mt-4">
                      {card.summary && (
                        <p className="font-display text-base leading-relaxed tracking-[-0.01em] text-muted">
                          {card.summary}
                        </p>
                      )}
                      {card.url && (
                        <a
                          href={card.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs mt-3 block hover:opacity-60 transition-opacity text-accent"
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
