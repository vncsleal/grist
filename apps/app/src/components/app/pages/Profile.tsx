import React, { useCallback, useEffect, useRef, useState } from "react";
import { getProfile, updateProfile, type UserContextData } from "../api";
import { Layout, Spinner } from "../Layout";

const PLATFORM_OPTIONS = ["linkedin", "x", "threads", "instagram", "newsletter", "blog", "medium"];

// Shared style for transparent inline inputs that look like prose
const inlineInputStyle: React.CSSProperties = {
  font: "inherit",
  background: "none",
  border: "none",
  borderBottom: "1px dashed var(--border)",
  outline: "none",
  padding: "0 2px",
  color: "var(--foreground)",
  minWidth: "4ch",
};

const inlineInputFocusStyle: React.CSSProperties = {
  ...inlineInputStyle,
  borderBottomColor: "var(--accent)",
  borderBottomStyle: "solid",
};

function InlineInput({
  value,
  onChange,
  placeholder,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...(focused ? inlineInputFocusStyle : inlineInputStyle),
        width: width ?? `${Math.max(value.length + 2, (placeholder?.length ?? 6) + 2)}ch`,
      }}
    />
  );
}

function InlineTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  // Auto-resize
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        font: "inherit",
        background: "none",
        border: "none",
        borderBottom: focused ? "1px solid var(--accent)" : "1px dashed var(--border)",
        outline: "none",
        padding: "2px",
        color: "var(--foreground)",
        resize: "none",
        width: "100%",
        overflow: "hidden",
        lineHeight: "inherit",
      }}
    />
  );
}

function InlineTag({
  value,
  onRemove,
}: {
  value: string;
  onRemove: () => void;
}) {
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <span style={{ color: "var(--foreground)" }}>{value}</span>
      <button
        onClick={onRemove}
        title={`Remove ${value}`}
        style={{
          font: "inherit",
          fontSize: "0.75em",
          background: "none",
          border: "none",
          padding: "0 0 0 3px",
          cursor: "pointer",
          color: "var(--muted)",
          opacity: 0.6,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </span>
  );
}

function InlineTagList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  function commitDraft() {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setDraft("");
    setAdding(false);
  }

  return (
    <>
      {values.map((v, i) => (
        <React.Fragment key={v}>
          {i > 0 && <span style={{ color: "var(--muted)", margin: "0 2px" }}>, </span>}
          <InlineTag value={v} onRemove={() => onChange(values.filter((_, idx) => idx !== i))} />
        </React.Fragment>
      ))}
      {values.length > 0 && <span style={{ color: "var(--muted)", margin: "0 2px" }}>, </span>}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
            if (e.key === "Escape") { setDraft(""); setAdding(false); }
            if (e.key === "," || e.key === "Tab") { e.preventDefault(); commitDraft(); }
          }}
          onBlur={commitDraft}
          placeholder={placeholder ?? "add…"}
          style={{
            ...inlineInputStyle,
            width: `${Math.max(draft.length + 2, 6)}ch`,
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            font: "inherit",
            fontSize: "0.875em",
            fontFamily: "var(--font-mono, monospace)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--muted)",
            textDecorationLine: "underline",
            textDecorationStyle: "dashed",
            textDecorationColor: "color-mix(in oklch, var(--accent) 40%, transparent)",
            textUnderlineOffset: "3px",
            opacity: 0.7,
          }}
        >
          + add
        </button>
      )}
    </>
  );
}

