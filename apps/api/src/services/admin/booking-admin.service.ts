import { getDb } from "../../config/database";
import {
  venueBookings,
  venueBookingMatches,
  venues,
  matches,
  teams,
  leagues,
} from "@dragons/db/schema";
import { eq, and, gte, lte, sql, count, asc } from "drizzle-orm";
import type {
  BookingListItem,
  BookingDetail,
  BookingStatus,
} from "@dragons/shared";
import { EVENT_TYPES } from "@dragons/shared";
import { publishDomainEvent } from "../events/event-publisher";
import { pickDefined } from "../utils/object";
import { logger } from "../../config/logger";

const log = logger.child({ service: "booking-admin" });

async function getVenueName(venueId: number): Promise<string> {
  const [venue] = await getDb()
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return venue?.name ?? "Unknown";
}

export interface BookingListFilters {
  status?: BookingStatus;
  dateFrom?: string;
  dateTo?: string;
}

export async function listBookings(
  filters?: BookingListFilters,
): Promise<BookingListItem[]> {
  const conditions = [];
  if (filters?.status) {
    conditions.push(eq(venueBookings.status, filters.status));
  }
  if (filters?.dateFrom) {
    conditions.push(gte(venueBookings.date, filters.dateFrom));
  }
  if (filters?.dateTo) {
    conditions.push(lte(venueBookings.date, filters.dateTo));
  }

  const matchCountSq = getDb()
    .select({
      venueBookingId: venueBookingMatches.venueBookingId,
      count: count().as("match_count"),
    })
    .from(venueBookingMatches)
    .groupBy(venueBookingMatches.venueBookingId)
    .as("match_count_sq");

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await getDb()
    .select({
      id: venueBookings.id,
      venueId: venueBookings.venueId,
      venueName: venues.name,
      date: venueBookings.date,
      calculatedStartTime: venueBookings.calculatedStartTime,
      calculatedEndTime: venueBookings.calculatedEndTime,
      overrideStartTime: venueBookings.overrideStartTime,
      overrideEndTime: venueBookings.overrideEndTime,
      status: venueBookings.status,
      needsReconfirmation: venueBookings.needsReconfirmation,
      notes: venueBookings.notes,
      matchCount: sql<number>`COALESCE(${matchCountSq.count}, 0)`.as(
        "match_count",
      ),
    })
    .from(venueBookings)
    .innerJoin(venues, eq(venues.id, venueBookings.venueId))
    .leftJoin(matchCountSq, eq(matchCountSq.venueBookingId, venueBookings.id))
    .where(whereClause)
    .orderBy(venueBookings.date, venueBookings.calculatedStartTime);

  return rows.map((row) => ({
    id: row.id,
    venueId: row.venueId,
    venueName: row.venueName,
    date: row.date,
    calculatedStartTime: row.calculatedStartTime,
    calculatedEndTime: row.calculatedEndTime,
    overrideStartTime: row.overrideStartTime,
    overrideEndTime: row.overrideEndTime,
    effectiveStartTime: row.overrideStartTime ?? row.calculatedStartTime,
    effectiveEndTime: row.overrideEndTime ?? row.calculatedEndTime,
    status: row.status,
    needsReconfirmation: row.needsReconfirmation,
    notes: row.notes,
    matchCount: Number(row.matchCount),
  }));
}

