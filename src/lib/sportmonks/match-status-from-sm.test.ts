import { describe, expect, it } from "vitest";
import { mapMatchStatusFromSmFixture } from "./match-status-from-sm";
import type { SmFixture } from "./client";

function base(overrides: Partial<SmFixture>): SmFixture {
  return {
    id: 1,
    starting_at: "2026-06-01T14:00:00.000000Z",
    ...overrides,
  };
}

describe("mapMatchStatusFromSmFixture", () => {
  it("NS + live 1 → upcoming", () => {
    expect(mapMatchStatusFromSmFixture(base({ status: "NS", live: 1 }))).toBe("upcoming");
  });

  it("Finished → completed", () => {
    expect(mapMatchStatusFromSmFixture(base({ status: "Finished", live: 0 }))).toBe("completed");
  });

  it("Aban. → completed", () => {
    expect(mapMatchStatusFromSmFixture(base({ status: "Aban.", live: 0 }))).toBe("completed");
  });

  it("Cancl. → completed", () => {
    expect(mapMatchStatusFromSmFixture(base({ status: "Cancl.", live: 0 }))).toBe("completed");
  });

  it("1st Innings → live", () => {
    expect(mapMatchStatusFromSmFixture(base({ status: "1st Innings", live: 0 }))).toBe("live");
  });

  it("Tea Break → live", () => {
    expect(mapMatchStatusFromSmFixture(base({ status: "Tea Break", live: 0 }))).toBe("live");
  });

  it("Innings Break → live", () => {
    expect(mapMatchStatusFromSmFixture(base({ status: "Innings Break", live: 0 }))).toBe("live");
  });

  it("Stump Day 1 → live", () => {
    expect(mapMatchStatusFromSmFixture(base({ status: "Stump Day 1", live: 0 }))).toBe("live");
  });

  it("Delayed → upcoming", () => {
    expect(mapMatchStatusFromSmFixture(base({ status: "Delayed", live: 1 }))).toBe("upcoming");
  });

  it("Postp. → upcoming", () => {
    expect(mapMatchStatusFromSmFixture(base({ status: "Postp.", live: 0 }))).toBe("upcoming");
  });

  it("Int. → live", () => {
    expect(mapMatchStatusFromSmFixture(base({ status: "Int.", live: 0 }))).toBe("live");
  });

  it("does not use inn substring on INNS", () => {
    expect(
      mapMatchStatusFromSmFixture(
        base({ status: "INNS", live: 0, starting_at: "2026-06-01T14:00:00.000000Z" }),
      ),
    ).toBe("upcoming");
  });
});
