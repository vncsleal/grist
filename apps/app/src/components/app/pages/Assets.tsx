import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { listAssets, type AssetInfo } from "../api";
import { Layout } from "../Layout";
import { Spinner } from "@heroui/react";
import { useWorkspace } from "../WorkspaceContext";

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
    if (loading && assets.length === 0) return "Loading assets…";
    if (assets.length === 0) return "No generated assets yet.";
    if (assets.length === 1) return "One generated asset.";
    return `${assets.length} generated assets.`;
  }, [assets.length, loading]);

  return (
    <Layout>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-accent/[0.06] to-transparent" />

      <div className="mb-10">
        <div className="mb-3 font-mono text-[0.68rem] tracking-[0.14em] uppercase text-accent">
          <span className="inline-block w-4 h-px bg-accent/60 mr-2 align-middle" />
          Library
        </div>
        <h1 className="text-3xl font-bold leading-tight font-display tracking-tight text-foreground">
          {title}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Button
              key={item}
              variant={item === filter ? "primary" : "ghost"}
              size="sm"
              className="rounded-full"
              onPress={() => setFilter(item)}
            >
              {item}
            </Button>
          ))}
        </div>
      </div>

      {error && <p className="mb-8 text-sm text-danger">{error}</p>}

      {loading && assets.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : assets.length === 0 ? (
        <p className="text-base leading-relaxed font-display text-muted">
          Finished assets will appear here once jobs complete.
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {assets.map((asset) => (
            <div key={asset.id} className="rounded-2xl border border-border bg-surface p-4">
              <p className="font-display text-base font-semibold text-foreground capitalize">
                {asset.modality}
              </p>
              <p className="mt-1 font-mono text-[0.75rem] text-muted">
                {formatDate(asset.createdAt)}
                {asset.provider ? ` · ${asset.provider}` : ""}
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
                <a href={asset.assetUrl} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-3 decoration-foreground/45">
                  Open
                </a>
                <a href={asset.assetUrl} download className="text-muted underline underline-offset-3 decoration-muted/45">
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
