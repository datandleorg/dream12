import { describe, expect, it } from "vitest";
import { formatDismissalFromBattingRow } from "./dismissal-format";

describe("formatDismissalFromBattingRow", () => {
  it("returns how_out when present", () => {
    const row = {
      player_id: 1,
      wicket_id: 2,
      how_out: "c Smith b Jones",
    };
    expect(formatDismissalFromBattingRow(row)).toBe("c Smith b Jones");
  });

  it("returns null for not out wicket", () => {
    const row = {
      player_id: 51,
      wicket_id: 84,
      wicket: { id: 84, name: "Not Out", resource: "wickets" },
    };
    expect(formatDismissalFromBattingRow(row)).toBeNull();
  });

  it("formats catch from nested players", () => {
    const row = {
      player_id: 26,
      wicket_id: 54,
      wicket: { name: "Catch Out" },
      catchstump: { id: 3431, fullname: "J Root" },
      bowler: { id: 9, fullname: "P Cummins" },
    };
    expect(formatDismissalFromBattingRow(row)).toBe("c J Root b P Cummins");
  });

  it("formats bowled with bowler nested", () => {
    const row = {
      player_id: 1,
      wicket_id: 2,
      wicket: { name: "Bowled" },
      bowler: { id: 99, fullname: "M Starc" },
    };
    expect(formatDismissalFromBattingRow(row)).toBe("b M Starc");
  });

  it("formats run out indirect with id map", () => {
    const row = {
      player_id: 10,
      wicket_id: 1,
      runout_by_id: 20,
      batsmanout_id: 30,
      wicket: { name: "Run Out" },
    };
    const map = new Map<number, string>([
      [20, "A"],
      [30, "B"],
    ]);
    expect(formatDismissalFromBattingRow(row, map)).toBe("run out (A/B)");
  });
});
