import type { SmFixture } from "./client";

type MatchBucket = "upcoming" | "live" | "completed";

/** Persisted `matches.status` including post-match review. */
export type DbMatchStatus = "upcoming" | "live" | "completed" | "in_review";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Raw SportMonks `fixture.status` for UI (unchanged casing preferred from API). */
export function smFixtureStatusLabel(f: SmFixture): string | null {
  const t = f.status?.trim();
  return t ? t : null;
}

function isCompletedStatus(s: string): boolean {
  return (
    s.includes("finished") ||
    s.includes("completed") ||
    s.includes("aban") ||
    s.includes("abandon") ||
    s.includes("cancl") ||
    s.includes("cancel")
  );
}

/**
 * Not started, scheduling issues — show under Upcoming tab.
 * (SportMonks: NS, Delayed, Postp., scheduled, etc.)
 */
function isUpcomingStatus(s: string): boolean {
  if (!s) return false;
  if (s === "ns") return true;
  if (s.includes("not started")) return true;
  if (s.includes("scheduled")) return true;
  if (s === "pre" || s === "preliminary") return true;
  if (s.includes("delayed")) return true;
  if (s.startsWith("postp") || s.includes("postponed")) return true;
  return false;
}

/**
 * In play or between sessions — show under Live tab.
 * @see https://docs.sportmonks.com/cricket/statuses-and-definitions
 */
function isLiveStatus(s: string): boolean {
  if (!s) return false;
  if (s.includes("live") && !s.includes("delivered")) return true;
  if (/\d+(st|nd|rd|th)\b/.test(s) && s.includes("inning")) return true;
  if (s.includes("inning") && !s.includes("not started")) return true;
  if (s.includes("stump")) return true;
  if (s.includes("innings break")) return true;
  if (s.includes("tea break") || s === "tea") return true;
  if (s.includes("lunch")) return true;
  if (s.includes("dinner")) return true;
  if (s === "int." || s === "int" || s.includes("interrupt")) return true;
  return false;
}

/**
 * Map SportMonks fixture → app `matches.status` enum (`upcoming` | `live` | `completed`).
 *
 * Priority:
 * 1. Explicit **completed** (Finished, Abandoned, Cancelled, …)
 * 2. Explicit **upcoming** (NS, Delayed, Postponed, …) — overrides misleading `live: 1`
 * 3. Explicit **live** (innings, breaks, interrupted, …) or `live` flag
 * 4. Start time fallback
 */
export function mapMatchStatusFromSmFixture(f: SmFixture): MatchBucket {
  const s = norm(f.status ?? "");

  if (isCompletedStatus(s)) {
    return "completed";
  }

  if (isUpcomingStatus(s)) {
    return "upcoming";
  }

  if (isLiveStatus(s)) {
    return "live";
  }

  const live = f.live;
  if (live === true || live === 1) {
    return "live";
  }

  const startMs = f.starting_at ? Date.parse(f.starting_at) : NaN;
  const now = Date.now();
  const startsInFuture = Number.isFinite(startMs) && startMs > now;

  if (startsInFuture) {
    return "upcoming";
  }

  return "upcoming";
}

/**
 * Map SportMonks + previous DB row → next `matches.status` during live pipeline.
 * Live → provider finished becomes `in_review` (not `completed`) until finalize.
 */
export function resolveDbStatusAfterLiveTick(
  previous: DbMatchStatus,
  f: SmFixture,
): { status: DbMatchStatus; setMatchFinishedAt: boolean } {
  const sm = mapMatchStatusFromSmFixture(f);

  if (previous === "in_review") {
    return { status: "in_review", setMatchFinishedAt: false };
  }

  if (previous === "live" && sm === "completed") {
    return { status: "in_review", setMatchFinishedAt: true };
  }

  if (sm === "completed") {
    return { status: "completed", setMatchFinishedAt: false };
  }
  if (sm === "live") {
    return { status: "live", setMatchFinishedAt: false };
  }
  return { status: "upcoming", setMatchFinishedAt: false };
}
