import React, { useCallback, useEffect, useMemo, useState } from "react";
import { listAssets, type AssetInfo } from "../api";
import { Layout, Spinner } from "../Layout";
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
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ background: `radial-gradient(ellipse 60% 40% at 20% 10%, color-mix(in oklch, var(--accent) 6%, transparent), transparent)` }} />

      <div className="mb-10">
        <div className="mb-3 font-mono text-[0.68rem] tracking-[0.14em] uppercase" style={{ color: "var(--accent)" }}>
          <span className="inline-block mr-2 w-4 h-px opacity-60" style={{ background: "var(--accent)", verticalAlign: "middle" }} />
          Library
        </div>
        <h1 className="text-3xl font-bold leading-tight" style={{ fontFamily: "var(--font-display, serif)", letterSpacing: "-0.025em", color: "var(--foreground)" }}>
          {title}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              style={{
                font: "inherit",
                background: item === filter ? "color-mix(in oklch, var(--accent) 12%, var(--surface))" : "var(--surface)",
                color: item === filter ? "var(--foreground)" : "var(--muted)",
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "0.3rem 0.7rem",
                cursor: "pointer",
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-8 text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

      {loading && assets.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : assets.length === 0 ? (
        <p className="text-base leading-relaxed" style={{ fontFamily: "var(--font-display, serif)", color: "var(--muted)" }}>
          Finished assets will appear here once jobs complete.
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {assets.map((asset) => (
            <div key={asset.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <p style={{ fontFamily: "var(--font-display, serif)", fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", textTransform: "capitalize" }}>
                {asset.modality}
              </p>
              <p className="mt-1 font-mono text-[0.75rem]" style={{ color: "var(--muted)" }}>
                {formatDate(asset.createdAt)}
                {asset.provider ? ` · ${asset.provider}` : ""}
              </p>
              <div className="mt-4">
                {asset.modality === "image" ? (
                  <img src={asset.assetUrl} alt="Generated asset" style={{ width: "100%", borderRadius: 12, objectFit: "cover" }} />
                ) : asset.modality === "audio" ? (
                  <audio controls src={asset.assetUrl} style={{ width: "100%" }} />
                ) : (
                  <video controls src={asset.assetUrl} style={{ width: "100%", borderRadius: 12 }} />
                )}
              </div>
              <div className="mt-3 flex gap-3">
                <a href={asset.assetUrl} target="_blank" rel="noreferrer" style={{ color: "var(--foreground)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
                  Open
                </a>
                <a href={asset.assetUrl} download style={{ color: "var(--muted)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
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