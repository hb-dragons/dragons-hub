import { db } from "../../config/database";
import {
  matches,
  teams,
  leagues,
  venues,
  refereeAssignmentIntents,
  matchReferees,
  referees,
} from "@dragons/db/schema";
import { eq, or, and, sql, asc, gte, lte, inArray, isNull } from "drizzle-orm";
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

  // Show matches that either:
  // 1. Have open SR slots (offenAngeboten from API), OR
  // 2. Are home games in leagues where the club provides its own referees
  const conditions = [
    or(
      or(
        eq(matches.sr1Open, true),
        eq(matches.sr2Open, true),
      ),
      and(
        eq(leagues.ownClubRefs, true),
        eq(homeTeam.isOwnClub, true),
      ),
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
        isForfeited: matches.isForfeited,
        isCancelled: matches.isCancelled,
        ownClubRefs: leagues.ownClubRefs,
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
      .innerJoin(
        homeTeam,
        eq(matches.homeTeamApiId, homeTeam.apiTeamPermanentId),
      )
      .leftJoin(leagues, eq(matches.leagueId, leagues.id))
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const matchIds = rows.map((r) => r.id);

  const [intents, assignments] =
    matchIds.length > 0
      ? await Promise.all([
          db
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
            ),
          db
            .select({
              matchId: matchReferees.matchId,
              slotNumber: matchReferees.slotNumber,
              firstName: referees.firstName,
              lastName: referees.lastName,
            })
            .from(matchReferees)
            .innerJoin(referees, eq(matchReferees.refereeId, referees.id))
            .where(inArray(matchReferees.matchId, matchIds)),
        ])
      : [[], []];

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

  type RefName = { firstName: string | null; lastName: string | null };
  const assignmentsByMatch = new Map<number, Map<number, RefName>>();
  for (const a of assignments) {
    let slots = assignmentsByMatch.get(a.matchId);
    if (!slots) {
      slots = new Map();
      assignmentsByMatch.set(a.matchId, slots);
    }
    slots.set(a.slotNumber, { firstName: a.firstName, lastName: a.lastName });
  }

  const items: RefereeMatchListItem[] = rows.map((row) => {
    const slots = assignmentsByMatch.get(row.id);
    return {
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
      isForfeited: row.isForfeited ?? false,
      isCancelled: row.isCancelled ?? false,
      ownClubRefs: row.ownClubRefs ?? false,
      sr1Referee: slots?.get(1) ?? null,
      sr2Referee: slots?.get(2) ?? null,
      myIntents: intentsByMatch.get(row.id) ?? [],
    };
  });

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
      leagueOwnClubRefs: leagues.ownClubRefs,
      homeIsOwnClub: homeTeam.isOwnClub,
    })
    .from(matches)
    .innerJoin(
      homeTeam,
      eq(matches.homeTeamApiId, homeTeam.apiTeamPermanentId),
    )
    .leftJoin(leagues, eq(matches.leagueId, leagues.id))
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) {
    return { error: "Match not found", status: 404 };
  }

  const isOwnClubRefsMatch =
    match.leagueOwnClubRefs === true && match.homeIsOwnClub === true;

  const slotOpen =
    (slotNumber === 1 && match.sr1Open) ||
    (slotNumber === 2 && match.sr2Open);

  if (!slotOpen && !isOwnClubRefsMatch) {
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

export async function cancelTakeIntent(
  matchId: number,
  refereeId: number,
  slotNumber: number,
): Promise<{ success: true } | { error: string; status: number }> {
  const deleted = await db
    .delete(refereeAssignmentIntents)
    .where(
      and(
        eq(refereeAssignmentIntents.matchId, matchId),
        eq(refereeAssignmentIntents.refereeId, refereeId),
        eq(refereeAssignmentIntents.slotNumber, slotNumber),
        isNull(refereeAssignmentIntents.confirmedBySyncAt),
      ),
    )
    .returning();

  if (deleted.length === 0) {
    return { error: "No pending intent found", status: 404 };
  }

  return { success: true };
}
