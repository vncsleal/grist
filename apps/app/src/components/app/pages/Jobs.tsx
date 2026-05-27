import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Separator } from "@heroui/react";
import { listJobs, type GenerationJobInfo } from "../api";
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
    if (loading && jobs.length === 0) return "Loading jobs…";
    if (jobs.length === 0) return "No generation jobs yet.";
    if (jobs.length === 1) return "One generation job.";
    return `${jobs.length} generation jobs.`;
  }, [jobs.length, loading]);

  return (
    <Layout>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-accent/[0.06] to-transparent" />

      <div className="mb-10">
        <div className="mb-3 font-mono text-[0.68rem] tracking-[0.14em] uppercase text-accent">
          <span className="inline-block w-4 h-px bg-accent/60 mr-2 align-middle" />
          Generation
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

      {loading && jobs.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : jobs.length === 0 ? (
        <p className="text-base leading-relaxed font-display text-muted">
          Generated images, audio clips, and videos will appear here once you start a job.
        </p>
      ) : (
        <div>
          {jobs.map((job, idx) => (
            <div key={job.id}>
              {idx > 0 && <Separator className="my-6" />}
              <p className="font-display text-base text-foreground">
                <span className="capitalize font-semibold">{job.modality}</span>
                {" "}
                <span className={`font-mono text-xs ${statusColor(job.status)}`}>{job.status}</span>
              </p>
              <p className="mt-1 leading-relaxed text-muted">{job.prompt}</p>
              <p className="mt-2 font-mono text-[0.75rem] text-muted">
                {formatDate(job.createdAt)}
                {job.provider ? ` · ${job.provider}` : ""}
                {job.outputRef ? " · output ready" : ""}
              </p>
              {job.error && <p className="mt-2 text-sm text-danger">{job.error}</p>}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
