import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { venueBookings, venueHallTimes, venues } from "@dragons/db/schema";
import { EVENT_TYPES, coverageFor } from "@dragons/shared";
import type {
  BookingHallTime,
  HallTimeImportPreview,
  HallTimeImportResult,
  HallTimeInput,
  HallTimeRow,
} from "@dragons/shared";
import type { HallTimeImportBody, HallTimeUpsertBody } from "@dragons/contracts";
import { getDb } from "../../config/database";
import { logger } from "../../config/logger";
import { publishDomainEvent } from "../events/event-publisher";
import type { TransactionClient } from "../events/event-publisher";
import { planHallTimeImport, type ImportPlan, type PlannerBooking } from "./hall-time-import-planner";


type StoredRow = typeof venueHallTimes.$inferSelect;

/** Postgres hands `time` back as HH:mm:ss; the sheet and the DTOs speak HH:mm. */
function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

function toRow(r: StoredRow): HallTimeRow {
  return {
    id: r.id,
    venueId: r.venueId,
    date: r.date,
    kind: r.kind,
    startTime: hhmm(r.startTime),
    endTime: hhmm(r.endTime),
    note: r.note,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function venueExists(venueId: number): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return row !== undefined;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listHallTimes(
  venueId: number,
  range: { from?: string; to?: string },
): Promise<HallTimeRow[] | null> {
  if (!(await venueExists(venueId))) return null;
  const rows = await getDb()
    .select()
    .from(venueHallTimes)
    .where(
      and(
        eq(venueHallTimes.venueId, venueId),
        range.from ? gte(venueHallTimes.date, range.from) : undefined,
        range.to ? lte(venueHallTimes.date, range.to) : undefined,
      ),
    )
    .orderBy(venueHallTimes.date);
  return rows.map(toRow);
}

/** The venue's stored rows inside a closed date span. */
async function loadSpan(
  venueId: number,
  span: { from: string; to: string },
): Promise<HallTimeRow[]> {
  const rows = await getDb()
    .select()
    .from(venueHallTimes)
    .where(
      and(
        eq(venueHallTimes.venueId, venueId),
        gte(venueHallTimes.date, span.from),
        lte(venueHallTimes.date, span.to),
      ),
    )
    .orderBy(venueHallTimes.date);
  return rows.map(toRow);
}

/**
 * Hall times for a set of (venue, day) pairs, keyed `${venueId}:${date}`.
 * One query however many bookings ask; a pair with no row is simply absent.
 */
export async function loadHallTimesByDay(
  pairs: readonly { venueId: number; date: string }[],
): Promise<Map<string, HallTimeRow>> {
  if (pairs.length === 0) return new Map();
  const unique = new Map(pairs.map((p) => [`${p.venueId}:${p.date}`, p]));
  const rows = await getDb()
    .select()
    .from(venueHallTimes)
    .where(
      or(
        ...[...unique.values()].map((p) =>
          and(eq(venueHallTimes.venueId, p.venueId), eq(venueHallTimes.date, p.date)),
        ),
      ),
    );
  return new Map(rows.map((r) => [`${r.venueId}:${r.date}`, toRow(r)]));
}

/** The booking-side view of one hall time, or null when the club holds none that day. */
export function bookingHallTime(
  window: { start: string; end: string },
  hallTime: HallTimeRow | null | undefined,
): BookingHallTime | null {
  if (!hallTime) return null;
  const coverage = coverageFor(window, hallTime);
  return {
    kind: hallTime.kind,
    startTime: hallTime.startTime,
    endTime: hallTime.endTime,
    note: hallTime.note,
    coverage: coverage.status,
    gapBeforeMinutes: coverage.gapBeforeMinutes,
    gapAfterMinutes: coverage.gapAfterMinutes,
  };
}

/**
 * Attach `hallTime` to booking-shaped items in one query. Every booking read
 * that reaches a client goes through here, so the coverage a list shows and
 * the one a detail shows can never disagree.
 */
export async function attachHallTimes<
  T extends { venueId: number; date: string; effectiveStartTime: string; effectiveEndTime: string },
>(items: T[]): Promise<(T & { hallTime: BookingHallTime | null })[]> {
  const byDay = await loadHallTimesByDay(items);
  return items.map((item) => ({
    ...item,
    hallTime: bookingHallTime(
      { start: item.effectiveStartTime, end: item.effectiveEndTime },
      byDay.get(`${item.venueId}:${item.date}`),
    ),
  }));
}

// ── Manual edits ─────────────────────────────────────────────────────────────

export async function upsertHallTime(
  venueId: number,
  date: string,
  body: HallTimeUpsertBody,
): Promise<HallTimeRow | null> {
  if (!(await venueExists(venueId))) return null;
  const values = {
    venueId,
    date,
    kind: body.kind,
    startTime: body.startTime,
    endTime: body.endTime,
    note: body.note,
    source: "manual" as const,
    updatedAt: new Date(),
  };
  const [row] = await getDb()
    .insert(venueHallTimes)
    .values(values)
    .onConflictDoUpdate({
      target: [venueHallTimes.venueId, venueHallTimes.date],
      set: values,
    })
    .returning();
  return toRow(row!);
}

export async function deleteHallTime(venueId: number, date: string): Promise<boolean> {
  const deleted = await getDb()
    .delete(venueHallTimes)
    .where(and(eq(venueHallTimes.venueId, venueId), eq(venueHallTimes.date, date)))
    .returning({ id: venueHallTimes.id });
  return deleted.length > 0;
}

// ── Import ───────────────────────────────────────────────────────────────────

async function loadBookingsInSpan(
  venueId: number,
  span: { from: string; to: string },
): Promise<PlannerBooking[]> {
  const rows = await getDb()
    .select({
      id: venueBookings.id,
      date: venueBookings.date,
      effectiveStartTime: sql<string>`coalesce(${venueBookings.overrideStartTime}, ${venueBookings.calculatedStartTime})`,
      effectiveEndTime: sql<string>`coalesce(${venueBookings.overrideEndTime}, ${venueBookings.calculatedEndTime})`,
    })
    .from(venueBookings)
    .where(
      and(
        eq(venueBookings.venueId, venueId),
        gte(venueBookings.date, span.from),
        lte(venueBookings.date, span.to),
      ),
    );
  return rows;
}

async function plan(venueId: number, body: HallTimeImportBody): Promise<ImportPlan | null> {
  if (!(await venueExists(venueId))) return null;
  const dates = body.rows.map((r) => r.date).sort();
  const span = { from: dates[0]!, to: dates[dates.length - 1]! };
  const [existing, bookings] = await Promise.all([
    loadSpan(venueId, span),
    loadBookingsInSpan(venueId, span),
  ]);
  return planHallTimeImport({ existing, rows: body.rows, bookings });
}

function toPreview(p: ImportPlan): HallTimeImportPreview {
  return {
    span: p.span,
    added: p.added,
    changed: p.changed,
    removed: p.removed,
    unchanged: p.unchanged,
    bookings: p.bookings,
  };
}

export async function previewHallTimeImport(
  venueId: number,
  body: HallTimeImportBody,
): Promise<HallTimeImportPreview | null> {
  const p = await plan(venueId, body);
  return p ? toPreview(p) : null;
}

export async function applyHallTimeImport(
  venueId: number,
  body: HallTimeImportBody,
): Promise<HallTimeImportResult | null> {
  const p = await plan(venueId, body);
  if (!p) return null;

  const [venue] = await getDb()
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  const venueName = venue?.name ?? "Unknown";
  const lossBookings =
    p.losses.length > 0
      ? await getDb()
          .select({
            id: venueBookings.id,
            date: venueBookings.date,
            startTime: sql<string>`coalesce(${venueBookings.overrideStartTime}, ${venueBookings.calculatedStartTime})`,
            endTime: sql<string>`coalesce(${venueBookings.overrideEndTime}, ${venueBookings.calculatedEndTime})`,
          })
          .from(venueBookings)
          .where(inArray(venueBookings.id, p.losses.map((l) => l.bookingId)))
      : [];
  const lossById = new Map(lossBookings.map((b) => [b.id, b]));
  const afterByDate = new Map<string, HallTimeInput>(p.inserts.map((r) => [r.date, r]));

  let eventsEmitted = 0;
  await getDb().transaction(async (tx) => {
    if (p.deleteIds.length > 0) {
      await tx.delete(venueHallTimes).where(inArray(venueHallTimes.id, p.deleteIds));
    }
    if (p.inserts.length > 0) {
      await tx.insert(venueHallTimes).values(
        p.inserts.map((r) => ({
          venueId,
          date: r.date,
          kind: r.kind,
          startTime: r.startTime,
          endTime: r.endTime,
          note: r.note,
          source: "anlage_t" as const,
        })),
      );
    }
    for (const loss of p.losses) {
      const booking = lossById.get(loss.bookingId);
      if (!booking) continue;
      await emitHallTimeMissing(tx, {
        bookingId: booking.id,
        venueId,
        venueName,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        coverage: loss.after,
        hallTime: afterByDate.get(booking.date) ?? null,
      });
      eventsEmitted++;
    }
  });

  logger.info(
    { service: "hall-times", venueId, added: p.added.length, changed: p.changed.length, removed: p.removed.length, eventsEmitted },
    "Hall time import applied",
  );
  return { ...toPreview(p), eventsEmitted };
}

// ── Event ────────────────────────────────────────────────────────────────────

export interface HallTimeMissingEvent {
  bookingId: number;
  venueId: number;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  coverage: "partial" | "uncovered" | "closed";
  hallTime: HallTimeInput | null;
}

/**
 * One booking whose window the club's hall time does not cover: a rental
 * request still has to go to the city. Published inside the caller's
 * transaction so the outbox only sees it once the change that caused it is
 * committed.
 */
export async function emitHallTimeMissing(
  tx: TransactionClient | undefined,
  e: HallTimeMissingEvent,
): Promise<void> {
  await publishDomainEvent(
    {
      type: EVENT_TYPES.BOOKING_HALL_TIME_MISSING,
      source: "reconciliation",
      entityType: "booking",
      entityId: e.bookingId,
      entityName: `${e.venueName} - ${e.date}`,
      deepLinkPath: `/admin/bookings/${e.bookingId}`,
      payload: {
        venueId: e.venueId,
        venueName: e.venueName,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        coverage: e.coverage,
        hallTime: e.hallTime
          ? {
              kind: e.hallTime.kind,
              startTime: e.hallTime.startTime,
              endTime: e.hallTime.endTime,
              note: e.hallTime.note,
            }
          : null,
      },
    },
    tx,
  );
}
