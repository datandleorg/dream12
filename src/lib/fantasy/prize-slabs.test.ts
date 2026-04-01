import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPrizeSlabs,
  grossFromEntryAndSpots,
  netPrizePoolFromGross,
  platformFeeFractionFromEnv,
  sumSlabAmounts,
} from "./prize-slabs";

describe("buildPrizeSlabs", () => {
  it("sums to netPool for single winner", () => {
    const slabs = buildPrizeSlabs(180000, 1);
    expect(slabs).toHaveLength(1);
    expect(slabs[0].rank_from).toBe(1);
    expect(slabs[0].rank_to).toBe(1);
    expect(sumSlabAmounts(slabs)).toBe(180000);
  });

  it("sums to netPool for 10 winners", () => {
    const net = 14250.5;
    const slabs = buildPrizeSlabs(net, 10);
    expect(slabs).toHaveLength(10);
    expect(sumSlabAmounts(slabs)).toBe(net);
  });

  it("floors ranks 2+ to whole rupees; 1st absorbs remainder", () => {
    const slabs = buildPrizeSlabs(100, 3);
    expect(sumSlabAmounts(slabs)).toBe(100);
    expect(Number.isInteger(slabs[1].amount)).toBe(true);
    expect(Number.isInteger(slabs[2].amount)).toBe(true);
  });

  it("throws for invalid winner count", () => {
    expect(() => buildPrizeSlabs(100, 0)).toThrow();
    expect(() => buildPrizeSlabs(100, -1)).toThrow();
  });

  it("allows effective winner counts not in create-contest allowlist (settlement parity)", () => {
    const slabs = buildPrizeSlabs(100, 6);
    expect(slabs).toHaveLength(6);
    expect(sumSlabAmounts(slabs)).toBe(100);
  });

  it("returns empty for non-positive pool", () => {
    expect(buildPrizeSlabs(0, 1)).toEqual([]);
  });

  /** Mirrors `public.build_prize_slabs_numeric` in 20260402120000_settle_contest_unfilled_spots.sql */
  it("golden vectors for SQL slab parity", () => {
    expect(buildPrizeSlabs(100, 3)).toEqual([
      { rank_from: 1, rank_to: 1, amount: 59 },
      { rank_from: 2, rank_to: 2, amount: 25 },
      { rank_from: 3, rank_to: 3, amount: 16 },
    ]);
    expect(buildPrizeSlabs(100, 6)).toEqual([
      { rank_from: 1, rank_to: 1, amount: 47 },
      { rank_from: 2, rank_to: 2, amount: 20 },
      { rank_from: 3, rank_to: 3, amount: 12 },
      { rank_from: 4, rank_to: 4, amount: 9 },
      { rank_from: 5, rank_to: 5, amount: 7 },
      { rank_from: 6, rank_to: 6, amount: 5 },
    ]);
    expect(buildPrizeSlabs(14250.5, 10)).toEqual([
      { rank_from: 1, rank_to: 1, amount: 5549.5 },
      { rank_from: 2, rank_to: 2, amount: 2498 },
      { rank_from: 3, rank_to: 3, amount: 1567 },
      { rank_from: 4, rank_to: 4, amount: 1126 },
      { rank_from: 5, rank_to: 5, amount: 871 },
      { rank_from: 6, rank_to: 6, amount: 706 },
      { rank_from: 7, rank_to: 7, amount: 591 },
      { rank_from: 8, rank_to: 8, amount: 507 },
      { rank_from: 9, rank_to: 9, amount: 443 },
      { rank_from: 10, rank_to: 10, amount: 392 },
    ]);
  });
});

describe("gross / net helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gross is entry * spots", () => {
    expect(grossFromEntryAndSpots(5, 3)).toBe(15);
  });

  it("net equals gross when env fee unset", () => {
    vi.stubEnv("NEXT_PUBLIC_PLATFORM_FEE_PCT", "");
    expect(platformFeeFractionFromEnv()).toBe(0);
    expect(netPrizePoolFromGross(100)).toBe(100);
  });

  it("env percentage reduces pool", () => {
    vi.stubEnv("NEXT_PUBLIC_PLATFORM_FEE_PCT", "6");
    expect(platformFeeFractionFromEnv()).toBe(0.06);
    expect(netPrizePoolFromGross(100)).toBe(94);
  });

  it("explicit fee fraction reduces pool", () => {
    expect(netPrizePoolFromGross(15, 1 / 15)).toBe(14);
  });
});
