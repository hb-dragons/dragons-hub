import { db } from "../../config/database";
import { standings, leagues, teams } from "@dragons/db/schema";
import { eq, asc } from "drizzle-orm";
import type { StandingItem, LeagueStandings } from "@dragons/shared";

export async function getStandings(): Promise<LeagueStandings[]> {
  const rows = await db
    .select({
      leagueId: leagues.id,
      leagueName: leagues.name,
      seasonName: leagues.seasonName,
      position: standings.position,
      teamApiId: standings.teamApiId,
      clubId: teams.clubId,
      teamName: teams.name,
      teamNameShort: teams.nameShort,
      isOwnClub: teams.isOwnClub,
      displayOrder: teams.displayOrder,
      played: standings.played,
      won: standings.won,
      lost: standings.lost,
      pointsFor: standings.pointsFor,
      pointsAgainst: standings.pointsAgainst,
      pointsDiff: standings.pointsDiff,
      leaguePoints: standings.leaguePoints,
    })
    .from(standings)
    .innerJoin(leagues, eq(standings.leagueId, leagues.id))
    .innerJoin(teams, eq(standings.teamApiId, teams.apiTeamPermanentId))
    .where(eq(leagues.isTracked, true))
    .orderBy(asc(leagues.name), asc(standings.position));

  const grouped = new Map<number, LeagueStandings>();
  const leagueOrder = new Map<number, number>();

  for (const row of rows) {
    let league = grouped.get(row.leagueId);
    if (!league) {
      league = {
        leagueId: row.leagueId,
        leagueName: row.leagueName,
        seasonName: row.seasonName,
        standings: [],
      };
      grouped.set(row.leagueId, league);
    }
    league.standings.push({
      position: row.position,
      teamApiId: row.teamApiId,
      clubId: row.clubId,
      teamName: row.teamName,
      teamNameShort: row.teamNameShort,
      isOwnClub: row.isOwnClub ?? false,
      played: row.played,
      won: row.won,
      lost: row.lost,
      pointsFor: row.pointsFor,
      pointsAgainst: row.pointsAgainst,
      pointsDiff: row.pointsDiff,
      leaguePoints: row.leaguePoints,
    });

    if (row.isOwnClub) {
      const current = leagueOrder.get(row.leagueId);
      if (current === undefined || row.displayOrder < current) {
        leagueOrder.set(row.leagueId, row.displayOrder);
      }
    }
  }

  // Sort leagues by their own-club team's displayOrder (leagues without an
  // own-club team fall to the end alphabetically).
  return Array.from(grouped.values()).sort((a, b) => {
    const aOrder = leagueOrder.get(a.leagueId);
    const bOrder = leagueOrder.get(b.leagueId);
    if (aOrder !== undefined && bOrder !== undefined) {
      return aOrder - bOrder || a.leagueName.localeCompare(b.leagueName);
    }
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    return a.leagueName.localeCompare(b.leagueName);
  });
}
