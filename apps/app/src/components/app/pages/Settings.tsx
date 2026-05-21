import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Layout, Spinner } from "../Layout";
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

// ─── Shared styles ────────────────────────────────────────────────────────────

const prose: React.CSSProperties = {
  fontFamily: "var(--font-display, serif)",
  fontSize: "1rem",
  lineHeight: "1.75",
  color: "var(--muted)",
};

const mono: React.CSSProperties = {
  fontFamily: "var(--font-mono, monospace)",
};

const inlineInput: React.CSSProperties = {
  font: "inherit",
  background: "none",
  border: "none",
  borderBottom: "1px dashed var(--border)",
  outline: "none",
  padding: "0 2px",
  color: "var(--foreground)",
  minWidth: "4ch",
};

function SettingsAction({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        font: "inherit",
        background: "none",
        border: "none",
        padding: 0,
        cursor: disabled ? "default" : "pointer",
        color: danger ? "var(--danger)" : "var(--muted)",
        textDecorationLine: "underline",
        textDecorationColor: danger
          ? "color-mix(in oklch, var(--danger) 35%, transparent)"
          : "color-mix(in oklch, var(--accent) 40%, transparent)",
        textUnderlineOffset: "3px",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Rule() {
  return (
    <div
      className="h-px"
      style={{ background: "linear-gradient(to right, var(--border), transparent)" }}
    />
  );
}

// ─── Appearance ───────────────────────────────────────────────────────────────

function AppearanceSection() {
  const [theme, setTheme] = useTheme();
  const isDark = theme === "dark";

  return (
    <section>
      <p style={prose}>
        The interface is in{" "}
        <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{isDark ? "dark" : "light"}</span>{" "}
        mode.{" "}
        <SettingsAction onClick={() => setTheme(isDark ? "light" : "dark")}>
          Switch to {isDark ? "light" : "dark"}.
        </SettingsAction>
      </p>
    </section>
  );
}

// ─── Profile (display name) ───────────────────────────────────────────────────

function ProfileSection() {
  const session = useSession();
  const user = session.data?.user;
  const [name, setName] = useState(user?.name ?? "");
  const [focused, setFocused] = useState(false);
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
      {error && <p style={{ ...mono, fontSize: "0.8rem", color: "var(--danger)" }}>{error}</p>}
      <p style={prose}>
        You're signed in as{" "}
        <span style={{ ...mono, fontSize: "0.875rem", color: "var(--foreground)" }}>{user?.email ?? "\u2014"}</span>.
      </p>
      <p style={prose}>
        Your display name is{" "}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
          style={{
            ...inlineInput,
            borderBottomColor: focused ? "var(--accent)" : undefined,
            borderBottomStyle: focused ? "solid" : "dashed",
            width: `${Math.max(name.length + 2, 10)}ch`,
          }}
        />
        .{" "}
        {saving ? (
          <span style={{ ...mono, fontSize: "0.8rem", opacity: 0.6 }}>saving\u2026</span>
        ) : saved ? (
          <span style={{ ...mono, fontSize: "0.8rem", color: "var(--success)" }}>saved.</span>
        ) : (
          <SettingsAction onClick={() => void handleSave()} disabled={!name.trim()}>
            Save.
          </SettingsAction>
        )}
      </p>
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
      <p style={prose}>
        {saved ? (
          <span style={{ ...mono, fontSize: "0.8rem", color: "var(--success)" }}>Password updated.</span>
        ) : open ? null : (
          <SettingsAction onClick={() => setOpen(true)}>Change your password.</SettingsAction>
        )}
      </p>
      {open && (
        <div className="flex flex-col gap-2">
          {error && <p style={{ ...mono, fontSize: "0.8rem", color: "var(--danger)" }}>{error}</p>}
          {[
            { label: "Current password", value: current, set: setCurrent, auto: "current-password" },
            { label: "New password", value: next, set: setNext, auto: "new-password" },
            { label: "Confirm", value: confirm, set: setConfirm, auto: "new-password" },
          ].map(({ label, value, set, auto }) => (
            <p key={label} style={prose}>
              {label}:{" "}
              <input
                type="password"
                value={value}
                onChange={(e) => set(e.target.value)}
                autoComplete={auto}
                onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); if (e.key === "Escape") setOpen(false); }}
                style={{ ...inlineInput, width: "18ch" }}
              />
            </p>
          ))}
          <p style={prose}>
            {saving ? (
              <span style={{ ...mono, fontSize: "0.8rem", opacity: 0.6 }}>saving\u2026</span>
            ) : (
              <>
                <SettingsAction onClick={() => void handleSubmit()} disabled={!current || !next || !confirm}>
                  Update password.
                </SettingsAction>
                {" "}
                <SettingsAction onClick={() => { setOpen(false); setError(null); setCurrent(""); setNext(""); setConfirm(""); }}>
                  Cancel.
                </SettingsAction>
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
      {error && <p style={{ ...mono, fontSize: "0.8rem", color: "var(--danger)" }}>{error}</p>}
      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : sessions.length === 0 ? (
        <p style={{ ...prose, opacity: 0.6 }}>No active sessions found.</p>
      ) : (
        <>
          {sessions.map((s, i) => {
            const isCurrent = s.id === currentSessionId;
            return (
              <React.Fragment key={s.id}>
                {i > 0 && <div className="h-px" style={{ background: "linear-gradient(to right, var(--border), transparent)" }} />}
                <p style={prose}>
                  <span style={{ color: "var(--foreground)" }}>
                    {s.userAgent ? s.userAgent.slice(0, 55) : "Unknown browser"}
                  </span>
                  {isCurrent && (
                    <span style={{ ...mono, fontSize: "0.7rem", color: "var(--accent)", marginLeft: "0.5rem" }}>
                      this session
                    </span>
                  )}
                  <br />
                  <span style={{ ...mono, fontSize: "0.75rem", opacity: 0.6 }}>
                    {s.ipAddress ? `${s.ipAddress} \u00b7 ` : ""}
                    {formatSessionDate(s.createdAt)}
                  </span>
                  {!isCurrent && (
                    <>
                      {" \u2014 "}
                      {revoking === s.id ? (
                        <Spinner />
                      ) : (
                        <SettingsAction onClick={() => void handleRevoke(s.id)}>
                          End session.
                        </SettingsAction>
                      )}
                    </>
                  )}
                </p>
              </React.Fragment>
            );
          })}
          {otherSessions.length > 1 && (
            <p style={prose}>
              {revokingAll ? (
                <span style={{ ...mono, fontSize: "0.8rem", opacity: 0.6 }}>signing out\u2026</span>
              ) : (
                <SettingsAction onClick={() => void handleRevokeOthers()}>
                  End all other sessions.
                </SettingsAction>
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
      {error && <p style={{ ...mono, fontSize: "0.8rem", color: "var(--danger)" }}>{error}</p>}
      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : info ? (
        <p style={prose}>
          You're on the{" "}
          <span style={{ color: "var(--foreground)", fontWeight: 600 }}>
            {info.plan === "pro" ? "Pro" : "Free"}
          </span>{" "}
          plan.
          {info.planEnforcementEnabled && info.limits && (
            <span style={{ opacity: 0.7 }}>
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
              <SettingsAction onClick={() => { window.open(`${apiBase}/api/billing/upgrade`, "_blank", "noopener"); }}>
                Upgrade to Pro.
              </SettingsAction>
            </>
          )}
          {info.billingPortalUrl && (
            <>
              {" "}
              <SettingsAction onClick={() => { window.open(`${apiBase}/api/billing/portal`, "_blank", "noopener"); }}>
                Manage billing.
              </SettingsAction>
            </>
          )}
        </p>
      ) : null}
    </section>
  );
}

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
    return <p style={{ ...mono, fontSize: "0.8rem", color: "var(--danger)" }}>{error}</p>;
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
      <p style={prose}>{modeCopy}</p>
      <div className="flex flex-col gap-3">
        {info.capabilities.map((capability, index) => (
          <React.Fragment key={capability.modality}>
            {index > 0 && <div className="h-px" style={{ background: "linear-gradient(to right, var(--border), transparent)" }} />}
            <p style={prose}>
              <span style={{ color: "var(--foreground)", textTransform: "capitalize" }}>{capability.modality}</span>
              {" "}
              <span style={{ ...mono, fontSize: "0.75rem", opacity: 0.7 }}>
                {capability.available ? `${capability.tier ?? "unavailable"} active` : `preferred: ${capability.setupMode}`}
              </span>
              <br />
              <span style={{ opacity: 0.8 }}>{capability.message}</span>
            </p>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

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

  return (
    <section className="flex flex-col gap-4">
      {error && <p style={{ ...mono, fontSize: "0.8rem", color: "var(--danger)" }}>{error}</p>}
      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : (
        <>
          <p style={prose}>
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
              {idx > 0 && <Rule />}
              <div className="flex flex-col gap-2">
                <p style={prose}>
                  <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{section.title}</span>
                  {" "}
                  <span style={{ ...mono, fontSize: "0.75rem", opacity: 0.7 }}>
                    {section.current?.configured ? `${section.current.provider} · ${section.current.source}` : "not configured"}
                  </span>
                </p>
                <p style={prose}>
                  Provider{" "}
                  <select value={section.provider} onChange={(e) => section.setProvider(e.target.value)} style={{ ...inlineInput, minWidth: "18ch" }}>
                    {section.providers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  {" "}key{" "}
                  <input type="password" value={section.apiKey} onChange={(e) => section.setApiKey(e.target.value)} style={{ ...inlineInput, width: "18ch" }} />
                  .{" "}
                  {saving === section.modality ? (
                    <span style={{ ...mono, fontSize: "0.8rem", opacity: 0.6 }}>saving…</span>
                  ) : (
                    <SettingsAction onClick={() => void handleSave(section.modality)} disabled={!section.apiKey.trim()}>
                      Save.
                    </SettingsAction>
                  )}
                  {" "}
                  <SettingsAction onClick={() => void handleClear(section.modality)} disabled={!section.current?.configured || saving === `${section.modality}-clear`}>
                    Clear.
                  </SettingsAction>
                </p>
                {section.modality === "audio" && section.provider !== "replicate" && (
                  <p style={prose}>
                    Voice ID{" "}
                    <input value={audioVoiceId} onChange={(e) => setAudioVoiceId(e.target.value)} style={{ ...inlineInput, width: "12ch" }} />
                    {" "}Group ID{" "}
                    <input value={audioGroupId} onChange={(e) => setAudioGroupId(e.target.value)} style={{ ...inlineInput, width: "12ch" }} />
                    .
                  </p>
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
  const [keyNameFocused, setKeyNameFocused] = useState(false);
  const [rateLimitMax, setRateLimitMax] = useState("60");
  const [rateLimitFocused, setRateLimitFocused] = useState(false);
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
      {error && <p style={{ ...mono, fontSize: "0.8rem", color: "var(--danger)" }}>{error}</p>}
      <p style={prose}>
        Remote MCP clients connect at{" "}
        <button
          onClick={() => { navigator.clipboard.writeText(connectorUrl).catch(() => {}); setUrlCopied(true); setTimeout(() => setUrlCopied(false), 1800); }}
          title="Click to copy"
          style={{
            font: "inherit",
            ...mono,
            fontSize: "0.8rem",
            background: "none",
            border: "none",
            padding: "0 1px",
            cursor: "pointer",
            color: "var(--foreground)",
            textDecorationLine: "underline",
            textDecorationColor: "color-mix(in oklch, var(--accent) 40%, transparent)",
            textUnderlineOffset: "3px",
          }}
        >
          {connectorUrl}
        </button>
        {urlCopied && <span style={{ ...mono, fontSize: "0.75rem", color: "var(--success)", marginLeft: "0.4rem" }}>copied.</span>}
      </p>
      <p style={prose}>
        Generate a key labeled{" "}
        <input
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          onFocus={() => setKeyNameFocused(true)}
          onBlur={() => setKeyNameFocused(false)}
          style={{
            ...inlineInput,
            ...mono,
            fontSize: "0.875rem",
            borderBottomColor: keyNameFocused ? "var(--accent)" : undefined,
            borderBottomStyle: keyNameFocused ? "solid" : "dashed",
            width: `${Math.max(keyName.length + 2, 10)}ch`,
          }}
        />{" "}
        with{" "}
        <input
          value={rateLimitMax}
          onChange={(e) => setRateLimitMax(e.target.value)}
          inputMode="numeric"
          onFocus={() => setRateLimitFocused(true)}
          onBlur={() => setRateLimitFocused(false)}
          style={{
            ...inlineInput,
            ...mono,
            fontSize: "0.875rem",
            borderBottomColor: rateLimitFocused ? "var(--accent)" : undefined,
            borderBottomStyle: rateLimitFocused ? "solid" : "dashed",
            width: "5ch",
            textAlign: "right",
          }}
        />{" "}
        requests per minute.{" "}
        {creating ? (
          <span style={{ ...mono, fontSize: "0.8rem", opacity: 0.6 }}>generating\u2026</span>
        ) : (
          <SettingsAction onClick={() => void handleCreate()}>Generate.</SettingsAction>
        )}
      </p>

      {freshKey && (
        <div className="flex flex-col gap-1">
          <p style={{ ...mono, fontSize: "0.75rem", color: "var(--muted)" }}>
            Copy this now \u2014 it won't be shown again.
          </p>
          <code
            style={{
              display: "block",
              ...mono,
              fontSize: "0.78rem",
              padding: "6px 10px",
              background: "color-mix(in oklch, var(--accent) 6%, var(--surface))",
              borderLeft: "2px solid color-mix(in oklch, var(--accent) 40%, transparent)",
              color: "var(--foreground)",
              wordBreak: "break-all",
            }}
          >
            {freshKey}
          </code>
          <p style={prose}>
            <SettingsAction onClick={() => { navigator.clipboard.writeText(freshKey).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
              {copied ? "Copied." : "Copy key."}
            </SettingsAction>
          </p>
        </div>
      )}

      {loading && keys.length === 0 ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : keys.length === 0 ? (
        <p style={{ ...prose, opacity: 0.6 }}>No active keys yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {keys.map((key, i) => (
            <React.Fragment key={key.id}>
              {i > 0 && <div className="h-px" style={{ background: "linear-gradient(to right, var(--border), transparent)" }} />}
              <p style={prose}>
                <span style={{ color: "var(--foreground)" }}>{key.name}</span>
                <br />
                <span style={{ ...mono, fontSize: "0.72rem", opacity: 0.6 }}>
                  {[key.prefix, key.start].filter(Boolean).join("_") || key.id}
                  {typeof key.rateLimitMax === "number" ? ` \u00b7 ${key.rateLimitMax} req/min` : ""}
                  {key.expiresAt ? ` \u00b7 expires ${formatKeyDate(key.expiresAt)}` : ""}
                </span>
                {" \u2014 "}
                {revokingId === key.id ? (
                  <Spinner />
                ) : (
                  <SettingsAction danger onClick={() => void handleRevoke(key.id)}>
                    Revoke.
                  </SettingsAction>
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
  const [pwFocused, setPwFocused] = useState(false);
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
      {error && <p style={{ ...mono, fontSize: "0.8rem", color: "var(--danger)" }}>{error}</p>}
      {!confirming ? (
        <p style={prose}>
          <SettingsAction danger onClick={() => setConfirming(true)}>
            Delete my account.
          </SettingsAction>
          {" "}
          <span style={{ opacity: 0.55 }}>This permanently removes all workspaces and data.</span>
        </p>
      ) : (
        <p style={prose}>
          Confirm with your password{" "}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            onFocus={() => setPwFocused(true)}
            onBlur={() => setPwFocused(false)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleDelete(); if (e.key === "Escape") { setConfirming(false); setPassword(""); } }}
            style={{
              ...inlineInput,
              borderBottomColor: pwFocused ? "var(--danger)" : undefined,
              borderBottomStyle: pwFocused ? "solid" : "dashed",
              width: "16ch",
            }}
          />
          {" \u2014 "}
          {deleting ? (
            <span style={{ ...mono, fontSize: "0.8rem", opacity: 0.6 }}>deleting\u2026</span>
          ) : (
            <>
              <SettingsAction danger onClick={() => void handleDelete()} disabled={!password}>
                Confirm deletion.
              </SettingsAction>
              {" "}
              <SettingsAction onClick={() => { setConfirming(false); setPassword(""); setError(null); }}>
                Cancel.
              </SettingsAction>
            </>
          )}
        </p>
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
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: `radial-gradient(ellipse 60% 40% at 20% 10%, color-mix(in oklch, var(--accent) 6%, transparent), transparent)`,
        }}
      />

      <div className="mb-10">
        <h1
          className="text-3xl font-bold leading-tight"
          style={{
            fontFamily: "var(--font-display, serif)",
            letterSpacing: "-0.025em",
            color: "var(--foreground)",
          }}
        >
          {name ? `${name}'s account.` : "Your account."}
        </h1>
      </div>

      <div className="flex flex-col gap-8 max-w-xl">
        <AppearanceSection />
        <Rule />
        <ProviderSetupSection />
        <Rule />
        <ProviderAdminSection />
        {DEPLOY_MODE === "self-hosted" && <Rule />}
        {isCloud ? (
          <>
            <ProfileSection />
            <Rule />
            <PlanSection />
            <Rule />
            <SecuritySection />
            <Rule />
            <SessionsSection />
            <Rule />
          </>
        ) : (
          <>
            <p style={prose}>
              Connected to{" "}
              <span style={{ ...mono, fontSize: "0.875rem", color: "var(--foreground)" }}>
                {conn?.serverUrl ?? "self-hosted server"}
              </span>
              . Use the Disconnect button in the nav to change servers.
            </p>
            <Rule />
          </>
        )}
        <ConnectorsSection />
        <Rule />
        {isCloud && <DangerZone />}
      </div>
    </Layout>
  );
}
