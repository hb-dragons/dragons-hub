import { describe, it, expect } from "vitest";
import type { LeagueStandings, StandingItem } from "./standings";
import { findLeagueStandingsForTeam, buildTeamsByApiId } from "./standings-lookup";

function standing(teamApiId: number, teamName: string): StandingItem {
  return {
    position: 1,
    teamApiId,
    clubId: 1,
    teamName,
    teamNameShort: null,
    isOwnClub: true,
    played: 0,
    won: 0,
    lost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointsDiff: 0,
    leaguePoints: 0,
    verzicht: false,
  };
}

function league(leagueId: number, leagueName: string, rows: StandingItem[]): LeagueStandings {
  return { leagueId, leagueName, seasonName: "2025/26", standings: rows };
}

// Real prod shape: the U18 squad's name is a prefix of the Damen squad's name,
// and five youth squads share the short name "DRAG1".
const LEAGUES: LeagueStandings[] = [
  league(14, "2. Regionalliga Damen West", [standing(320674, "Hanover Basketball Dragons")]),
  league(21, "Landesliga Damen 2", [standing(320914, "Hanover Basketball Dragons II")]),
  league(20, "Landesliga männlich U18 Süd", [standing(159888, "Hanover Basketball Dragons")]),
  league(17, "Regionsklasse U14 männlich / 1", [standing(290567, "Hanover Dragons")]),
  league(16, "Regionsklasse U12 männlich / 2", [standing(290564, "Hanover Dragons")]),
];

describe("findLeagueStandingsForTeam", () => {
  it("returns the league the team's api id actually appears in", () => {
    expect(findLeagueStandingsForTeam(LEAGUES, 290564)?.leagueId).toBe(16);
    expect(findLeagueStandingsForTeam(LEAGUES, 159888)?.leagueId).toBe(20);
    expect(findLeagueStandingsForTeam(LEAGUES, 320914)?.leagueId).toBe(21);
  });

  it("does not match a different squad whose name shares a prefix", () => {
    // Name matching resolved 320674 ("Hanover Basketball Dragons", Damen 1) to
    // whichever league listed a name containing it first.
    expect(findLeagueStandingsForTeam(LEAGUES, 320674)?.leagueId).toBe(14);
  });

  it("returns null for a team that is in no league table", () => {
    expect(findLeagueStandingsForTeam(LEAGUES, 999999)).toBeNull();
    expect(findLeagueStandingsForTeam(LEAGUES, null)).toBeNull();
    expect(findLeagueStandingsForTeam(LEAGUES, undefined)).toBeNull();
  });

  it("tolerates an empty league list", () => {
    expect(findLeagueStandingsForTeam([], 1)).toBeNull();
  });
});

describe("buildTeamsByApiId", () => {
  it("keys teams by their permanent api id", () => {
    const teams = [
      { apiTeamPermanentId: 290564, name: "Hanover Dragons" },
      { apiTeamPermanentId: 290567, name: "Hanover Dragons" },
    ];
    const map = buildTeamsByApiId(teams);
    expect(map.get(290564)?.apiTeamPermanentId).toBe(290564);
    expect(map.get(290567)?.apiTeamPermanentId).toBe(290567);
    expect(map.size).toBe(2);
  });

  it("keeps the first team when two rows share an api id", () => {
    const map = buildTeamsByApiId([
      { apiTeamPermanentId: 1, name: "first" },
      { apiTeamPermanentId: 1, name: "second" },
    ]);
    expect(map.get(1)?.name).toBe("first");
  });
});
