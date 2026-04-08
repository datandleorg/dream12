import { describe, expect, it } from "vitest";
import { isTeamEditLocked } from "./team-lock";

describe("isTeamEditLocked", () => {
  it("unlocked only for upcoming", () => {
    expect(isTeamEditLocked("upcoming")).toBe(false);
    expect(isTeamEditLocked("Upcoming")).toBe(false);
    expect(isTeamEditLocked("  upcoming  ")).toBe(false);
  });

  it("locked for live, in_review, completed", () => {
    expect(isTeamEditLocked("live")).toBe(true);
    expect(isTeamEditLocked("in_review")).toBe(true);
    expect(isTeamEditLocked("completed")).toBe(true);
  });

  it("empty or missing status is not locked (lenient UI)", () => {
    expect(isTeamEditLocked("")).toBe(false);
    expect(isTeamEditLocked(null)).toBe(false);
    expect(isTeamEditLocked(undefined)).toBe(false);
  });
});
