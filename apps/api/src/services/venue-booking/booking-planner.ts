import { calculateTimeWindow, type BookingConfig } from "./booking-calculator";

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface PlannerMatch {
  matchId: number;
  venueId: number;
  kickoffDate: string;
  kickoffTime: string;
  isForfeited: boolean | null;
  isCancelled: boolean | null;
  estimatedGameDuration: number | null;
}

export interface PlannerExistingBooking {
  id: number;
  venueId: number;
  date: string;
  status: string;
  calculatedStartTime: string;
  calculatedEndTime: string;
}

export type PlanScope = { kind: "all" } | { kind: "matchIds"; matchIds: number[] };

export interface PlannerInput {
  groups: ReadonlyMap<string, readonly PlannerMatch[]>;
  existingBookings: readonly PlannerExistingBooking[];
  bookingMatchMap: ReadonlyMap<number, readonly number[]>;
  config: BookingConfig;
  scope: PlanScope;
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export interface PlanCreate {
  venueId: number;
  date: string;
  calculatedStartTime: string;
  calculatedEndTime: string;
  matchIds: number[];
}

export interface PlanUpdate {
  bookingId: number;
  venueId: number;
  date: string;
  status: string;
  currentStartTime: string;
  currentEndTime: string;
  newStartTime: string;
  newEndTime: string;
  windowChanged: boolean;
  addedMatchIds: number[];
  removedMatchIds: number[];
  expectedMatchIds: number[];
}

export type RemovalReason = "all_matches_cancelled" | "no_matches";

export interface PlanRemoval {
  bookingId: number;
  venueId: number;
  date: string;
  status: string;
  reason: RemovalReason;
  /** Matches to show in a preview's removal list. */
  displayMatchIds: number[];
  /** Junction match ids to delete when executing the plan. */
  removeMatchIds: number[];
  /** Whether the booking row itself becomes empty and is deleted. */
  deletesBooking: boolean;
}

export interface ReconcilePlan {
  creates: PlanCreate[];
  updates: PlanUpdate[];
  removals: PlanRemoval[];
  unchanged: number;
  touchedBookingIds: number[];
}

function isActive(m: PlannerMatch): boolean {
  return m.isForfeited !== true && m.isCancelled !== true;
}

/**
 * Pure reconciliation planner shared by the preview (render) and reconcile
 * (execute) paths. Given the already-grouped home games, the current bookings
 * and their junction links, it classifies every venue+date group as a create,
 * update, removal or no-op — and computes scope-bounded orphan removals.
 *
 * No database access and no side effects: callers map the plan to display DTOs
 * (preview) or to DB writes plus events (reconcile).
 */
export function planReconciliation(input: PlannerInput): ReconcilePlan {
  const { groups, existingBookings, bookingMatchMap, config, scope } = input;

  const plan: ReconcilePlan = {
    creates: [],
    updates: [],
    removals: [],
    unchanged: 0,
    touchedBookingIds: [],
  };
  const touched = new Set<number>();

  for (const [, group] of groups) {
    const { venueId, kickoffDate } = group[0]!;
    const activeGames = group.filter(isActive);
    const existing = existingBookings.find(
      (b) => b.venueId === venueId && b.date === kickoffDate,
    );

    if (activeGames.length === 0) {
      // Whole group forfeited/cancelled.
      if (existing) {
        touched.add(existing.id);
        const groupMatchIds = group.map((g) => g.matchId);
        const currentMatchIds = bookingMatchMap.get(existing.id) ?? [];
        const remaining = currentMatchIds.filter((id) => !groupMatchIds.includes(id));
        plan.removals.push({
          bookingId: existing.id,
          venueId: existing.venueId,
          date: existing.date,
          status: existing.status,
          reason: "all_matches_cancelled",
          displayMatchIds: groupMatchIds,
          removeMatchIds: groupMatchIds,
          deletesBooking: remaining.length === 0,
        });
      }
      continue;
    }

    const window = calculateTimeWindow(
      activeGames.map((g) => ({
        kickoffTime: g.kickoffTime,
        teamGameDuration: g.estimatedGameDuration,
      })),
      config,
    )!;
    const activeMatchIds = activeGames.map((g) => g.matchId);

    if (!existing) {
      plan.creates.push({
        venueId,
        date: kickoffDate,
        calculatedStartTime: window.calculatedStartTime,
        calculatedEndTime: window.calculatedEndTime,
        matchIds: activeMatchIds,
      });
      continue;
    }

    touched.add(existing.id);
    const currentMatchIds = new Set(bookingMatchMap.get(existing.id) ?? []);
    const activeSet = new Set(activeMatchIds);
    const windowChanged =
      existing.calculatedStartTime !== window.calculatedStartTime ||
      existing.calculatedEndTime !== window.calculatedEndTime;
    const addedMatchIds = activeMatchIds.filter((id) => !currentMatchIds.has(id));
    const removedMatchIds = [...currentMatchIds].filter((id) => !activeSet.has(id));

    if (windowChanged || addedMatchIds.length > 0 || removedMatchIds.length > 0) {
      plan.updates.push({
        bookingId: existing.id,
        venueId: existing.venueId,
        date: existing.date,
        status: existing.status,
        currentStartTime: existing.calculatedStartTime,
        currentEndTime: existing.calculatedEndTime,
        newStartTime: window.calculatedStartTime,
        newEndTime: window.calculatedEndTime,
        windowChanged,
        addedMatchIds,
        removedMatchIds,
        expectedMatchIds: activeMatchIds,
      });
    } else {
      plan.unchanged++;
    }
  }

  // Orphan/stale removals for bookings no active group touched.
  for (const b of existingBookings) {
    if (touched.has(b.id)) continue;
    const currentMatchIds = bookingMatchMap.get(b.id) ?? [];

    let removeMatchIds: number[];
    if (scope.kind === "all") {
      removeMatchIds = [...currentMatchIds];
    } else {
      const scopeSet = new Set(scope.matchIds);
      removeMatchIds = currentMatchIds.filter((id) => scopeSet.has(id));
      // Execute only cares about bookings linked to the matches it was asked about.
      if (removeMatchIds.length === 0) continue;
    }

    const remaining = currentMatchIds.filter((id) => !removeMatchIds.includes(id));
    plan.removals.push({
      bookingId: b.id,
      venueId: b.venueId,
      date: b.date,
      status: b.status,
      reason: "no_matches",
      displayMatchIds: [...currentMatchIds],
      removeMatchIds,
      deletesBooking: remaining.length === 0,
    });
  }

  plan.touchedBookingIds = [...touched];
  return plan;
}
