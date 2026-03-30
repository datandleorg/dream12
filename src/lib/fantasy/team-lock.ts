/**
 * Aligns with `save_fantasy_team` in Supabase: edits blocked when
 * `timezone('utc', now()) >= match_start - interval '1 minute'`.
 */
export function isTeamEditLocked(startIso: string): boolean {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return false;
  const deadlineMs = startMs - 60_000;
  return Date.now() >= deadlineMs;
}

/**
 * Create contest / join / squad save: blocked when match is completed, or when upcoming
 * and within 1 minute of start. Live matches stay open until completed.
 */
export function isFantasyTeamMutationLocked(matchStatus: string, startIso: string): boolean {
  const s = matchStatus.trim().toLowerCase();
  if (s === "completed") return true;
  if (s === "live") return false;
  return isTeamEditLocked(startIso);
}
