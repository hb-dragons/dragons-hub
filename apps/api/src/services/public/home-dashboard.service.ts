import { getDb } from "../../config/database";
import { standings, teams, leagues } from "@dragons/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getOwnClubMatches } from "../admin/match-query.service";
import { getActiveSeasonId } from "../admin/season.service";
import type { HomeDashboard, ClubStats } from "@dragons/shared";

const EMPTY_DASHBOARD: HomeDashboard = {
  nextGame: null,
  recentResults: [],
  upcomingGames: [],
  clubStats: { teamCount: 0, totalWins: 0, totalLosses: 0, winPercentage: 0 },
};

/**
 * Own-club team count. Season-agnostic — the club fields the same teams whichever
 * season is live — so it is the one figure the dashboard can still report when
 * no season is active.
 */
function teamCountQuery() {
  return getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(teams)
    .where(eq(teams.isOwnClub, true));
}

export async function getHomeDashboard(): Promise<HomeDashboard> {
  const today = new Date().toISOString().split("T")[0]!;

  // Resolved before the fan-out rather than inside it: it is a cached lookup
  // (60s TTL) that usually costs no query at all, and every other read below
  // needs its result to be season-scoped.
  const seasonId = await getActiveSeasonId();

  if (seasonId === null) {
    const [row] = await teamCountQuery();
    return {
      ...EMPTY_DASHBOARD,
      clubStats: { ...EMPTY_DASHBOARD.clubStats, teamCount: row?.count ?? 0 },
    };
  }

  const [nextGameResult, recentResultsResult, upcomingGamesResult, statsRows, teamCountRows] =
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
      teamCountQuery(),
    ]);

  const totalWins = statsRows[0]?.totalWins ?? 0;
  const totalLosses = statsRows[0]?.totalLosses ?? 0;
  const totalGames = totalWins + totalLosses;
  const winPercentage = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  const clubStats: ClubStats = {
    teamCount: teamCountRows[0]?.count ?? 0,
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
