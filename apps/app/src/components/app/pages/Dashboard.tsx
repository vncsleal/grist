import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Layout, Spinner } from "../Layout";
import { useWorkspace } from "../WorkspaceContext";
import { DotLink, MonoLink } from "../primitives";

// ─── Styles injected once on mount ────────────────────────────────────────────

const DASH_STYLES = `
  @keyframes db-breathe {
    0%, 100% { opacity: 0.55; transform: scale(1); }
    50%       { opacity: 1;    transform: scale(1.35); }
  }
  @keyframes db-fadein {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: none; }
  }
  .db-section { animation: db-fadein 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  .db-dot     { animation: db-breathe 2.8s ease-in-out infinite; }

  .db-story-row { display:flex; align-items:flex-start; gap:1rem; padding:0.875rem 0; cursor:pointer; }
  .db-story-row:hover .db-story-title  { color: var(--foreground) !important; }
  .db-story-row:hover .db-story-action { opacity: 0.75 !important; }

  .db-cta-row { display:flex; align-items:center; justify-content:space-between; padding:0.9rem 0; cursor:pointer; }
  .db-cta-row:hover .db-cta-label { color: var(--foreground) !important; }
  .db-cta-row:hover .db-cta-arrow { opacity: 0.75 !important; }

  .db-toc-link { display:block; text-decoration:none; line-height:1.4; margin-top:0.15rem; transition:color 0.15s; }
  .db-toc-link:hover { color: var(--foreground) !important; }

  .db-draft-title { cursor:pointer; transition:color 0.15s; }
  .db-draft-title:hover { color: var(--accent) !important; }

  .db-read-bar {
    position: fixed; top: 64px; left: 0;
    height: 2px; width: 0%;
    background: var(--accent);
    opacity: 0.6;
    z-index: 9999;
    transition: width 0.08s linear;
  }

  @media (max-width: 780px) {
    .db-toc { display: none !important; }
    .db-main { padding-left: 0 !important; max-width: 100% !important; }
    .db-layout { grid-template-columns: 1fr !important; }
  }
`;

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
  return <div className="db-read-bar" style={{ width: `${pct}%` }} />;
});

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
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(activeWsId); }, [activeWsId, load]);

  // ── Inject styles once ──
  const stylesInjected = useRef(false);
  useEffect(() => {
    if (stylesInjected.current) return;
    stylesInjected.current = true;
    const el = document.createElement("style");
    el.setAttribute("data-dash", "");
    el.textContent = DASH_STYLES;
    document.head.appendChild(el);
    return () => { el.remove(); stylesInjected.current = false; };
  }, []);

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

  return (
    <Layout>
      {/* reading progress bar */}
      <ReadProgress />

      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div style={{ position: "absolute", top: "-15%", right: "-5%", width: "60vw", height: "60vw", borderRadius: "50%", background: "radial-gradient(circle, color-mix(in oklch, var(--accent) 7%, transparent) 0%, transparent 70%)", filter: "blur(70px)" }} />
        <div style={{ position: "absolute", bottom: "5%",  left:  "-8%", width: "38vw", height: "38vw", borderRadius: "50%", background: "radial-gradient(circle, color-mix(in oklch, var(--accent) 4%, transparent) 0%, transparent 70%)", filter: "blur(90px)" }} />
      </div>

      {loading ? (
        <div className="min-h-[60vh] flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        /* two-column reading layout */
        <div
          className="db-layout"
          style={{ display: "grid", gridTemplateColumns: "180px 1fr", maxWidth: 1040, margin: "0 auto", gap: 0 }}
        >
          {/* ── TOC sidebar ── */}
          <aside
            className="db-toc"
            style={{ position: "sticky", top: 64, height: "calc(100vh - 64px)", overflowY: "auto", scrollbarWidth: "none", padding: "2.5rem 1.5rem 2.5rem 0", borderRight: "1px solid var(--border)" }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.52rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--muted)", opacity: 0.5, marginBottom: "1.5rem" }}>
              In this briefing
            </div>
            {tocSections.map(({ id, n, label }) => (
              <div key={id} style={{ marginBottom: "1.35rem" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.48rem", letterSpacing: "0.1em", color: "var(--muted)", opacity: 0.4 }}>{n}</span>
                <a
                  href={`#${id}`}
                  className="db-toc-link"
                  onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                  style={{ fontFamily: "var(--font-display, serif)", fontSize: "0.82rem", fontWeight: 400, color: activeId === id ? "var(--accent)" : "var(--muted)", textDecoration: "none" }}
                >
                  {label}
                </a>
                <div style={{ width: 16, height: 1, background: "var(--border)", marginTop: "1rem" }} />
              </div>
            ))}
          </aside>

          {/* ── Main reading column ── */}
          <main
            className="db-main"
            style={{ padding: "2.5rem 0 7rem 3rem", maxWidth: 680 }}
          >

            {/* ── 01 · PROFILE ── */}
            <section id="profile" className="db-section" style={{ animationDelay: "0s" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)", opacity: 0.5, marginBottom: "1.5rem" }}>
                {fmtDate()} &middot; {fmtTime()}
              </p>

              {/* Greeting — matches reference: "Good morning,\n<name>." */}
              <h1 style={{ fontFamily: "var(--font-display, serif)", fontSize: "clamp(2.2rem, 4vw, 3.75rem)", fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.08, color: "var(--foreground)", marginBottom: "0.75rem" }}>
                {timeGreeting()},<br />
                <em style={{ fontStyle: "italic", fontWeight: 300, color: "var(--accent)" }}>
                  {firstName ? `${firstName}.` : "let's get started."}
                </em>
              </h1>

              {/* Role / industry */}
              {(profile?.role || profile?.industry) ? (
                <p style={{ fontFamily: "var(--font-display, serif)", fontStyle: "italic", fontWeight: 300, fontSize: "clamp(0.93rem, 1.4vw, 1.05rem)", color: "var(--muted)", lineHeight: 1.8, maxWidth: "56ch", marginBottom: "1rem" }}>
                  {profile?.role && <><span style={{ color: "var(--foreground)", fontWeight: 600, fontStyle: "normal" }}>{profile.role}</span></>}
                  {profile?.role && profile?.industry && " in the "}
                  {profile?.industry && <><span style={{ color: "var(--foreground)", fontWeight: 600, fontStyle: "normal" }}>{profile.industry}</span> industry</>}
                  {"."}{(profile?.platforms ?? []).length > 0 && <> Writing on <span style={{ color: "var(--foreground)", fontWeight: 600, fontStyle: "normal" }}>{profile!.platforms!.join(" · ")}</span>.</>}
                </p>
              ) : (
                <p style={{ fontFamily: "var(--font-display, serif)", fontStyle: "italic", fontWeight: 300, fontSize: "1rem", color: "var(--muted)", lineHeight: 1.8, marginBottom: "1rem" }}>
                  Your profile isn&rsquo;t set up yet.{" "}
                  <DotLink onClick={() => navigate("/profile")}>Tell me about yourself →</DotLink>
                </p>
              )}

              {/* Editorial brief */}
              <p style={{ fontFamily: "var(--font-display, serif)", fontStyle: "italic", fontWeight: 300, fontSize: "1.025rem", color: "var(--muted)", lineHeight: 1.85, maxWidth: "58ch", marginBottom: "0.75rem" }}>
                {feedCount > 0
                  ? <><span style={{ color: "var(--foreground)", fontWeight: 600, fontStyle: "normal" }}>{feedCount}</span> {feedCount === 1 ? "source" : "sources"} monitored. </>
                  : <><DotLink onClick={() => navigate("/feeds")}>Add a source</DotLink> to start surfacing ideas. </>
                }
                {pending.length > 0
                  ? <><span style={{ color: "var(--foreground)", fontWeight: 600, fontStyle: "normal" }}>{pending.length}</span> {pending.length === 1 ? "item" : "items"} in queue{topCards.length > 0 && ", top stories below"}. </>
                  : feedCount > 0 ? <>Queue is clear. </> : null
                }
                {drafts.length > 0
                  ? <><span style={{ color: "var(--foreground)", fontWeight: 600, fontStyle: "normal" }}>{drafts.length}</span> {drafts.length === 1 ? "draft" : "drafts"} waiting.</>
                  : <>No drafts yet.</>
                }
              </p>

              {/* Voice */}
              {profile?.voice && (
                <p style={{ fontFamily: "var(--font-display, serif)", fontStyle: "italic", fontWeight: 300, fontSize: "0.975rem", color: "var(--muted)", lineHeight: 1.8, maxWidth: "58ch", marginBottom: "0.5rem" }}>
                  Your voice is <span style={{ color: "var(--foreground)", fontWeight: 600, fontStyle: "normal" }}>{profile.voice}</span>.
                </p>
              )}

              {/* Goals */}
              {(profile?.contentGoals ?? []).length > 0 && (
                <p style={{ fontFamily: "var(--font-display, serif)", fontStyle: "italic", fontWeight: 300, fontSize: "0.93rem", color: "var(--muted)", lineHeight: 1.8, marginTop: "0.5rem" }}>
                  {profile!.contentGoals!.length === 1
                    ? <>Your goal is to <span style={{ color: "var(--foreground)", fontWeight: 600, fontStyle: "normal" }}>{profile!.contentGoals![0]}</span>.</>
                    : <>Your goals are{" "}
                        {profile!.contentGoals!.map((g, i, arr) => (
                          <React.Fragment key={i}>
                            <span style={{ color: "var(--foreground)", fontWeight: 600, fontStyle: "normal" }}>{g}</span>
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
                <p style={{ fontFamily: "var(--font-display, serif)", fontStyle: "italic", fontWeight: 300, fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.75, marginTop: "0.5rem" }}>
                  Workspace memory holds <span style={{ color: "var(--foreground)", fontWeight: 600, fontStyle: "normal" }}>{totalMem}</span> {totalMem === 1 ? "note" : "notes"} — voice, style, and audience.{" "}
                  <DotLink onClick={() => navigate("/memory")}>Browse →</DotLink>
                </p>
              )}

              <p style={{ marginTop: "0.9rem" }}>
                <MonoLink onClick={() => navigate("/profile")}>Edit profile →</MonoLink>
              </p>

              <SectionRule />
            </section>

            {/* ── 02 · BRIEF ── */}
            <section id="brief" className="db-section" style={{ paddingTop: "3rem", animationDelay: "0.08s" }}>
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
                <div style={{ borderTop: "1px solid var(--border)", marginBottom: "1.5rem" }}>
                  {topCards.map((card, i) => {
                    const scoreW = Math.round(Math.min(1, Math.max(0, card.score ?? 0.5)) * 100);
                    return (
                      <div
                        key={card.id}
                        className="db-story-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate("/cards")}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/cards"); }}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.56rem", color: "var(--muted)", opacity: 0.45, flexShrink: 0, width: 18, paddingTop: 2 }}>
                          0{i + 1}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="db-story-title" style={{ fontSize: "0.9375rem", lineHeight: 1.45, marginBottom: "0.2rem", color: "var(--muted)", transition: "color 0.15s" }}>
                            {card.title}
                          </div>
                          {(card.source || card.createdAt) && (
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.52rem", letterSpacing: "0.07em", color: "var(--muted)", opacity: 0.45 }}>
                              {[card.source, fmtShortDate(card.createdAt)].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "0.6rem" }}>
                          <div style={{ width: 38, height: 2, background: "var(--border)", borderRadius: 1 }}>
                            <div style={{ width: `${scoreW}%`, height: "100%", borderRadius: 1, background: "var(--accent)", opacity: 0.5 }} />
                          </div>
                          <span className="db-story-action" style={{ fontFamily: "var(--font-mono)", fontSize: "0.53rem", color: "var(--accent)", opacity: 0, transition: "opacity 0.15s" }}>
                            open →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ fontFamily: "var(--font-display, serif)", fontStyle: "italic", fontWeight: 300, fontSize: "0.925rem", color: "var(--muted)", lineHeight: 1.85, marginBottom: "1.5rem", maxWidth: "58ch" }}>
                  {feedCount > 0
                    ? "Ask Claude to fetch fresh content, or wait for your sources to update."
                    : <><DotLink onClick={() => navigate("/feeds")}>Add a source →</DotLink></>
                  }
                </p>
              )}

              {pending.length > topCards.length && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", letterSpacing: "0.1em", color: "var(--muted)", opacity: 0.5, marginBottom: "1.5rem" }}>
                  <MonoLink onClick={() => navigate("/cards")}>See all {pending.length} items in queue →</MonoLink>
                </p>
              )}

              <SectionRule />
            </section>

            {/* ── 03 · DRAFTS ── */}
            <section id="drafts" className="db-section" style={{ paddingTop: "3rem", animationDelay: "0.16s" }}>
              <SectionHead
                title={drafts.length > 0
                  ? drafts.length === 1 ? "One draft waiting." : `${drafts.length} drafts waiting.`
                  : "No drafts yet."}
                sub={drafts.length > 0
                  ? "Review and post when ready."
                  : "Generate a draft from a shortlisted card, or ask Claude to write one."}
              />

              {drafts.length > 0 ? (
                <div style={{ marginBottom: "1.5rem" }}>
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
                      <div key={draft.id} style={{ display: "grid", gridTemplateColumns: "8px 1fr", gap: "0 0.9rem", marginBottom: "1.75rem", alignItems: "start" }}>
                        <span
                          className="db-dot"
                          style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, display: "block", marginTop: "0.42rem", boxShadow: `0 0 7px ${dotColor}` }}
                        />
                        <div>
                          <div
                            className="db-draft-title"
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate("/drafts")}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/drafts"); }}
                            style={{ fontFamily: "var(--font-display, serif)", fontSize: "1.025rem", fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3 }}
                          >
                            {displayTitle}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.53rem", letterSpacing: "0.07em", color: "var(--muted)", opacity: 0.45, margin: "0.3rem 0 0.45rem" }}>
                            {[
                              draft.format,
                              wordCount ? `~${wordCount} words` : null,
                              isReady ? "ready to post" : "in progress",
                              fmtShortDate(draft.createdAt),
                            ].filter(Boolean).join(" · ")}
                          </div>
                          {preview && (
                            <p style={{ fontSize: "0.875rem", color: "var(--muted)", lineHeight: 1.6, opacity: 0.75 }}>
                              {preview}{(preview.length >= 115 ? "…" : "")}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => navigate("/drafts")}
                            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "0.57rem", letterSpacing: "0.08em", color: "var(--accent)", opacity: 0.65, padding: 0, marginTop: "0.5rem", transition: "opacity 0.15s" }}
                          >
                            {isReady ? "Open draft →" : "Finish draft →"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {drafts.length > 4 && (
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.57rem", letterSpacing: "0.1em", color: "var(--muted)", opacity: 0.45 }}>
                      <MonoLink onClick={() => navigate("/drafts")}>+ {drafts.length - 4} more in queue →</MonoLink>
                    </p>
                  )}
                </div>
              ) : (
                <p style={{ fontFamily: "var(--font-display, serif)", fontStyle: "italic", fontWeight: 300, fontSize: "0.925rem", color: "var(--muted)", lineHeight: 1.85, marginBottom: "1.5rem", maxWidth: "58ch" }}>
                  Nothing written yet. Ask Claude: <span style={{ color: "var(--foreground)", fontStyle: "normal" }}>"write a post about [topic]"</span> — or shortlist a card first.
                </p>
              )}

              <SectionRule />
            </section>

            {/* ── 04 · PULSE ── */}
            <section id="pulse" className="db-section" style={{ paddingTop: "3rem", animationDelay: "0.24s" }}>
              <SectionHead
                title="The numbers."
                sub="Everything in your current workspace at a glance."
              />

              <div style={{ display: "flex", gap: "2.5rem", flexWrap: "wrap", marginBottom: "2rem", alignItems: "flex-end" }}>
                <StatBlock n={pending.length}  label="In queue"    color="var(--accent)" />
                <StatBlock n={shortlisted}     label="Shortlisted" color="var(--success)" />
                <StatBlock n={drafts.length}   label="Drafts"      color="var(--warning)" />
                <StatBlock n={feedCount}       label="Sources"     color="color-mix(in oklch, var(--accent) 60%, var(--foreground))" />
                <StatBlock n={totalMem}        label="Memory"      color="var(--muted)" />
              </div>

              <SectionRule />
            </section>

            {/* ── 05 · NEXT ── */}
            <section id="next" className="db-section" style={{ paddingTop: "3rem", animationDelay: "0.32s" }}>
              <SectionHead
                title="Pick one."
                sub="Prioritised by likely impact this session."
              />

              <div style={{ borderTop: "1px solid var(--border)" }}>
                {ctaList.slice(0, 5).map(({ label, to }, i) => (
                  <div
                    key={i}
                    className="db-cta-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(to)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate(to); }}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <span className="db-cta-label" style={{ fontFamily: "var(--font-display, serif)", fontStyle: "italic", fontWeight: 300, fontSize: "0.95rem", color: "var(--muted)", transition: "color 0.15s" }}>
                      {label}
                    </span>
                    <span className="db-cta-arrow" style={{ fontFamily: "var(--font-mono)", fontSize: "0.57rem", color: "var(--accent)", opacity: 0, transition: "opacity 0.15s", flexShrink: 0, marginLeft: "1rem" }}>
                      open →
                    </span>
                  </div>
                ))}
              </div>
            </section>

          </main>
        </div>
      )}
    </Layout>
  );
}

// ─── Section primitives ────────────────────────────────────────────────────────

function SectionRule() {
  return (
    <div style={{ height: 1, background: "linear-gradient(to right, var(--border), transparent 80%)", marginTop: "3rem" }} />
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: "1.75rem" }}>
      <h2 style={{ fontFamily: "var(--font-display, serif)", fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, color: "var(--foreground)", marginBottom: sub ? "0.35rem" : 0 }}>
        {title}
      </h2>
      {sub && (
        <p style={{ fontSize: "0.875rem", color: "var(--muted)", lineHeight: 1.6 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function StatBlock({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
      <span style={{ fontFamily: "var(--font-display, serif)", fontSize: "2.25rem", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color }}>
        {n}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.53rem", letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--muted)", opacity: 0.55 }}>
        {label}
      </span>
    </div>
  );
}



