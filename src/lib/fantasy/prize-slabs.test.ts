import { describe, expect, it } from "vitest";
import {
  buildPrizeSlabs,
  grossFromEntryAndSpots,
  netPrizePoolFromGross,
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

  it("throws for invalid winner count", () => {
    expect(() => buildPrizeSlabs(100, 6)).toThrow();
  });

  it("returns empty for non-positive pool", () => {
    expect(buildPrizeSlabs(0, 1)).toEqual([]);
  });
});

describe("gross / net helpers", () => {
  it("gross is entry * spots", () => {
    expect(grossFromEntryAndSpots(5, 3)).toBe(15);
  });

  it("net uses default fee", () => {
    expect(netPrizePoolFromGross(15)).toBe(14);
  });
});
