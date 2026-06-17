import { getDb } from "../../config/database";
import { logger } from "../../config/logger";
import {
  venueBookings,
  venueBookingMatches,
  matches,
  teams,
  venues,
  appSettings,
} from "@dragons/db/schema";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { type BookingConfig } from "./booking-calculator";
import { planReconciliation } from "./booking-planner";
import type {
  ReconcilePreview,
  ReconcilePreviewMatch,
  ReconcileResult,
  BookingStatus,
} from "@dragons/shared";
import { EVENT_TYPES } from "@dragons/shared";
import { publishDomainEvent } from "../events/event-publisher";

const log = logger.child({ service: "venue-booking" });

// ── Config ───────────────────────────────────────────────────────────────────

const SETTING_KEYS = {
  bufferBefore: "venue_booking_buffer_before",
  bufferAfter: "venue_booking_buffer_after",
  gameDuration: "venue_booking_game_duration",
  dueDaysBefore: "venue_booking_due_days_before",
} as const;

const DEFAULTS = {
  bufferBefore: 60,
  bufferAfter: 60,
  gameDuration: 90,
  dueDaysBefore: 7,
} as const;

export async function getBookingConfig(): Promise<BookingConfig> {
  const rows = await getDb()
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(
      inArray(appSettings.key, [
        SETTING_KEYS.bufferBefore,
        SETTING_KEYS.bufferAfter,
        SETTING_KEYS.gameDuration,
      ]),
    );

  const settings = new Map(rows.map((r) => [r.key, r.value]));

  function parse(key: string, fallback: number): number {
    const raw = settings.get(key);
    if (raw == null) return fallback;
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  return {
    bufferBeforeMinutes: parse(SETTING_KEYS.bufferBefore, DEFAULTS.bufferBefore),
    bufferAfterMinutes: parse(SETTING_KEYS.bufferAfter, DEFAULTS.bufferAfter),
    defaultGameDurationMinutes: parse(SETTING_KEYS.gameDuration, DEFAULTS.gameDuration),
  };
}

// ── Shared query types ──────────────────────────────────────────────────────

interface MatchWithTeam {
  matchId: number;
  venueId: number;
  kickoffDate: string;
  kickoffTime: string;
  isOwnClub: boolean | null;
  isForfeited: boolean | null;
  isCancelled: boolean | null;
  estimatedGameDuration: number | null;
}

async function queryHomeMatches(matchIds: number[]): Promise<MatchWithTeam[]> {
  if (matchIds.length === 0) return [];

  const rows = await getDb()
    .select({
      matchId: matches.id,
      venueId: matches.venueId,
      kickoffDate: matches.kickoffDate,
      kickoffTime: matches.kickoffTime,
      isOwnClub: teams.isOwnClub,
      isForfeited: matches.isForfeited,
      isCancelled: matches.isCancelled,
      estimatedGameDuration: teams.estimatedGameDuration,
    })
    .from(matches)
    .innerJoin(teams, eq(teams.apiTeamPermanentId, matches.homeTeamApiId))
    .where(and(inArray(matches.id, matchIds), sql`${matches.venueId} IS NOT NULL`));

  return rows
    .filter((r) => r.isOwnClub === true)
    .map((row) => ({ ...row, venueId: row.venueId as number }));
}

function groupByVenueDate(games: MatchWithTeam[]): Map<string, MatchWithTeam[]> {
  const groups = new Map<string, MatchWithTeam[]>();
  for (const game of games) {
    const key = `${game.venueId}:${game.kickoffDate}`;
    const group = groups.get(key);
    if (group) {
      group.push(game);
    } else {
      groups.set(key, [game]);
    }
  }
  return groups;
}

function sortMatchesByKickoff(matches: ReconcilePreviewMatch[]): ReconcilePreviewMatch[] {
  return matches.sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime));
}

// ── Preview ─────────────────────────────────────────────────────────────────

async function fetchMatchDisplayInfo(matchIds: number[]): Promise<Map<number, ReconcilePreviewMatch>> {
  if (matchIds.length === 0) return new Map();

  const homeTeam = getDb()
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name, customName: teams.customName })
    .from(teams)
    .as("home_team");
  const guestTeam = getDb()
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name })
    .from(teams)
    .as("guest_team");

  const rows = await getDb()
    .select({
      id: matches.id,
      kickoffTime: matches.kickoffTime,
      isForfeited: matches.isForfeited,
      isCancelled: matches.isCancelled,
      homeTeam: homeTeam.name,
      homeTeamCustomName: homeTeam.customName,
      guestTeam: guestTeam.name,
    })
    .from(matches)
    .innerJoin(homeTeam, eq(homeTeam.apiTeamPermanentId, matches.homeTeamApiId))
    .innerJoin(guestTeam, eq(guestTeam.apiTeamPermanentId, matches.guestTeamApiId))
    .where(inArray(matches.id, matchIds));

  const map = new Map<number, ReconcilePreviewMatch>();
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      homeTeam: r.homeTeam,
      homeTeamCustomName: r.homeTeamCustomName,
      guestTeam: r.guestTeam,
      kickoffTime: r.kickoffTime,
      isForfeited: r.isForfeited ?? false,
      isCancelled: r.isCancelled ?? false,
    });
  }
  return map;
}

