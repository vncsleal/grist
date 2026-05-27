import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  TextField,
  Input,
  Label,
  Button,
  Separator,
  Select,
  ListBox,
} from "@heroui/react";
import {
  useSession,
  updateUser,
  changePassword,
  deleteAccount,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  type ActiveSession,
} from "../auth";
import { Layout } from "../Layout";
import { Spinner } from "@heroui/react";
import {
  getConnection,
  getPlan,
  getProviderPolicy,
  getProviderConfig,
  saveProviderConfig as saveProviderConfigApi,
  clearProviderConfig as clearProviderConfigApi,
  getResolvedApiBaseUrl,
  type PlanInfo,
  type ProviderConfigInfo,
  type ProviderPolicyInfo,
  createConnectorApiKey,
  listConnectorApiKeys,
  revokeConnectorApiKey,
  type ConnectorApiKey,
} from "../api";
import { useTheme } from "../useTheme";

const DEPLOY_MODE = (import.meta.env.VITE_QUILLBY_DEPLOYMENT_MODE ?? "").trim().toLowerCase();

// ─── Appearance ───────────────────────────────────────────────────────────────

function AppearanceSection() {
  const [theme, setTheme] = useTheme();
  const isDark = theme === "dark";

  return (
    <section>
      <p className="text-muted">
        The interface is in{" "}
        <span className="text-foreground font-medium">{isDark ? "dark" : "light"}</span>{" "}
        mode.{" "}
        <Button
          variant="ghost"
          size="sm"
          className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
          onPress={() => setTheme(isDark ? "light" : "dark")}
        >
          Switch to {isDark ? "light" : "dark"}.
        </Button>
      </p>
    </section>
  );
}

// ─── Profile (display name) ───────────────────────────────────────────────────

function ProfileSection() {
  const session = useSession();
  const user = session.data?.user;
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  async function handleSave() {
    if (!name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await updateUser(name.trim());
      await session.refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      <p className="text-muted">
        You&rsquo;re signed in as{" "}
        <span className="text-foreground font-mono text-sm">{user?.email ?? "\u2014"}</span>.
      </p>
      <TextField name="name" value={name} onChange={setName}>
        <Label>Display name</Label>
        <Input
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSave();
          }}
        />
      </TextField>
      {saving ? (
        <span className="text-xs font-mono opacity-60">saving&hellip;</span>
      ) : saved ? (
        <span className="text-xs font-mono text-success">saved.</span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
          isDisabled={!name.trim()}
          onPress={() => void handleSave()}
        >
          Save.
        </Button>
      )}
    </section>
  );
}

// ─── Password ─────────────────────────────────────────────────────────────────

