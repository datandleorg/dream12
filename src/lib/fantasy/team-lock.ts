/**
 * Aligns with `save_fantasy_team` in Supabase: edits blocked when match is not `upcoming`.
 */
export function isTeamEditLocked(matchStatus: string | null | undefined): boolean {
  const s = String(matchStatus ?? "").trim().toLowerCase();
  if (!s) return false;
  return s !== "upcoming";
}

/**
 * Creating or deleting a user-hosted contest is allowed only while the match is `upcoming`
 * (same cutoff as team edits / `create_user_contest` / `delete_user_contest` in the DB).
 */
export function isMatchUpcomingForUserContests(
  matchStatus: string | null | undefined,
): boolean {
  const s = String(matchStatus ?? "").trim().toLowerCase();
  return s === "upcoming";
}
