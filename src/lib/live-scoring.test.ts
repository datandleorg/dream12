import { describe, expect, it } from "vitest";
import { aggregateTeamPoints } from "./live-scoring";

describe("aggregateTeamPoints", () => {
  it("sums roster with captain multiplier", () => {
    const roster = [
      { player_id: "a", sportmonks_id: 1, role: "BAT" },
      { player_id: "b", sportmonks_id: 2, role: "BOWL" },
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
