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

/**
 * Percentage of gross entry collections kept as platform fee (e.g. `6` = 6%).
 * Reads `NEXT_PUBLIC_PLATFORM_FEE_PCT` so create-contest UI and server action stay aligned.
 * Unset or empty → no fee (0).
 */
export function platformFeeFractionFromEnv(): number {
  const raw = process.env.NEXT_PUBLIC_PLATFORM_FEE_PCT?.trim();
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, n) / 100;
}

/** Weight for rank i (1-based): stronger skew to top. */
function rankWeight(i: number): number {
  return 1 / Math.pow(i, 1.15);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build `winnerCount` slabs (ranks 1..N each a single band) that sum to `netPool`.
 * Ranks **2..N** use **whole rupees** (`Math.floor` of their weighted share). **1st place** gets the
 * remainder so the pool is fully allocated (may include paisa if `netPool` has decimals).
 */
export function buildPrizeSlabs(netPool: number, winnerCount: number): PrizeSlab[] {
  if (netPool <= 0) return [];
  if (!Number.isInteger(winnerCount) || winnerCount < 1) {
    throw new Error("winner count must be a positive integer");
  }

  const weights = Array.from({ length: winnerCount }, (_, j) => rankWeight(j + 1));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (netPool * w) / wsum);

  const amounts: number[] = new Array(winnerCount).fill(0);
  if (winnerCount === 1) {
    amounts[0] = roundMoney(netPool);
  } else {
    for (let i = 1; i < winnerCount; i++) {
      amounts[i] = Math.floor(raw[i]!);
    }
    const others = amounts.slice(1).reduce((a, b) => a + b, 0);
    amounts[0] = roundMoney(netPool - others);
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

/**
 * Prize pool after platform fee. `feeFraction` is 0–1 (e.g. 0.06 = 6%).
 * Defaults to {@link platformFeeFractionFromEnv} when omitted.
 */
export function netPrizePoolFromGross(
  gross: number,
  feeFraction: number = platformFeeFractionFromEnv(),
): number {
  return roundMoney(gross * (1 - feeFraction));
}
