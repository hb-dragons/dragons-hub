import { db } from "../../config/database";
import { logger } from "../../config/logger";
import {
  venueBookings,
  venueBookingMatches,
  matches,
  teams,
  venues,
  leagues,
  appSettings,
} from "@dragons/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { calculateTimeWindow, type BookingConfig } from "./booking-calculator";
import type {
  ReconcilePreview,
  ReconcilePreviewMatch,
  ReconcilePreviewCreate,
  ReconcilePreviewUpdate,
  ReconcilePreviewRemove,
  ReconcileResult,
  BookingStatus,
} from "@dragons/shared";

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

  const rows = await db
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

function isActiveMatch(m: MatchWithTeam): boolean {
  return m.isForfeited !== true && m.isCancelled !== true;
}

function sortMatchesByKickoff(matches: ReconcilePreviewMatch[]): ReconcilePreviewMatch[] {
  return matches.sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime));
}

// ── Preview ─────────────────────────────────────────────────────────────────

async function fetchMatchDisplayInfo(matchIds: number[]): Promise<Map<number, ReconcilePreviewMatch>> {
  if (matchIds.length === 0) return new Map();

  const homeTeam = db
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name, customName: teams.customName })
    .from(teams)
    .as("home_team");
  const guestTeam = db
    .select({ apiTeamPermanentId: teams.apiTeamPermanentId, name: teams.name })
    .from(teams)
    .as("guest_team");

  const rows = await db
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
  const rows = await db
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .where(inArray(venues.id, venueIds));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function previewReconciliation(): Promise<ReconcilePreview> {
  const preview: ReconcilePreview = { toCreate: [], toUpdate: [], toRemove: [], unchanged: 0 };

  // Get all home matches (including forfeited/cancelled so we can show them)
  const allHomeMatchRows = await db
    .select({ id: matches.id })
    .from(matches)
    .innerJoin(teams, eq(teams.apiTeamPermanentId, matches.homeTeamApiId))
    .where(and(eq(teams.isOwnClub, true), sql`${matches.venueId} IS NOT NULL`));

  const allMatchIds = allHomeMatchRows.map((r) => r.id);
  if (allMatchIds.length === 0) return preview;

  const config = await getBookingConfig();
  const homeGames = await queryHomeMatches(allMatchIds);
  const groups = groupByVenueDate(homeGames);

  // Collect all match IDs and venue IDs for display info
  const allMatchIdsForDisplay = new Set<number>();
  const allVenueIds = new Set<number>();
  for (const group of groups.values()) {
    for (const g of group) {
      allMatchIdsForDisplay.add(g.matchId);
      allVenueIds.add(g.venueId);
    }
  }

  // Also get existing bookings to find removals
  const existingBookings = await db
    .select({
      id: venueBookings.id,
      venueId: venueBookings.venueId,
      date: venueBookings.date,
      status: venueBookings.status,
      calculatedStartTime: venueBookings.calculatedStartTime,
      calculatedEndTime: venueBookings.calculatedEndTime,
    })
    .from(venueBookings);

  for (const b of existingBookings) {
    allVenueIds.add(b.venueId);
  }

  // Get existing junction entries for each booking
  const allJunctions = await db
    .select({
      venueBookingId: venueBookingMatches.venueBookingId,
      matchId: venueBookingMatches.matchId,
    })
    .from(venueBookingMatches);

  const bookingMatchMap = new Map<number, number[]>();
  for (const j of allJunctions) {
    const list = bookingMatchMap.get(j.venueBookingId) ?? [];
    list.push(j.matchId);
    bookingMatchMap.set(j.venueBookingId, list);
    allMatchIdsForDisplay.add(j.matchId);
  }

  const [matchDisplay, venueNames] = await Promise.all([
    fetchMatchDisplayInfo([...allMatchIdsForDisplay]),
    fetchVenueNames([...allVenueIds]),
  ]);

  const touchedBookingIds = new Set<number>();

  for (const [, group] of groups) {
    const { venueId, kickoffDate } = group[0]!;
    const activeGames = group.filter(isActiveMatch);
    const venueName = venueNames.get(venueId) ?? "Unknown";

    // Find existing booking for this venue+date
    const existing = existingBookings.find(
      (b) => b.venueId === venueId && b.date === kickoffDate,
    );

    if (activeGames.length === 0) {
      // All matches forfeited/cancelled
      if (existing) {
        touchedBookingIds.add(existing.id);
        preview.toRemove.push({
          bookingId: existing.id,
          venueName,
          date: kickoffDate,
          status: existing.status as BookingStatus,
          reason: "all_matches_cancelled",
          matches: sortMatchesByKickoff(group.map((g) => matchDisplay.get(g.matchId)!).filter(Boolean)),
        });
      }
      continue;
    }

    const matchInputs = activeGames.map((g) => ({
      kickoffTime: g.kickoffTime,
      teamGameDuration: g.estimatedGameDuration,
    }));
    const window = calculateTimeWindow(matchInputs, config)!;
    const activeMatchIds = new Set(activeGames.map((g) => g.matchId));

    if (existing) {
      touchedBookingIds.add(existing.id);
      const currentMatchIds = new Set(bookingMatchMap.get(existing.id) ?? []);

      const windowChanged =
        existing.calculatedStartTime !== window.calculatedStartTime ||
        existing.calculatedEndTime !== window.calculatedEndTime;

      const added = [...activeMatchIds].filter((id) => !currentMatchIds.has(id));
      const removed = [...currentMatchIds].filter((id) => !activeMatchIds.has(id));

      if (windowChanged || added.length > 0 || removed.length > 0) {
        preview.toUpdate.push({
          bookingId: existing.id,
          venueName,
          date: kickoffDate,
          status: existing.status as BookingStatus,
          currentStartTime: existing.calculatedStartTime,
          currentEndTime: existing.calculatedEndTime,
          newStartTime: window.calculatedStartTime,
          newEndTime: window.calculatedEndTime,
          matchesAdded: sortMatchesByKickoff(added.map((id) => matchDisplay.get(id)!).filter(Boolean)),
          matchesRemoved: sortMatchesByKickoff(removed.map((id) => matchDisplay.get(id)!).filter(Boolean)),
        });
      } else {
        preview.unchanged++;
      }
    } else {
      preview.toCreate.push({
        venueName,
        date: kickoffDate,
        calculatedStartTime: window.calculatedStartTime,
        calculatedEndTime: window.calculatedEndTime,
        matches: sortMatchesByKickoff(activeGames.map((g) => matchDisplay.get(g.matchId)!).filter(Boolean)),
      });
    }
  }

  // Find existing bookings not touched (no matching home games at all)
  for (const b of existingBookings) {
    if (!touchedBookingIds.has(b.id)) {
      const linkedMatchIds = bookingMatchMap.get(b.id) ?? [];
      preview.toRemove.push({
        bookingId: b.id,
        venueName: venueNames.get(b.venueId) ?? "Unknown",
        date: b.date,
        status: b.status as BookingStatus,
        reason: "no_matches",
        matches: sortMatchesByKickoff(linkedMatchIds.map((id) => matchDisplay.get(id)!).filter(Boolean)),
      });
    }
  }

  const byDateAsc = (a: { date: string }, b: { date: string }) =>
    a.date.localeCompare(b.date);
  preview.toCreate.sort(byDateAsc);
  preview.toUpdate.sort(byDateAsc);
  preview.toRemove.sort(byDateAsc);

  return preview;
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

  const touchedBookingIds = new Set<number>();

  for (const [, group] of groups) {
    const { venueId, kickoffDate } = group[0]!;

    // Only active (non-forfeited, non-cancelled) matches count
    const activeGames = group.filter(isActiveMatch);

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

    if (activeGames.length === 0) {
      // All matches are forfeited/cancelled — mark existing booking for cleanup
      if (existing) {
        // Remove all junction entries for these matches
        const cancelledMatchIds = group.map((g) => g.matchId);
        await db
          .delete(venueBookingMatches)
          .where(
            and(
              eq(venueBookingMatches.venueBookingId, existing.id),
              inArray(venueBookingMatches.matchId, cancelledMatchIds),
            ),
          );

        // Check if booking has any remaining matches
        const [remaining] = await db
          .select({ count: sql<number>`count(*)` })
          .from(venueBookingMatches)
          .where(eq(venueBookingMatches.venueBookingId, existing.id));

        if (Number(remaining!.count) === 0) {
          await db.delete(venueBookings).where(eq(venueBookings.id, existing.id));
          result.removed++;
        }
        touchedBookingIds.add(existing.id);
      }
      continue;
    }

    const activeMatchIds = activeGames.map((g) => g.matchId);

    // Calculate time window from active matches only
    const matchInputs = activeGames.map((g) => ({
      kickoffTime: g.kickoffTime,
      teamGameDuration: g.estimatedGameDuration,
    }));
    const window = calculateTimeWindow(matchInputs, config)!;

    if (existing) {
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

      // Sync junction entries — only active matches
      await syncBookingMatches(existing.id, activeMatchIds);
      touchedBookingIds.add(existing.id);
    } else {
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

      if (activeMatchIds.length > 0) {
        await db.insert(venueBookingMatches).values(
          activeMatchIds.map((matchId) => ({
            venueBookingId: created!.id,
            matchId,
          })),
        );
      }

      result.created++;
      touchedBookingIds.add(created!.id);
    }
  }

  // Clean up stale bookings linked to these matchIds that we didn't touch
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

  for (const bookingId of staleBookingIds) {
    const [remaining] = await db
      .select({ count: sql<number>`count(*)` })
      .from(venueBookingMatches)
      .where(eq(venueBookingMatches.venueBookingId, bookingId));

    if (Number(remaining!.count) === 0) {
      await db.delete(venueBookings).where(eq(venueBookings.id, bookingId));
      result.removed++;
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

  const toInsert = [...expectedIds].filter((id) => !existingIds.has(id));
  const toDelete = [...existingIds].filter((id) => !expectedIds.has(id));

  if (toInsert.length > 0) {
    await db.insert(venueBookingMatches).values(
      toInsert.map((matchId) => ({ venueBookingId: bookingId, matchId })),
    );
  }

  if (toDelete.length > 0) {
    await db
      .delete(venueBookingMatches)
      .where(
        and(
          eq(venueBookingMatches.venueBookingId, bookingId),
          inArray(venueBookingMatches.matchId, toDelete),
        ),
      );
  }
}

// ── Post-sync reconciliation ─────────────────────────────────────────────────

export async function reconcileAfterSync(): Promise<void> {
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
  const previousLinks = await db
    .select({
      venueBookingId: venueBookingMatches.venueBookingId,
      bookingVenueId: venueBookings.venueId,
      bookingDate: venueBookings.date,
    })
    .from(venueBookingMatches)
    .innerJoin(venueBookings, eq(venueBookings.id, venueBookingMatches.venueBookingId))
    .where(eq(venueBookingMatches.matchId, matchId));

  const [currentMatch] = await db
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
        await db
          .delete(venueBookingMatches)
          .where(
            and(
              eq(venueBookingMatches.venueBookingId, link.venueBookingId),
              eq(venueBookingMatches.matchId, matchId),
            ),
          );

        const [remaining] = await db
          .select({ count: sql<number>`count(*)` })
          .from(venueBookingMatches)
          .where(eq(venueBookingMatches.venueBookingId, link.venueBookingId));

        if (Number(remaining!.count) === 0) {
          await db
            .delete(venueBookings)
            .where(eq(venueBookings.id, link.venueBookingId));
        }
      }
    }
  }

  await reconcileBookingsForMatches([matchId]);
}
