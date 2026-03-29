import { describe, expect, it } from "vitest";
import { extractScoreboardRawToLiveMap } from "./extract-scoreboard-raw-to-live-map";

describe("extractScoreboardRawToLiveMap", () => {
  it("maps batting by player_id with SportMonks score/ball fields", () => {
    const raw = {
      batting: {
        data: [
          {
            player_id: 12,
            score: 40,
            ball: 22,
            four_x: 5,
            six_x: 1,
          },
        ],
      },
    };
    const out = extractScoreboardRawToLiveMap(raw);
    expect(out["12"]?.runs).toBe(40);
    expect(out["12"]?.ballsFaced).toBe(22);
    expect(out["12"]?.fours).toBe(5);
    expect(out["12"]?.sixes).toBe(1);
  });

  it("treats wicket_id as dismissed for batting", () => {
    const raw = {
      batting: {
        data: [{ player_id: 7, score: 0, ball: 3, wicket_id: 9001 }],
      },
    };
    const out = extractScoreboardRawToLiveMap(raw);
    expect(out["7"]?.isDismissed).toBe(true);
  });

  it("merges bowling into same player key", () => {
    const raw = {
      batting: {
        data: [{ player_id: 55, score: 10, ball: 8 }],
      },
      bowling: {
        data: [
          {
            player_id: 55,
            overs: "3.2",
            wickets: 2,
            runs: 18,
            medians: 1,
          },
        ],
      },
    };
    const out = extractScoreboardRawToLiveMap(raw);
    expect(out["55"]?.runs).toBe(10);
    expect(out["55"]?.wickets).toBe(2);
    expect(out["55"]?.runsConceded).toBe(18);
    expect(out["55"]?.maidens).toBe(1);
    expect(out["55"]?.oversBowled).toBeCloseTo(3 + 2 / 6, 5);
  });

  it("indexes batting by numeric id when player_id is absent", () => {
    const raw = {
      batting: {
        data: [
          {
            id: 99_001,
            runs: 15,
            balls_faced: 12,
            fours: 2,
            sixes: 0,
            dismissed: false,
          },
        ],
      },
    };
    const out = extractScoreboardRawToLiveMap(raw);
    expect(out["99001"]?.runs).toBe(15);
    expect(out["99001"]?.ballsFaced).toBe(12);
  });
});
