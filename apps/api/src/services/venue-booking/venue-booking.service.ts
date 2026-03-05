import { db } from "../../config/database";
import { logger } from "../../config/logger";
import {
  venueBookings,
  venueBookingMatches,
  matches,
  teams,
  appSettings,
} from "@dragons/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { calculateTimeWindow, type BookingConfig } from "./booking-calculator";

const log = logger.child({ service: "venue-booking" });

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReconcileResult {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
}

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
  const rows = await db
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

// ── Reconciliation ───────────────────────────────────────────────────────────

interface MatchWithTeam {
  matchId: number;
  venueId: number;
  kickoffDate: string;
  kickoffTime: string;
  isOwnClub: boolean | null;
  estimatedGameDuration: number | null;
}

export async function reconcileBookingsForMatches(
  matchIds: number[],
): Promise<ReconcileResult> {
  const result: ReconcileResult = { created: 0, updated: 0, deleted: 0, unchanged: 0 };

  if (matchIds.length === 0) return result;

  const config = await getBookingConfig();

  // 1. Query matches with home team info, only those with a venue
  const rows: MatchWithTeam[] = await db
    .select({
      matchId: matches.id,
      venueId: matches.venueId,
      kickoffDate: matches.kickoffDate,
      kickoffTime: matches.kickoffTime,
      isOwnClub: teams.isOwnClub,
      estimatedGameDuration: teams.estimatedGameDuration,
    })
    .from(matches)
    .innerJoin(teams, eq(teams.apiTeamPermanentId, matches.homeTeamApiId))
    .where(and(inArray(matches.id, matchIds), sql`${matches.venueId} IS NOT NULL`))
    .then((r) =>
      r.map((row) => ({
        ...row,
        venueId: row.venueId as number,
      })),
    );

  // 2. Filter to home games only
  const homeGames = rows.filter((r) => r.isOwnClub === true);

  // 3. Group by (venueId, kickoffDate)
  const groups = new Map<string, MatchWithTeam[]>();
  for (const game of homeGames) {
    const key = `${game.venueId}:${game.kickoffDate}`;
    const group = groups.get(key);
    if (group) {
      group.push(game);
    } else {
      groups.set(key, [game]);
    }
  }

  // 4. Process each group
  const touchedBookingIds = new Set<number>();

  for (const [, group] of groups) {
    const { venueId, kickoffDate } = group[0]!;
    const matchIdsInGroup = group.map((g) => g.matchId);

    // Calculate time window
    const matchInputs = group.map((g) => ({
      kickoffTime: g.kickoffTime,
      teamGameDuration: g.estimatedGameDuration,
    }));
    // Every group has at least one match, so window is always non-null
    const window = calculateTimeWindow(matchInputs, config)!;

    // Find existing booking
    const [existing] = await db
      .select()
      .from(venueBookings)
      .where(
        and(
          eq(venueBookings.venueId, venueId),
          eq(venueBookings.date, kickoffDate),
        ),
      )
      .limit(1);

    if (existing) {
      // Check if time window changed
      const windowChanged =
        existing.calculatedStartTime !== window.calculatedStartTime ||
        existing.calculatedEndTime !== window.calculatedEndTime;

      if (windowChanged) {
        const updateData: Record<string, unknown> = {
          calculatedStartTime: window.calculatedStartTime,
          calculatedEndTime: window.calculatedEndTime,
          needsReconfirmation:
            existing.status === "confirmed" ? true : existing.needsReconfirmation,
          updatedAt: new Date(),
        };

        // If booking was confirmed and times changed, revert to pending
        if (existing.status === "confirmed") {
          updateData.status = "pending";
          updateData.confirmedAt = null;
          updateData.confirmedBy = null;
        }

        await db
          .update(venueBookings)
          .set(updateData)
          .where(eq(venueBookings.id, existing.id));

        result.updated++;
      } else {
        result.unchanged++;
      }

      // Sync junction entries
      await syncBookingMatches(existing.id, matchIdsInGroup);
      touchedBookingIds.add(existing.id);
    } else {
      // Create new booking
      const [created] = await db
        .insert(venueBookings)
        .values({
          venueId,
          date: kickoffDate,
          calculatedStartTime: window.calculatedStartTime,
          calculatedEndTime: window.calculatedEndTime,
          status: "pending",
          needsReconfirmation: false,
        })
        .returning({ id: venueBookings.id });

      // Link matches
      for (const mid of matchIdsInGroup) {
        await db.insert(venueBookingMatches).values({
          venueBookingId: created!.id,
          matchId: mid,
        });
      }

      result.created++;
      touchedBookingIds.add(created!.id);
    }
  }

  // 5. Clean up: find bookings linked to these matchIds that we didn't touch,
  //    and remove the stale junction entries
  const allLinkedBookings = await db
    .select({ venueBookingId: venueBookingMatches.venueBookingId })
    .from(venueBookingMatches)
    .where(inArray(venueBookingMatches.matchId, matchIds));

  const staleBookingIds = new Set<number>();
  for (const row of allLinkedBookings) {
    if (!touchedBookingIds.has(row.venueBookingId)) {
      staleBookingIds.add(row.venueBookingId);
    }
  }

  // Remove stale junction entries for these matches
  if (staleBookingIds.size > 0) {
    for (const bookingId of staleBookingIds) {
      await db
        .delete(venueBookingMatches)
        .where(
          and(
            eq(venueBookingMatches.venueBookingId, bookingId),
            inArray(venueBookingMatches.matchId, matchIds),
          ),
        );
    }
  }

  // 6. Delete stale bookings that now have zero linked matches
  for (const bookingId of staleBookingIds) {
    const [remaining] = await db
      .select({ count: sql<number>`count(*)` })
      .from(venueBookingMatches)
      .where(eq(venueBookingMatches.venueBookingId, bookingId));

    // count(*) always returns a row
    if (Number(remaining!.count) === 0) {
      await db.delete(venueBookings).where(eq(venueBookings.id, bookingId));
      result.deleted++;
    }
  }

  log.info(result, "Reconciliation complete");
  return result;
}

