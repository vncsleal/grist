/**
 * Feedback storage + pattern extraction for GRIST's reinforcement loop.
 *
 * Every time the user rates a card or a post, a FeedbackRecord is appended to
 * config/feedback.json.  getPreferredPatterns() aggregates those records into
 * a PreferredPatterns object that the Sampling call sites inject into their
 * prompts — biasing future scoring toward topics/angles that historically scored
 * high and away from what repeatedly scored low.
 *
 * Posts rated ≥ 4 are also auto-promoted to voiceExamples in the user context
 * by the grist_rate_post handler, closing the voice-learning loop without any
 * explicit user action.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedbackRecord {
  id: string;
  timestamp: string;
  type: "card" | "post";
  rating: number; // 1–5
  cardId?: number;
  platform?: string;
  /** Full post text — stored only when type === "post" */
  postContent?: string;
  whatWorked?: string;
  whatDidntWork?: string;
  /** From the card at rating time */
  trendTags?: string[];
  usedAngle?: string;
  usedHook?: string;
  /** User's topics at rating time — snapshot so patterns survive context changes */
  topics?: string[];
}

export interface PreferredPatterns {
  /** Topics that appear most often in high-rated (≥4) records */
  topics: string[];
  /** Trend tags that appear most often in high-rated records */
  trendTags: string[];
  /** Specific angles that scored high (from usedAngle field) */
  angles: string[];
  /** Specific hooks that scored high (from usedHook field) */
  hooks: string[];
  /** Post content from records rated ≥4, newest/highest first, capped at 10 */
  voiceExamples: string[];
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const FEEDBACK_PATH = path.join("config", "feedback.json");

export function loadFeedback(): FeedbackRecord[] {
  try {
    if (!fs.existsSync(FEEDBACK_PATH)) return [];
    return JSON.parse(fs.readFileSync(FEEDBACK_PATH, "utf8")) as FeedbackRecord[];
  } catch {
    return [];
  }
}

export function appendFeedback(record: FeedbackRecord): void {
  const existing = loadFeedback();
  existing.push(record);
  fs.mkdirSync(path.dirname(FEEDBACK_PATH), { recursive: true });
  fs.writeFileSync(FEEDBACK_PATH, JSON.stringify(existing, null, 2));
}

// ─── Pattern extraction ───────────────────────────────────────────────────────

function countOccurrences(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const item of items) m.set(item, (m.get(item) ?? 0) + 1);
  return m;
}

function topByCount(m: Map<string, number>, n: number): string[] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

/**
 * Aggregate high-rated feedback records into actionable preferred patterns.
 * Only records with rating >= 4 contribute to the signal.
 */
export function getPreferredPatterns(feedback: FeedbackRecord[]): PreferredPatterns {
  const highRated = feedback.filter((r) => r.rating >= 4);

  const topics = topByCount(
    countOccurrences(highRated.flatMap((r) => r.topics ?? [])),
    8,
  );
  const trendTags = topByCount(
    countOccurrences(highRated.flatMap((r) => r.trendTags ?? [])),
    10,
  );
  const angles = topByCount(
    countOccurrences(highRated.filter((r) => r.usedAngle).map((r) => r.usedAngle!)),
    5,
  );
  const hooks = topByCount(
    countOccurrences(highRated.filter((r) => r.usedHook).map((r) => r.usedHook!)),
    5,
  );

  // Post-type records with content, sorted by rating desc then recency desc
  const voiceExamples = highRated
    .filter((r) => r.type === "post" && !!r.postContent)
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, 10)
    .map((r) => r.postContent!);

  return { topics, trendTags, angles, hooks, voiceExamples };
}

// ─── Summary for grist_feedback_stats ────────────────────────────────────────

export function feedbackSummary(feedback: FeedbackRecord[]): Record<string, unknown> {
  const total = feedback.length;
  const postsRated = feedback.filter((r) => r.type === "post").length;
  const cardsRated = feedback.filter((r) => r.type === "card").length;
  const avgRating =
    total > 0
      ? +(feedback.reduce((s: number, r) => s + r.rating, 0) / total).toFixed(1)
      : null;
  const byRating = [1, 2, 3, 4, 5].map((r) => ({
    rating: r,
    count: feedback.filter((f) => f.rating === r).length,
  }));
  const preferredPatterns = getPreferredPatterns(feedback);
  return { total, avgRating, postsRated, cardsRated, byRating, preferredPatterns };
}
