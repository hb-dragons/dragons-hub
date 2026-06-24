import { eq, and, or, desc, isNotNull } from "drizzle-orm";
import type { TeamStats, FormEntry } from "@dragons/shared";
import { getDb } from "../../config/database";
import { teams, standings, leagues, matches } from "@dragons/db/schema";
import { withActiveSeason } from "../season-scope";

export async function getTeamStats(teamId: number): Promise<TeamStats | null> {
  // Look up team by internal id to get apiTeamPermanentId
  const [team] = await getDb()
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) {
    return null;
  }

  const apiId = team.apiTeamPermanentId;

  return withActiveSeason(async (seasonId) => {
    // Get standing joined with league for this team in the active season
    const [standing] = await getDb()
      .select({
        position: standings.position,
        played: standings.played,
        won: standings.won,
        lost: standings.lost,
        pointsFor: standings.pointsFor,
        pointsAgainst: standings.pointsAgainst,
        pointsDiff: standings.pointsDiff,
        leagueName: leagues.name,
      })
      .from(standings)
      .innerJoin(leagues, eq(standings.leagueId, leagues.id))
      .where(and(eq(standings.teamApiId, apiId), eq(leagues.seasonRefId, seasonId)))
      .limit(1);

    // Get last 5 completed matches (both scores present) in the active season
    const recentMatches = await getDb()
      .select({
        id: matches.id,
        homeTeamApiId: matches.homeTeamApiId,
        guestTeamApiId: matches.guestTeamApiId,
        homeScore: matches.homeScore,
        guestScore: matches.guestScore,
      })
      .from(matches)
      .innerJoin(leagues, eq(matches.leagueId, leagues.id))
      .where(
        and(
          or(
            eq(matches.homeTeamApiId, apiId),
            eq(matches.guestTeamApiId, apiId),
          ),
          isNotNull(matches.homeScore),
          isNotNull(matches.guestScore),
          eq(leagues.seasonRefId, seasonId),
        ),
      )
      .orderBy(desc(matches.kickoffDate))
      .limit(5);

    const form: FormEntry[] = recentMatches.map((match) => {
      const isHome = match.homeTeamApiId === apiId;
      const teamScore = isHome ? match.homeScore! : match.guestScore!;
      const opponentScore = isHome ? match.guestScore! : match.homeScore!;
      return {
        result: teamScore > opponentScore ? "W" : "L",
        matchId: match.id,
      };
    });

    return {
      teamId,
      leagueName: standing?.leagueName ?? "",
      position: standing?.position ?? null,
      played: standing?.played ?? 0,
      wins: standing?.won ?? 0,
      losses: standing?.lost ?? 0,
      pointsFor: standing?.pointsFor ?? 0,
      pointsAgainst: standing?.pointsAgainst ?? 0,
      pointsDiff: standing?.pointsDiff ?? 0,
      form,
    };
  }, null);
}
