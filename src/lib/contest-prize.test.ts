import { describe, expect, it } from "vitest";
import {
  contestTieMetasForSortedLeaderboard,
  prizeTotalForOrdinals,
  splitPrizePoolCents,
  projectedPrizeInrForTiedRow,
} from "./contest-prize";

describe("contestTieMetasForSortedLeaderboard", () => {
  it("assigns 1,1,3 for two leaders then one trailer", () => {
    const sorted = [
      { total_points: 100 },
      { total_points: 100 },
      { total_points: 90 },
    ];
    const m = contestTieMetasForSortedLeaderboard(sorted);
    expect(m.map((x) => x.competitionRank)).toEqual([1, 1, 3]);
    expect(m[0]!.tieSize).toBe(2);
    expect(m[2]!.tieSize).toBe(1);
  });
});

describe("splitPrizePoolCents", () => {
  it("sums to pool and gives extra paise to first indices", () => {
    const s = splitPrizePoolCents(100, 3);
    expect(s.reduce((a, b) => a + b, 0)).toBe(100);
    expect(s).toEqual([34, 33, 33]);
  });
});

describe("prize pooling for ties", () => {
  const breakup = [
    { rank_from: 1, rank_to: 1, amount: 100 },
    { rank_from: 2, rank_to: 2, amount: 50 },
    { rank_from: 3, rank_to: 3, amount: 25 },
  ];

  it("pools ordinals 1–2 for a two-way tie at top", () => {
    expect(prizeTotalForOrdinals(breakup, 1, 2)).toBe(150);
  });

  it("projected share splits pool for tied row", () => {
    const meta = { competitionRank: 1, tieSize: 2, tieIndex: 0 };
    const a = projectedPrizeInrForTiedRow(breakup, meta);
    const b = projectedPrizeInrForTiedRow(breakup, { ...meta, tieIndex: 1 });
    expect(a + b).toBeCloseTo(150, 2);
    expect(a).toBe(b);
  });
});
