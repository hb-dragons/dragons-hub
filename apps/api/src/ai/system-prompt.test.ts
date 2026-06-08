import { describe, expect, it } from "vitest";
import { buildRescheduleSystemPrompt } from "./system-prompt";

describe("buildRescheduleSystemPrompt", () => {
  it("encodes the three disciplines and seeds the match when provided", () => {
    const p = buildRescheduleSystemPrompt({
      matchId: 1, apiMatchId: 11, homeTeamName: "Dragons", guestTeamName: "Lions",
      date: "2026-02-14", time: "18:00:00", venueName: "Hall 1", matchDay: 5,
      leagueId: 1, leagueName: "L1", homeTeamApiId: 100, guestTeamApiId: 200,
      venueId: 1, isCancelled: false, isForfeited: false,
    });
    expect(p).toMatch(/verify_slot/);
    expect(p).toMatch(/basketball-bund/i);
    expect(p).toMatch(/Dragons/);
    expect(p).toMatch(/cannot move the game yourself/i);
    expect(p).toMatch(/heuristic/i);
  });
  it("works with no seeded match", () => {
    expect(buildRescheduleSystemPrompt(null)).toMatch(/verify_slot/);
  });
  it("covers ?? fallback branches when nullable fields are null", () => {
    const p = buildRescheduleSystemPrompt({
      matchId: 2, apiMatchId: 22, homeTeamName: "Hawks", guestTeamName: "Bears",
      date: "2026-03-01", time: "19:00:00", venueName: null, matchDay: 7,
      leagueId: null, leagueName: null, homeTeamApiId: 101, guestTeamApiId: 201,
      venueId: null, isCancelled: false, isForfeited: false,
    });
    expect(p).toMatch(/unknown venue/);
    expect(p).toMatch(/league \? \(id \?\)/);
    expect(p).toMatch(/venueId.*none/);
  });
});
