import { describe, expect, it } from "vitest";
import type { MatchListItem } from "@dragons/shared";
import { filterByLocation, matchCardModel, scoreLine } from "./match-card";

function match(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return {
    id: 1,
    kickoffDate: "2026-11-14",
    kickoffTime: "12:00:00",
    homeTeamName: "Dragons Rhöndorf 2",
    homeTeamNameShort: "DRAG2",
    homeTeamCustomName: "Herren 2",
    homeClubId: 10,
    guestTeamName: "Basketballgemeinschaft Dorsten-Hervest 2",
    guestTeamNameShort: "BGDH2",
    guestTeamCustomName: null,
    guestClubId: 20,
    homeIsOwnClub: true,
    guestIsOwnClub: false,
    homeBadgeColor: "green",
    guestBadgeColor: null,
    homeScore: null,
    guestScore: null,
    isCancelled: false,
    isForfeited: false,
    ...overrides,
  } as MatchListItem;
}

describe("matchCardModel", () => {
  it("reads a home game from the club's side", () => {
    const m = matchCardModel(match());
    expect(m).toMatchObject({
      isHome: true,
      ownSide: "home",
      ownName: "Herren 2",
      ownRawName: "Dragons Rhöndorf 2",
      ownBadgeColor: "green",
      opponentClubId: 20,
      homeName: "Herren 2",
      guestName: "Basketballgemeinschaft Dorsten-Hervest 2",
      hasScore: false,
      outcome: "upcoming",
    });
  });

  it("shows the opponent's full federation name, not its short code", () => {
    expect(matchCardModel(match()).opponentName).toBe("Basketballgemeinschaft Dorsten-Hervest 2");
  });

  it("flips names, club and score for an away game", () => {
    const m = matchCardModel(
      match({
        homeIsOwnClub: false,
        guestIsOwnClub: true,
        homeTeamName: "TK Hannover 2",
        homeTeamCustomName: null,
        homeBadgeColor: null,
        guestTeamName: "Dragons Rhöndorf",
        guestTeamNameShort: "DRAG1",
        guestTeamCustomName: null,
        guestBadgeColor: "blue",
        homeScore: 74,
        guestScore: 81,
      }),
    );
    expect(m).toMatchObject({
      isHome: false,
      ownSide: "guest",
      ownName: "DRAG1",
      ownRawName: "Dragons Rhöndorf",
      ownBadgeColor: "blue",
      opponentName: "TK Hannover 2",
      opponentClubId: 10,
      homeName: "TK Hannover 2",
      guestName: "DRAG1",
      ownScore: 81,
      opponentScore: 74,
      outcome: "win",
    });
  });

  it("falls back to the federation name when the squad has no custom or short name", () => {
    const m = matchCardModel(match({ homeTeamCustomName: null, homeTeamNameShort: null }));
    expect(m.ownName).toBe("Dragons Rhöndorf 2");
  });

  it("calls a lower own score a loss", () => {
    expect(matchCardModel(match({ homeScore: 58, guestScore: 63 })).outcome).toBe("loss");
  });

  it("puts cancelled before forfeited before the score", () => {
    expect(
      matchCardModel(match({ isCancelled: true, isForfeited: true, homeScore: 20, guestScore: 0 })).outcome,
    ).toBe("cancelled");
    expect(matchCardModel(match({ isForfeited: true, homeScore: 20, guestScore: 0 })).outcome).toBe(
      "forfeited",
    );
  });

  it("reads a game between two other clubs from the home side, with no own side", () => {
    const m = matchCardModel(match({ homeIsOwnClub: false, guestIsOwnClub: false }));
    expect(m.isHome).toBe(true);
    expect(m.ownSide).toBeNull();
  });
});

describe("scoreLine", () => {
  it("puts the own score first", () => {
    const away = matchCardModel(
      match({ homeIsOwnClub: false, guestIsOwnClub: true, homeScore: 74, guestScore: 81 }),
    );
    expect(scoreLine(away)).toBe("81:74");
  });

  it("is null without a result", () => {
    expect(scoreLine(matchCardModel(match()))).toBeNull();
  });
});

describe("filterByLocation", () => {
  const home = match({ id: 1 });
  const away = match({ id: 2, homeIsOwnClub: false, guestIsOwnClub: true });

  it("keeps everything for 'all'", () => {
    expect(filterByLocation([home, away], "all")).toEqual([home, away]);
  });

  it("keeps home games for 'home' and away games for 'away'", () => {
    expect(filterByLocation([home, away], "home")).toEqual([home]);
    expect(filterByLocation([home, away], "away")).toEqual([away]);
  });
});
