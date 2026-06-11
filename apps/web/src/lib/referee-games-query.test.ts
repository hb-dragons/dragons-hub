import { describe, it, expect } from "vitest";
import { normalizeRefereeGamesQuery } from "./referee-games-query";

describe("normalizeRefereeGamesQuery", () => {
  it("applies status/limit/offset defaults when omitted", () => {
    expect(normalizeRefereeGamesQuery({})).toEqual({
      status: "active",
      limit: 100,
      offset: 0,
    });
  });

  it("joins a multi-element league array into a comma string", () => {
    const norm = normalizeRefereeGamesQuery({ league: ["U18", "U20"] });
    expect(norm.league).toBe("U18,U20");
  });

  it("joins a single-element league array to the bare value (no trailing comma)", () => {
    const norm = normalizeRefereeGamesQuery({ league: ["U18"] });
    expect(norm.league).toBe("U18");
  });

  it("omits league when the array is empty", () => {
    expect(normalizeRefereeGamesQuery({ league: [] })).not.toHaveProperty("league");
  });

  it("retains assignedRefereeApiId of 0 (uses != null, not truthiness)", () => {
    const norm = normalizeRefereeGamesQuery({ assignedRefereeApiId: 0 });
    expect(norm.assignedRefereeApiId).toBe(0);
  });

  it("passes through provided optional fields and overrides defaults", () => {
    expect(
      normalizeRefereeGamesQuery({
        status: "all",
        limit: 200,
        offset: 50,
        slotStatus: "offered",
        gameType: "both",
        dateFrom: "2026-01-01",
        dateTo: "2026-02-28",
        search: "abc",
      }),
    ).toEqual({
      status: "all",
      limit: 200,
      offset: 50,
      slotStatus: "offered",
      gameType: "both",
      dateFrom: "2026-01-01",
      dateTo: "2026-02-28",
      search: "abc",
    });
  });
});
