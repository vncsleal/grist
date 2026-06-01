import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { listWorkspaces, selectWorkspace, type Workspace } from "../api";
import { Layout, EmptyState, ErrorBanner } from "../Layout";
import { Card } from "@heroui/react/card";
import { Button } from "@heroui/react/button";
import { Alert } from "@heroui/react/alert";
import { Chip } from "@heroui/react/chip";
import { Skeleton } from "@heroui/react/skeleton";
import { Eyebrow } from "../primitives";

export function Workspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [isNewAccount] = useState(() => {
    try {
      const flag = sessionStorage.getItem("quillby_new_account");
      if (flag) sessionStorage.removeItem("quillby_new_account");
      return flag === "1";
    } catch {
      return false;
    }
  });

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const ws = await listWorkspaces();
      setWorkspaces(ws);
      const active = ws.find((w) => w.isActive);
      if (active) setActiveId(active.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSelect(ws: Workspace) {
    setSelecting(ws.id);
    try {
      await selectWorkspace(ws.id);
      setActiveId(ws.id);
      setWorkspaces((prev) => prev.map((w) => ({ ...w, isActive: w.id === ws.id })));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSelecting(null);
    }
  }

  const activeWs = workspaces.find((w) => w.id === activeId);

  return (
    <Layout activeWorkspace={activeWs?.name}>
      <div className="flex items-start justify-between mb-8">
        <div>
          <Eyebrow>Workspaces</Eyebrow>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Workspaces
          </h1>
        </div>
        <Button variant="ghost" onPress={load} isDisabled={loading} size="sm" className="mt-1">
          {loading ? "Loading\u2026" : "Refresh"}
        </Button>
      </div>

      {isNewAccount && !loading && workspaces.length === 0 && (
        <Alert status="accent" className="mb-6">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Welcome to Quillby!</Alert.Title>
            <Alert.Description>
              You&apos;re in. <Link to="/onboarding" className="text-accent no-underline hover:underline font-semibold">Complete your setup</Link>{" "}
              to tell Quillby about your voice, topics, and first content source — or create your
              first workspace by opening Claude with the Quillby connector attached and asking:{" "}
              <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-surface-secondary">
                Create a workspace called My Brand
              </code>
              <br />
              <br />
              Then come back here to browse and manage your workspaces — or head to{" "}
              <Link to="/connectors" className="text-accent no-underline hover:underline">
                Connectors
              </Link>{" "}
              to generate your first API key.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {error && <ErrorBanner message={error} />}

      {loading && workspaces.length === 0 ? (
        <div className="flex justify-center py-16"><Skeleton className="h-8 w-64 rounded-lg" /></div>
      ) : workspaces.length === 0 ? (
        <EmptyState
          title="No workspaces yet"
          body='Create a workspace by asking Claude: "Create a workspace called…"'
        />
      ) : (
        <div className="flex flex-col gap-3">
          {workspaces.map((ws) => {
            const isActive = ws.id === activeId;
            return (
              <Card key={ws.id} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm font-mono select-none ${
                      isActive
                        ? "bg-accent/18 text-accent border border-accent/30"
                        : "bg-foreground/6 text-muted border border-border"
                    }`}
                  >
                    {ws.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate text-foreground tracking-tight">
                      {ws.name}
                    </p>
                    <p className="text-xs font-mono truncate mt-0.5 text-muted opacity-50">{ws.id}</p>
                  </div>
                </div>

                <div className="shrink-0">
                  {isActive ? (
                    <Chip color="accent" size="sm">Active</Chip>
                  ) : (
                    <Button
                      variant="secondary"
                      onPress={() => handleSelect(ws)}
                      isDisabled={selecting === ws.id}
                      size="sm"
                    >
                      {selecting === ws.id ? "Selecting\u2026" : "Select"}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
