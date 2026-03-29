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

  it("does not treat SportMonks Not Out (wicket_id + name) as dismissed", () => {
    const raw = {
      batting: {
        data: [
          {
            id: 859_492,
            player_id: 51,
            score: 26,
            ball: 13,
            four_x: 1,
            six_x: 3,
            wicket_id: 84,
            wicket: { id: 84, name: "Not Out", resource: "wickets" },
          },
        ],
      },
    };
    const out = extractScoreboardRawToLiveMap(raw);
    expect(out["51"]?.runs).toBe(26);
    expect(out["51"]?.ballsFaced).toBe(13);
    expect(out["51"]?.isDismissed).toBe(false);
    expect(out["859492"]).toBeUndefined();
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

  it("credits catch to catchstump player on Catch Out", () => {
    const raw = {
      batting: {
        data: [
          {
            player_id: 26,
            score: 11,
            ball: 9,
            wicket_id: 54,
            catch_stump_player_id: 3431,
            wicket: { name: "Catch Out" },
          },
        ],
      },
    };
    const out = extractScoreboardRawToLiveMap(raw);
    expect(out["3431"]?.catches).toBe(1);
  });

  it("credits stumping to catchstump player", () => {
    const raw = {
      batting: {
        data: [
          {
            player_id: 1,
            score: 4,
            ball: 2,
            wicket_id: 9,
            catch_stump_player_id: 2,
            wicket: { name: "Stumped" },
          },
        ],
      },
    };
    const out = extractScoreboardRawToLiveMap(raw);
    expect(out["2"]?.stumpings).toBe(1);
  });

  it("credits caught-and-bowled to bowler", () => {
    const raw = {
      batting: {
        data: [
          {
            player_id: 5,
            score: 0,
            ball: 1,
            wicket_id: 3,
            bowling_player_id: 9,
            wicket: { name: "Caught and Bowled" },
          },
        ],
      },
    };
    const out = extractScoreboardRawToLiveMap(raw);
    expect(out["9"]?.catches).toBe(1);
  });

  it("increments bowledLbwDismissals for bowler on Bowled", () => {
    const raw = {
      batting: {
        data: [
          {
            player_id: 1,
            score: 0,
            ball: 1,
            wicket_id: 2,
            bowling_player_id: 99,
            wicket: { name: "Bowled" },
          },
        ],
      },
    };
    const out = extractScoreboardRawToLiveMap(raw);
    expect(out["99"]?.bowledLbwDismissals).toBe(1);
  });

  it("splits indirect run-out between two fielders", () => {
    const raw = {
      batting: {
        data: [
          {
            player_id: 10,
            score: 5,
            ball: 3,
            wicket_id: 1,
            runout_by_id: 20,
            batsmanout_id: 30,
            wicket: { name: "Run Out" },
          },
        ],
      },
    };
    const out = extractScoreboardRawToLiveMap(raw);
    expect(out["20"]?.runOutIndirect).toBe(1);
    expect(out["30"]?.runOutIndirect).toBe(1);
  });

  it("credits direct run-out when only runout_by_id is set", () => {
    const raw = {
      batting: {
        data: [
          {
            player_id: 10,
            score: 5,
            ball: 2,
            wicket_id: 1,
            runout_by_id: 20,
            wicket: { name: "Run Out" },
          },
        ],
      },
    };
    const out = extractScoreboardRawToLiveMap(raw);
    expect(out["20"]?.runOutDirect).toBe(1);
  });

  it("passes bowling wickets through as provider totals (assumed ex-run-out)", () => {
    const raw = {
      bowling: {
        data: [{ player_id: 7, overs: 4, wickets: 3, runs: 22, medians: 0 }],
      },
    };
    const out = extractScoreboardRawToLiveMap(raw);
    expect(out["7"]?.wickets).toBe(3);
  });
});
