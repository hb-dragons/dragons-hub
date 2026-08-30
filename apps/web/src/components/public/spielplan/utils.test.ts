import { describe, expect, it } from "vitest";
import type { MatchListItem } from "@dragons/shared";
import { selectedTeamApiId, spielplanRowClass } from "./utils";

function makeMatch(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return {
    id: 1,
    apiMatchId: 100,
    matchNo: 42,
    matchDay: 3,
    kickoffDate: "2026-09-06",
    kickoffTime: "15:30:00",
    homeTeamApiId: 10,
    homeTeamName: "TSV Musterstadt",
    homeTeamNameShort: null,
    homeTeamCustomName: null,
    homeClubId: 500,
    guestTeamApiId: 20,
    guestTeamName: "HB Dragons Hannover",
    guestTeamNameShort: null,
    guestTeamCustomName: "Herren 2",
    guestClubId: 4121,
    homeIsOwnClub: false,
    guestIsOwnClub: true,
    homeBadgeColor: null,
    guestBadgeColor: "#00ff00",
    homeScore: null,
    guestScore: null,
    leagueId: 7,
    leagueName: "Bezirksliga",
    venueId: 9,
    venueName: "Sporthalle Musterstadt",
    venueStreet: null,
    venuePostalCode: null,
    venueCity: null,
    venueNameOverride: null,
    isConfirmed: true,
    isForfeited: false,
    isCancelled: false,
    anschreiber: null,
    zeitnehmer: null,
    shotclock: null,
    publicComment: null,
    hasLocalChanges: false,
    overriddenFields: [],
    booking: null,
    ...overrides,
  };
}

describe("spielplanRowClass", () => {
  it("tints a Dragons home game", () => {
    const cls = spielplanRowClass(makeMatch({ homeIsOwnClub: true, guestIsOwnClub: false }));
    expect(cls).toContain("border-l-primary/50");
    expect(cls).toContain("bg-primary/5");
  });

  it("gives a rival-club game no special highlight", () => {
    expect(spielplanRowClass(makeMatch({ homeTeamName: "TuS Ahlem" }))).toBe("");
  });

  it("mutes a game whose comment says it was moved (verlegt)", () => {
    expect(spielplanRowClass(makeMatch({ publicComment: "wird verlegt" }))).toContain(
      "text-muted-foreground",
    );
  });

  it("strikes through cancelled and forfeited games", () => {
    expect(spielplanRowClass(makeMatch({ isCancelled: true }))).toContain("line-through");
    expect(spielplanRowClass(makeMatch({ isForfeited: true }))).toContain("line-through");
  });

  it("leaves a plain away game unstyled", () => {
    expect(spielplanRowClass(makeMatch())).toBe("");
  });
});

describe("selectedTeamApiId", () => {
  const games = [
    makeMatch({ guestTeamCustomName: "Herren 2", guestTeamApiId: 20 }),
    makeMatch({
      id: 2,
      homeIsOwnClub: true,
      guestIsOwnClub: false,
      homeTeamCustomName: "U18",
      homeTeamApiId: 33,
      guestTeamCustomName: null,
    }),
  ];

  it("resolves the api id when exactly one team is selected", () => {
    expect(selectedTeamApiId(games, ["Herren 2"])).toBe(20);
    expect(selectedTeamApiId(games, ["U18"])).toBe(33);
  });

  it("is null without a single-team selection", () => {
    expect(selectedTeamApiId(games, undefined)).toBeNull();
    expect(selectedTeamApiId(games, [])).toBeNull();
    expect(selectedTeamApiId(games, ["Herren 2", "U18"])).toBeNull();
    expect(selectedTeamApiId(games, ["Damen 1"])).toBeNull();
  });
});
