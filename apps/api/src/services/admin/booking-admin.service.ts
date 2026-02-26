import { db } from "../../config/database";
import {
  venueBookings,
  venueBookingMatches,
  venues,
  matches,
  teams,
  tasks,
  boardColumns,
} from "@dragons/db/schema";
import { eq, and, gte, lte, sql, count } from "drizzle-orm";

export interface BookingListItem {
  id: number;
  venueId: number;
  venueName: string;
  date: string;
  calculatedStartTime: string;
  calculatedEndTime: string;
  overrideStartTime: string | null;
  overrideEndTime: string | null;
  effectiveStartTime: string;
  effectiveEndTime: string;
  status: string;
  needsReconfirmation: boolean;
  notes: string | null;
  matchCount: number;
  task: { id: number; title: string } | null;
}

export interface BookingDetailMatch {
  id: number;
  matchNo: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeam: string;
  guestTeam: string;
}

export interface BookingDetailTask {
  id: number;
  title: string;
  columnName: string;
  status: string;
}

export interface BookingDetail {
  id: number;
  venueId: number;
  venueName: string;
  date: string;
  calculatedStartTime: string;
  calculatedEndTime: string;
  overrideStartTime: string | null;
  overrideEndTime: string | null;
  overrideReason: string | null;
  effectiveStartTime: string;
  effectiveEndTime: string;
  status: string;
  needsReconfirmation: boolean;
  notes: string | null;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  matches: BookingDetailMatch[];
  task: BookingDetailTask | null;
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
    conditions.push(eq(venueBookings.status, filters.status));
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
      taskId: tasks.id,
      taskTitle: tasks.title,
    })
    .from(venueBookings)
    .innerJoin(venues, eq(venues.id, venueBookings.venueId))
    .leftJoin(matchCountSq, eq(matchCountSq.venueBookingId, venueBookings.id))
    .leftJoin(tasks, eq(tasks.venueBookingId, venueBookings.id))
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
    task: row.taskId ? { id: row.taskId, title: row.taskTitle! } : null,
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
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name })
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
      guestTeam: guestTeam.name,
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
    .where(eq(venueBookingMatches.venueBookingId, id));

  // Fetch linked task
  const [linkedTask] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      columnName: boardColumns.name,
      status: sql<string>`CASE WHEN ${boardColumns.isDoneColumn} THEN 'done' ELSE 'open' END`,
    })
    .from(tasks)
    .innerJoin(boardColumns, eq(boardColumns.id, tasks.columnId))
    .where(eq(tasks.venueBookingId, id))
    .limit(1);

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
    confirmedAt: booking.confirmedAt,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    matches: linkedMatches,
    task: linkedTask ?? null,
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

  // Fetch venue name and task info
  const [venue] = await db
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, updated.venueId))
    .limit(1);

  const matchCountResult = await db
    .select({ count: count() })
    .from(venueBookingMatches)
    .where(eq(venueBookingMatches.venueBookingId, id));

  const [linkedTask] = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(eq(tasks.venueBookingId, id))
    .limit(1);

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
    task: linkedTask ?? null,
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

  const [linkedTask] = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(eq(tasks.venueBookingId, id))
    .limit(1);

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
    task: linkedTask ?? null,
  };
}
