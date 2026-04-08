/**
 * Aligns with `save_fantasy_team` in Supabase: edits blocked when match is not `upcoming`.
 */
export function isTeamEditLocked(matchStatus: string | null | undefined): boolean {
  const s = String(matchStatus ?? "").trim().toLowerCase();
  if (!s) return false;
  return s !== "upcoming";
}
