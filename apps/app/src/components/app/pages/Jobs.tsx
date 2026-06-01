import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Separator } from "@heroui/react/separator";
import { Alert } from "@heroui/react/alert";
import { Skeleton } from "@heroui/react/skeleton";
import { listJobs, type GenerationJobInfo } from "../api";
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

function statusColor(status: GenerationJobInfo["status"]): string {
  if (status === "done") return "text-success";
  if (status === "failed") return "text-danger";
  if (status === "running") return "text-accent";
  return "text-muted";
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
    if (loading && jobs.length === 0) return "Loading jobs\u2026";
    if (jobs.length === 0) return "No generation jobs yet.";
    if (jobs.length === 1) return "One generation job.";
    return `${jobs.length} generation jobs.`;
  }, [jobs.length, loading]);

  return (
    <Layout>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-accent/[0.06] to-transparent" />

      <div className="mb-10">
        <Eyebrow>Generation</Eyebrow>
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

      {loading && jobs.length === 0 ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-48 rounded-lg" />
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-3 w-32 rounded" />
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <PageEmptyState message="Generated images, audio clips, and videos will appear here once you start a job." />
      ) : (
        <div>
          {jobs.map((job, idx) => (
            <div key={job.id}>
              {idx > 0 && <Separator variant="tertiary" className="my-6" />}
              <p className="text-base text-foreground">
                <span className="capitalize font-semibold">{job.modality}</span>
                {" "}
                <span className={`text-xs ${statusColor(job.status)}`}>{job.status}</span>
              </p>
              <p className="mt-1 leading-relaxed text-muted">{job.prompt}</p>
              <p className="mt-2 text-xs text-muted">
                {formatDate(job.createdAt)}
                {job.provider ? ` \u00b7 ${job.provider}` : ""}
                {job.outputRef ? " \u00b7 output ready" : ""}
              </p>
              {job.error && <p className="mt-2 text-sm text-danger">{job.error}</p>}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
