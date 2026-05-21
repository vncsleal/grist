import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  createConnectorApiKey,
  getConnection,
  getResolvedApiBaseUrl,
  listConnectorApiKeys,
  revokeConnectorApiKey,
  type ConnectorApiKey,
} from "../api";
import { Layout, Card, Button, Spinner, EmptyState, ErrorBanner, Alert } from "../Layout";
import { TextField, Label, Input } from "@heroui/react";

function formatDate(iso?: string | null): string {
  if (!iso) return "No expiry";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function buildConnectorUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/mcp`;
}

export function Connectors() {
  const [keys, setKeys] = useState<ConnectorApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("claude-connector");
  const [rateLimitMax, setRateLimitMax] = useState("60");
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => getResolvedApiBaseUrl(), []);
  const connectorUrl = useMemo(() => buildConnectorUrl(apiBaseUrl), [apiBaseUrl]);
  const isSelfHosted = Boolean(getConnection());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listConnectorApiKeys();
      setKeys(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    setFreshKey(null);
    try {
      const limit = rateLimitMax.trim() ? Number(rateLimitMax) : undefined;
      const result = await createConnectorApiKey(
        newKeyName.trim() || "quillby-connector",
        Number.isFinite(limit) ? limit : undefined,
      );
      setFreshKey(result.key);
      setKeys((prev) => [result.meta, ...prev]);
      setNewKeyName("quillby-connector");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    setRevokingId(keyId);
    setError(null);
    try {
      await revokeConnectorApiKey(keyId);
      setKeys((prev) => prev.filter((key) => key.id !== keyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <Layout>
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2.5 font-mono text-[0.68rem] tracking-[0.14em] uppercase text-(--accent)">
            <span className="inline-block w-4 h-px bg-(--accent) opacity-60 shrink-0" />
            Remote access
          </div>
          <h1
            className="text-3xl font-bold text-(--foreground)"
            style={{ fontFamily: "var(--font-display, serif)", letterSpacing: "-0.025em" }}
          >
            Connectors
          </h1>
        </div>
        <Button variant="ghost" onPress={() => void load()} isDisabled={loading} size="sm" className="mt-1">
          {loading ? <Spinner /> : "Refresh"}
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Create key card */}
        <Card className="flex flex-col gap-5">
          <div>
            <div className="flex items-center gap-2 mb-2 font-mono text-[0.68rem] tracking-[0.14em] uppercase text-(--accent)">
              <span className="inline-block w-4 h-px bg-(--accent) opacity-60 shrink-0" />
              Remote MCP access
            </div>
            <h2
              className="text-xl font-bold text-(--foreground) mb-2"
              style={{ fontFamily: "var(--font-display, serif)", letterSpacing: "-0.02em" }}
            >
              Generate connector keys for Claude and other clients
            </h2>
            <p className="mt-2 text-sm leading-7 text-(--muted-foreground)">
              Browser sessions are used for this dashboard. Remote MCP clients still authenticate with Bearer API keys against your Quillby HTTP endpoint.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField value={newKeyName} onChange={setNewKeyName} className="w-full">
              <Label>Key label</Label>
              <Input placeholder="claude-connector" />
            </TextField>
            <TextField value={rateLimitMax} onChange={setRateLimitMax} className="w-full">
              <Label>Requests per minute</Label>
              <Input inputMode="numeric" />
            </TextField>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onPress={() => void handleCreate()} isDisabled={creating}>
              {creating ? <Spinner /> : "Create API key"}
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                navigator.clipboard.writeText(connectorUrl).catch(() => {});
              }}
            >
              Copy MCP URL
            </Button>
          </div>

          {freshKey && (
            <Alert status="success">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>New API key generated</Alert.Title>
                <Alert.Description>
                  Copy it now — Quillby only shows the full token once.
                </Alert.Description>
              </Alert.Content>
              <div className="mt-3 flex flex-col gap-3">
                <code
                  className="block overflow-x-auto rounded-xl px-4 py-3 text-xs bg-(--background) text-(--foreground) font-mono"
                >
                  {freshKey}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    navigator.clipboard.writeText(freshKey).catch(() => {});
                  }}
                >
                  Copy key
                </Button>
              </div>
            </Alert>
          )}
        </Card>

        {/* Setup card */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-2 font-mono text-[0.68rem] tracking-[0.14em] uppercase text-(--accent)">
            <span className="inline-block w-4 h-px bg-(--accent) opacity-60 shrink-0" />
            Setup
          </div>
          <h2
            className="text-xl font-bold text-(--foreground)"
            style={{ fontFamily: "var(--font-display, serif)", letterSpacing: "-0.02em" }}
          >
            Connector details
          </h2>

          <div className="grid gap-3">
            <ConnectorField label="Mode" value={isSelfHosted ? "Self-hosted endpoint" : "Quillby Cloud endpoint"} />
            <ConnectorField label="Connector URL" value={connectorUrl} />
            <ConnectorField label="Authentication" value="Bearer token" />
          </div>

          <Card variant="secondary" className="p-4">
            <div className="text-sm font-semibold text-(--foreground) mb-3">Claude.ai custom connector</div>
            <ol className="grid gap-2 text-sm text-(--muted-foreground)">
              <li>1. Open Claude settings and add a custom connector.</li>
              <li>2. Use the connector URL shown here.</li>
              <li>3. Choose Bearer token authentication.</li>
              <li>4. Paste the new API key.</li>
            </ol>
          </Card>

          <Card variant="secondary" className="p-4">
            <div className="text-sm font-semibold text-(--foreground) mb-2">Other MCP clients</div>
            <p className="text-sm leading-7 text-(--muted-foreground)">
              Use the same URL and token in ChatGPT connectors or any MCP client that supports remote HTTP transport with Bearer authentication.
            </p>
          </Card>
        </Card>
      </div>

      {/* Keys list */}
      <div className="mt-10">
        <div className="flex items-center gap-2 mb-5 font-mono text-[0.68rem] tracking-[0.14em] uppercase text-(--accent)">
          <span className="inline-block w-4 h-px bg-(--accent) opacity-60 shrink-0" />
          Active keys
        </div>

        {loading && keys.length === 0 ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : keys.length === 0 ? (
          <EmptyState
            title="No connector keys yet"
            body="Create a key above to connect Claude, ChatGPT, or another remote MCP client."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {keys.map((key) => (
              <Card key={key.id} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-(--foreground)">{key.name}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-(--muted-foreground)">
                    <span className="font-mono">{[key.prefix, key.start].filter(Boolean).join("_") || key.id}</span>
                    {typeof key.rateLimitMax === "number" && (
                      <span>{key.rateLimitMax} req/min</span>
                    )}
                    <span>Created {formatDate(key.createdAt)}</span>
                    <span>{formatDate(key.expiresAt)}</span>
                  </div>
                </div>
                <Button
                  variant="danger"
                  onPress={() => void handleRevoke(key.id)}
                  isDisabled={revokingId === key.id}
                  size="sm"
                >
                  {revokingId === key.id ? <Spinner /> : "Revoke"}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function ConnectorField({ label, value }: { label: string; value: string }) {
  return (
    <TextField isReadOnly value={value} className="w-full">
      <Label>{label}</Label>
      <Input className="font-mono" />
    </TextField>
  );
}