async function fetchVenueNames(venueIds: number[]): Promise<Map<number, string>> {
  if (venueIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .where(inArray(venues.id, venueIds));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function previewReconciliation(): Promise<ReconcilePreview> {
  const preview: ReconcilePreview = { toCreate: [], toUpdate: [], toRemove: [], unchanged: 0 };

  // Get all home matches (including forfeited/cancelled so we can show them)
  const allHomeMatchRows = await getDb()
    .select({ id: matches.id })
    .from(matches)
    .innerJoin(teams, eq(teams.apiTeamPermanentId, matches.homeTeamApiId))
    .where(and(eq(teams.isOwnClub, true), sql`${matches.venueId} IS NOT NULL`));

  const allMatchIds = allHomeMatchRows.map((r) => r.id);
  if (allMatchIds.length === 0) return preview;

  const config = await getBookingConfig();
  const homeGames = await queryHomeMatches(allMatchIds);
  const groups = groupByVenueDate(homeGames);

  // Existing bookings + junction links feed the shared planner.
  const existingBookings = await getDb()
    .select({
      id: venueBookings.id,
      venueId: venueBookings.venueId,
      date: venueBookings.date,
      status: venueBookings.status,
      calculatedStartTime: venueBookings.calculatedStartTime,
      calculatedEndTime: venueBookings.calculatedEndTime,
    })
    .from(venueBookings);

  const bookingMatchMap = await loadBookingMatchMap();

  const plan = planReconciliation({
    groups,
    existingBookings,
    bookingMatchMap,
    config,
    scope: { kind: "all" },
  });

  // Collect the match + venue IDs the preview will render.
  const displayMatchIds = new Set<number>();
  const venueIds = new Set<number>();
  for (const c of plan.creates) {
    venueIds.add(c.venueId);
    c.matchIds.forEach((id) => displayMatchIds.add(id));
  }
  for (const u of plan.updates) {
    venueIds.add(u.venueId);
    u.addedMatchIds.forEach((id) => displayMatchIds.add(id));
    u.removedMatchIds.forEach((id) => displayMatchIds.add(id));
  }
  for (const r of plan.removals) {
    venueIds.add(r.venueId);
    r.displayMatchIds.forEach((id) => displayMatchIds.add(id));
  }

  const [matchDisplay, venueNames] = await Promise.all([
    fetchMatchDisplayInfo([...displayMatchIds]),
    fetchVenueNames([...venueIds]),
  ]);

  const nameOf = (venueId: number) => venueNames.get(venueId) ?? "Unknown";
  const displayOf = (ids: number[]) =>
    sortMatchesByKickoff(ids.map((id) => matchDisplay.get(id)!).filter(Boolean));

  for (const c of plan.creates) {
    preview.toCreate.push({
      venueName: nameOf(c.venueId),
      date: c.date,
      calculatedStartTime: c.calculatedStartTime,
      calculatedEndTime: c.calculatedEndTime,
      matches: displayOf(c.matchIds),
    });
  }
  for (const u of plan.updates) {
    preview.toUpdate.push({
      bookingId: u.bookingId,
      venueName: nameOf(u.venueId),
      date: u.date,
      status: u.status as BookingStatus,
      currentStartTime: u.currentStartTime,
      currentEndTime: u.currentEndTime,
      newStartTime: u.newStartTime,
      newEndTime: u.newEndTime,
      matchesAdded: displayOf(u.addedMatchIds),
      matchesRemoved: displayOf(u.removedMatchIds),
    });
  }
  for (const r of plan.removals) {
    preview.toRemove.push({
      bookingId: r.bookingId,
      venueName: nameOf(r.venueId),
      date: r.date,
      status: r.status as BookingStatus,
      reason: r.reason,
      matches: displayOf(r.displayMatchIds),
    });
  }
  preview.unchanged = plan.unchanged;

  const byDateAsc = (a: { date: string }, b: { date: string }) =>
    a.date.localeCompare(b.date);
  preview.toCreate.sort(byDateAsc);
  preview.toUpdate.sort(byDateAsc);
  preview.toRemove.sort(byDateAsc);

  return preview;
}

/** Batch-load every booking's current junction match ids. */
async function loadBookingMatchMap(): Promise<Map<number, number[]>> {
  const rows = await getDb()
    .select({
      venueBookingId: venueBookingMatches.venueBookingId,
      matchId: venueBookingMatches.matchId,
    })
    .from(venueBookingMatches);

  const map = new Map<number, number[]>();
  for (const j of rows) {
    const list = map.get(j.venueBookingId) ?? [];
    list.push(j.matchId);
    map.set(j.venueBookingId, list);
  }
  return map;
}

// ── Reconciliation ───────────────────────────────────────────────────────────

export async function reconcileBookingsForMatches(
  matchIds: number[],
): Promise<ReconcileResult> {
  const result: ReconcileResult = { created: 0, updated: 0, removed: 0, unchanged: 0 };

  if (matchIds.length === 0) return result;

  const config = await getBookingConfig();
  const homeGames = await queryHomeMatches(matchIds);
  const groups = groupByVenueDate(homeGames);

  // Batch-load bookings + junctions once; the pure planner decides everything.
  const existingBookings = await getDb()
    .select({
      id: venueBookings.id,
      venueId: venueBookings.venueId,
      date: venueBookings.date,
      status: venueBookings.status,
      calculatedStartTime: venueBookings.calculatedStartTime,
      calculatedEndTime: venueBookings.calculatedEndTime,
      needsReconfirmation: venueBookings.needsReconfirmation,
    })
    .from(venueBookings);
  const bookingById = new Map(existingBookings.map((b) => [b.id, b]));
  const bookingMatchMap = await loadBookingMatchMap();

  const plan = planReconciliation({
    groups,
    existingBookings,
    bookingMatchMap,
    config,
    scope: { kind: "matchIds", matchIds },
  });

  // Venue names for any reconfirmation events.
  const reconfirmVenueIds = plan.updates
    .filter((u) => u.windowChanged && u.status === "confirmed")
    .map((u) => u.venueId);
  const venueNames =
    reconfirmVenueIds.length > 0 ? await fetchVenueNames(reconfirmVenueIds) : new Map<number, string>();

  // Apply the whole plan atomically: a crash mid-flight rolls back every
  // booking/junction change together, and reconfirmation events are inserted
  // via the transaction so the outbox only enqueues them after commit.
  await getDb().transaction(async (tx) => {
    // Junction rows to insert/delete, accumulated across creates + updates +
    // removals so they go out as single set-based statements.
    const junctionInserts: { venueBookingId: number; matchId: number }[] = [];
    const junctionDeletes: { venueBookingId: number; matchId: number }[] = [];

    // Creates — one multi-row booking insert, then map ids back by venue+date.
    // onConflictDoNothing tolerates a booking a concurrent reconcile/manual
    // create inserted for the same (venueId, date) between our snapshot read and
    // this write: instead of a 500, we skip it and leave that row (and its
    // confirmation state) untouched for the next reconcile to converge.
    if (plan.creates.length > 0) {
      const createdRows = await tx
        .insert(venueBookings)
        .values(
          plan.creates.map((c) => ({
            venueId: c.venueId,
            date: c.date,
            calculatedStartTime: c.calculatedStartTime,
            calculatedEndTime: c.calculatedEndTime,
            status: "pending" as const,
            needsReconfirmation: false,
          })),
        )
        .onConflictDoNothing({ target: [venueBookings.venueId, venueBookings.date] })
        .returning({ id: venueBookings.id, venueId: venueBookings.venueId, date: venueBookings.date });

      const createdIdByKey = new Map(createdRows.map((r) => [`${r.venueId}:${r.date}`, r.id]));
      for (const c of plan.creates) {
        const bookingId = createdIdByKey.get(`${c.venueId}:${c.date}`);
        // A conflicted create returns no row — its booking already exists and is
        // owned by the concurrent writer, so skip linking here.
        if (bookingId === undefined) continue;
        for (const matchId of c.matchIds) {
          junctionInserts.push({ venueBookingId: bookingId, matchId });
        }
      }
      result.created += createdRows.length;
    }

    // Updates — per-booking UPDATE (distinct SET values) + accumulated junction deltas.
    for (const u of plan.updates) {
      if (u.windowChanged) {
        const wasConfirmed = u.status === "confirmed";
        const updateData: Record<string, unknown> = {
          calculatedStartTime: u.newStartTime,
          calculatedEndTime: u.newEndTime,
          needsReconfirmation: wasConfirmed
            ? true
            : bookingById.get(u.bookingId)?.needsReconfirmation ?? false,
          updatedAt: new Date(),
        };
        if (wasConfirmed) {
          updateData.status = "pending";
          updateData.confirmedAt = null;
          updateData.confirmedBy = null;
        }

        await tx
          .update(venueBookings)
          .set(updateData)
          .where(eq(venueBookings.id, u.bookingId));

        if (wasConfirmed) {
          try {
            const venueName = venueNames.get(u.venueId) ?? "Unknown";
            await publishDomainEvent(
              {
                type: EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION,
                source: "reconciliation",
                entityType: "booking",
                entityId: u.bookingId,
                entityName: `${venueName} - ${u.date}`,
                deepLinkPath: `/admin/bookings/${u.bookingId}`,
                payload: {
                  venueName,
                  date: u.date,
                  reason: "Time window changed after sync reconciliation",
                },
              },
              tx,
            );
          } catch (error) {
            log.warn({ err: error, bookingId: u.bookingId }, "Failed to emit booking.needs_reconfirmation event");
          }
        }

        result.updated++;
      } else {
        result.unchanged++;
      }

      for (const matchId of u.addedMatchIds) {
        junctionInserts.push({ venueBookingId: u.bookingId, matchId });
      }
      for (const matchId of u.removedMatchIds) {
        junctionDeletes.push({ venueBookingId: u.bookingId, matchId });
      }
    }
    result.unchanged += plan.unchanged;

    // Removals (all-cancelled groups + scoped stale bookings).
    const bookingDeletes: number[] = [];
    for (const r of plan.removals) {
      if (r.deletesBooking) {
        bookingDeletes.push(r.bookingId);
      } else {
        for (const matchId of r.removeMatchIds) {
          junctionDeletes.push({ venueBookingId: r.bookingId, matchId });
        }
      }
    }

    // Set-based junction insert (DoNothing tolerates a racing duplicate link).
    if (junctionInserts.length > 0) {
      await tx.insert(venueBookingMatches).values(junctionInserts).onConflictDoNothing();
    }

    // Set-based junction delete for partial removals + match moves.
    if (junctionDeletes.length > 0) {
      await tx
        .delete(venueBookingMatches)
        .where(
          or(
            ...junctionDeletes.map((d) =>
              and(
                eq(venueBookingMatches.venueBookingId, d.venueBookingId),
                eq(venueBookingMatches.matchId, d.matchId),
              ),
            ),
          ),
        );
    }

    // Set-based booking delete (drops their junction rows too) for full removals.
    if (bookingDeletes.length > 0) {
      await tx
        .delete(venueBookingMatches)
        .where(inArray(venueBookingMatches.venueBookingId, bookingDeletes));
      await tx.delete(venueBookings).where(inArray(venueBookings.id, bookingDeletes));
      result.removed += bookingDeletes.length;
    }
  });

  log.info(result, "Reconciliation complete");
  return result;
}

// ── Post-sync reconciliation ─────────────────────────────────────────────────

export async function reconcileAfterSync(): Promise<void> {
  const homeMatchRows = await getDb()
    .select({ id: matches.id })
    .from(matches)
    .innerJoin(teams, eq(teams.apiTeamPermanentId, matches.homeTeamApiId))
    .where(and(eq(teams.isOwnClub, true), sql`${matches.venueId} IS NOT NULL`));

  const allIds = homeMatchRows.map((r) => r.id);

  if (allIds.length === 0) {
    log.info("No home matches found, skipping reconciliation");
    return;
  }

  await reconcileBookingsForMatches(allIds);
}

// ── Single match reconciliation ──────────────────────────────────────────────

export async function reconcileMatch(matchId: number): Promise<void> {
  const previousLinks = await getDb()
    .select({
      venueBookingId: venueBookingMatches.venueBookingId,
      bookingVenueId: venueBookings.venueId,
      bookingDate: venueBookings.date,
    })
    .from(venueBookingMatches)
    .innerJoin(venueBookings, eq(venueBookings.id, venueBookingMatches.venueBookingId))
    .where(eq(venueBookingMatches.matchId, matchId));

  const [currentMatch] = await getDb()
    .select({
      venueId: matches.venueId,
      kickoffDate: matches.kickoffDate,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (currentMatch && previousLinks.length > 0) {
    for (const link of previousLinks) {
      const changed =
        link.bookingVenueId !== currentMatch.venueId ||
        link.bookingDate !== currentMatch.kickoffDate;

      if (changed) {
        await getDb()
          .delete(venueBookingMatches)
          .where(
            and(
              eq(venueBookingMatches.venueBookingId, link.venueBookingId),
              eq(venueBookingMatches.matchId, matchId),
            ),
          );

        const [remaining] = await getDb()
          .select({ count: sql<number>`count(*)` })
          .from(venueBookingMatches)
          .where(eq(venueBookingMatches.venueBookingId, link.venueBookingId));

        if (Number(remaining!.count) === 0) {
          await getDb()
            .delete(venueBookings)
            .where(eq(venueBookings.id, link.venueBookingId));
        }
      }
    }
  }

  await reconcileBookingsForMatches([matchId]);
}
