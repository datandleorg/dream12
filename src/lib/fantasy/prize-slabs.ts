/**
 * Approximate Dream11-style prize distribution: top-heavy weights, one slab per
 * rank. Sums to `netPool` (rupees, 2 decimals) after rounding.
 */

export type PrizeSlab = {
  rank_from: number;
  rank_to: number;
  amount: number;
};

export const ALLOWED_WINNER_COUNTS = [1, 2, 3, 4, 5, 7, 10] as const;
export type WinnerCount = (typeof ALLOWED_WINNER_COUNTS)[number];

/** Gross → net: e.g. ₹15 collected → ₹14 pool (1/15 platform fee). */
export const DEFAULT_PLATFORM_FEE_PCT = 1 / 15;

function assertWinnerCount(n: number): asserts n is WinnerCount {
  if (!ALLOWED_WINNER_COUNTS.includes(n as WinnerCount)) {
    throw new Error(`winner count must be one of ${ALLOWED_WINNER_COUNTS.join(", ")}`);
  }
}

/** Weight for rank i (1-based): stronger skew to top. */
function rankWeight(i: number): number {
  return 1 / Math.pow(i, 1.15);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build `winnerCount` slabs (ranks 1..N each a single band) that sum to `netPool`.
 */
export function buildPrizeSlabs(netPool: number, winnerCount: number): PrizeSlab[] {
  if (netPool <= 0) return [];
  assertWinnerCount(winnerCount);

  const weights = Array.from({ length: winnerCount }, (_, j) => rankWeight(j + 1));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (netPool * w) / wsum);

  const floors = raw.map((r) => Math.floor(r * 100) / 100);
  const assigned = floors.reduce((a, b) => a + b, 0);
  let remainder = roundMoney(netPool - assigned);
  const amounts = [...floors];

  // Distribute leftover rupees to top ranks (0.01 steps)
  let i = 0;
  while (remainder >= 0.01 && i < amounts.length) {
    amounts[i] = roundMoney(amounts[i] + 0.01);
    remainder = roundMoney(remainder - 0.01);
    i = (i + 1) % amounts.length;
  }

  // Fix float dust
  const total = amounts.reduce((a, b) => a + b, 0);
  const drift = roundMoney(netPool - total);
  if (Math.abs(drift) >= 0.005) {
    amounts[0] = roundMoney(amounts[0] + drift);
  }

  return amounts.map((amount, idx) => ({
    rank_from: idx + 1,
    rank_to: idx + 1,
    amount: roundMoney(amount),
  }));
}

export function sumSlabAmounts(slabs: PrizeSlab[]): number {
  return roundMoney(slabs.reduce((s, x) => s + x.amount, 0));
}

export function grossFromEntryAndSpots(entry: number, spots: number): number {
  return roundMoney(entry * spots);
}

export function netPrizePoolFromGross(
  gross: number,
  feePct: number = DEFAULT_PLATFORM_FEE_PCT,
): number {
  return roundMoney(gross * (1 - feePct));
}
