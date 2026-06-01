import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { TextArea } from "@heroui/react/textarea";
import { Alert } from "@heroui/react/alert";
import { updateProfile, addFeed } from "../api";
import { useWorkspace } from "../WorkspaceContext";

const PLATFORM_OPTIONS = ["linkedin", "x", "threads", "instagram", "newsletter", "blog", "medium"];

const STEPS = [
  { n: 1, label: "Profile" },
  { n: 2, label: "Voice & goals" },
  { n: 3, label: "Your first source" },
];

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.n}>
          {i > 0 && <div className="w-6 h-px bg-border" />}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${
              step === s.n
                ? "bg-accent/15 text-accent border border-accent/30"
                : step > s.n
                  ? "bg-success/10 text-success border border-success/20"
                  : "bg-surface text-muted border border-border"
            }`}
          >
            <span>{step > s.n ? "\u2713" : s.n}</span>
            <span className="hidden sm:inline">{s.label}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export function Onboarding() {
  const navigate = useNavigate();
  const { activeWsId } = useWorkspace();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Profile
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [industry, setIndustry] = useState("");

  // Step 2: Voice, goals, audience
  const [voice, setVoice] = useState("");
  const [audienceDescription, setAudienceDescription] = useState("");
  const [topics, setTopics] = useState("");
  const [contentGoals, setContentGoals] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);

  // Step 3: Feed URL
  const [feedUrl, setFeedUrl] = useState("");

  function canProceedStep1(): boolean {
    return name.trim().length > 0;
  }

  async function handleFinish() {
    setError(null);
    setSaving(true);
    try {
      // Save profile
      await updateProfile({
        name: name.trim() || undefined,
        role: role.trim() || undefined,
        industry: industry.trim() || undefined,
        voice: voice.trim() || undefined,
        audienceDescription: audienceDescription.trim() || undefined,
        topics: topics.trim() ? topics.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        contentGoals: contentGoals.trim() ? contentGoals.split(",").map((g) => g.trim()).filter(Boolean) : undefined,
        platforms: platforms.length > 0 ? platforms : undefined,
      });

      // Optionally add a feed
      if (feedUrl.trim()) {
        try {
          new URL(feedUrl.trim());
          await addFeed(feedUrl.trim(), activeWsId);
        } catch {
          // Invalid URL — silently skip; user can add sources later
        }
      }

      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  function togglePlatform(p: string) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 h-16 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <img src="/quillby-logo.png" alt="Quillby" className="w-[30px] h-[30px] object-contain" />
          <span className="text-[1.2rem] font-bold tracking-tight text-foreground font-display">
            Quillby
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
          onPress={() => navigate("/dashboard")}
        >
          Skip setup
        </Button>
      </nav>

      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -top-[15%] -right-[5%] w-[60vw] h-[60vw] rounded-full"
          style={{
            background: "radial-gradient(circle, color-mix(in oklch, var(--accent) 7%, transparent) 0%, transparent 70%)",
            filter: "blur(70px)",
          }}
        />
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          {/* Step indicator */}
          <StepIndicator step={step} />

          {/* Error */}
          {error && (
            <Alert status="danger" className="mb-6">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Tell me about yourself.
                </h1>
                <p className="text-sm text-muted mt-1">
                  This helps me tailor content to your voice and audience.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Your name *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Rivera"
                    onKeyDown={(e) => { if (e.key === "Enter" && canProceedStep1()) setStep(2); }}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Your role</label>
                  <Input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Marketing Director"
                    onKeyDown={(e) => { if (e.key === "Enter" && canProceedStep1()) setStep(2); }}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Your industry</label>
                  <Input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. SaaS"
                    onKeyDown={(e) => { if (e.key === "Enter" && canProceedStep1()) setStep(2); }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="primary"
                  isDisabled={!canProceedStep1()}
                  onPress={() => setStep(2)}
                >
                  Next step
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                  onPress={() => setStep(2)}
                >
                  Skip
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Describe your voice.
                </h1>
                <p className="text-sm text-muted mt-1">
                  What tone, topics, and goals define your content?
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Voice & style</label>
                  <TextArea
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    placeholder="e.g. Direct, analytical, no corporate speak\u2026"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Audience</label>
                  <TextArea
                    value={audienceDescription}
                    onChange={(e) => setAudienceDescription(e.target.value)}
                    placeholder="e.g. CTOs and technical leads at mid-size B2B companies"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    Topics <span className="text-muted">(comma separated)</span>
                  </label>
                  <Input
                    value={topics}
                    onChange={(e) => setTopics(e.target.value)}
                    placeholder="e.g. AI, product management, leadership"
                    onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Content goals</label>
                  <Input
                    value={contentGoals}
                    onChange={(e) => setContentGoals(e.target.value)}
                    placeholder="e.g. thought leadership, lead gen (comma separated)"
                    onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Platforms</label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORM_OPTIONS.map((p) => {
                      const active = platforms.includes(p);
                      return (
                        <Button
                          key={p}
                          variant={active ? "primary" : "ghost"}
                          size="sm"
                          onPress={() => togglePlatform(p)}
                        >
                          {!active && <span className="text-xs mr-0.5 opacity-70">+</span>}
                          {p}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="primary"
                  onPress={() => setStep(3)}
                >
                  Next step
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                  onPress={() => setStep(3)}
                >
                  Skip
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                  onPress={() => setStep(1)}
                >
                  Back
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Add your first source.
                </h1>
                <p className="text-sm text-muted mt-1">
                  Quillby will monitor this feed and surface relevant stories.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    RSS or Reddit URL <span className="text-muted">(optional)</span>
                  </label>
                  <Input
                    value={feedUrl}
                    onChange={(e) => setFeedUrl(e.target.value)}
                    placeholder="https://example.com/feed.xml or reddit://r/subreddit"
                    onKeyDown={(e) => { if (e.key === "Enter") void handleFinish(); }}
                  />
                </div>
                <p className="text-xs text-muted">
                  You can always add or remove sources later in Feeds.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="primary"
                  isDisabled={saving}
                  onPress={() => void handleFinish()}
                >
                  {saving ? "Saving\u2026" : "Complete setup"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                  isDisabled={saving}
                  onPress={() => void handleFinish()}
                >
                  Skip
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                  isDisabled={saving}
                  onPress={() => setStep(2)}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
