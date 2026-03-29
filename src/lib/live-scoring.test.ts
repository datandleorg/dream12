import { describe, expect, it } from "vitest";
import {
  aggregateTeamPoints,
  teamPointsBreakdown,
  type TeamBreakdownRosterRow,
} from "./live-scoring";

describe("aggregateTeamPoints", () => {
  it("sums roster with captain multiplier", () => {
    const roster = [
      { player_id: "a", sportmonks_id: 1, role: "BAT", in_playing_xi: null },
      { player_id: "b", sportmonks_id: 2, role: "BOWL", in_playing_xi: true },
    ];
    const live = {
      "1": { runs: 20, ballsFaced: 12, isDismissed: false },
      "2": { wickets: 1, oversBowled: 2, runsConceded: 12 },
    };
    const baseBat = 20; // simplified expectation: at least runs
    const total = aggregateTeamPoints(roster, "a", "b", live);
    expect(total).toBeGreaterThan(baseBat);
  });
});

describe("teamPointsBreakdown", () => {
  it("matches aggregateTeamPoints total", () => {
    const roster: TeamBreakdownRosterRow[] = [
      {
        player_id: "a",
        sportmonks_id: 1,
        role: "BAT",
        in_playing_xi: true,
        player_name: "A",
        team_label: "T1",
      },
      {
        player_id: "b",
        sportmonks_id: 2,
        role: "BOWL",
        in_playing_xi: false,
        player_name: "B",
        team_label: "T1",
      },
    ];
    const live = {
      "1": { runs: 10, ballsFaced: 12, isDismissed: false },
      "2": { wickets: 1, oversBowled: 2, runsConceded: 12 },
    };
    const rosterCore = roster.map(({ player_name, team_label, ...r }) => r);
    const sum = aggregateTeamPoints(rosterCore, "a", "b", live);
    const { computedTotal, lines } = teamPointsBreakdown(roster, "a", "b", live);
    expect(computedTotal).toBe(sum);
    const sumLines = lines.reduce((acc, l) => acc + l.points, 0);
    expect(sumLines).toBe(computedTotal);
  });
});
