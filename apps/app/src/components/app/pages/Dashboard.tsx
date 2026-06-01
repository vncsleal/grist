import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Separator } from "@heroui/react/separator";
import { Button } from "@heroui/react/button";
import { Skeleton } from "@heroui/react/skeleton";
import { Alert } from "@heroui/react/alert";
import {
  getProfile,
  listCards,
  listDrafts,
  listFeeds,
  getMemory,
  type UserContextData,
  type Card,
  type Draft,
  type MemoryBuckets,
} from "../api";
import { Layout } from "../Layout";
import { useWorkspace } from "../WorkspaceContext";
import { DotLink, MonoLink } from "../primitives";

// ─── Time helpers ──────────────────────────────────────────────────────────────

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function fmtDate() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function fmtTime() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtShortDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Reading progress bar (memoized for scroll perf) ──────────────────────────

const ReadProgress = React.memo(function ReadProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (total > 0) setPct(Math.min(100, Math.round((window.scrollY / total) * 100)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      className="fixed top-16 left-0 h-0.5 z-50 bg-accent/60"
      style={{ width: `${pct}%` }}
    />
  );
});

// ─── Section-level fade-in animation ──────────────────────────────────────────

function useMountFadeIn() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return mounted;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate();
  const { activeWsId } = useWorkspace();

  const [profile, setProfile]   = useState<UserContextData | null>(null);
  const [cards, setCards]       = useState<Card[]>([]);
  const [drafts, setDrafts]     = useState<Draft[]>([]);
  const [feeds, setFeeds]       = useState<string[]>([]);
  const [memory, setMemory]     = useState<MemoryBuckets | null>(null);
  const [loading, setLoading]   = useState(true);
  const [activeId, setActiveId] = useState("profile");

  // ── Data load ──
  const load = useCallback(async (wsId?: string) => {
    setLoading(true);
    try {
      const empty: MemoryBuckets = {
        voiceExamples: [],
        styleRules: [],
        audienceInsights: [],
        doNotSay: [],
        successfulPosts: [],
        campaignContext: [],
        sourcePreferences: [],
        visualStyle: [],
        voiceProfile: [],
      };
      const [p, c, d, f, m] = await Promise.all([
        getProfile(),
        listCards(wsId).catch((): Card[] => []),
        listDrafts(wsId).catch((): Draft[] => []),
        listFeeds(wsId).catch((): string[] => []),
        getMemory(wsId).catch((): MemoryBuckets => empty),
      ]);
      setProfile(p);
      setCards(c);
      setDrafts(d);
      setFeeds(f);
      setMemory(m);
    } catch (err) {
      console.error("Dashboard failed to load:", err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(activeWsId); }, [activeWsId, load]);

  // ── TOC highlighting ──
  useEffect(() => {
    if (loading) return;
    const ids = ["profile", "brief", "drafts", "pulse", "next"];
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) { if (e.isIntersecting) setActiveId(e.target.id); }
      },
      { rootMargin: "-35% 0px -55% 0px" },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [loading]);

  // ── Mount animation ──
  const animate = useMountFadeIn();

  // ── Derived data ──
  const firstName   = profile?.name?.split(" ")[0] ?? profile?.name;
  const pending     = cards.filter((c) => !c.curationStatus || c.curationStatus === "pending");
  const shortlisted = cards.filter((c) => c.curationStatus === "shortlisted").length;
  const feedCount   = feeds.length;
  const totalMem    = memory ? Object.values(memory).reduce((s, a) => s + a.length, 0) : 0;

  const topCards = [...pending]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);

  const ctaList: { label: string; to: string }[] = [];
  if (drafts.length > 0)    ctaList.push({ label: "Review and post your latest draft", to: "/drafts" });
  if (shortlisted > 0)      ctaList.push({ label: `Turn ${shortlisted === 1 ? "your shortlisted idea" : `${shortlisted} shortlisted ideas`} into a draft`, to: "/drafts" });
  if (pending.length > 0)   ctaList.push({ label: "Work through your reading queue", to: "/cards" });
  if (feedCount === 0)      ctaList.push({ label: "Add your first source", to: "/feeds" });
  else                      ctaList.push({ label: "Manage your content sources", to: "/feeds" });
  if (!profile?.voice)      ctaList.push({ label: "Complete your voice profile", to: "/profile" });
  if (totalMem > 0)         ctaList.push({ label: "Browse workspace memory", to: "/memory" });

  const tocSections = [
    { id: "profile", n: "01", label: "Who you are" },
    { id: "brief",   n: "02", label: "Today's brief" },
    { id: "drafts",  n: "03", label: "Drafts in queue" },
    { id: "pulse",   n: "04", label: "Workspace pulse" },
    { id: "next",    n: "05", label: "What to do next" },
  ];

  const fadeInClasses = `transition-all duration-500 ease-out ${
    animate ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2.5"
  }`;

  return (
    <Layout>
      {/* reading progress bar */}
      <ReadProgress />

      {/* ambient glow */}
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

      {loading ? (
        <div className="min-h-[60vh] flex flex-col gap-4 p-10 max-w-[1040px] mx-auto">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-8 w-64 rounded" />
          <Skeleton className="h-4 w-96 rounded" />
          <div className="mt-8 space-y-3">
            <Skeleton className="h-3 w-32 rounded" />
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        </div>
      ) : (
        <>
        {/* Setup banner — shown when profile is incomplete */}
        {(!profile?.name || !profile?.voice) && !loading && (
          <div className="max-w-[1040px] mx-auto mb-6">
            <Alert status="accent">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Complete your setup</Alert.Title>
                <Alert.Description>
                  Tell Quillby about yourself — your name, role, voice, and topics — so every
                  story and draft is tailored to you.{" "}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="underline underline-offset-3 decoration-accent/40 h-auto min-w-0 p-0"
                    onPress={() => navigate("/onboarding")}
                  >
                    Finish setup
                  </Button>
                </Alert.Description>
              </Alert.Content>
            </Alert>
          </div>
        )}

        {/* two-column reading layout */}
        <div className="grid grid-cols-[180px_1fr] max-md:grid-cols-1 max-w-[1040px] mx-auto gap-0">
          {/* ── TOC sidebar ── */}
          <aside className="sticky top-16 h-[calc(100vh-64px)] overflow-y-auto [scrollbar-width:none] py-10 pl-6 pr-0 border-r border-border max-md:hidden">
            <div className="font-mono text-xs tracking-widest uppercase text-muted/50 mb-6">
              In this briefing
            </div>
            {tocSections.map(({ id, n, label }) => (
              <div key={id} className="mb-5">
                <span className="font-mono text-[10px] tracking-wider text-muted/40">{n}</span>
                <a
                  href={`#${id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`block text-sm font-normal no-underline leading-snug mt-0.5 transition-colors duration-150 hover:text-foreground ${
                    activeId === id ? "text-accent" : "text-muted"
                  }`}
                >
                  {label}
                </a>
                <div className="w-4 h-px bg-border mt-4" />
              </div>
            ))}
          </aside>

          {/* ── Main reading column ── */}
          <main className="py-10 pb-28 pl-12 max-w-[680px] max-md:pl-0 max-md:max-w-full">

            {/* ── 01 · PROFILE ── */}
            <section
              id="profile"
              className={fadeInClasses}
              style={{ transitionDelay: "0s" }}
            >
              <p className="font-mono text-xs tracking-wide uppercase text-muted/50 mb-6">
                {fmtDate()} &middot; {fmtTime()}
              </p>

              {/* Greeting */}
              <h1 className=" text-4xl md:text-5xl font-bold tracking-tight leading-tight text-foreground mb-3">
                {timeGreeting()},<br />
                <em className="italic font-light text-accent">
                  {firstName ? `${firstName}.` : "let's get started."}
                </em>
              </h1>

              {/* Role / industry */}
              {(profile?.role || profile?.industry) ? (
                <p className=" italic font-light text-base md:text-lg text-muted leading-relaxed max-w-prose mb-4">
                  {profile?.role && <><span className="text-foreground font-semibold not-italic">{profile.role}</span></>}
                  {profile?.role && profile?.industry && " in the "}
                  {profile?.industry && <><span className="text-foreground font-semibold not-italic">{profile.industry}</span> industry</>}
                  {"."}{(profile?.platforms ?? []).length > 0 && <> Writing on <span className="text-foreground font-semibold not-italic">{profile!.platforms!.join(" · ")}</span>.</>}
                </p>
              ) : (
                <p className=" italic font-light text-base text-muted leading-relaxed mb-4">
                  Your profile isn&rsquo;t set up yet.{" "}
                  <DotLink onClick={() => navigate("/profile")}>Tell me about yourself →</DotLink>
                </p>
              )}

              {/* Editorial brief */}
              <p className=" italic font-light text-base text-muted leading-relaxed max-w-prose mb-3">
                {feedCount > 0
                  ? <><span className="text-foreground font-semibold not-italic">{feedCount}</span> {feedCount === 1 ? "source" : "sources"} monitored. </>
                  : <><DotLink onClick={() => navigate("/feeds")}>Add a source</DotLink> to start surfacing ideas. </>
                }
                {pending.length > 0
                  ? <><span className="text-foreground font-semibold not-italic">{pending.length}</span> {pending.length === 1 ? "item" : "items"} in queue{topCards.length > 0 && ", top stories below"}. </>
                  : feedCount > 0 ? <>Queue is clear. </> : null
                }
                {drafts.length > 0
                  ? <><span className="text-foreground font-semibold not-italic">{drafts.length}</span> {drafts.length === 1 ? "draft" : "drafts"} waiting.</>
                  : <>No drafts yet.</>
                }
              </p>

              {/* Voice */}
              {profile?.voice && (
                <p className=" italic font-light text-sm text-muted leading-relaxed max-w-prose mb-2">
                  Your voice is <span className="text-foreground font-semibold not-italic">{profile.voice}</span>.
                </p>
              )}

              {/* Goals */}
              {(profile?.contentGoals ?? []).length > 0 && (
                <p className=" italic font-light text-sm text-muted leading-relaxed mt-2">
                  {profile!.contentGoals!.length === 1
                    ? <>Your goal is to <span className="text-foreground font-semibold not-italic">{profile!.contentGoals![0]}</span>.</>
                    : <>Your goals are{" "}
                        {profile!.contentGoals!.map((g, i, arr) => (
                          <React.Fragment key={i}>
                            <span className="text-foreground font-semibold not-italic">{g}</span>
                            {i < arr.length - 2 && ", "}
                            {i === arr.length - 2 && " and "}
                          </React.Fragment>
                        ))}.
                      </>
                  }
                </p>
              )}

              {/* Memory note */}
              {totalMem > 0 && (
                <p className=" italic font-light text-sm text-muted leading-relaxed mt-2">
                  Workspace memory holds <span className="text-foreground font-semibold not-italic">{totalMem}</span> {totalMem === 1 ? "note" : "notes"} — voice, style, and audience.{" "}
                  <DotLink onClick={() => navigate("/memory")}>Browse →</DotLink>
                </p>
              )}

              <p className="mt-3">
                <MonoLink onClick={() => navigate("/profile")}>Edit profile →</MonoLink>
              </p>

              <SectionRule />
            </section>

            {/* ── 02 · BRIEF ── */}
            <section
              id="brief"
              className={`pt-12 ${fadeInClasses}`}
              style={{ transitionDelay: "0.08s" }}
            >
              <SectionHead
                title={topCards.length > 0
                  ? `${topCards.length === 1 ? "One story" : `${topCards.length} stories`} from ${pending.length} items.`
                  : "Reading queue"}
                sub={topCards.length > 0
                  ? "Ranked by relevance to your profile and voice."
                  : feedCount === 0
                    ? "Add sources to start seeing stories here."
                    : "Nothing pending right now — you're caught up."}
              />

              {topCards.length > 0 ? (
                <div className="border-t border-border mb-6">
                  {topCards.map((card, i) => {
                    const scoreW = Math.round(Math.min(1, Math.max(0, card.score ?? 0.5)) * 100);
                    return (
                      <div
                        key={card.id}
                        className="group/db-story flex items-start gap-4 py-3.5 cursor-pointer border-b border-border"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate("/cards")}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/cards"); }}
                      >
                        <span className="font-mono text-xs text-muted/45 shrink-0 w-[18px] pt-0.5">
                          0{i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm leading-normal mb-0.5 text-muted transition-colors duration-150 group-hover/db-story:text-foreground">
                            {card.title}
                          </div>
                          {(card.source || card.createdAt) && (
                            <div className="font-mono text-xs tracking-wider text-muted/45">
                              {[card.source, fmtShortDate(card.createdAt)].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <div className="w-[38px] h-0.5 bg-border rounded-sm">
                            <div
                              className="h-full rounded-sm bg-accent/50"
                              style={{ width: `${scoreW}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-accent opacity-0 transition-opacity duration-150 group-hover/db-story:opacity-75">
                            open →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className=" italic font-light text-sm text-muted leading-relaxed mb-6 max-w-prose">
                  {feedCount > 0
                    ? "Ask Claude to fetch fresh content, or wait for your sources to update."
                    : <><DotLink onClick={() => navigate("/feeds")}>Add a source →</DotLink></>
                  }
                </p>
              )}

              {pending.length > topCards.length && (
                <p className="font-mono text-xs tracking-wider text-muted/50 mb-6">
                  <MonoLink onClick={() => navigate("/cards")}>See all {pending.length} items in queue →</MonoLink>
                </p>
              )}

              <SectionRule />
            </section>

            {/* ── 03 · DRAFTS ── */}
            <section
              id="drafts"
              className={`pt-12 ${fadeInClasses}`}
              style={{ transitionDelay: "0.16s" }}
            >
              <SectionHead
                title={drafts.length > 0
                  ? drafts.length === 1 ? "One draft waiting." : `${drafts.length} drafts waiting.`
                  : "No drafts yet."}
                sub={drafts.length > 0
                  ? "Review and post when ready."
                  : "Generate a draft from a shortlisted card, or ask Claude to write one."}
              />

              {drafts.length > 0 ? (
                <div className="mb-6">
                  {drafts.slice(0, 4).map((draft, i) => {
                    const isReady  = i === 0;
                    const dotColor = isReady ? "var(--success)" : "var(--warning)";
                    const wordCount = draft.content
                      ? Math.round(draft.content.trim().split(/\s+/).length)
                      : null;
                    const preview = draft.content
                      ? draft.content.replace(/^#+\s*/gm, "").trim().slice(0, 115)
                      : null;
                    const displayTitle = draft.title
                      ?? (draft.content ? `"${draft.content.replace(/^#+\s*/, "").slice(0, 55).trim()}…"` : "Untitled draft");

                    return (
                      <div key={draft.id} className="grid grid-cols-[8px_1fr] gap-x-3 mb-6 items-start">
                        <span
                          className="block w-2 h-2 rounded-full mt-1.5 animate-pulse"
                          style={{ background: dotColor, boxShadow: `0 0 7px ${dotColor}` }}
                        />
                        <div>
                          <div
                            className=" text-base font-semibold text-foreground leading-snug cursor-pointer transition-colors duration-150 hover:text-accent"
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate("/drafts")}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/drafts"); }}
                          >
                            {displayTitle}
                          </div>
                          <div className="font-mono text-xs tracking-wider text-muted/45 my-1">
                            {[
                              draft.format,
                              wordCount ? `~${wordCount} words` : null,
                              isReady ? "ready to post" : "in progress",
                              fmtShortDate(draft.createdAt),
                            ].filter(Boolean).join(" · ")}
                          </div>
                          {preview && (
                            <p className="text-sm text-muted/75 leading-relaxed">
                              {preview}{(preview.length >= 115 ? "…" : "")}
                            </p>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="font-mono text-xs tracking-wider text-accent/65 p-0 h-auto min-w-0 mt-2"
                            onPress={() => navigate("/drafts")}
                          >
                            {isReady ? "Open draft →" : "Finish draft →"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {drafts.length > 4 && (
                    <p className="font-mono text-xs tracking-wider text-muted/45">
                      <MonoLink onClick={() => navigate("/drafts")}>+ {drafts.length - 4} more in queue →</MonoLink>
                    </p>
                  )}
                </div>
              ) : (
                <p className=" italic font-light text-sm text-muted leading-relaxed mb-6 max-w-prose">
                  Nothing written yet. Ask Claude: <span className="text-foreground not-italic">"write a post about [topic]"</span> — or shortlist a card first.
                </p>
              )}

              <SectionRule />
            </section>

            {/* ── 04 · PULSE ── */}
            <section
              id="pulse"
              className={`pt-12 ${fadeInClasses}`}
              style={{ transitionDelay: "0.24s" }}
            >
              <SectionHead
                title="The numbers."
                sub="Everything in your current workspace at a glance."
              />

              <div className="flex gap-10 flex-wrap mb-8 items-end">
                <StatBlock n={pending.length}  label="In queue"    color="var(--accent)" />
                <StatBlock n={shortlisted}     label="Shortlisted" color="var(--success)" />
                <StatBlock n={drafts.length}   label="Drafts"      color="var(--warning)" />
                <StatBlock n={feedCount}       label="Sources"     color="color-mix(in oklch, var(--accent) 60%, var(--foreground))" />
                <StatBlock n={totalMem}        label="Memory"      color="var(--muted)" />
              </div>

              <SectionRule />
            </section>

            {/* ── 05 · NEXT ── */}
            <section
              id="next"
              className={`pt-12 ${fadeInClasses}`}
              style={{ transitionDelay: "0.32s" }}
            >
              <SectionHead
                title="Pick one."
                sub="Prioritised by likely impact this session."
              />

              <div className="border-t border-border">
                {ctaList.slice(0, 5).map(({ label, to }, i) => (
                  <div
                    key={i}
                    className="group/db-cta flex items-center justify-between py-3 cursor-pointer border-b border-border"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(to)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate(to); }}
                  >
                    <span className=" italic font-light text-sm text-muted transition-colors duration-150 group-hover/db-cta:text-foreground">
                      {label}
                    </span>
                    <span className="font-mono text-xs text-accent opacity-0 transition-opacity duration-150 group-hover/db-cta:opacity-75 shrink-0 ml-4">
                      open →
                    </span>
                  </div>
                ))}
              </div>
            </section>

          </main>
        </div>
        </>
      )}
    </Layout>
  );
}

// ─── Section primitives ────────────────────────────────────────────────────────

function SectionRule() {
  return <Separator variant="tertiary" className="mt-12" />;
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h2 className=" text-2xl font-bold tracking-tight leading-snug text-foreground">
        {title}
      </h2>
      {sub && (
        <p className="text-sm text-muted leading-relaxed">{sub}</p>
      )}
    </div>
  );
}

function StatBlock({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className=" text-4xl font-extrabold tracking-tight leading-none"
        style={{ color }}
      >
        {n}
      </span>
      <span className="font-mono text-xs tracking-wider uppercase text-muted/55">
        {label}
      </span>
    </div>
  );
}
