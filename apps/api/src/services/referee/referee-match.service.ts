import { db } from "../../config/database";
import {
  matches,
  teams,
  leagues,
  venues,
  refereeAssignmentIntents,
} from "@dragons/db/schema";
import { eq, or, and, sql, asc, gte, lte, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  RefereeMatchListItem,
  TakeMatchResponse,
  PaginatedResponse,
} from "@dragons/shared";

const homeTeam = alias(teams, "homeTeam");
const guestTeam = alias(teams, "guestTeam");

export interface OpenMatchListParams {
  limit: number;
  offset: number;
  leagueId?: number;
  dateFrom?: string;
  dateTo?: string;
}

export async function getMatchesWithOpenSlots(
  params: OpenMatchListParams,
  refereeId: number,
): Promise<PaginatedResponse<RefereeMatchListItem>> {
  const { limit, offset, leagueId, dateFrom, dateTo } = params;

  const conditions = [
    or(
      eq(matches.sr1Open, true),
      eq(matches.sr2Open, true),
      eq(matches.sr3Open, true),
    )!,
  ];

  if (leagueId) conditions.push(eq(matches.leagueId, leagueId));
  if (dateFrom) conditions.push(gte(matches.kickoffDate, dateFrom));
  if (dateTo) conditions.push(lte(matches.kickoffDate, dateTo));

  const whereClause = and(...conditions)!;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: matches.id,
        apiMatchId: matches.apiMatchId,
        matchNo: matches.matchNo,
        kickoffDate: matches.kickoffDate,
        kickoffTime: matches.kickoffTime,
        homeTeamName: homeTeam.name,
        guestTeamName: guestTeam.name,
        homeIsOwnClub: homeTeam.isOwnClub,
        guestIsOwnClub: guestTeam.isOwnClub,
        leagueName: leagues.name,
        venueName: venues.name,
        venueCity: venues.city,
        sr1Open: matches.sr1Open,
        sr2Open: matches.sr2Open,
        sr3Open: matches.sr3Open,
      })
      .from(matches)
      .innerJoin(
        homeTeam,
        eq(matches.homeTeamApiId, homeTeam.apiTeamPermanentId),
      )
      .innerJoin(
        guestTeam,
        eq(matches.guestTeamApiId, guestTeam.apiTeamPermanentId),
      )
      .leftJoin(leagues, eq(matches.leagueId, leagues.id))
      .leftJoin(venues, eq(matches.venueId, venues.id))
      .where(whereClause)
      .orderBy(asc(matches.kickoffDate), asc(matches.kickoffTime))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(matches)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const matchIds = rows.map((r) => r.id);
  const intents =
    matchIds.length > 0
      ? await db
          .select({
            matchId: refereeAssignmentIntents.matchId,
            slotNumber: refereeAssignmentIntents.slotNumber,
            clickedAt: refereeAssignmentIntents.clickedAt,
            confirmedBySyncAt: refereeAssignmentIntents.confirmedBySyncAt,
          })
          .from(refereeAssignmentIntents)
          .where(
            and(
              inArray(refereeAssignmentIntents.matchId, matchIds),
              eq(refereeAssignmentIntents.refereeId, refereeId),
            ),
          )
      : [];

  const intentsByMatch = new Map<number, RefereeMatchListItem["myIntents"]>();
  for (const i of intents) {
    const existing = intentsByMatch.get(i.matchId) ?? [];
    existing.push({
      slotNumber: i.slotNumber,
      clickedAt: i.clickedAt.toISOString(),
      confirmedBySyncAt: i.confirmedBySyncAt?.toISOString() ?? null,
    });
    intentsByMatch.set(i.matchId, existing);
  }

  const items: RefereeMatchListItem[] = rows.map((row) => ({
    id: row.id,
    apiMatchId: row.apiMatchId,
    matchNo: row.matchNo,
    kickoffDate: row.kickoffDate,
    kickoffTime: row.kickoffTime,
    homeTeamName: row.homeTeamName,
    guestTeamName: row.guestTeamName,
    homeIsOwnClub: row.homeIsOwnClub ?? false,
    guestIsOwnClub: row.guestIsOwnClub ?? false,
    leagueName: row.leagueName,
    venueName: row.venueName,
    venueCity: row.venueCity,
    sr1Open: row.sr1Open,
    sr2Open: row.sr2Open,
    sr3Open: row.sr3Open,
    myIntents: intentsByMatch.get(row.id) ?? [],
  }));

  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}

export async function recordTakeIntent(
  matchId: number,
  refereeId: number,
  slotNumber: number,
): Promise<TakeMatchResponse | { error: string; status: number }> {
  const [match] = await db
    .select({
      id: matches.id,
      apiMatchId: matches.apiMatchId,
      sr1Open: matches.sr1Open,
      sr2Open: matches.sr2Open,
      sr3Open: matches.sr3Open,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) {
    return { error: "Match not found", status: 404 };
  }

  const slotOpen =
    (slotNumber === 1 && match.sr1Open) ||
    (slotNumber === 2 && match.sr2Open) ||
    (slotNumber === 3 && match.sr3Open);

  if (!slotOpen) {
    return { error: "This referee slot is not open", status: 400 };
  }

  const now = new Date();
  const [intent] = await db
    .insert(refereeAssignmentIntents)
    .values({
      matchId,
      refereeId,
      slotNumber,
      clickedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        refereeAssignmentIntents.matchId,
        refereeAssignmentIntents.refereeId,
        refereeAssignmentIntents.slotNumber,
      ],
      set: { clickedAt: now },
    })
    .returning();

  return {
    deepLink: `https://basketball-bund.net/app.do?app=/sr/take&spielId=${match.apiMatchId}`,
    intent: {
      matchId: intent.matchId,
      slotNumber: intent.slotNumber,
      clickedAt: intent.clickedAt.toISOString(),
    },
  };
}
