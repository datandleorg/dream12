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