export async function getBookingDetail(
  id: number,
): Promise<BookingDetail | null> {
  const [booking] = await getDb()
    .select({
      id: venueBookings.id,
      venueId: venueBookings.venueId,
      venueName: venues.name,
      date: venueBookings.date,
      calculatedStartTime: venueBookings.calculatedStartTime,
      calculatedEndTime: venueBookings.calculatedEndTime,
      overrideStartTime: venueBookings.overrideStartTime,
      overrideEndTime: venueBookings.overrideEndTime,
      overrideReason: venueBookings.overrideReason,
      status: venueBookings.status,
      needsReconfirmation: venueBookings.needsReconfirmation,
      notes: venueBookings.notes,
      confirmedBy: venueBookings.confirmedBy,
      confirmedAt: venueBookings.confirmedAt,
      createdAt: venueBookings.createdAt,
      updatedAt: venueBookings.updatedAt,
    })
    .from(venueBookings)
    .innerJoin(venues, eq(venues.id, venueBookings.venueId))
    .where(eq(venueBookings.id, id))
    .limit(1);

  if (!booking) return null;

  // Fetch linked matches
  const homeTeam = getDb()
    .select({
      apiTeamPermanentId: teams.apiTeamPermanentId,
      name: teams.name,
      customName: teams.customName,
      badgeColor: teams.badgeColor,
    })
    .from(teams)
    .as("home_team");
  const guestTeam = getDb()
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name })
    .from(teams)
    .as("guest_team");

  const linkedMatches = await getDb()
    .select({
      id: matches.id,
      matchNo: matches.matchNo,
      kickoffDate: matches.kickoffDate,
      kickoffTime: matches.kickoffTime,
      homeTeam: homeTeam.name,
      homeTeamCustomName: homeTeam.customName,
      homeBadgeColor: homeTeam.badgeColor,
      guestTeam: guestTeam.name,
      leagueName: leagues.name,
    })
    .from(venueBookingMatches)
    .innerJoin(matches, eq(matches.id, venueBookingMatches.matchId))
    .innerJoin(
      homeTeam,
      eq(homeTeam.apiTeamPermanentId, matches.homeTeamApiId),
    )
    .innerJoin(
      guestTeam,
      eq(guestTeam.apiTeamPermanentId, matches.guestTeamApiId),
    )
    .leftJoin(leagues, eq(leagues.id, matches.leagueId))
    .where(eq(venueBookingMatches.venueBookingId, id))
    .orderBy(asc(matches.kickoffTime));

  return {
    id: booking.id,
    venueId: booking.venueId,
    venueName: booking.venueName,
    date: booking.date,
    calculatedStartTime: booking.calculatedStartTime,
    calculatedEndTime: booking.calculatedEndTime,
    overrideStartTime: booking.overrideStartTime,
    overrideEndTime: booking.overrideEndTime,
    overrideReason: booking.overrideReason,
    effectiveStartTime:
      booking.overrideStartTime ?? booking.calculatedStartTime,
    effectiveEndTime: booking.overrideEndTime ?? booking.calculatedEndTime,
    status: booking.status,
    needsReconfirmation: booking.needsReconfirmation,
    notes: booking.notes,
    confirmedBy: booking.confirmedBy,
    confirmedAt: booking.confirmedAt?.toISOString() ?? null,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    matches: linkedMatches,
  };
}

export interface BookingUpdateData {
  overrideStartTime?: string | null;
  overrideEndTime?: string | null;
  overrideReason?: string | null;
  status?: BookingStatus;
  notes?: string | null;
}

export async function updateBooking(
  id: number,
  data: BookingUpdateData,
): Promise<BookingListItem | null> {
  const set = {
    ...pickDefined(data, [
      "overrideStartTime",
      "overrideEndTime",
      "overrideReason",
      "status",
      "notes",
    ]),
    updatedAt: new Date(),
  };

  // Capture pre-update times so a real reschedule can be detected after the UPDATE.
  const [before] = await getDb()
    .select({
      overrideStartTime: venueBookings.overrideStartTime,
      overrideEndTime: venueBookings.overrideEndTime,
      calculatedStartTime: venueBookings.calculatedStartTime,
      calculatedEndTime: venueBookings.calculatedEndTime,
    })
    .from(venueBookings)
    .where(eq(venueBookings.id, id))
    .limit(1);

  if (!before) return null;

  const [updated] = await getDb()
    .update(venueBookings)
    .set(set)
    .where(eq(venueBookings.id, id))
    .returning({
      id: venueBookings.id,
      venueId: venueBookings.venueId,
      date: venueBookings.date,
      calculatedStartTime: venueBookings.calculatedStartTime,
      calculatedEndTime: venueBookings.calculatedEndTime,
      overrideStartTime: venueBookings.overrideStartTime,
      overrideEndTime: venueBookings.overrideEndTime,
      status: venueBookings.status,
      needsReconfirmation: venueBookings.needsReconfirmation,
      notes: venueBookings.notes,
    });

  if (!updated) return null;

  // Fetch venue name and match count
  const [venue] = await getDb()
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, updated.venueId))
    .limit(1);

  const matchCountResult = await getDb()
    .select({ count: count() })
    .from(venueBookingMatches)
    .where(eq(venueBookingMatches.venueBookingId, id));

  // Emit booking.status.changed if override times changed
  const timeChanged =
    data.overrideStartTime !== undefined || data.overrideEndTime !== undefined;
  if (timeChanged && venue) {
    try {
      // Compare the pre-update effective times against the post-update ones.
      const oldStart = before.overrideStartTime ?? before.calculatedStartTime;
      const oldEnd = before.overrideEndTime ?? before.calculatedEndTime;
      const newStart = updated.overrideStartTime ?? updated.calculatedStartTime;
      const newEnd = updated.overrideEndTime ?? updated.calculatedEndTime;

      if (oldStart !== newStart || oldEnd !== newEnd) {
        await publishDomainEvent({
          type: EVENT_TYPES.BOOKING_STATUS_CHANGED,
          source: "manual",
          entityType: "booking",
          entityId: id,
          entityName: `${venue.name} - ${updated.date}`,
          deepLinkPath: `/admin/bookings/${id}`,
          payload: {
            venueName: venue.name,
            date: updated.date,
            oldStartTime: oldStart,
            oldEndTime: oldEnd,
            newStartTime: newStart,
            newEndTime: newEnd,
          },
        });
      }
    } catch (error) {
      log.warn({ err: error, bookingId: id }, "Failed to emit booking.status.changed event");
    }
  }

  return {
    id: updated.id,
    venueId: updated.venueId,
    venueName: venue!.name,
    date: updated.date,
    calculatedStartTime: updated.calculatedStartTime,
    calculatedEndTime: updated.calculatedEndTime,
    overrideStartTime: updated.overrideStartTime,
    overrideEndTime: updated.overrideEndTime,
    effectiveStartTime:
      updated.overrideStartTime ?? updated.calculatedStartTime,
    effectiveEndTime: updated.overrideEndTime ?? updated.calculatedEndTime,
    status: updated.status,
    needsReconfirmation: updated.needsReconfirmation,
    notes: updated.notes,
    matchCount: Number(matchCountResult[0]!.count),
  };
}

