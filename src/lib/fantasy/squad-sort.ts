type LineupSortableRow = {
  id: string;
  name: string;
  credit_value: number;
  in_playing_xi: boolean | null;
};

/** Confirmed XI first, then unknown lineup, then not in XI; then credits ↓, name, id. */
function playingXiBand(x: boolean | null): number {
  if (x === true) return 0;
  if (x === null) return 1;
  return 2;
}

/** Returns a new sorted array (does not mutate `rows`). */
export function sortSquadByLineupFirst<T extends LineupSortableRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const xi = playingXiBand(a.in_playing_xi) - playingXiBand(b.in_playing_xi);
    if (xi !== 0) return xi;
    const creditDiff = Number(b.credit_value) - Number(a.credit_value);
    if (creditDiff !== 0) return creditDiff;
    const nameCmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id);
  });
}
