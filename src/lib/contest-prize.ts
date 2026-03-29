/** Mirrors SQL `public.prize_amount_for_rank` for client/server prize display. */
export function prizeAmountForRank(breakup: unknown, rank: number): number {
  if (!Array.isArray(breakup) || rank < 1) return 0;
  for (const elem of breakup) {
    if (!elem || typeof elem !== "object") continue;
    const o = elem as Record<string, unknown>;
    const from = Number(o.rank_from);
    const to = Number(o.rank_to);
    const amount = Number(o.amount);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(amount)) continue;
    if (rank >= from && rank <= to) {
      const span = Math.max(1, Math.floor(to) - Math.floor(from) + 1);
      return Math.round((amount / span) * 100) / 100;
    }
  }
  return 0;
}
