import { describe, expect, it } from "vitest";
import {
  applyCaptainMultipliers,
  calculateFantasyPoints,
  pointsForPlayer,
  type NormalizedPlayerStats,
} from "./scoring";

const empty: NormalizedPlayerStats = {
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
  it("adds runs, boundary bonuses, and strike rate in T20 bands", () => {
    const s: NormalizedPlayerStats = {
      ...empty,
      runs: 20,
      fours: 2,
      sixes: 1,
      ballsFaced: 12,
      isDismissed: false,
    };
    const p = pointsForPlayer("bat", s);
    // 20 + 2 + 2 + SR 166.67 → +4
    expect(p).toBe(28);
  });

  it("applies batting milestones (100 overrides 50 overrides 30)", () => {
    expect(pointsForPlayer("bat", { ...empty, runs: 35, ballsFaced: 40 })).toBe(35 + 4);
    expect(pointsForPlayer("bat", { ...empty, runs: 55, ballsFaced: 50 })).toBe(55 + 8);
    // Milestone 100+ (+16), SR 170 → +4 in 150.01–170 band
    expect(pointsForPlayer("bat", { ...empty, runs: 102, ballsFaced: 60 })).toBe(102 + 16 + 4);
  });

  it("applies duck penalty for dismissed batsman on zero", () => {
    const s: NormalizedPlayerStats = {
      ...empty,
      runs: 0,
      ballsFaced: 1,
      isDismissed: true,
    };
    expect(pointsForPlayer("bat", s)).toBe(-2);
    expect(pointsForPlayer("bowl", s)).toBe(0);
  });

  it("awards wickets, bowled/LBW bonus, haul, maiden, economy", () => {
    const s: NormalizedPlayerStats = {
      ...empty,
      wickets: 3,
      bowledLbwDismissals: 1,
      oversBowled: 4,
      runsConceded: 20,
      maidens: 1,
    };
    const p = pointsForPlayer("bowl", s);
    // 25*3 + 8 + haul 4 + maiden 12 + er 5 → +4
    expect(p).toBe(75 + 8 + 4 + 12 + 4);
  });

  it("does not apply economy below 2 overs", () => {
    const s: NormalizedPlayerStats = {
      ...empty,
      wickets: 1,
      oversBowled: 1.5,
      runsConceded: 30,
    };
    const p = pointsForPlayer("bowl", s);
    expect(p).toBe(25);
  });

  it("adds fielding points, 3-catch bonus, and legacy runOuts as indirect", () => {
    const s: NormalizedPlayerStats = {
      ...empty,
      catches: 3,
      stumpings: 1,
      runOuts: 1,
    };
    const p = pointsForPlayer("wk", s);
    expect(p).toBe(8 * 3 + 4 + 12 + 6);
  });

  it("splits run-out direct vs indirect", () => {
    const s: NormalizedPlayerStats = {
      ...empty,
      runOutDirect: 1,
      runOutIndirect: 1,
      runOuts: 0,
    };
    expect(pointsForPlayer("bat", s)).toBe(12 + 6);
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
  it("merges payload keys with C/VC and optional starting XI", () => {
    const payload = {
      p1: { kind: "bat" as const, runs: 10, ballsFaced: 12, isDismissed: false, inPlayingXi: true },
      p2: { kind: "bowl" as const, wickets: 2, oversBowled: 3, runsConceded: 18 },
    };
    const m = calculateFantasyPoints(payload, "p1", "p2");
    const base1 = pointsForPlayer("bat", {
      ...empty,
      runs: 10,
      ballsFaced: 12,
      isDismissed: false,
    });
    expect(m.p1).toBe(applyCaptainMultipliers(base1 + 4, true, false));
    expect(m.p2).toBeDefined();
  });
});
