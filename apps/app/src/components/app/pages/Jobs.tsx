import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listJobs, type GenerationJobInfo } from "../api";
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

function statusColor(status: GenerationJobInfo["status"]): string {
  if (status === "done") return "var(--success)";
  if (status === "failed") return "var(--danger)";
  if (status === "running") return "var(--accent)";
  return "var(--muted)";
}

export function Jobs() {
  const { activeWsId } = useWorkspace();
  const [jobs, setJobs] = useState<GenerationJobInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const load = useCallback(async (wsId?: string, modality?: "image" | "audio" | "video") => {
    setError(null);
    setLoading(true);
    try {
      setJobs(await listJobs(wsId, modality));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(activeWsId, filter === "all" ? undefined : filter);
  }, [activeWsId, filter, load]);

  const hasPending = useRef(false);
  hasPending.current = jobs.some((job) => job.status === "queued" || job.status === "running");

  useEffect(() => {
    if (!hasPending.current) return;
    const timer = window.setInterval(() => {
      void load(activeWsId, filter === "all" ? undefined : filter);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeWsId, filter, load]);

  const title = useMemo(() => {
    if (loading && jobs.length === 0) return "Loading jobs…";
    if (jobs.length === 0) return "No generation jobs yet.";
    if (jobs.length === 1) return "One generation job.";
    return `${jobs.length} generation jobs.`;
  }, [jobs.length, loading]);

  return (
    <Layout>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ background: `radial-gradient(ellipse 60% 40% at 20% 10%, color-mix(in oklch, var(--accent) 6%, transparent), transparent)` }} />

      <div className="mb-10">
        <div className="mb-3 font-mono text-[0.68rem] tracking-[0.14em] uppercase" style={{ color: "var(--accent)" }}>
          <span className="inline-block mr-2 w-4 h-px opacity-60" style={{ background: "var(--accent)", verticalAlign: "middle" }} />
          Generation
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

      {loading && jobs.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : jobs.length === 0 ? (
        <p className="text-base leading-relaxed" style={{ fontFamily: "var(--font-display, serif)", color: "var(--muted)" }}>
          Generated images, audio clips, and videos will appear here once you start a job.
        </p>
      ) : (
        <div>
          {jobs.map((job, idx) => (
            <div key={job.id}>
              {idx > 0 && <div className="my-6 h-px" style={{ background: "linear-gradient(to right, var(--border), transparent)" }} />}
              <p style={{ fontFamily: "var(--font-display, serif)", fontSize: "1rem", color: "var(--foreground)" }}>
                <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{job.modality}</span>
                {" "}
                <span className="font-mono text-xs" style={{ color: statusColor(job.status) }}>{job.status}</span>
              </p>
              <p className="mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>{job.prompt}</p>
              <p className="mt-2 font-mono text-[0.75rem]" style={{ color: "var(--muted)" }}>
                {formatDate(job.createdAt)}
                {job.provider ? ` · ${job.provider}` : ""}
                {job.outputRef ? " · output ready" : ""}
              </p>
              {job.error && <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{job.error}</p>}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}