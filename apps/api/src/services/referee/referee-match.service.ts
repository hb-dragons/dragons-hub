import { db } from "../../config/database";
import {
  matches,
  teams,
  leagues,
  venues,
  refereeAssignmentIntents,
  matchReferees,
  referees,
  refereeRoles,
} from "@dragons/db/schema";
import { eq, or, and, sql, asc, gte, lte, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  RefereeMatchListItem,
  TakeMatchResponse,
  VerifyMatchResponse,
  PaginatedResponse,
} from "@dragons/shared";
import { sdkClient } from "../sync/sdk-client";
import { logger } from "../../config/logger";

const log = logger.child({ service: "referee-match" });

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
  refereeId: number | null,
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

  const [allIntentsRaw, assignments] =
    matchIds.length > 0
      ? await Promise.all([
          db
            .select({
              matchId: refereeAssignmentIntents.matchId,
              slotNumber: refereeAssignmentIntents.slotNumber,
              refereeId: refereeAssignmentIntents.refereeId,
              clickedAt: refereeAssignmentIntents.clickedAt,
              confirmedBySyncAt: refereeAssignmentIntents.confirmedBySyncAt,
              refereeFirstName: referees.firstName,
              refereeLastName: referees.lastName,
            })
            .from(refereeAssignmentIntents)
            .innerJoin(referees, eq(refereeAssignmentIntents.refereeId, referees.id))
            .where(inArray(refereeAssignmentIntents.matchId, matchIds)),
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

  const intentsByMatch = new Map<number, RefereeMatchListItem["intents"]>();
  for (const i of allIntentsRaw) {
    const existing = intentsByMatch.get(i.matchId) ?? [];
    existing.push({
      slotNumber: i.slotNumber,
      refereeId: i.refereeId,
      refereeFirstName: i.refereeFirstName,
      refereeLastName: i.refereeLastName,
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
      currentRefereeId: refereeId,
      intents: intentsByMatch.get(row.id) ?? [],
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
      matchId: intent!.matchId,
      slotNumber: intent!.slotNumber,
      clickedAt: intent!.clickedAt.toISOString(),
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

export async function verifyMatchAssignment(
  matchId: number,
  refereeId: number,
): Promise<VerifyMatchResponse | { error: string; status: number }> {
  const [match] = await db
    .select({
      id: matches.id,
      apiMatchId: matches.apiMatchId,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) {
    return { error: "Match not found", status: 404 };
  }

  // Fetch fresh game details from the SDK
  let details;
  try {
    details = await sdkClient.getGameDetails(match.apiMatchId);
  } catch (error) {
    log.error({ err: error, apiMatchId: match.apiMatchId }, "Failed to fetch game details for verification");
    return { error: "Failed to fetch game details from Basketball-Bund", status: 502 };
  }

  // Update SR open status on the match
  await db
    .update(matches)
    .set({
      sr1Open: details.sr1?.offenAngeboten ?? false,
      sr2Open: details.sr2?.offenAngeboten ?? false,
      lastRemoteSync: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(matches.id, match.id));

  // Sync referee assignments from the fresh details
  for (const [slotKey, slotNumber] of [["sr1", 1], ["sr2", 2]] as const) {
    const slot = details[slotKey];
    const spielleitung = slot?.spielleitung;

    if (spielleitung?.schiedsrichter?.personVO && spielleitung?.schirirolle) {
      const { schiedsrichter, schirirolle } = spielleitung;

      // Upsert referee
      const now = new Date();
      const [ref] = await db
        .insert(referees)
        .values({
          apiId: schiedsrichter.schiedsrichterId,
          firstName: schiedsrichter.personVO.vorname,
          lastName: schiedsrichter.personVO.nachname,
          licenseNumber: schiedsrichter.lizenznummer,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: referees.apiId,
          set: {
            firstName: schiedsrichter.personVO.vorname,
            lastName: schiedsrichter.personVO.nachname,
            licenseNumber: schiedsrichter.lizenznummer,
            updatedAt: now,
          },
        })
        .returning({ id: referees.id });

      // Upsert role
      const [role] = await db
        .insert(refereeRoles)
        .values({
          apiId: schirirolle.schirirolleId,
          name: schirirolle.schirirollename,
          shortName: schirirolle.schirirollekurzname,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: refereeRoles.apiId,
          set: {
            name: schirirolle.schirirollename,
            shortName: schirirolle.schirirollekurzname,
            updatedAt: now,
          },
        })
        .returning({ id: refereeRoles.id });

      // Upsert match referee assignment
      const [existing] = await db
        .select()
        .from(matchReferees)
        .where(
          and(
            eq(matchReferees.matchId, match.id),
            eq(matchReferees.slotNumber, slotNumber),
          ),
        )
        .limit(1);

      if (!existing) {
        await db.insert(matchReferees).values({
          matchId: match.id,
          refereeId: ref!.id,
          roleId: role!.id,
          slotNumber,
          createdAt: now,
        });
      } else if (existing.refereeId !== ref!.id || existing.roleId !== role!.id) {
        await db
          .update(matchReferees)
          .set({ refereeId: ref!.id, roleId: role!.id })
          .where(eq(matchReferees.id, existing.id));
      }
    }
  }

  // Check if this referee is now assigned to the match and confirm intent
  const [assignment] = await db
    .select({ id: matchReferees.id })
    .from(matchReferees)
    .where(
      and(
        eq(matchReferees.matchId, match.id),
        eq(matchReferees.refereeId, refereeId),
      ),
    )
    .limit(1);

  const confirmed = !!assignment;

  if (confirmed) {
    await db
      .update(refereeAssignmentIntents)
      .set({ confirmedBySyncAt: new Date() })
      .where(
        and(
          eq(refereeAssignmentIntents.matchId, match.id),
          eq(refereeAssignmentIntents.refereeId, refereeId),
          isNull(refereeAssignmentIntents.confirmedBySyncAt),
        ),
      );
  }

  // Load current referee names for response
  const assignedRefs = await db
    .select({
      slotNumber: matchReferees.slotNumber,
      firstName: referees.firstName,
      lastName: referees.lastName,
    })
    .from(matchReferees)
    .innerJoin(referees, eq(matchReferees.refereeId, referees.id))
    .where(eq(matchReferees.matchId, match.id));

  const sr1Ref = assignedRefs.find((r) => r.slotNumber === 1);
  const sr2Ref = assignedRefs.find((r) => r.slotNumber === 2);

  return {
    confirmed,
    sr1Open: details.sr1?.offenAngeboten ?? false,
    sr2Open: details.sr2?.offenAngeboten ?? false,
    sr1Referee: sr1Ref ? { firstName: sr1Ref.firstName, lastName: sr1Ref.lastName } : null,
    sr2Referee: sr2Ref ? { firstName: sr2Ref.firstName, lastName: sr2Ref.lastName } : null,
  };
}
