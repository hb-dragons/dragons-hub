import { eq, and, or, desc, isNotNull } from "drizzle-orm";
import type { TeamStats, FormEntry } from "@dragons/shared";
import { db } from "../../config/database";
import { teams, standings, leagues, matches } from "@dragons/db/schema";

export async function getTeamStats(teamId: number): Promise<TeamStats | null> {
  // Look up team by internal id to get apiTeamPermanentId
  const [team] = await db
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) {
    return null;
  }

  const apiId = team.apiTeamPermanentId;

  // Get standing joined with league for this team
  const [standing] = await db
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
    .where(eq(standings.teamApiId, apiId))
    .limit(1);

  // Get last 5 completed matches (both scores present)
  const recentMatches = await db
    .select({
      id: matches.id,
      homeTeamApiId: matches.homeTeamApiId,
      guestTeamApiId: matches.guestTeamApiId,
      homeScore: matches.homeScore,
      guestScore: matches.guestScore,
    })
    .from(matches)
    .where(
      and(
        or(
          eq(matches.homeTeamApiId, apiId),
          eq(matches.guestTeamApiId, apiId),
        ),
        isNotNull(matches.homeScore),
        isNotNull(matches.guestScore),
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
}
