import { describe, expect, it } from "vitest";
import type { TeamBreakdownRosterRow } from "@/lib/live-scoring";
import {
  mergeLiveStatsFromStoredSnapshot,
  parseCricketOversToDecimal,
} from "@/lib/live-stats-from-snapshot";

describe("parseCricketOversToDecimal", () => {
  it("parses balls after the dot", () => {
    expect(parseCricketOversToDecimal("15.4")).toBeCloseTo(15 + 4 / 6, 5);
    expect(parseCricketOversToDecimal("2.4")).toBeCloseTo(2 + 4 / 6, 5);
  });
  it("parses whole overs", () => {
    expect(parseCricketOversToDecimal("4")).toBe(4);
  });
});

describe("mergeLiveStatsFromStoredSnapshot", () => {
  const snapshot = {
    shortLine: "RCB 203/4 (15.4) · SH 201/9 (20)",
    updatedAt: "2026-03-29T08:22:09.885Z",
    inningsCards: [
      {
        headerLine: "Royal Challengers Bengaluru 203/4 (15.4 ov)",
        battingTeamName: "Royal Challengers Bengaluru",
        battingTeamId: 8,
        scoreboardKey: "S2",
        battingRows: [
          {
            name: "Devdutt Padikkal",
            runs: 61,
            balls: 26,
            fours: 7,
            sixes: 4,
            dismissal: null,
            strikeRate: "235",
          },
        ],
        bowlingRows: [],
      },
    ],
  };

  it("fills live map by sportmonks id using snapshot batting names", () => {
    const roster: TeamBreakdownRosterRow[] = [
      {
        player_id: "p1",
        sportmonks_id: 88_888,
        role: "BAT",
        in_playing_xi: true,
        player_name: "Devdutt Padikkal",
        team_label: "Royal Challengers Bengaluru",
      },
    ];
    const merged = mergeLiveStatsFromStoredSnapshot(snapshot, roster, {});
    expect(merged["88888"]?.runs).toBe(61);
    expect(merged["88888"]?.ballsFaced).toBe(26);
    expect(merged["88888"]?.fours).toBe(7);
    expect(merged["88888"]?.sixes).toBe(4);
  });

  it("keeps API batting when non-zero", () => {
    const roster: TeamBreakdownRosterRow[] = [
      {
        player_id: "p1",
        sportmonks_id: 1,
        role: "BAT",
        in_playing_xi: true,
        player_name: "Devdutt Padikkal",
        team_label: "Royal Challengers Bengaluru",
      },
    ];
    const merged = mergeLiveStatsFromStoredSnapshot(snapshot, roster, {
      "1": { runs: 10, ballsFaced: 8, fours: 1, sixes: 0, isDismissed: false },
    });
    expect(merged["1"]?.runs).toBe(10);
  });
});
