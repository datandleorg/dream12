/**
 * Fantasy picks vs SportMonks playing XI (`players.in_playing_xi`).
 * `false` = known not in announced lineup; `null` = unknown (no lineup sync yet).
 */

export function countRosterNotInPlayingXi(
  rosterPlayerIds: string[],
  inPlayingXiByPlayerId: Map<string, boolean | null>,
): number {
  let n = 0;
  for (const id of rosterPlayerIds) {
    if (inPlayingXiByPlayerId.get(id) === false) n += 1;
  }
  return n;
}

export function countSelectedNotInPlayingXi(
  selected: { id: string; in_playing_xi?: boolean | null }[],
): number {
  return selected.filter((p) => p.in_playing_xi === false).length;
}
