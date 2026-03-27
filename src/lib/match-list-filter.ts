/** Shared match list tab filter — safe for server and client (no "use client"). */

export type MatchListFilter = "live" | "upcoming" | "completed";

export function parseMatchListFilter(raw: string | null | undefined): MatchListFilter {
  if (raw === "upcoming" || raw === "completed") return raw;
  return "live";
}
