import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Separator, Input, TextArea, Alert, Skeleton } from "@heroui/react";
import { getProfile, updateProfile, type UserContextData } from "../api";
import { Layout } from "../Layout";
import { Eyebrow, InlineAction } from "../primitives";

const PLATFORM_OPTIONS = ["linkedin", "x", "threads", "instagram", "newsletter", "blog", "medium"];

function InlineInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="inline-flex w-auto min-w-[4ch]" />;
}

function InlineTextarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <TextArea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

function InlineTag({ value, onRemove }: { value: string; onRemove: () => void }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-foreground">{value}</span>
      <InlineAction onClick={onRemove}>&times;</InlineAction>
    </span>
  );
}

function InlineTagList({ values, onChange, placeholder }: { values: string[]; onChange: (next: string[]) => void; placeholder?: string }) {
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
        <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitDraft(); } if (e.key === "Escape") { setDraft(""); setAdding(false); } if (e.key === "," || e.key === "Tab") { e.preventDefault(); commitDraft(); } }}
          onBlur={commitDraft} placeholder={placeholder ?? "add\u2026"} className="inline-flex w-auto min-w-[4ch]" />
      ) : (
        <InlineAction onClick={() => setAdding(true)}>+ add</InlineAction>
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
    try { const p = await getProfile(); setForm(p ?? {}); } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    setSaving(true); setSaved(false); setError(null);
    try { const updated = await updateProfile(form); setForm(updated); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  function setField<K extends keyof UserContextData>(key: K, value: UserContextData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Layout>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_60%_40%_at_20%_10%,color-mix(in_oklch,var(--accent)_6%,transparent),transparent)]" />

      <div className="mb-10">
        <Eyebrow>Settings</Eyebrow>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
          {form.name ? `Hello, I'm ${form.name}.` : "Tell me who you are."}
        </h1>
      </div>

      {error && (
        <Alert status="danger" className="mb-8">
          <Alert.Indicator />
          <Alert.Content><Alert.Description>{error}</Alert.Description></Alert.Content>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-6 max-w-2xl">
          <Skeleton className="h-5 w-3/4 rounded" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-5 w-1/2 rounded" />
        </div>
      ) : (
        <div className="flex flex-col gap-10 max-w-2xl">
          <section>
            <p className="text-sm leading-relaxed text-muted">
              My name is <InlineInput value={form.name ?? ""} onChange={(v) => setField("name", v)} placeholder="your name" />.{" "}
              I work as a <InlineInput value={form.role ?? ""} onChange={(v) => setField("role", v)} placeholder="role" />{" "}
              in the <InlineInput value={form.industry ?? ""} onChange={(v) => setField("industry", v)} placeholder="industry" /> industry.
            </p>
          </section>

          <Separator variant="tertiary" />

          <section>
            <p className="text-sm leading-relaxed text-muted">
              My voice is <InlineTextarea value={form.voice ?? ""} onChange={(v) => setField("voice", v)} placeholder="direct, analytical, no corporate speak\u2026" />
            </p>
          </section>

          <Separator variant="tertiary" />

          <section>
            <p className="text-sm leading-relaxed text-muted">
              My audience is <InlineTextarea value={form.audienceDescription ?? ""} onChange={(v) => setField("audienceDescription", v)} placeholder="who your content is for\u2026" />
            </p>
          </section>

          <Separator variant="tertiary" />

          <section>
            <p className="text-sm leading-relaxed text-muted">
              Everything I create is about <InlineTagList values={form.topics ?? []} onChange={(v) => setField("topics", v)} placeholder="topic" />.
            </p>
            <p className="text-sm leading-relaxed text-muted mt-3">
              My goals are <InlineTagList values={form.contentGoals ?? []} onChange={(v) => setField("contentGoals", v)} placeholder="goal" />.
            </p>
            <p className="text-sm leading-relaxed text-muted mt-3">
              I avoid <InlineTagList values={form.excludeTopics ?? []} onChange={(v) => setField("excludeTopics", v)} placeholder="topic to avoid" />.
            </p>
          </section>

          <Separator variant="tertiary" />

          <section>
            <p className="text-sm leading-relaxed text-muted">
              I publish on{" "}
              <span className="inline-flex flex-wrap gap-x-3 gap-y-1 align-baseline">
                {PLATFORM_OPTIONS.map((p) => {
                  const active = (form.platforms ?? []).includes(p);
                  return (
                    <Button key={p} variant={active ? "primary" : "ghost"} size="sm"
                      aria-label={active ? `Remove ${p}` : `Add ${p}`}
                      onPress={() => { const next = active ? (form.platforms ?? []).filter((x) => x !== p) : [...(form.platforms ?? []), p]; setField("platforms", next); }}>
                      {!active && <span className="text-xs mr-0.5 opacity-70">+</span>}
                      {p}
                    </Button>
                  );
                })}
              </span>.
            </p>
          </section>

          <Separator variant="tertiary" />

          <p className="text-xs text-muted">
            {saving ? <span className="opacity-60">saving\u2026</span> : saved ? <span className="text-success">saved.</span> : <InlineAction onClick={() => void handleSave()}>save changes</InlineAction>}
          </p>
        </div>
      )}
    </Layout>
  );
}
