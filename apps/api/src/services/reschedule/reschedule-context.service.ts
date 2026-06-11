import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../config/database";
import { matches, venues, venueBookings } from "@dragons/db/schema";
import { queryMatchWithJoins, getOwnClubMatches } from "../admin/match-query.service";
import { getVisibleRefereeGameByMatchId } from "../referee/referee-game-visibility.service";
import type { z } from "zod";
import type { dateRangeSchema, listVenueBookingsSchema, roundWindowSchema } from "./reschedule.types";

export interface RescheduleMatch {
  matchId: number;
  apiMatchId: number;
  matchDay: number;
  leagueId: number | null;
  leagueName: string | null;
  date: string;
  time: string;
  homeTeamApiId: number;
  homeTeamName: string;
  guestTeamApiId: number;
  guestTeamName: string;
  venueId: number | null;
  venueName: string | null;
  isCancelled: boolean;
  isForfeited: boolean;
}

export async function getMatchForReschedule(matchId: number): Promise<RescheduleMatch | null> {
  const [row] = await queryMatchWithJoins().where(eq(matches.id, matchId)).limit(1);
  if (!row) return null;
  return {
    matchId: row.id,
    apiMatchId: row.apiMatchId,
    matchDay: row.matchDay,
    leagueId: row.leagueId,
    leagueName: row.leagueName,
    date: row.kickoffDate,
    time: row.kickoffTime,
    homeTeamApiId: row.homeTeamApiId,
    homeTeamName: row.homeTeamName,
    guestTeamApiId: row.guestTeamApiId,
    guestTeamName: row.guestTeamName,
    venueId: row.venueId,
    venueName: row.venueName,
    isCancelled: row.isCancelled ?? false,
    isForfeited: row.isForfeited ?? false,
  };
}

export async function listClubMatches(range: z.infer<typeof dateRangeSchema>) {
  const { items } = await getOwnClubMatches({
    limit: 200,
    offset: 0,
    dateFrom: range.from,
    dateTo: range.to,
    excludeInactive: true,
    sort: "asc",
  });
  return items.map((m) => ({
    matchId: m.id,
    apiMatchId: m.apiMatchId,
    date: m.kickoffDate,
    time: m.kickoffTime,
    homeTeamName: m.homeTeamName,
    guestTeamName: m.guestTeamName,
    venueId: m.venueId,
    venueName: m.venueName,
  }));
}

export async function listVenueBookings(params: z.infer<typeof listVenueBookingsSchema>) {
  const where = [gte(venueBookings.date, params.from), lte(venueBookings.date, params.to)];
  if (params.venueId != null) {
    where.push(eq(venueBookings.venueId, params.venueId));
  }
  return getDb()
    .select({
      venueId: venueBookings.venueId,
      date: venueBookings.date,
      calculatedStartTime: venueBookings.calculatedStartTime,
      calculatedEndTime: venueBookings.calculatedEndTime,
      overrideStartTime: venueBookings.overrideStartTime,
      overrideEndTime: venueBookings.overrideEndTime,
      status: venueBookings.status,
      needsReconfirmation: venueBookings.needsReconfirmation,
    })
    .from(venueBookings)
    .where(and(...where))
    .orderBy(asc(venueBookings.date));
}

export async function listClubVenues() {
  return getDb()
    .select({ venueId: venues.id, name: venues.name, city: venues.city })
    .from(venues)
    .orderBy(asc(venues.name));
}

export async function getRoundWindow(
  params: z.infer<typeof roundWindowSchema>,
): Promise<{ from: string; to: string } | null> {
  const rows = await getDb()
    .select({ date: matches.kickoffDate })
    .from(matches)
    .where(and(eq(matches.leagueId, params.leagueId), eq(matches.matchDay, params.matchDay)));
  const dates = rows.map((r) => r.date).filter((d): d is string => !!d);
  if (dates.length === 0) return null;
  /* v8 ignore next -- reduce ternary branches covered by 3-date test; v8 misreports inline ternaries */
  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  /* v8 ignore next -- reduce ternary branches covered by 3-date test; v8 misreports inline ternaries */
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));
  return { from: minDate, to: maxDate };
}

export interface RefereeContext {
  slots: Array<{ slot: 1 | 2; name: string | null; status: string; ourClub: boolean }>;
  note: string;
}

export async function getRefereeContext(matchId: number): Promise<RefereeContext> {
  const note =
    "Referee availability for a NEW date is a heuristic; confirm after the portal move.";
  const game = await getVisibleRefereeGameByMatchId(null, matchId);
  if (!game) return { slots: [], note };
  return {
    slots: [
      { slot: 1, name: game.sr1Name, status: game.sr1Status, ourClub: game.sr1OurClub },
      { slot: 2, name: game.sr2Name, status: game.sr2Status, ourClub: game.sr2OurClub },
    ],
    note,
  };
}
