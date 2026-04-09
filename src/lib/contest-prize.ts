/** Mirrors SQL `public.prize_amount_for_rank` for client/server prize display. */
export function prizeAmountForRank(breakup: unknown, rank: number): number {
  if (!Array.isArray(breakup) || rank < 1) return 0;
  for (const elem of breakup) {
    if (!elem || typeof elem !== "object") continue;
    const o = elem as Record<string, unknown>;
    const from = Number(o.rank_from);
    const to = Number(o.rank_to);
    const amount = Number(o.amount);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(amount))
      continue;
    if (rank >= from && rank <= to) {
      const span = Math.max(1, Math.floor(to) - Math.floor(from) + 1);
      return Math.round((amount / span) * 100) / 100;
    }
  }
  return 0;
}

/** Mirrors SQL `public.prize_total_for_ordinals` (sum of per-ordinal prizes for a tie span). */
export function prizeTotalForOrdinals(
  breakup: unknown,
  startRank: number,
  count: number,
): number {
  if (count < 1 || startRank < 1) return 0;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += prizeAmountForRank(breakup, startRank + i);
  }
  return Math.round(sum * 100) / 100;
}

/** Split pool cents so sum equals `poolCents`; first `rem` recipients get +1 paisa (matches settlement SQL). */
export function splitPrizePoolCents(poolCents: number, tieSize: number): number[] {
  if (tieSize < 1 || !Number.isFinite(poolCents)) return [];
  const pc = Math.round(poolCents);
  const base = Math.floor(pc / tieSize);
  const rem = pc % tieSize;
  return Array.from({ length: tieSize }, (_, i) => base + (i < rem ? 1 : 0));
}

export type ContestTieMeta = {
  competitionRank: number;
  tieSize: number;
  tieIndex: number;
};

/**
 * Competition ranking on points only (1,1,3…). `sorted` must be ordered like settlement:
 * total_points desc, created_at asc, id asc.
 */
export function contestTieMetasForSortedLeaderboard<
  T extends { total_points: number },
>(sorted: T[]): ContestTieMeta[] {
  const metas: ContestTieMeta[] = [];
  let nextRank = 1;
  let i = 0;
  const n = sorted.length;
  while (i < n) {
    let j = i + 1;
    const pts = sorted[i]!.total_points;
    while (j < n && sorted[j]!.total_points === pts) j++;
    const tieSize = j - i;
    for (let k = 0; k < tieSize; k++) {
      metas.push({
        competitionRank: nextRank,
        tieSize,
        tieIndex: k,
      });
    }
    nextRank += tieSize;
    i = j;
  }
  return metas;
}

/** Projected INR for one row after tie split (matches DB cent split). */
export function projectedPrizeInrForTiedRow(
  breakup: unknown,
  meta: ContestTieMeta,
): number {
  const pool = prizeTotalForOrdinals(
    breakup,
    meta.competitionRank,
    meta.tieSize,
  );
  const poolCents = Math.round(pool * 100);
  const splits = splitPrizePoolCents(poolCents, meta.tieSize);
  const cents = splits[meta.tieIndex] ?? 0;
  return cents / 100;
}

export type LeaderboardSortRow = {
  total_points: number;
  id: string;
  created_at?: string | null;
};

/** Same ordering as `settle_contest_prizes` within ties: points desc, created_at asc, team id asc. */
export function compareLeaderboardRows(a: LeaderboardSortRow, b: LeaderboardSortRow): number {
  if (b.total_points !== a.total_points) return b.total_points - a.total_points;
  const ca = a.created_at ?? "";
  const cb = b.created_at ?? "";
  if (ca !== cb) return ca < cb ? -1 : ca > cb ? 1 : 0;
  return a.id.localeCompare(b.id);
}
