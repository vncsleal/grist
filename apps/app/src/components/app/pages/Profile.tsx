import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Separator, Input, TextArea } from "@heroui/react";
import { getProfile, updateProfile, type UserContextData } from "../api";
import { Layout } from "../Layout";
import { Spinner } from "@heroui/react";

const PLATFORM_OPTIONS = ["linkedin", "x", "threads", "instagram", "newsletter", "blog", "medium"];

function InlineInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="inline-flex w-auto min-w-[4ch]"
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

  // Auto-resize
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <TextArea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
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
    <span className="whitespace-nowrap">
      <span className="text-foreground">{value}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-auto min-w-0 p-0 text-muted opacity-60 leading-none ml-0.5 text-xs"
        onPress={onRemove}
        aria-label={`Remove ${value}`}
      >
        ×
      </Button>
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
          {i > 0 && <span className="text-muted mx-0.5">, </span>}
          <InlineTag value={v} onRemove={() => onChange(values.filter((_, idx) => idx !== i))} />
        </React.Fragment>
      ))}
      {values.length > 0 && <span className="text-muted mx-0.5">, </span>}
      {adding ? (
        <Input
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
          className="inline-flex w-auto min-w-[4ch]"
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="underline decoration-dashed underline-offset-3 decoration-accent/40 text-muted opacity-70 h-auto min-w-0 p-0 font-mono text-sm"
          onPress={() => setAdding(true)}
        >
          + add
        </Button>
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
        <div className="mb-3 font-mono text-[0.68rem] tracking-[0.14em] uppercase text-accent">
          <span className="inline-block w-4 h-px bg-accent/60 mr-2 align-middle" />
          Settings
        </div>
        <h1 className="text-3xl font-bold leading-tight font-display tracking-tighter text-foreground">
          {form.name ? `Hello, I'm ${form.name}.` : "Tell me who you are."}
        </h1>
      </div>

      {error && (
        <p className="mb-8 text-sm text-danger">{error}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="flex flex-col gap-10 max-w-2xl">

          {/* Identity */}
          <section>
            <p className="font-display text-base leading-[1.75] text-muted">
              My name is{" "}
              <InlineInput value={form.name ?? ""} onChange={(v) => setField("name", v)} placeholder="your name" />.{" "}
              I work as a{" "}
              <InlineInput value={form.role ?? ""} onChange={(v) => setField("role", v)} placeholder="role" />{" "}
              in the{" "}
              <InlineInput value={form.industry ?? ""} onChange={(v) => setField("industry", v)} placeholder="industry" />{" "}
              industry.
            </p>
          </section>

          <Separator className="my-4" />

          {/* Voice */}
          <section>
            <p className="font-display text-base leading-[1.75] text-muted">
              My voice is{" "}
              <InlineTextarea
                value={form.voice ?? ""}
                onChange={(v) => setField("voice", v)}
                placeholder="direct, analytical, no corporate speak…"
              />
            </p>
          </section>

          <Separator className="my-4" />

          {/* Audience */}
          <section>
            <p className="font-display text-base leading-[1.75] text-muted">
              My audience is{" "}
              <InlineTextarea
                value={form.audienceDescription ?? ""}
                onChange={(v) => setField("audienceDescription", v)}
                placeholder="who your content is for…"
              />
            </p>
          </section>

          <Separator className="my-4" />

          {/* Topics & goals */}
          <section>
            <p className="font-display text-base leading-[1.75] text-muted">
              Everything I create is about{" "}
              <InlineTagList
                values={form.topics ?? []}
                onChange={(v) => setField("topics", v)}
                placeholder="topic"
              />
              .
            </p>
            <p className="font-display text-base leading-[1.75] text-muted mt-3">
              My goals are{" "}
              <InlineTagList
                values={form.contentGoals ?? []}
                onChange={(v) => setField("contentGoals", v)}
                placeholder="goal"
              />
              .
            </p>
            <p className="font-display text-base leading-[1.75] text-muted mt-3">
              I avoid{" "}
              <InlineTagList
                values={form.excludeTopics ?? []}
                onChange={(v) => setField("excludeTopics", v)}
                placeholder="topic to avoid"
              />
              .
            </p>
          </section>

          <Separator className="my-4" />

          {/* Platforms */}
          <section>
            <p className="font-display text-base leading-[1.75] text-muted">
              I publish on{" "}
              <span className="inline-flex flex-wrap gap-x-3 gap-y-1 align-baseline">
                {PLATFORM_OPTIONS.map((p) => {
                  const active = (form.platforms ?? []).includes(p);
                  return (
                    <Button
                      key={p}
                      variant={active ? "primary" : "ghost"}
                      size="sm"
                      aria-label={active ? `Remove ${p}` : `Add ${p}`}
                      onPress={() => {
                        const next = active
                          ? (form.platforms ?? []).filter((x) => x !== p)
                          : [...(form.platforms ?? []), p];
                        setField("platforms", next);
                      }}
                    >
                      {!active && <span className="font-mono text-[0.8em] mr-0.5 opacity-70">+</span>}
                      {p}
                    </Button>
                  );
                })}
              </span>
              .
            </p>
          </section>

          <Separator className="my-4" />

          {/* Save */}
          <p className="font-mono text-[0.8rem] text-muted">
            {saving ? (
              <span className="opacity-60">saving…</span>
            ) : saved ? (
              <span className="text-success">saved.</span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="underline underline-offset-3 decoration-accent/40 text-muted h-auto min-w-0 p-0"
                onPress={() => void handleSave()}
              >
                save changes
              </Button>
            )}
          </p>
        </div>
      )}
    </Layout>
  );
}
