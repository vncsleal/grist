import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Skeleton } from "@heroui/react";
import { listAssets, type AssetInfo } from "../api";
import { Layout } from "../Layout";
import { useWorkspace } from "../WorkspaceContext";
import { Eyebrow, PageEmptyState } from "../primitives";

const FILTERS = ["all", "image", "audio", "video"] as const;

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function Assets() {
  const { activeWsId } = useWorkspace();
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const load = useCallback(async (wsId?: string, modality?: "image" | "audio" | "video") => {
    setError(null);
    setLoading(true);
    try {
      setAssets(await listAssets(wsId, modality));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(activeWsId, filter === "all" ? undefined : filter);
  }, [activeWsId, filter, load]);

  const title = useMemo(() => {
    if (loading && assets.length === 0) return "Loading assets\u2026";
    if (assets.length === 0) return "No generated assets yet.";
    if (assets.length === 1) return "One generated asset.";
    return `${assets.length} generated assets.`;
  }, [assets.length, loading]);

  return (
    <Layout>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-accent/[0.06] to-transparent" />

      <div className="mb-10">
        <Eyebrow>Library</Eyebrow>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                item === filter
                  ? "bg-accent text-white border-accent"
                  : "bg-transparent text-muted border-border hover:border-accent/50"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Alert status="danger" className="mb-8">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {loading && assets.length === 0 ? (
        <div className="grid gap-5 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-surface p-4 space-y-3">
              <Skeleton className="h-5 w-24 rounded-lg" />
              <Skeleton className="h-3 w-32 rounded" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : assets.length === 0 ? (
        <PageEmptyState message="Finished assets will appear here once jobs complete." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {assets.map((asset) => (
            <div key={asset.id} className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-base font-semibold text-foreground capitalize">
                {asset.modality}
              </p>
              <p className="mt-1 text-xs text-muted">
                {formatDate(asset.createdAt)}
                {asset.provider ? ` \u00b7 ${asset.provider}` : ""}
              </p>
              <div className="mt-4">
                {asset.modality === "image" ? (
                  <img src={asset.assetUrl} alt="Generated asset" className="w-full rounded-xl object-cover" />
                ) : asset.modality === "audio" ? (
                  <audio controls src={asset.assetUrl} className="w-full" />
                ) : (
                  <video controls src={asset.assetUrl} className="w-full rounded-xl" />
                )}
              </div>
              <div className="mt-3 flex gap-3">
                <a href={asset.assetUrl} target="_blank" rel="noreferrer" className="text-sm text-foreground underline underline-offset-2 decoration-foreground/45">
                  Open
                </a>
                <a href={asset.assetUrl} download className="text-sm text-muted underline underline-offset-2 decoration-muted/45">
                  Download
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
