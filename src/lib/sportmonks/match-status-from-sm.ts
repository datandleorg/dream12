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

/** Readable chip label for common SM abbreviations; `null` if no mapping. */
export function smFixtureStatusDisplayLabel(
  raw: string | null | undefined,
): string | null {
  const original = raw?.trim() || "";
  if (!original) return null;
  const s = norm(original);
  if (s === "int." || s === "int" || s.includes("interrupt")) {
    return "Interrupted";
  }
  if (s.includes("aban") || s.includes("abandon")) {
    return "Abandoned";
  }
  if (s.includes("delayed")) {
    return "Delayed";
  }
  if (s.includes("cancl") || s.includes("cancel")) {
    return "Cancelled";
  }
  return null;
}

/** UI hint for coloring SportMonks `fixture.status` chips (substring rules aligned with mapping above). */
export type SmFixtureStatusUiTone =
  | "cancelled"
  | "completed"
  | "break"
  | "interrupted"
  | "delayed"
  | "live"
  | "upcoming";

export function smFixtureStatusUiTone(
  raw: string | null | undefined,
): SmFixtureStatusUiTone {
  const s = norm(raw ?? "");
  if (!s) return "upcoming";
  if (
    s.includes("cancl") ||
    s.includes("cancel") ||
    s.includes("aban") ||
    s.includes("abandon")
  ) {
    return "cancelled";
  }
  if (s.includes("finished") || s.includes("completed")) {
    return "completed";
  }
  if (
    s.includes("tea break") ||
    s === "tea" ||
    s.includes("lunch") ||
    s.includes("dinner") ||
    s.includes("innings break")
  ) {
    return "break";
  }
  if (s === "int." || s === "int" || s.includes("interrupt")) {
    return "interrupted";
  }
  if (s.includes("delayed")) {
    return "delayed";
  }
  if (isUpcomingStatus(s)) {
    return "upcoming";
  }
  if (isLiveStatus(s)) {
    return "live";
  }
  return "upcoming";
}

/**
 * Match cards (home / contest): center shows "Match in progress" when SM tone is in-play;
 * otherwise only `sm_fixture_note` when set — status stays on the fixture badge only.
 */
export function matchCardLiveCenterLine(
  smFixtureStatus: string | null | undefined,
  smFixtureNote: string | null | undefined,
): { text: string; tone: SmFixtureStatusUiTone } | null {
  const tone = smFixtureStatusUiTone(smFixtureStatus);
  const note = smFixtureNote?.trim() || null;
  if (tone === "live") {
    return { text: "Match in progress", tone: "live" };
  }
  if (note) return { text: note, tone };
  return null;
}
