import { getDb } from "../../config/database";
import { standings, teams, leagues } from "@dragons/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getOwnClubMatches } from "../admin/match-query.service";
import type { HomeDashboard, ClubStats } from "@dragons/shared";
import { withActiveSeason } from "../season-scope";

const EMPTY_DASHBOARD: HomeDashboard = {
  nextGame: null,
  recentResults: [],
  upcomingGames: [],
  clubStats: { teamCount: 0, totalWins: 0, totalLosses: 0, winPercentage: 0 },
};

export async function getHomeDashboard(): Promise<HomeDashboard> {
  const today = new Date().toISOString().split("T")[0]!;

  // teamCount is season-agnostic (own-club teams don't change per season)
  const [teamCountRow] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(teams)
    .where(eq(teams.isOwnClub, true));

  const teamCount = teamCountRow?.count ?? 0;

  return withActiveSeason(async (seasonId) => {
    const [nextGameResult, recentResultsResult, upcomingGamesResult, statsRows] =
      await Promise.all([
        getOwnClubMatches({
          limit: 1,
          offset: 0,
          dateFrom: today,
          hasScore: false,
          sort: "asc",
          excludeInactive: true,
          seasonId,
        }),
        getOwnClubMatches({
          limit: 5,
          offset: 0,
          dateTo: today,
          hasScore: true,
          sort: "desc",
          excludeInactive: true,
          seasonId,
        }),
        getOwnClubMatches({
          limit: 3,
          offset: 0,
          dateFrom: today,
          hasScore: false,
          sort: "asc",
          excludeInactive: true,
          seasonId,
        }),
        getDb()
          .select({
            totalWins: sql<number>`coalesce(sum(${standings.won}),0)::int`,
            totalLosses: sql<number>`coalesce(sum(${standings.lost}),0)::int`,
          })
          .from(standings)
          .innerJoin(teams, eq(standings.teamApiId, teams.apiTeamPermanentId))
          .innerJoin(leagues, eq(standings.leagueId, leagues.id))
          .where(and(eq(teams.isOwnClub, true), eq(leagues.seasonRefId, seasonId))),
      ]);

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
  }, { ...EMPTY_DASHBOARD, clubStats: { ...EMPTY_DASHBOARD.clubStats, teamCount } });
}
