import React, { useCallback, useEffect, useRef, useState } from "react";
import { Separator, Alert, Skeleton, TextField, Input, FieldError } from "@heroui/react";
import { listFeeds, addFeed, deleteFeed } from "../api";
import { Layout } from "../Layout";
import { useWorkspace } from "../WorkspaceContext";
import { InlineAction, PageEmptyState } from "../primitives";

function getFeedLabel(url: string): string | null {
  try {
    const u = new URL(url);
    const q = u.searchParams.get("q");
    if (q) return decodeURIComponent(q);
    const path = decodeURIComponent(u.pathname)
      .replace(/^\/+/, "").replace(/\.(xml|rss|atom|json)$/i, "").replace(/\//g, " · ").trim();
    if (path && path.toLowerCase() !== u.hostname.toLowerCase()) return path;
    return null;
  } catch { return null; }
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
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(activeWsId); }, [activeWsId, load]);

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
      } else { setAddError((err as Error).message); }
    } finally { setAdding(false); }
  }

  async function handleDelete(url: string) {
    setDeletingUrl(url);
    setError(null);
    try {
      const updated = await deleteFeed(url, activeWsId);
      setFeeds(updated);
    } catch (err) { setError((err as Error).message); }
    finally { setDeletingUrl(null); }
  }

  function headlineText(): string {
    if (loading && feeds.length === 0) return "Loading sources\u2026";
    if (feeds.length === 0) return "No sources yet.";
    if (feeds.length === 1) return "You're drawing from one source.";
    return `You're drawing from ${feeds.length} sources.`;
  }

  return (
    <Layout>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_60%_40%_at_20%_10%,color-mix(in_oklch,var(--accent)_6%,transparent),transparent)]" />

      <div className="mb-10">
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
          {headlineText()}
        </h1>
        {feeds.length > 0 && !loading && (
          <p className="mt-2 text-sm leading-relaxed text-muted/70">
            Each one shapes what gets surfaced to you.
          </p>
        )}
      </div>

      {error && (
        <Alert status="danger" className="mb-8">
          <Alert.Indicator />
          <Alert.Content><Alert.Description>{error}</Alert.Description></Alert.Content>
        </Alert>
      )}

      {loading && feeds.length === 0 ? (
        <div className="space-y-4 max-w-2xl">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col max-w-2xl">
          {feeds.map((url, i) => {
            let hostname = url;
            try { hostname = new URL(url).hostname; } catch { /* keep */ }
            const label = getFeedLabel(url);

            return (
              <React.Fragment key={url}>
                {i > 0 && <Separator variant="tertiary" className="my-4" />}
                <p className="text-sm leading-relaxed text-muted">
                  You follow{" "}
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="text-foreground underline underline-offset-2 decoration-accent/45"
                  >
                    {label ?? hostname}
                  </a>
                  {label && <span className="text-xs ml-1 text-muted/55">({hostname})</span>}
                  .{" "}
                  <InlineAction onClick={() => void handleDelete(url)}>
                    Stop following it.
                  </InlineAction>
                </p>
              </React.Fragment>
            );
          })}

          <Separator variant="tertiary" className="mt-8" />

          {addingInline ? (
            <div className="mt-6 space-y-3">
              <TextField
                isInvalid={!!addError}
                className="max-w-sm"
              >
                <Input
                  ref={inputRef}
                  value={newUrl}
                  onChange={(e) => { setNewUrl(e.target.value); setAddError(null); }}
                  placeholder="https://example.com/feed.xml"
                  onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); if (e.key === "Escape") { setAddingInline(false); setNewUrl(""); setAddError(null); } }}
                />
                {addError && <FieldError>{addError}</FieldError>}
              </TextField>
              <div className="flex gap-2 items-center">
                <InlineAction onClick={() => void handleAdd()}>
                  {adding ? "adding\u2026" : "add it"}
                </InlineAction>
                <span className="text-muted">or</span>
                <InlineAction onClick={() => { setAddingInline(false); setNewUrl(""); setAddError(null); }}>
                  never mind
                </InlineAction>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm leading-relaxed text-muted">
              {feeds.length === 0 ? (
                <>Nothing here yet. <InlineAction onClick={() => setAddingInline(true)}>Add your first source.</InlineAction></>
              ) : (
                <InlineAction onClick={() => setAddingInline(true)}>Add another source.</InlineAction>
              )}
            </p>
          )}
        </div>
      )}
    </Layout>
  );
}
