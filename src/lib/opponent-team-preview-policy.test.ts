import { describe, expect, it } from "vitest";
import { canViewOthersContestTeamPreview } from "./opponent-team-preview-policy";

describe("canViewOthersContestTeamPreview", () => {
  const viewer = "viewer-uuid";
  const owner = "owner-uuid";

  it("allows owner to view own team while upcoming", () => {
    expect(
      canViewOthersContestTeamPreview({
        matchStatus: "upcoming",
        viewerUserId: viewer,
        teamOwnerUserId: viewer,
      }),
    ).toBe(true);
  });

  it("blocks non-owner while upcoming", () => {
    expect(
      canViewOthersContestTeamPreview({
        matchStatus: "upcoming",
        viewerUserId: viewer,
        teamOwnerUserId: owner,
      }),
    ).toBe(false);
  });

  it("allows non-owner once live", () => {
    expect(
      canViewOthersContestTeamPreview({
        matchStatus: "live",
        viewerUserId: viewer,
        teamOwnerUserId: owner,
      }),
    ).toBe(true);
  });

  it("allows non-owner for in_review and completed", () => {
    for (const s of ["in_review", "completed"] as const) {
      expect(
        canViewOthersContestTeamPreview({
          matchStatus: s,
          viewerUserId: viewer,
          teamOwnerUserId: owner,
        }),
      ).toBe(true);
    }
  });
});
