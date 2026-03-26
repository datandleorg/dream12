import { describe, expect, it } from "vitest";
import {
  applyCaptainMultipliers,
  calculateFantasyPoints,
  pointsForPlayer,
  type NormalizedPlayerStats,
} from "./scoring";

const baseBat: NormalizedPlayerStats = {
  runs: 0,
  ballsFaced: 0,
  fours: 0,
  sixes: 0,
  isDismissed: false,
  wickets: 0,
  oversBowled: 0,
  runsConceded: 0,
  maidens: 0,
  catches: 0,
  stumpings: 0,
  runOuts: 0,
};

describe("pointsForPlayer", () => {
  it("adds +1 per run and boundary bonuses", () => {
    const s: NormalizedPlayerStats = {
      ...baseBat,
      runs: 20,
      fours: 2,
      sixes: 1,
      ballsFaced: 12,
      isDismissed: false,
    };
    const p = pointsForPlayer("bat", s);
    expect(p).toBeGreaterThanOrEqual(20 + 2 + 2);
  });

  it("applies duck penalty for dismissed batsman on zero", () => {
    const s: NormalizedPlayerStats = {
      ...baseBat,
      runs: 0,
      ballsFaced: 1,
      isDismissed: true,
    };
    const p = pointsForPlayer("bat", s);
    expect(p).toBeLessThan(0);
  });

  it("awards wickets and economy for bowlers", () => {
    const s: NormalizedPlayerStats = {
      ...baseBat,
      wickets: 3,
      oversBowled: 4,
      runsConceded: 20,
      maidens: 1,
    };
    const p = pointsForPlayer("bowl", s);
    expect(p).toBeGreaterThanOrEqual(25 * 3 + 8);
  });

  it("adds fielding points", () => {
    const s: NormalizedPlayerStats = {
      ...baseBat,
      catches: 2,
      stumpings: 1,
      runOuts: 1,
    };
    const p = pointsForPlayer("wk", s);
    expect(p).toBe(8 * 2 + 12 + 6);
  });
});

describe("captain multipliers", () => {
  it("doubles captain and 1.5x vice", () => {
    expect(applyCaptainMultipliers(40, true, false)).toBe(80);
    expect(applyCaptainMultipliers(40, false, true)).toBe(60);
    expect(applyCaptainMultipliers(40, false, false)).toBe(40);
  });
});

describe("calculateFantasyPoints", () => {
  it("merges payload keys with C/VC", () => {
    const payload = {
      p1: { kind: "bat" as const, runs: 10, ballsFaced: 12, isDismissed: false },
      p2: { kind: "bowl" as const, wickets: 2, oversBowled: 3, runsConceded: 18 },
    };
    const m = calculateFantasyPoints(payload, "p1", "p2");
    expect(m.p1).toBe(applyCaptainMultipliers(pointsForPlayer("bat", { ...baseBat, runs: 10, ballsFaced: 12, isDismissed: false }), true, false));
    expect(m.p2).toBeDefined();
  });
});