export async function updateBookingStatus(
  id: number,
  status: BookingStatus,
): Promise<BookingListItem | null> {
  const base = { status, updatedAt: new Date() };
  const set =
    status === "confirmed"
      ? { ...base, confirmedAt: new Date(), needsReconfirmation: false }
      : { ...base, confirmedAt: null, confirmedBy: null };

  const [updated] = await getDb()
    .update(venueBookings)
    .set(set)
    .where(eq(venueBookings.id, id))
    .returning({
      id: venueBookings.id,
      venueId: venueBookings.venueId,
      date: venueBookings.date,
      calculatedStartTime: venueBookings.calculatedStartTime,
      calculatedEndTime: venueBookings.calculatedEndTime,
      overrideStartTime: venueBookings.overrideStartTime,
      overrideEndTime: venueBookings.overrideEndTime,
      status: venueBookings.status,
      needsReconfirmation: venueBookings.needsReconfirmation,
      notes: venueBookings.notes,
    });

  if (!updated) return null;

  const [venue] = await getDb()
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, updated.venueId))
    .limit(1);

  const matchCountResult = await getDb()
    .select({ count: count() })
    .from(venueBookingMatches)
    .where(eq(venueBookingMatches.venueBookingId, id));

  // Emit booking.status.changed event when status changes to cancelled
  if (status === "cancelled") {
    try {
      await publishDomainEvent({
        type: EVENT_TYPES.BOOKING_STATUS_CHANGED,
        source: "manual",
        entityType: "booking",
        entityId: id,
        entityName: `${venue!.name} - ${updated.date}`,
        deepLinkPath: `/admin/bookings/${id}`,
        payload: {
          venueName: venue!.name,
          date: updated.date,
          reason: "Status changed to cancelled",
        },
      });
    } catch (error) {
      log.warn({ err: error, bookingId: id }, "Failed to emit booking.status.changed event");
    }
  }

  return {
    id: updated.id,
    venueId: updated.venueId,
    venueName: venue!.name,
    date: updated.date,
    calculatedStartTime: updated.calculatedStartTime,
    calculatedEndTime: updated.calculatedEndTime,
    overrideStartTime: updated.overrideStartTime,
    overrideEndTime: updated.overrideEndTime,
    effectiveStartTime:
      updated.overrideStartTime ?? updated.calculatedStartTime,
    effectiveEndTime: updated.overrideEndTime ?? updated.calculatedEndTime,
    status: updated.status,
    needsReconfirmation: updated.needsReconfirmation,
    notes: updated.notes,
    matchCount: Number(matchCountResult[0]!.count),
  };
}