// ── Junction sync ────────────────────────────────────────────────────────────

async function syncBookingMatches(
  bookingId: number,
  expectedMatchIds: number[],
): Promise<void> {
  const existing = await db
    .select({ matchId: venueBookingMatches.matchId })
    .from(venueBookingMatches)
    .where(eq(venueBookingMatches.venueBookingId, bookingId));

  const existingIds = new Set(existing.map((r) => r.matchId));
  const expectedIds = new Set(expectedMatchIds);

  // Add missing
  for (const matchId of expectedIds) {
    if (!existingIds.has(matchId)) {
      await db.insert(venueBookingMatches).values({
        venueBookingId: bookingId,
        matchId,
      });
    }
  }

  // Remove stale
  for (const matchId of existingIds) {
    if (!expectedIds.has(matchId)) {
      await db
        .delete(venueBookingMatches)
        .where(
          and(
            eq(venueBookingMatches.venueBookingId, bookingId),
            eq(venueBookingMatches.matchId, matchId),
          ),
        );
    }
  }
}

// ── Post-sync reconciliation ─────────────────────────────────────────────────

export async function reconcileAfterSync(): Promise<void> {
  // Reconcile ALL home matches — the reconciliation is idempotent,
  // so unchanged bookings stay the same.
  const homeMatchRows = await db
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
  // Check if match was previously linked to a booking
  const previousLinks = await db
    .select({
      venueBookingId: venueBookingMatches.venueBookingId,
      bookingVenueId: venueBookings.venueId,
      bookingDate: venueBookings.date,
    })
    .from(venueBookingMatches)
    .innerJoin(venueBookings, eq(venueBookings.id, venueBookingMatches.venueBookingId))
    .where(eq(venueBookingMatches.matchId, matchId));

  // Get the current match state
  const [currentMatch] = await db
    .select({
      venueId: matches.venueId,
      kickoffDate: matches.kickoffDate,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  // If match moved to a different venue/date, clean up old bookings
  if (currentMatch && previousLinks.length > 0) {
    for (const link of previousLinks) {
      const changed =
        link.bookingVenueId !== currentMatch.venueId ||
        link.bookingDate !== currentMatch.kickoffDate;

      if (changed) {
        // Remove this match from the old booking
        await db
          .delete(venueBookingMatches)
          .where(
            and(
              eq(venueBookingMatches.venueBookingId, link.venueBookingId),
              eq(venueBookingMatches.matchId, matchId),
            ),
          );

        // Check if old booking is now empty
        const [remaining] = await db
          .select({ count: sql<number>`count(*)` })
          .from(venueBookingMatches)
          .where(eq(venueBookingMatches.venueBookingId, link.venueBookingId));

        // count(*) always returns a row
        if (Number(remaining!.count) === 0) {
          await db
            .delete(venueBookings)
            .where(eq(venueBookings.id, link.venueBookingId));
        }
      }
    }
  }

  // Reconcile the match at its current venue/date
  await reconcileBookingsForMatches([matchId]);
}
