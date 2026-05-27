import React, { useCallback, useEffect, useRef, useState } from "react";
import { Separator, Button } from "@heroui/react";
import { listFeeds, addFeed, deleteFeed } from "../api";
import { Layout } from "../Layout";
import { Spinner } from "@heroui/react";
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

  return (
    <Layout>
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_60%_40%_at_20%_10%,color-mix(in_oklch,var(--accent)_6%,transparent),transparent)]"
      />

      {/* Header */}
      <div className="mb-10">
        <h1 className="font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-foreground">
          {headlineText()}
        </h1>
        {feeds.length > 0 && !loading && (
          <p className="mt-2 font-display text-[0.9375rem] leading-relaxed text-muted/70">
            Each one shapes what gets surfaced to you.
          </p>
        )}
      </div>

      {error && (
        <p className="mb-8 text-sm text-danger">
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
                  <Separator className="my-4" />
                )}
                <p className="font-display text-base leading-[1.75] text-muted">
                  You follow{" "}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline underline-offset-3 decoration-accent/45"
                  >
                    {label ?? hostname}
                  </a>
                  {label && (
                    <span className="font-mono text-[0.7rem] ml-1 text-muted/55">
                      ({hostname})
                    </span>
                  )}
                  .{" "}
                  {isDeleting ? (
                    <Spinner />
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => void handleDelete(url)}
                      className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0 text-muted font-display"
                    >
                      Stop following it.
                    </Button>
                  )}
                </p>
              </React.Fragment>
            );
          })}

          {/* Add feed */}
          <Separator className="mt-8" />

          {addingInline ? (
            <p className="mt-6 font-display text-base leading-[1.75] text-muted">
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
                className="font-mono text-[0.875rem] text-foreground bg-transparent border-none border-b border-border outline-none w-[26ch] p-0.5"
              />
              {" — "}
              <Button
                variant="ghost"
                size="sm"
                onPress={() => void handleAdd()}
                isDisabled={adding || !newUrl.trim()}
                className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0 text-muted font-display"
              >
                {adding ? "adding…" : "add it"}
              </Button>
              {" "}or{" "}
              <Button
                variant="ghost"
                size="sm"
                onPress={() => { setAddingInline(false); setNewUrl(""); setAddError(null); }}
                className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0 text-muted font-display"
              >
                never mind
              </Button>
              .
              {addError && (
                <span className="ml-2 font-mono text-sm text-danger">
                  {addError}
                </span>
              )}
            </p>
          ) : (
            <p className="mt-6 font-display text-base leading-[1.75] text-muted">
              {feeds.length === 0
                ? <>Nothing here yet. <Button variant="ghost" size="sm" onPress={() => setAddingInline(true)} className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0 text-muted font-display">Add your first source.</Button></>
                : <Button variant="ghost" size="sm" onPress={() => setAddingInline(true)} className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0 text-muted font-display">Add another source.</Button>
              }
            </p>
          )}
        </div>
      )}
    </Layout>
  );
}
