import { describe, expect, it } from "vitest";
import { extractLiveStatsByPlayer } from "./extract-live-stats-by-player";

describe("extractLiveStatsByPlayer", () => {
  it("indexes batting row by numeric id when player_id is absent", () => {
    const payload = {
      batting: {
        data: [
          {
            id: 55_555,
            runs: 72,
            balls_faced: 45,
            fours: 8,
            sixes: 3,
            dismissed: false,
          },
        ],
      },
    };
    const out = extractLiveStatsByPlayer(payload);
    expect(out["55555"]?.runs).toBe(72);
    expect(out["55555"]?.ballsFaced).toBe(45);
  });

  it("still indexes by player_id when present", () => {
    const out = extractLiveStatsByPlayer({
      row: { player_id: 12, runs: 10, balls_faced: 8 },
    });
    expect(out["12"]?.runs).toBe(10);
  });

  it("merges duplicate keys on same node", () => {
    const out = extractLiveStatsByPlayer({
      x: { player_id: 7, id: 7, runs: 5, balls_faced: 4 },
    });
    expect(out["7"]?.runs).toBe(5);
  });
});
