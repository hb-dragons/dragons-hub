import { db } from "../../config/database";
import { standings, teams } from "@dragons/db/schema";
import { eq, sql } from "drizzle-orm";
import { getOwnClubMatches } from "../admin/match-query.service";
import type { HomeDashboard, ClubStats } from "@dragons/shared";

export async function getHomeDashboard(): Promise<HomeDashboard> {
  const today = new Date().toISOString().split("T")[0]!;

  const [nextGameResult, recentResultsResult, upcomingGamesResult, statsRows] =
    await Promise.all([
      getOwnClubMatches({
        limit: 1,
        offset: 0,
        dateFrom: today,
        hasScore: false,
        sort: "asc",
        excludeInactive: true,
      }),
      getOwnClubMatches({
        limit: 5,
        offset: 0,
        dateTo: today,
        hasScore: true,
        sort: "desc",
        excludeInactive: true,
      }),
      getOwnClubMatches({
        limit: 3,
        offset: 0,
        dateFrom: today,
        hasScore: false,
        sort: "asc",
        excludeInactive: true,
      }),
      db
        .select({
          totalWins: sql<number>`coalesce(sum(${standings.won}),0)::int`,
          totalLosses: sql<number>`coalesce(sum(${standings.lost}),0)::int`,
        })
        .from(standings)
        .innerJoin(teams, eq(standings.teamApiId, teams.apiTeamPermanentId))
        .where(eq(teams.isOwnClub, true)),
    ]);

  const [teamCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teams)
    .where(eq(teams.isOwnClub, true));

  const teamCount = teamCountRow?.count ?? 0;
  const totalWins = statsRows[0]?.totalWins ?? 0;
  const totalLosses = statsRows[0]?.totalLosses ?? 0;
  const totalGames = totalWins + totalLosses;
  const winPercentage = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  const clubStats: ClubStats = {
    teamCount,
    totalWins,
    totalLosses,
    winPercentage,
  };

  return {
    nextGame: nextGameResult.items[0] ?? null,
    recentResults: recentResultsResult.items,
    upcomingGames: upcomingGamesResult.items,
    clubStats,
  };
}
