import React, { useEffect, useState } from "react";
import { Button } from "@heroui/react/button";
import { Skeleton } from "@heroui/react/skeleton";
import { getFullPlanInfo, getResolvedApiBaseUrl, type PlanInfo, type UsageInfo } from "../api";
import { Layout, ErrorBanner } from "../Layout";
import { PageEmptyState, Eyebrow } from "../primitives";

const DEPLOY_MODE = (import.meta.env.VITE_QUILLBY_DEPLOYMENT_MODE ?? "").trim().toLowerCase();

type ColumnPlan = "free" | "pro";

interface FeatureRow {
  label: string;
  free: string;
  pro: string;
}

const FEATURES: FeatureRow[] = [
  { label: "Workspaces", free: "3 max", pro: "Unlimited" },
  { label: "Drafts per workspace", free: "20 max", pro: "Unlimited" },
  { label: "Image generations / month", free: "0", pro: "300" },
  { label: "Audio generations / month", free: "0", pro: "500" },
  { label: "Video generations / month", free: "0", pro: "30" },
  { label: "RSS & Reddit sources", free: "Unlimited", pro: "Unlimited" },
  { label: "MCP connector support", free: "Included", pro: "Included" },
  { label: "Priority support", free: "\u2014", pro: "Email & chat" },
];

function CreditBar({
  label,
  used,
  total,
}: {
  label: string;
  used: number;
  total: number | null;
}) {
  const max = total ?? 0;
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const isOver = max > 0 && used >= max;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted capitalize">{label}</span>
        <span className={`font-mono ${isOver ? "text-danger" : "text-foreground"}`}>
          {used}{max > 0 ? ` / ${max}` : ""}
        </span>
      </div>
      {max > 0 && (
        <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isOver ? "bg-danger" : pct > 80 ? "bg-warning" : "bg-accent"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {max === 0 && (
        <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
          <div className="h-full rounded-full bg-muted/30" style={{ width: "100%" }} />
        </div>
      )}
    </div>
  );
}

export function Pricing() {
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (DEPLOY_MODE !== "cloud") {
      setLoading(false);
      setError(null);
      setPlan(null);
      setUsage(null);
      return;
    }
    getFullPlanInfo()
      .then((info) => {
        setPlan({ plan: info.plan, mode: info.mode, planEnforcementEnabled: info.planEnforcementEnabled, limits: info.limits, billingPortalUrl: info.billingPortalUrl });
        setUsage(info.usage);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load plan info"))
      .finally(() => setLoading(false));
  }, []);

  if (DEPLOY_MODE !== "cloud") {
    return (
      <Layout>
        <PageEmptyState message="Pricing is only available in cloud mode." />
      </Layout>
    );
  }

  const currentPlan: ColumnPlan = plan?.plan === "pro" ? "pro" : "free";
  const apiBase = getResolvedApiBaseUrl();
  const isPro = currentPlan === "pro";

  return (
    <Layout>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -top-[15%] -right-[5%] w-[60vw] h-[60vw] rounded-full"
          style={{
            background: "radial-gradient(circle, color-mix(in oklch, var(--accent) 7%, transparent) 0%, transparent 70%)",
            filter: "blur(70px)",
          }}
        />
        <div
          className="absolute bottom-[5%] -left-[8%] w-[38vw] h-[38vw] rounded-full"
          style={{
            background: "radial-gradient(circle, color-mix(in oklch, var(--accent) 4%, transparent) 0%, transparent 70%)",
            filter: "blur(90px)",
          }}
        />
      </div>

      <div className="mb-10">
        <Eyebrow>Billing</Eyebrow>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
          {loading ? "Loading\u2026" : isPro ? "You're on Pro." : "Choose your plan."}
        </h1>
        {!loading && !error && plan && (
          <p className="mt-2 text-sm leading-relaxed text-muted max-w-prose">
            {isPro
              ? "Your Pro plan includes generous monthly credits for every modality."
              : "Upgrade to Pro for unlimited workspaces and full access to image, audio, and video generation."}
          </p>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-surface p-8 space-y-6">
              <Skeleton className="h-6 w-24 rounded-lg" />
              <Skeleton className="h-10 w-32 rounded-lg" />
              {[1, 2, 3, 4, 5].map((j) => (
                <Skeleton key={j} className="h-4 w-full rounded" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
          {/* Free column */}
          <div
            className={`rounded-2xl border p-8 flex flex-col gap-6 ${
              currentPlan === "free"
                ? "border-accent/30 bg-accent/[0.03]"
                : "border-border bg-surface"
            }`}
          >
            <div>
              <Eyebrow>Free</Eyebrow>
              <div className="text-3xl font-bold text-foreground mt-2">$0</div>
              <p className="text-sm text-muted mt-1">For evaluation and light use.</p>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              {FEATURES.map((f) => (
                <div key={f.label} className="flex items-center justify-between">
                  <span className="text-muted">{f.label}</span>
                  <span className="text-foreground font-medium">{f.free}</span>
                </div>
              ))}
            </div>

            {currentPlan === "free" ? (
              <div className="mt-auto pt-4">
                <p className="text-xs text-muted text-center">You're currently on this plan.</p>
              </div>
            ) : (
              <div className="mt-auto pt-4" />
            )}
          </div>

          {/* Pro column */}
          <div
            className={`rounded-2xl border p-8 flex flex-col gap-6 ${
              currentPlan === "pro"
                ? "border-accent/30 bg-accent/[0.03]"
                : "border-border bg-surface"
            }`}
          >
            <div>
              <Eyebrow>Pro</Eyebrow>
              <div className="text-3xl font-bold text-foreground mt-2">
                $20<span className="text-base font-normal text-muted">/mo</span>
              </div>
              <p className="text-sm text-muted mt-1">For creators and teams.</p>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              {FEATURES.map((f) => (
                <div key={f.label} className="flex items-center justify-between">
                  <span className="text-muted">{f.label}</span>
                  <span className="text-foreground font-medium">{f.pro}</span>
                </div>
              ))}
            </div>

            {usage && isPro && plan?.limits && (
              <div className="border-t border-border pt-5 flex flex-col gap-4">
                <p className="text-xs font-mono tracking-wider uppercase text-muted/60">
                  This month's usage
                </p>
                <CreditBar
                  label="Image"
                  used={usage.imageCreditsUsed}
                  total={plan.limits.imageCreditsPerMonth}
                />
                <CreditBar
                  label="Audio"
                  used={usage.audioCreditsUsed}
                  total={plan.limits.audioCreditsPerMonth}
                />
                <CreditBar
                  label="Video"
                  used={usage.videoCreditsUsed}
                  total={plan.limits.videoCreditsPerMonth}
                />
              </div>
            )}

            <div className="mt-auto pt-4">
              {isPro ? (
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  onPress={() => { window.open(`${apiBase}/api/billing/portal`, "_blank", "noopener"); }}
                >
                  Manage billing
                </Button>
              ) : (
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  onPress={() => { window.open(`${apiBase}/api/billing/upgrade`, "_blank", "noopener"); }}
                >
                  Upgrade to Pro \u2014 $20/mo
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
