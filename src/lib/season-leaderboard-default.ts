export type SeasonOption = {
  id: number;
  name: string;
  starting_at: string | null;
  is_current: boolean;
  leagueName: string | null;
};

export function formatSeasonLabel(s: SeasonOption): string {
  const league = s.leagueName?.trim();
  if (league) return `${league} · ${s.name}`;
  return s.name;
}

/**
 * Resolves which season the leaderboard should show.
 * - Valid `?season=` id wins if present in the catalog.
 * - Else: if exactly one `is_current` season, use it.
 * - Else: pick the season with the most matches; tie-break by most finalized matches,
 *   then latest `starting_at`, then higher id.
 */
export function resolveEffectiveSeasonId(
  seasons: SeasonOption[],
  matchCountBySeasonId: ReadonlyMap<number, number>,
  finalizedMatchCountBySeasonId: ReadonlyMap<number, number>,
  querySeason: string | null | undefined,
): number | null {
  if (seasons.length === 0) return null;

  const idSet = new Set(seasons.map((s) => s.id));
  if (querySeason) {
    const parsed = Number(querySeason);
    if (Number.isSafeInteger(parsed) && idSet.has(parsed)) return parsed;
  }

  const current = seasons.filter((s) => s.is_current);
  if (current.length === 1) return current[0]!.id;

  const scored = seasons.map((s) => ({
    s,
    matches: matchCountBySeasonId.get(s.id) ?? 0,
    finalized: finalizedMatchCountBySeasonId.get(s.id) ?? 0,
    start: s.starting_at ? new Date(s.starting_at).getTime() : 0,
  }));

  scored.sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches;
    if (b.finalized !== a.finalized) return b.finalized - a.finalized;
    if (b.start !== a.start) return b.start - a.start;
    return Number(b.s.id) - Number(a.s.id);
  });

  return scored[0]!.s.id;
}
