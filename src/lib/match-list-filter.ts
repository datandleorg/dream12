/** Shared match list tab filter — safe for server and client (no "use client"). */

export type MatchListFilter = "live" | "upcoming" | "completed";

/**
 * Resolves the home match list tab from the URL and whether any rows are `status = live`.
 * Omitted/invalid `filter` → live when `hasLiveMatches`, otherwise upcoming.
 */
export function resolveHomeMatchListFilter(
  raw: string | null | undefined,
  hasLiveMatches: boolean,
): MatchListFilter {
  if (raw === "upcoming" || raw === "completed" || raw === "live") return raw;
  return hasLiveMatches ? "live" : "upcoming";
}
