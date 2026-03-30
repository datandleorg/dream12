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
    expect(() => buildPrizeSlabs(100, 6)).toThrow();
  });

  it("returns empty for non-positive pool", () => {
    expect(buildPrizeSlabs(0, 1)).toEqual([]);
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
