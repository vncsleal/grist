import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react/button";
import { Separator } from "@heroui/react/separator";
import { Input } from "@heroui/react/input";
import { TextArea } from "@heroui/react/textarea";
import { Alert } from "@heroui/react/alert";
import { Skeleton } from "@heroui/react/skeleton";
import { FieldError } from "@heroui/react/field-error";
import { getProfile, updateProfile, type UserContextData } from "../api";
import { Layout } from "../Layout";
import { Eyebrow, InlineAction } from "../primitives";
import { profileSchema } from "../validation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

const PLATFORM_OPTIONS = ["linkedin", "x", "threads", "instagram", "newsletter", "blog", "medium"];

type ProfileForm = z.infer<typeof profileSchema>;

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
  const [apiError, setApiError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {},
  });

  const form = watch();
  const fieldErrors = errors;

  const load = useCallback(async () => {
    setApiError(null);
    setLoading(true);
    try {
      const p = await getProfile();
      reset(p ?? {});
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [reset]);

  useEffect(() => { void load(); }, [load]);

  async function onSave(data: ProfileForm) {
    setSaving(true);
    setSaved(false);
    setApiError(null);
    try {
      // Filter out undefined values to match UserContextData
      const cleaned: UserContextData = {};
      for (const [key, val] of Object.entries(data)) {
        if (val !== undefined) {
          (cleaned as Record<string, unknown>)[key] = val;
        }
      }
      const updated = await updateProfile(cleaned);
      reset(updated as ProfileForm);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Collect all visible field-level error messages for inline display
  const validationErrors: string[] = [];
  for (const err of Object.values(fieldErrors)) {
    if (err && typeof err === "object" && "message" in err && err.message) {
      validationErrors.push(err.message as string);
    }
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

      {/* API-level error banner */}
      {apiError && (
        <Alert status="danger" className="mb-8">
          <Alert.Indicator />
          <Alert.Content><Alert.Description>{apiError}</Alert.Description></Alert.Content>
        </Alert>
      )}

      {/* Field-level validation errors */}
      {validationErrors.length > 0 && (
        <Alert status="warning" className="mb-8">
          <Alert.Indicator />
          <Alert.Content>
            <ul className="list-disc pl-4 text-sm space-y-1">
              {validationErrors.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </Alert.Content>
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
              My name is <InlineInput value={form.name ?? ""} onChange={(v) => setValue("name", v)} placeholder="your name" />.{" "}
              I work as a <InlineInput value={form.role ?? ""} onChange={(v) => setValue("role", v)} placeholder="role" />{" "}
              in the <InlineInput value={form.industry ?? ""} onChange={(v) => setValue("industry", v)} placeholder="industry" /> industry.
              {errors.name && <FieldError className="inline ml-1">{errors.name.message}</FieldError>}
            </p>
          </section>

          <Separator variant="tertiary" />

          <section>
            <p className="text-sm leading-relaxed text-muted">
              My voice is <InlineTextarea value={form.voice ?? ""} onChange={(v) => setValue("voice", v)} placeholder="direct, analytical, no corporate speak\u2026" />
              {errors.voice && <FieldError className="inline ml-1">{errors.voice.message}</FieldError>}
            </p>
          </section>

          <Separator variant="tertiary" />

          <section>
            <p className="text-sm leading-relaxed text-muted">
              My audience is <InlineTextarea value={form.audienceDescription ?? ""} onChange={(v) => setValue("audienceDescription", v)} placeholder="who your content is for\u2026" />
              {errors.audienceDescription && <FieldError className="inline ml-1">{errors.audienceDescription.message}</FieldError>}
            </p>
          </section>

          <Separator variant="tertiary" />

          <section>
            <p className="text-sm leading-relaxed text-muted">
              Everything I create is about <InlineTagList values={form.topics ?? []} onChange={(v) => setValue("topics", v)} placeholder="topic" />.
            </p>
            <p className="text-sm leading-relaxed text-muted mt-3">
              My goals are <InlineTagList values={form.contentGoals ?? []} onChange={(v) => setValue("contentGoals", v)} placeholder="goal" />.
            </p>
            <p className="text-sm leading-relaxed text-muted mt-3">
              I avoid <InlineTagList values={form.excludeTopics ?? []} onChange={(v) => setValue("excludeTopics", v)} placeholder="topic to avoid" />.
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
                      onPress={() => { const next = active ? (form.platforms ?? []).filter((x) => x !== p) : [...(form.platforms ?? []), p]; setValue("platforms", next); }}>
                      {!active && <span className="text-xs mr-0.5 opacity-70">+</span>}
                      {p}
                    </Button>
                  );
                })}
              </span>.
            </p>
          </section>

          <Separator variant="tertiary" />

          <form onSubmit={handleSubmit(onSave)}>
            <p className="text-xs text-muted">
              {saving ? <span className="opacity-60">saving\u2026</span> : saved ? <span className="text-success">saved.</span> : <button type="submit" className="underline underline-offset-2 decoration-accent/40 h-auto min-w-0 p-0 text-accent hover:decoration-accent transition-all bg-transparent border-none cursor-pointer text-xs font-inherit">save changes</button>}
            </p>
          </form>
        </div>
      )}
    </Layout>
  );
}