export function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<UserContextData>({});

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const p = await getProfile();
      setForm(p ?? {});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateProfile(form);
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function setField<K extends keyof UserContextData>(key: K, value: UserContextData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const proseStyle: React.CSSProperties = {
    fontFamily: "var(--font-display, serif)",
    fontSize: "1rem",
    lineHeight: "1.75",
    color: "var(--muted)",
  };

  return (
    <Layout>
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: `radial-gradient(ellipse 60% 40% at 20% 10%, color-mix(in oklch, var(--accent) 6%, transparent), transparent)`,
        }}
      />

      {/* Header */}
      <div className="mb-10">
        <div
          className="mb-3 font-mono text-[0.68rem] tracking-[0.14em] uppercase"
          style={{ color: "var(--accent)" }}
        >
          <span
            className="inline-block mr-2 w-4 h-px opacity-60"
            style={{ background: "var(--accent)", verticalAlign: "middle" }}
          />
          Settings
        </div>
        <h1
          className="text-3xl font-bold leading-tight"
          style={{
            fontFamily: "var(--font-display, serif)",
            letterSpacing: "-0.025em",
            color: "var(--foreground)",
          }}
        >
          {form.name ? `Hello, I'm ${form.name}.` : "Tell me who you are."}
        </h1>
      </div>

      {error && (
        <p className="mb-8 text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="flex flex-col gap-10 max-w-2xl">

          {/* Identity */}
          <section>
            <p style={proseStyle}>
              My name is{" "}
              <InlineInput value={form.name ?? ""} onChange={(v) => setField("name", v)} placeholder="your name" />.{" "}
              I work as a{" "}
              <InlineInput value={form.role ?? ""} onChange={(v) => setField("role", v)} placeholder="role" />{" "}
              in the{" "}
              <InlineInput value={form.industry ?? ""} onChange={(v) => setField("industry", v)} placeholder="industry" />{" "}
              industry.
            </p>
          </section>

          <div className="h-px" style={{ background: "linear-gradient(to right, var(--border), transparent)" }} />

          {/* Voice */}
          <section>
            <p style={proseStyle}>
              My voice is{" "}
              <InlineTextarea
                value={form.voice ?? ""}
                onChange={(v) => setField("voice", v)}
                placeholder="direct, analytical, no corporate speak…"
              />
            </p>
          </section>

          <div className="h-px" style={{ background: "linear-gradient(to right, var(--border), transparent)" }} />

          {/* Audience */}
          <section>
            <p style={proseStyle}>
              My audience is{" "}
              <InlineTextarea
                value={form.audienceDescription ?? ""}
                onChange={(v) => setField("audienceDescription", v)}
                placeholder="who your content is for…"
              />
            </p>
          </section>

          <div className="h-px" style={{ background: "linear-gradient(to right, var(--border), transparent)" }} />

          {/* Topics & goals */}
          <section>
            <p style={proseStyle}>
              Everything I create is about{" "}
              <InlineTagList
                values={form.topics ?? []}
                onChange={(v) => setField("topics", v)}
                placeholder="topic"
              />
              .
            </p>
            <p style={{ ...proseStyle, marginTop: "0.75rem" }}>
              My goals are{" "}
              <InlineTagList
                values={form.contentGoals ?? []}
                onChange={(v) => setField("contentGoals", v)}
                placeholder="goal"
              />
              .
            </p>
            <p style={{ ...proseStyle, marginTop: "0.75rem" }}>
              I avoid{" "}
              <InlineTagList
                values={form.excludeTopics ?? []}
                onChange={(v) => setField("excludeTopics", v)}
                placeholder="topic to avoid"
              />
              .
            </p>
          </section>

          <div className="h-px" style={{ background: "linear-gradient(to right, var(--border), transparent)" }} />

          {/* Platforms */}
          <section>
            <p style={proseStyle}>
              I publish on{" "}
              <span className="inline-flex flex-wrap gap-x-3 gap-y-1 align-baseline">
                {PLATFORM_OPTIONS.map((p) => {
                  const active = (form.platforms ?? []).includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      title={active ? `Remove ${p}` : `Add ${p}`}
                      onClick={() => {
                        const next = active
                          ? (form.platforms ?? []).filter((x) => x !== p)
                          : [...(form.platforms ?? []), p];
                        setField("platforms", next);
                      }}
                      style={{
                        font: "inherit",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        color: active ? "var(--foreground)" : "var(--muted)",
                        fontWeight: active ? 600 : 400,
                        textDecorationLine: active ? "underline" : "none",
                        textDecorationStyle: "solid",
                        textDecorationColor: "color-mix(in oklch, var(--accent) 55%, transparent)",
                        textUnderlineOffset: "3px",
                        opacity: active ? 1 : 0.35,
                      }}
                    >
                      {active ? null : (
                        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8em", marginRight: "1px", opacity: 0.7 }}>+</span>
                      )}
                      {p}
                    </button>
                  );
                })}
              </span>
              .
            </p>
          </section>

          <div className="h-px" style={{ background: "linear-gradient(to right, var(--border), transparent)" }} />

          {/* Save */}
          <p
            className="font-mono text-[0.8rem]"
            style={{ color: "var(--muted)" }}
          >
            {saving ? (
              <span style={{ opacity: 0.6 }}>saving…</span>
            ) : saved ? (
              <span style={{ color: "var(--success)" }}>saved.</span>
            ) : (
              <button
                onClick={() => void handleSave()}
                style={{
                  font: "inherit",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "var(--muted)",
                  textDecorationLine: "underline",
                  textDecorationColor: "color-mix(in oklch, var(--accent) 40%, transparent)",
                  textUnderlineOffset: "3px",
                }}
              >
                save changes
              </button>
            )}
          </p>
        </div>
      )}
    </Layout>
  );
}
