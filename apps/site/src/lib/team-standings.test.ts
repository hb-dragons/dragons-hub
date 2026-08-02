import { describe, expect, it } from "vitest";

import {
  findTeamLeague,
  toStandingRows,
  type PublicLeagueStandings,
  type PublicStandingItem,
} from "./team-standings";

function item(overrides: Partial<PublicStandingItem> = {}): PublicStandingItem {
  return {
    position: 1,
    teamApiId: 158917,
    clubId: 1465,
    teamName: "SC Weende",
    teamNameShort: null,
    isOwnClub: false,
    played: 12,
    won: 10,
    lost: 2,
    pointsFor: 756,
    pointsAgainst: 534,
    pointsDiff: 222,
    leaguePoints: 20,
    verzicht: false,
    ...overrides,
  };
}

function league(overrides: Partial<PublicLeagueStandings> = {}): PublicLeagueStandings {
  return {
    leagueId: 2,
    leagueName: "Landesliga Herren 2",
    seasonName: "2025/2026",
    standings: [item()],
    ...overrides,
  };
}

describe("findTeamLeague", () => {
  const herren = league({
    leagueId: 2,
    standings: [item({ teamApiId: 160402, isOwnClub: true })],
  });
  const damen = league({
    leagueId: 1,
    leagueName: "Oberliga Damen Ost",
    standings: [item({ teamApiId: 320674, isOwnClub: true })],
  });

  it("returns the league containing the team's api id", () => {
    expect(findTeamLeague([damen, herren], 160402)).toBe(herren);
  });

  it("returns null when no league contains the team", () => {
    expect(findTeamLeague([damen, herren], 999999)).toBeNull();
  });

  it("returns null without an api id", () => {
    expect(findTeamLeague([damen, herren], null)).toBeNull();
    expect(findTeamLeague([damen, herren], undefined)).toBeNull();
  });
});

describe("toStandingRows", () => {
  it("adapts the public naming to the legacy row shape", () => {
    const rows = toStandingRows(
      league({
        standings: [
          item({
            position: 3,
            teamName: "HB Dragons LLH",
            played: 12,
            won: 8,
            lost: 4,
            leaguePoints: 16,
            pointsFor: 700,
            pointsAgainst: 650,
          }),
        ],
      }),
    );
    expect(rows).toEqual([
      {
        rank: 3,
        name: "HB Dragons LLH",
        games: 12,
        wins: 8,
        losses: 4,
        points: 16,
        pointsFor: 700,
        pointsAgainst: 650,
        resigned: false,
      },
    ]);
  });

  it("marks withdrawn teams as resigned", () => {
    const rows = toStandingRows(league({ standings: [item({ verzicht: true })] }));
    expect(rows[0]?.resigned).toBe(true);
  });

  it("treats a missing verzicht flag as not resigned", () => {
    const legacyItem = item();
    delete legacyItem.verzicht;
    const rows = toStandingRows(league({ standings: [legacyItem] }));
    expect(rows[0]?.resigned).toBe(false);
  });
});