function SecuritySection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (next !== confirm) { setError("New passwords don't match."); return; }
    if (next.length < 8) { setError("Must be at least 8 characters."); return; }
    setSaving(true);
    try {
      await changePassword(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      setSaved(true);
      setOpen(false);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <p className="text-muted">
        {saved ? (
          <span className="text-xs font-mono text-success">Password updated.</span>
        ) : open ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
            onPress={() => setOpen(true)}
          >
            Change your password.
          </Button>
        )}
      </p>
      {open && (
        <div className="flex flex-col gap-2">
          {error && <p className="text-xs text-danger font-mono">{error}</p>}
          <TextField type="password" name="current" value={current} onChange={setCurrent}>
            <Label>Current password</Label>
            <Input
              type="password"
              autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); if (e.key === "Escape") setOpen(false); }}
            />
          </TextField>
          <TextField type="password" name="new" value={next} onChange={setNext}>
            <Label>New password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); if (e.key === "Escape") setOpen(false); }}
            />
          </TextField>
          <TextField type="password" name="confirm" value={confirm} onChange={setConfirm}>
            <Label>Confirm</Label>
            <Input
              type="password"
              autoComplete="new-password"
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); if (e.key === "Escape") setOpen(false); }}
            />
          </TextField>
          <p className="text-muted">
            {saving ? (
              <span className="text-xs font-mono opacity-60">saving&hellip;</span>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                  isDisabled={!current || !next || !confirm}
                  onPress={() => void handleSubmit()}
                >
                  Update password.
                </Button>
                {" "}
                <Button
                  variant="ghost"
                  size="sm"
                  className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                  onPress={() => { setOpen(false); setError(null); setCurrent(""); setNext(""); setConfirm(""); }}
                >
                  Cancel.
                </Button>
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

function formatSessionDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function SessionsSection() {
  const session = useSession();
  const currentSessionId = session.data?.session.id;
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setSessions(await listSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      await revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setRevoking(null);
    }
  }

  async function handleRevokeOthers() {
    setRevokingAll(true);
    try {
      await revokeOtherSessions();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign out");
    } finally {
      setRevokingAll(false);
    }
  }

  const otherSessions = sessions.filter((s) => s.id !== currentSessionId);

  return (
    <section className="flex flex-col gap-3">
      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : sessions.length === 0 ? (
        <p className="text-muted opacity-60">No active sessions found.</p>
      ) : (
        <>
          {sessions.map((s, i) => {
            const isCurrent = s.id === currentSessionId;
            return (
              <React.Fragment key={s.id}>
                {i > 0 && <Separator />}
                <p className="text-muted">
                  <span className="text-foreground">
                    {s.userAgent ? s.userAgent.slice(0, 55) : "Unknown browser"}
                  </span>
                  {isCurrent && (
                    <span className="text-accent font-mono text-xs ml-2">
                      this session
                    </span>
                  )}
                  <br />
                  <span className="font-mono text-xs opacity-60">
                    {s.ipAddress ? `${s.ipAddress} \u00b7 ` : ""}
                    {formatSessionDate(s.createdAt)}
                  </span>
                  {!isCurrent && (
                    <>
                      {" \u2014 "}
                      {revoking === s.id ? (
                        <Spinner />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                          onPress={() => void handleRevoke(s.id)}
                        >
                          End session.
                        </Button>
                      )}
                    </>
                  )}
                </p>
              </React.Fragment>
            );
          })}
          {otherSessions.length > 1 && (
            <p className="text-muted">
              {revokingAll ? (
                <span className="text-xs font-mono opacity-60">signing out&hellip;</span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                  onPress={() => void handleRevokeOthers()}
                >
                  End all other sessions.
                </Button>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

function PlanSection() {
  const [info, setInfo] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlan()
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load plan"))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && info && info.mode !== "cloud") return null;

  const apiBase = getResolvedApiBaseUrl();

  return (
    <section>
      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : info ? (
        <p className="text-muted">
          You&rsquo;re on the{" "}
          <span className="text-foreground font-semibold">
            {info.plan === "pro" ? "Pro" : "Free"}
          </span>{" "}
          plan.
          {info.planEnforcementEnabled && info.limits && (
            <span className="opacity-70">
              {" "}
              {[
                info.limits.maxOwnedWorkspaces != null && `${info.limits.maxOwnedWorkspaces} workspaces`,
                info.limits.maxDraftsPerWorkspace != null && `${info.limits.maxDraftsPerWorkspace} drafts per workspace`,
              ].filter(Boolean).join(", ")}.
            </span>
          )}
          {info.plan === "free" && (
            <>
              {" "}
              <Button
                variant="ghost"
                size="sm"
                className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                onPress={() => { window.open(`${apiBase}/api/billing/upgrade`, "_blank", "noopener"); }}
              >
                Upgrade to Pro.
              </Button>
            </>
          )}
          {info.billingPortalUrl && (
            <>
              {" "}
              <Button
                variant="ghost"
                size="sm"
                className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                onPress={() => { window.open(`${apiBase}/api/billing/portal`, "_blank", "noopener"); }}
              >
                Manage billing.
              </Button>
            </>
          )}
        </p>
      ) : null}
    </section>
  );
}

// ─── Provider setup info ──────────────────────────────────────────────────────

function ProviderSetupSection() {
  const [info, setInfo] = useState<ProviderPolicyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProviderPolicy()
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load provider setup"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-4"><Spinner /></div>;
  }

  if (error) {
    return <p className="text-xs text-danger font-mono">{error}</p>;
  }

  if (!info) return null;

  const modeCopy =
    info.deploymentMode === "cloud"
      ? "Cloud keeps providers fully managed. End users never need provider accounts or API keys."
      : info.deploymentMode === "self-hosted"
        ? "Self-hosted deployments use admin-managed providers. End users should not manage provider keys themselves."
        : "Local mode is bring-your-own-AI: use a host client when available, or add provider env vars on this machine for unsupported modalities.";

  return (
    <section className="flex flex-col gap-3">
      <p className="text-muted">{modeCopy}</p>
      <div className="flex flex-col gap-3">
        {info.capabilities.map((capability, index) => (
          <React.Fragment key={capability.modality}>
            {index > 0 && <Separator />}
            <p className="text-muted">
              <span className="text-foreground capitalize">{capability.modality}</span>
              {" "}
              <span className="font-mono text-xs opacity-70">
                {capability.available ? `${capability.tier ?? "unavailable"} active` : `preferred: ${capability.setupMode}`}
              </span>
              <br />
              <span className="opacity-80">{capability.message}</span>
            </p>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

// ─── Provider admin (self-hosted) ─────────────────────────────────────────────

function ProviderAdminSection() {
  const [config, setConfig] = useState<ProviderConfigInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageProvider, setImageProvider] = useState("replicate");
  const [imageKey, setImageKey] = useState("");
  const [audioProvider, setAudioProvider] = useState("replicate");
  const [audioKey, setAudioKey] = useState("");
  const [audioVoiceId, setAudioVoiceId] = useState("");
  const [audioGroupId, setAudioGroupId] = useState("");
  const [videoProvider, setVideoProvider] = useState("replicate");
  const [videoKey, setVideoKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConfig(await getProviderConfig());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load provider config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(modality: "image" | "audio" | "video") {
    setSaving(modality);
    setError(null);
    try {
      const next = await saveProviderConfigApi(
        modality === "image"
          ? { modality, provider: imageProvider, apiKey: imageKey }
          : modality === "audio"
            ? { modality, provider: audioProvider, apiKey: audioKey, voiceId: audioVoiceId || undefined, groupId: audioGroupId || undefined }
            : { modality, provider: videoProvider, apiKey: videoKey }
      );
      setConfig(next);
      if (modality === "image") setImageKey("");
      if (modality === "audio") setAudioKey("");
      if (modality === "video") setVideoKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save provider");
    } finally {
      setSaving(null);
    }
  }

  async function handleClear(modality: "image" | "audio" | "video") {
    setSaving(`${modality}-clear`);
    setError(null);
    try {
      setConfig(await clearProviderConfigApi(modality));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear provider");
    } finally {
      setSaving(null);
    }
  }

  if (DEPLOY_MODE !== "self-hosted") return null;

  function ProviderSelect({
    value,
    onChange,
    providers,
    label,
  }: {
    value: string;
    onChange: (v: string) => void;
    providers: readonly (readonly [string, string])[];
    label: string;
  }) {
    return (
      <Select
        selectedKey={value}
        onSelectionChange={(key) => {
          if (typeof key === "string") onChange(key);
        }}
        className="w-auto min-w-44"
      >
        <Label>{label}</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {providers.map(([val, itemLabel]) => (
              <ListBox.Item key={val} id={val}>
                {itemLabel}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : (
        <>
          <p className="text-muted">
            Configure one Replicate API token for this self-hosted deployment. Quillby uses it as the single external multimodal hub for image, audio, and video.
          </p>

          {([
            {
              modality: "image" as const,
              title: "Image provider",
              current: config?.config.image,
              provider: imageProvider,
              setProvider: setImageProvider,
              apiKey: imageKey,
              setApiKey: setImageKey,
              providers: [["replicate", "Replicate (recommended)"]] as const,
            },
            {
              modality: "audio" as const,
              title: "Audio provider",
              current: config?.config.audio,
              provider: audioProvider,
              setProvider: setAudioProvider,
              apiKey: audioKey,
              setApiKey: setAudioKey,
              providers: [["replicate", "Replicate (recommended)"]] as const,
            },
            {
              modality: "video" as const,
              title: "Video provider",
              current: config?.config.video,
              provider: videoProvider,
              setProvider: setVideoProvider,
              apiKey: videoKey,
              setApiKey: setVideoKey,
              providers: [["replicate", "Replicate (recommended)"]] as const,
            },
          ]).map((section, idx) => (
            <React.Fragment key={section.modality}>
              {idx > 0 && <Separator />}
              <div className="flex flex-col gap-2">
                <p className="text-muted">
                  <span className="text-foreground font-semibold">{section.title}</span>
                  {" "}
                  <span className="font-mono text-xs opacity-70">
                    {section.current?.configured ? `${section.current.provider} \u00b7 ${section.current.source}` : "not configured"}
                  </span>
                </p>
                <div className="flex flex-col gap-2">
                  <ProviderSelect
                    value={section.provider}
                    onChange={section.setProvider}
                    providers={section.providers}
                    label="Provider"
                  />
                  <TextField type="password" name={`${section.modality}-key`} value={section.apiKey} onChange={section.setApiKey}>
                    <Label>Key</Label>
                    <Input type="password" />
                  </TextField>
                  <div className="flex gap-2 items-center">
                    {saving === section.modality ? (
                      <span className="text-xs font-mono opacity-60">saving&hellip;</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                        isDisabled={!section.apiKey.trim()}
                        onPress={() => void handleSave(section.modality)}
                      >
                        Save.
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0 text-danger"
                      isDisabled={!section.current?.configured || saving === `${section.modality}-clear`}
                      onPress={() => void handleClear(section.modality)}
                    >
                      Clear.
                    </Button>
                  </div>
                </div>
                {section.modality === "audio" && section.provider !== "replicate" && (
                  <div className="flex flex-col gap-2">
                    <TextField name="voiceId" value={audioVoiceId} onChange={setAudioVoiceId}>
                      <Label>Voice ID</Label>
                      <Input />
                    </TextField>
                    <TextField name="groupId" value={audioGroupId} onChange={setAudioGroupId}>
                      <Label>Group ID</Label>
                      <Input />
                    </TextField>
                  </div>
                )}
              </div>
            </React.Fragment>
          ))}
        </>
      )}
    </section>
  );
}

// ─── Connectors ───────────────────────────────────────────────────────────────

function formatKeyDate(iso?: string | null): string {
  if (!iso) return "no expiry";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ConnectorsSection() {
  const [keys, setKeys] = useState<ConnectorApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("quillby-connector");
  const [rateLimitMax, setRateLimitMax] = useState("60");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const connectorUrl = useMemo(() => {
    const base = getResolvedApiBaseUrl().replace(/\/$/, "");
    return `${base}/mcp`;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await listConnectorApiKeys());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load keys");
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
        keyName.trim() || "quillby-connector",
        Number.isFinite(limit) ? limit : undefined,
      );
      setFreshKey(result.key);
      setKeys((prev) => [result.meta, ...prev]);
      setKeyName("quillby-connector");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    setError(null);
    try {
      await revokeConnectorApiKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      {error && <p className="text-xs text-danger font-mono">{error}</p>}

      <p className="text-muted">
        Remote MCP clients connect at{" "}
        <Button
          variant="ghost"
          size="sm"
          className="font-mono text-xs underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0 text-foreground"
          onPress={() => { navigator.clipboard.writeText(connectorUrl).catch(() => {}); setUrlCopied(true); setTimeout(() => setUrlCopied(false), 1800); }}
        >
          {connectorUrl}
        </Button>
        {urlCopied && <span className="font-mono text-xs text-success ml-1">copied.</span>}
      </p>

      <div className="flex flex-col gap-2">
        <TextField name="keyName" value={keyName} onChange={setKeyName}>
          <Label>Key label</Label>
          <Input
            placeholder="quillby-connector"
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
          />
        </TextField>
        <TextField name="rateLimit" value={rateLimitMax} onChange={setRateLimitMax} inputMode="numeric">
          <Label>Rate limit (requests per minute)</Label>
          <Input
            placeholder="60"
            inputMode="numeric"
          />
        </TextField>
        <div className="flex items-center gap-2">
          {creating ? (
            <span className="text-xs font-mono opacity-60">generating&hellip;</span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
              onPress={() => void handleCreate()}
            >
              Generate.
            </Button>
          )}
        </div>
      </div>

      {freshKey && (
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs text-muted">
            Copy this now &mdash; it won&rsquo;t be shown again.
          </p>
          <div className="block font-mono text-xs px-2.5 py-1.5 bg-accent/6 border-l-2 border-accent/40 text-foreground break-all">
            {freshKey}
          </div>
          <p className="text-muted">
            <Button
              variant="ghost"
              size="sm"
              className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
              onPress={() => { navigator.clipboard.writeText(freshKey).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
            >
              {copied ? "Copied." : "Copy key."}
            </Button>
          </p>
        </div>
      )}

      {loading && keys.length === 0 ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : keys.length === 0 ? (
        <p className="text-muted opacity-60">No active keys yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {keys.map((key, i) => (
            <React.Fragment key={key.id}>
              {i > 0 && <Separator />}
              <p className="text-muted">
                <span className="text-foreground">{key.name}</span>
                <br />
                <span className="font-mono text-xs opacity-60">
                  {[key.prefix, key.start].filter(Boolean).join("_") || key.id}
                  {typeof key.rateLimitMax === "number" ? ` \u00b7 ${key.rateLimitMax} req/min` : ""}
                  {key.expiresAt ? ` \u00b7 expires ${formatKeyDate(key.expiresAt)}` : ""}
                </span>
                {" \u2014 "}
                {revokingId === key.id ? (
                  <Spinner />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0 text-danger"
                    onPress={() => void handleRevoke(key.id)}
                  >
                    Revoke.
                  </Button>
                )}
              </p>
            </React.Fragment>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Danger zone ──────────────────────────────────────────────────────────────

function DangerZone() {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await deleteAccount(password || undefined);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setDeleting(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      {!confirming ? (
        <p className="text-muted">
          <Button
            variant="ghost"
            size="sm"
            className="underline underline-offset-3 h-auto min-w-0 p-0 text-danger decoration-danger/35"
            onPress={() => setConfirming(true)}
          >
            Delete my account.
          </Button>
          {" "}
          <span className="opacity-55">This permanently removes all workspaces and data.</span>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <TextField type="password" name="confirm-password" value={password} onChange={setPassword}>
            <Label>Confirm with your password</Label>
            <Input
              type="password"
              autoComplete="current-password"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") void handleDelete(); if (e.key === "Escape") { setConfirming(false); setPassword(""); } }}
            />
          </TextField>
          <p className="text-muted">
            {deleting ? (
              <span className="text-xs font-mono opacity-60">deleting&hellip;</span>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="underline underline-offset-3 h-auto min-w-0 p-0 text-danger decoration-danger/35"
                  isDisabled={!password}
                  onPress={() => void handleDelete()}
                >
                  Confirm deletion.
                </Button>
                {" "}
                <Button
                  variant="ghost"
                  size="sm"
                  className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                  onPress={() => { setConfirming(false); setPassword(""); setError(null); }}
                >
                  Cancel.
                </Button>
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Settings() {
  const session = useSession();
  const conn = getConnection();
  const isCloud = DEPLOY_MODE !== "self-hosted" && !conn;
  const name = session.data?.user?.name;

  return (
    <Layout>
      <div className="mb-10">
        <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">
          {name ? `${name}'s account.` : "Your account."}
        </h1>
      </div>

      <div className="flex flex-col gap-8 max-w-xl">
        <AppearanceSection />
        <Separator />
        <ProviderSetupSection />
        <Separator />
        <ProviderAdminSection />
        {DEPLOY_MODE === "self-hosted" && <Separator />}
        {isCloud ? (
          <>
            <ProfileSection />
            <Separator />
            <PlanSection />
            <Separator />
            <SecuritySection />
            <Separator />
            <SessionsSection />
            <Separator />
          </>
        ) : (
          <>
            <p className="text-muted">
              Connected to{" "}
              <span className="text-foreground font-mono text-sm">
                {conn?.serverUrl ?? "self-hosted server"}
              </span>
              . Use the Disconnect button in the nav to change servers.
            </p>
            <Separator />
          </>
        )}
        <ConnectorsSection />
        <Separator />
        {isCloud && <DangerZone />}
      </div>
    </Layout>
  );
}
