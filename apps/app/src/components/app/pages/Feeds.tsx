import React, { useCallback, useEffect, useRef, useState } from "react";
import { listFeeds, addFeed, deleteFeed } from "../api";
import { Layout, Spinner } from "../Layout";
import { useWorkspace } from "../WorkspaceContext";

/** Extract a human-readable topic label from a feed URL.
 *  - Google News: decodes the `q` query param
 *  - RSS hubs (Feedly, etc.): strips known wrapper paths
 *  - Generic: returns the cleaned URL path segments
 *  Returns null when nothing meaningful can be found.
 */
function getFeedLabel(url: string): string | null {
  try {
    const u = new URL(url);

    // Google News RSS / Atom — topic is in `q`
    const q = u.searchParams.get("q");
    if (q) return decodeURIComponent(q);

    // Path-based feeds — strip leading slash, decode, drop file extensions
    const path = decodeURIComponent(u.pathname)
      .replace(/^\/+/, "")
      .replace(/\.(xml|rss|atom|json)$/i, "")
      .replace(/\//g, " · ")
      .trim();

    // Only return path label if it's meaningfully different from the hostname
    if (path && path.toLowerCase() !== u.hostname.toLowerCase()) return path;

    return null;
  } catch {
    return null;
  }
}

function FeedAction({
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

export function Feeds() {
  const { activeWsId } = useWorkspace();
  const [feeds, setFeeds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addingInline, setAddingInline] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (wsId?: string) => {
    setError(null);
    setLoading(true);
    try {
      const urls = await listFeeds(wsId);
      setFeeds(urls);
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

  async function handleAdd() {
    const url = newUrl.trim();
    if (!url) return;
    setAddError(null);
    setAdding(true);
    try {
      new URL(url);
      const updated = await addFeed(url, activeWsId);
      setFeeds(updated);
      setNewUrl("");
      setAddingInline(false);
    } catch (err) {
      if (err instanceof TypeError && err.message.includes("Invalid URL")) {
        setAddError("That doesn't look like a valid URL.");
      } else {
        setAddError((err as Error).message);
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(url: string) {
    setDeletingUrl(url);
    setError(null);
    try {
      const updated = await deleteFeed(url, activeWsId);
      setFeeds(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingUrl(null);
    }
  }

  function headlineText(): string {
    if (loading && feeds.length === 0) return "Loading sources…";
    if (feeds.length === 0) return "No sources yet.";
    if (feeds.length === 1) return "You're drawing from one source.";
    return `You're drawing from ${feeds.length} sources.`;
  }

  const proseStyle: React.CSSProperties = {
    fontFamily: "var(--font-display, serif)",
    fontSize: "1rem",
    lineHeight: "1.75",
    color: "var(--muted)",
  };

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
        {feeds.length > 0 && !loading && (
          <p className="mt-2" style={{ ...proseStyle, opacity: 0.7, fontSize: "0.9375rem" }}>
            Each one shapes what gets surfaced to you.
          </p>
        )}
      </div>

      {error && (
        <p className="mb-8 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {loading && feeds.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="flex flex-col max-w-2xl">
          {/* Feed list */}
          {feeds.map((url, i) => {
            let hostname = url;
            try { hostname = new URL(url).hostname; } catch { /* keep raw */ }
            const label = getFeedLabel(url);
            const isDeleting = deletingUrl === url;

            return (
              <React.Fragment key={url}>
                {i > 0 && (
                  <div
                    className="my-4 h-px"
                    style={{ background: "linear-gradient(to right, var(--border), transparent)" }}
                  />
                )}
                <p style={proseStyle}>
                  You follow{" "}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--foreground)",
                      textDecorationLine: "underline",
                      textDecorationColor: "color-mix(in oklch, var(--accent) 45%, transparent)",
                      textUnderlineOffset: "3px",
                    }}
                  >
                    {label ?? hostname}
                  </a>
                  {label && (
                    <span
                      className="font-mono text-[0.7rem] ml-1"
                      style={{ color: "var(--muted)", opacity: 0.55 }}
                    >
                      ({hostname})
                    </span>
                  )}
                  .{" "}
                  {isDeleting ? (
                    <Spinner />
                  ) : (
                    <FeedAction onClick={() => void handleDelete(url)}>
                      Stop following it.
                    </FeedAction>
                  )}
                </p>
              </React.Fragment>
            );
          })}

          {/* Add feed */}
          <div
            className="mt-8 h-px"
            style={{ background: "linear-gradient(to right, var(--border), transparent)" }}
          />

          {addingInline ? (
            <p className="mt-6" style={proseStyle}>
              Start following{" "}
              <input
                ref={inputRef}
                value={newUrl}
                onChange={(e) => { setNewUrl(e.target.value); setAddError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd();
                  if (e.key === "Escape") { setAddingInline(false); setNewUrl(""); setAddError(null); }
                }}
                placeholder="https://example.com/feed.xml"
                data-1p-ignore
                autoFocus
                style={{
                  font: "inherit",
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "0.875rem",
                  color: "var(--foreground)",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  outline: "none",
                  width: "26ch",
                  padding: "0 2px",
                }}
              />
              {" — "}
              <FeedAction onClick={() => void handleAdd()} disabled={adding || !newUrl.trim()}>
                {adding ? "adding…" : "add it"}
              </FeedAction>
              {" "}or{" "}
              <FeedAction onClick={() => { setAddingInline(false); setNewUrl(""); setAddError(null); }}>
                never mind
              </FeedAction>
              .
              {addError && (
                <span
                  className="ml-2 text-sm"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--danger)" }}
                >
                  {addError}
                </span>
              )}
            </p>
          ) : (
            <p className="mt-6" style={proseStyle}>
              {feeds.length === 0
                ? <>Nothing here yet. <FeedAction onClick={() => setAddingInline(true)}>Add your first source.</FeedAction></>
                : <FeedAction onClick={() => setAddingInline(true)}>Add another source.</FeedAction>
              }
            </p>
          )}
        </div>
      )}
    </Layout>
  );
}
