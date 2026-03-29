import { describe, expect, it } from "vitest";
import { pickScoreboardRaw } from "./pick-scoreboard-raw";

describe("pickScoreboardRaw", () => {
  it("keeps only whitelisted top-level keys", () => {
    const merged = {
      localteam: { id: 1 },
      visitorteam: { id: 2 },
      batting: { data: [] },
      bowling: { data: [] },
      runs: [],
      scoreboards: [],
      balls: [{ x: 1 }],
      lineup: [],
      id: 99,
    };
    const out = pickScoreboardRaw(merged);
    expect(out).toEqual({
      localteam: { id: 1 },
      visitorteam: { id: 2 },
      batting: { data: [] },
      bowling: { data: [] },
      runs: [],
      scoreboards: [],
    });
    expect("balls" in out).toBe(false);
  });
});
