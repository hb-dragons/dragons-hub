import { db } from "../../config/database";
import { refereeGames } from "@dragons/db/schema";
import { and, eq, gte, lte, or, ilike, sql, asc } from "drizzle-orm";
import type { RefereeGameListItem } from "@dragons/shared";

interface GetRefereeGamesParams {
  limit: number;
  offset: number;
  search?: string;
  status?: "active" | "cancelled" | "forfeited" | "all";
  league?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getRefereeGames(params: GetRefereeGamesParams) {
  const { limit, offset, search, status, league, dateFrom, dateTo } = params;
  const conditions = [];

  // Status
  if (status === "cancelled") conditions.push(eq(refereeGames.isCancelled, true));
  else if (status === "forfeited") conditions.push(eq(refereeGames.isForfeited, true));
  else if (status !== "all") {
    conditions.push(eq(refereeGames.isCancelled, false));
    conditions.push(eq(refereeGames.isForfeited, false));
  }

  // League
  if (league) conditions.push(eq(refereeGames.leagueShort, league));

  // Date range
  if (dateFrom) conditions.push(gte(refereeGames.kickoffDate, dateFrom));
  if (dateTo) conditions.push(lte(refereeGames.kickoffDate, dateTo));

  // Search
  if (search) {
    const words = search.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const pattern = `%${word}%`;
      conditions.push(or(
        ilike(refereeGames.homeTeamName, pattern),
        ilike(refereeGames.guestTeamName, pattern),
        ilike(refereeGames.leagueName, pattern),
      )!);
    }
  }

  const whereClause = conditions.length > 0
    ? conditions.length === 1 ? conditions[0]! : and(...conditions)!
    : undefined;

  const isTrackedLeague = sql<boolean>`${refereeGames.matchId} IS NOT NULL`.as("is_tracked_league");

  const [items, countResult] = await Promise.all([
    db.select({
      id: refereeGames.id,
      apiMatchId: refereeGames.apiMatchId,
      matchId: refereeGames.matchId,
      matchNo: refereeGames.matchNo,
      kickoffDate: refereeGames.kickoffDate,
      kickoffTime: refereeGames.kickoffTime,
      homeTeamName: refereeGames.homeTeamName,
      guestTeamName: refereeGames.guestTeamName,
      leagueName: refereeGames.leagueName,
      leagueShort: refereeGames.leagueShort,
      venueName: refereeGames.venueName,
      venueCity: refereeGames.venueCity,
      sr1OurClub: refereeGames.sr1OurClub,
      sr2OurClub: refereeGames.sr2OurClub,
      sr1Name: refereeGames.sr1Name,
      sr2Name: refereeGames.sr2Name,
      sr1Status: refereeGames.sr1Status,
      sr2Status: refereeGames.sr2Status,
      isCancelled: refereeGames.isCancelled,
      isForfeited: refereeGames.isForfeited,
      lastSyncedAt: refereeGames.lastSyncedAt,
      isTrackedLeague,
      isHomeGame: refereeGames.isHomeGame,
      isGuestGame: refereeGames.isGuestGame,
    })
    .from(refereeGames)
    .where(whereClause)
    .orderBy(asc(refereeGames.kickoffDate), asc(refereeGames.kickoffTime))
    .limit(limit)
    .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
    .from(refereeGames)
    .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;
  return {
    items: items as RefereeGameListItem[],
    total, limit, offset,
    hasMore: offset + items.length < total,
  };
}