export interface BookingCreateData {
  venueId: number;
  date: string;
  overrideStartTime: string;
  overrideEndTime: string;
  overrideReason?: string | null;
  notes?: string | null;
  matchIds?: number[];
}

/**
 * Create a booking, link its matches and record the `booking.created` event as
 * one unit.
 *
 * Everything that makes up "a booking exists" is written in a single
 * transaction. Previously the booking row, each junction row and the domain
 * event were separate statements: a failure while linking matches left a
 * booking with a partial match list and no event, and the duplicate check was a
 * plain SELECT, so two concurrent creates for the same (venue, date) both
 * passed it and the second died on `venue_bookings_venue_date_uniq` with a 500
 * instead of the intended `null`. The insert now arbitrates on that unique
 * index itself, and the per-match junction inserts collapse into one statement.
 */
export async function createBooking(
  data: BookingCreateData,
): Promise<BookingDetail | null> {
  const matchIds = [...new Set(data.matchIds ?? [])];

  const created = await getDb().transaction(async (tx) => {
    // Verify venue exists (its name is needed for the event below anyway)
    const [venue] = await tx
      .select({ id: venues.id, name: venues.name })
      .from(venues)
      .where(eq(venues.id, data.venueId))
      .limit(1);

    if (!venue) return null;

    // Duplicate (same venue + date) resolves against the unique index rather
    // than a preceding SELECT, so the check cannot be won by two callers.
    const [inserted] = await tx
      .insert(venueBookings)
      .values({
        venueId: data.venueId,
        date: data.date,
        calculatedStartTime: data.overrideStartTime,
        calculatedEndTime: data.overrideEndTime,
        overrideStartTime: data.overrideStartTime,
        overrideEndTime: data.overrideEndTime,
        overrideReason: data.overrideReason ?? null,
        notes: data.notes ?? null,
        status: "pending",
        needsReconfirmation: false,
      })
      .onConflictDoNothing({
        target: [venueBookings.venueId, venueBookings.date],
      })
      .returning({ id: venueBookings.id });

    if (!inserted) return null;

    // Link matches if provided — one multi-row insert, not one per match.
    if (matchIds.length > 0) {
      await tx.insert(venueBookingMatches).values(
        matchIds.map((matchId) => ({
          venueBookingId: inserted.id,
          matchId,
        })),
      );
    }

    const venueName = venue.name;

    // Published inside the transaction (outbox): the event row commits with the
    // booking, so a crash between the two cannot lose it. The outbox poller
    // enqueues it after commit.
    await publishDomainEvent(
      {
        type: EVENT_TYPES.BOOKING_CREATED,
        source: "manual",
        entityType: "booking",
        entityId: inserted.id,
        entityName: `${venueName} - ${data.date}`,
        deepLinkPath: `/admin/bookings/${inserted.id}`,
        payload: {
          venueName,
          date: data.date,
          startTime: data.overrideStartTime,
          endTime: data.overrideEndTime,
          matchCount: matchIds.length,
        },
      },
      tx,
    );

    return inserted.id;
  });

  if (created === null) return null;

  return getBookingDetail(created);
}

export async function deleteBooking(id: number): Promise<boolean> {
  // Fetch booking info before deletion for event emission
  const [bookingInfo] = await getDb()
    .select({
      venueId: venueBookings.venueId,
      date: venueBookings.date,
    })
    .from(venueBookings)
    .where(eq(venueBookings.id, id))
    .limit(1);

  // Delete junction entries first (they cascade, but be explicit)
  await getDb()
    .delete(venueBookingMatches)
    .where(eq(venueBookingMatches.venueBookingId, id));

  const [deleted] = await getDb()
    .delete(venueBookings)
    .where(eq(venueBookings.id, id))
    .returning({ id: venueBookings.id });

  if (deleted && bookingInfo) {
    try {
      const venueName = await getVenueName(bookingInfo.venueId);
      await publishDomainEvent({
        type: EVENT_TYPES.BOOKING_STATUS_CHANGED,
        source: "manual",
        entityType: "booking",
        entityId: id,
        entityName: `${venueName} - ${bookingInfo.date}`,
        deepLinkPath: `/admin/bookings/${id}`,
        payload: {
          venueName,
          date: bookingInfo.date,
          reason: "Booking deleted",
        },
      });
    } catch (error) {
      log.warn({ err: error, bookingId: id }, "Failed to emit booking.status.changed event");
    }
  }

  return !!deleted;
}
