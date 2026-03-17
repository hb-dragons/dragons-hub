import { db } from "../../config/database";
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
  BookingMatch,
  BookingStatus,
} from "@dragons/shared";
import { EVENT_TYPES } from "@dragons/shared";
import { publishDomainEvent } from "../events/event-publisher";
import { logger } from "../../config/logger";

const log = logger.child({ service: "booking-admin" });

async function getVenueName(venueId: number): Promise<string> {
  const [venue] = await db
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return venue?.name ?? "Unknown";
}

export interface BookingListFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listBookings(
  filters?: BookingListFilters,
): Promise<BookingListItem[]> {
  const conditions = [];
  if (filters?.status) {
    conditions.push(eq(venueBookings.status, filters.status as BookingStatus));
  }
  if (filters?.dateFrom) {
    conditions.push(gte(venueBookings.date, filters.dateFrom));
  }
  if (filters?.dateTo) {
    conditions.push(lte(venueBookings.date, filters.dateTo));
  }

  const matchCountSq = db
    .select({
      venueBookingId: venueBookingMatches.venueBookingId,
      count: count().as("match_count"),
    })
    .from(venueBookingMatches)
    .groupBy(venueBookingMatches.venueBookingId)
    .as("match_count_sq");

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
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
    status: row.status as BookingStatus,
    needsReconfirmation: row.needsReconfirmation,
    notes: row.notes,
    matchCount: Number(row.matchCount),
  }));
}

export async function getBookingDetail(
  id: number,
): Promise<BookingDetail | null> {
  const [booking] = await db
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
  const homeTeam = db
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name, customName: teams.customName })
    .from(teams)
    .as("home_team");
  const guestTeam = db
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name })
    .from(teams)
    .as("guest_team");

  const linkedMatches = await db
    .select({
      id: matches.id,
      matchNo: matches.matchNo,
      kickoffDate: matches.kickoffDate,
      kickoffTime: matches.kickoffTime,
      homeTeam: homeTeam.name,
      homeTeamCustomName: homeTeam.customName,
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
    status: booking.status as BookingStatus,
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
  status?: string;
  notes?: string | null;
}

export async function updateBooking(
  id: number,
  data: BookingUpdateData,
): Promise<BookingListItem | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };

  if (data.overrideStartTime !== undefined)
    set.overrideStartTime = data.overrideStartTime;
  if (data.overrideEndTime !== undefined)
    set.overrideEndTime = data.overrideEndTime;
  if (data.overrideReason !== undefined)
    set.overrideReason = data.overrideReason;
  if (data.status !== undefined) set.status = data.status;
  if (data.notes !== undefined) set.notes = data.notes;

  const [updated] = await db
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
  const [venue] = await db
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, updated.venueId))
    .limit(1);

  const matchCountResult = await db
    .select({ count: count() })
    .from(venueBookingMatches)
    .where(eq(venueBookingMatches.venueBookingId, id));

  // Emit booking.status.changed if override times changed
  const timeChanged =
    data.overrideStartTime !== undefined || data.overrideEndTime !== undefined;
  if (timeChanged && venue) {
    try {
      // Fetch old values for comparison
      const oldStart = updated.overrideStartTime ?? updated.calculatedStartTime;
      const oldEnd = updated.overrideEndTime ?? updated.calculatedEndTime;
      const newStart = data.overrideStartTime ?? oldStart;
      const newEnd = data.overrideEndTime ?? oldEnd;

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
    status: updated.status as BookingStatus,
    needsReconfirmation: updated.needsReconfirmation,
    notes: updated.notes,
    matchCount: Number(matchCountResult[0]!.count),
  };
}

export async function updateBookingStatus(
  id: number,
  status: string,
): Promise<BookingListItem | null> {
  const set: Record<string, unknown> = { status, updatedAt: new Date() };

  if (status === "confirmed") {
    set.confirmedAt = new Date();
    set.needsReconfirmation = false;
  } else {
    set.confirmedAt = null;
    set.confirmedBy = null;
  }

  const [updated] = await db
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

  const [venue] = await db
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, updated.venueId))
    .limit(1);

  const matchCountResult = await db
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
    status: updated.status as BookingStatus,
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

export async function createBooking(
  data: BookingCreateData,
): Promise<BookingDetail | null> {
  // Verify venue exists
  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.id, data.venueId))
    .limit(1);

  if (!venue) return null;

  // Check for duplicate (same venue + date)
  const [existing] = await db
    .select({ id: venueBookings.id })
    .from(venueBookings)
    .where(
      and(
        eq(venueBookings.venueId, data.venueId),
        eq(venueBookings.date, data.date),
      ),
    )
    .limit(1);

  if (existing) return null;

  const [created] = await db
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
    .returning({ id: venueBookings.id });

  if (!created) return null;

  // Link matches if provided
  if (data.matchIds && data.matchIds.length > 0) {
    for (const matchId of data.matchIds) {
      await db.insert(venueBookingMatches).values({
        venueBookingId: created.id,
        matchId,
      });
    }
  }

  // Emit booking.created event
  try {
    const venueName = await getVenueName(data.venueId);
    await publishDomainEvent({
      type: EVENT_TYPES.BOOKING_CREATED,
      source: "manual",
      entityType: "booking",
      entityId: created.id,
      entityName: `${venueName} - ${data.date}`,
      deepLinkPath: `/admin/bookings/${created.id}`,
      payload: {
        venueName,
        date: data.date,
        startTime: data.overrideStartTime,
        endTime: data.overrideEndTime,
        matchCount: data.matchIds?.length ?? 0,
      },
    });
  } catch (error) {
    log.warn({ err: error, bookingId: created.id }, "Failed to emit booking.created event");
  }

  return getBookingDetail(created.id);
}

export async function deleteBooking(id: number): Promise<boolean> {
  // Fetch booking info before deletion for event emission
  const [bookingInfo] = await db
    .select({
      venueId: venueBookings.venueId,
      date: venueBookings.date,
    })
    .from(venueBookings)
    .where(eq(venueBookings.id, id))
    .limit(1);

  // Delete junction entries first (they cascade, but be explicit)
  await db
    .delete(venueBookingMatches)
    .where(eq(venueBookingMatches.venueBookingId, id));

  const [deleted] = await db
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
