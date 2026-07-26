import { describe, expect, it } from "vitest";
import { planReconciliation, type PlannerMatch, type PlannerExistingBooking } from "./booking-planner";
import type { BookingConfig } from "./booking-calculator";

const CONFIG: BookingConfig = {
  bufferBeforeMinutes: 60,
  bufferAfterMinutes: 60,
  defaultGameDurationMinutes: 90,
};

function match(overrides: Partial<PlannerMatch> & { matchId: number }): PlannerMatch {
  return {
    venueId: 10,
    kickoffDate: "2025-03-15",
    kickoffTime: "18:00:00",
    isForfeited: false,
    isCancelled: false,
    estimatedGameDuration: null,
    ...overrides,
  };
}

function groupsOf(...all: PlannerMatch[]): Map<string, PlannerMatch[]> {
  const groups = new Map<string, PlannerMatch[]>();
  for (const m of all) {
    const key = `${m.venueId}:${m.kickoffDate}`;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }
  return groups;
}

function booking(overrides: Partial<PlannerExistingBooking> & { id: number }): PlannerExistingBooking {
  return {
    venueId: 10,
    date: "2025-03-15",
    status: "pending",
    calculatedStartTime: "17:00:00",
    calculatedEndTime: "20:30:00",
    ...overrides,
  };
}

describe("planReconciliation", () => {
  it("plans a create for an active group with no existing booking", () => {
    const groups = groupsOf(match({ matchId: 1, kickoffTime: "18:00:00" }));

    const plan = planReconciliation({
      groups,
      existingBookings: [],
      bookingMatchMap: new Map(),
      config: CONFIG,
      scope: { kind: "all" },
    });

    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({
      venueId: 10,
      date: "2025-03-15",
      calculatedStartTime: "17:00:00", // 18:00 - 60
      calculatedEndTime: "20:30:00", // 18:00 + 90 + 60
      matchIds: [1],
    });
    expect(plan.updates).toHaveLength(0);
    expect(plan.removals).toHaveLength(0);
    expect(plan.unchanged).toBe(0);
  });

  it("plans a window update when the existing booking's times changed", () => {
    const groups = groupsOf(match({ matchId: 1, kickoffTime: "18:00:00" }));
    const existing = booking({ id: 7, calculatedStartTime: "16:00:00", calculatedEndTime: "18:00:00" });

    const plan = planReconciliation({
      groups,
      existingBookings: [existing],
      bookingMatchMap: new Map([[7, [1]]]),
      config: CONFIG,
      scope: { kind: "all" },
    });

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({
      bookingId: 7,
      windowChanged: true,
      currentStartTime: "16:00:00",
      currentEndTime: "18:00:00",
      newStartTime: "17:00:00",
      newEndTime: "20:30:00",
      addedMatchIds: [],
      removedMatchIds: [],
      expectedMatchIds: [1],
    });
    expect(plan.touchedBookingIds).toContain(7);
  });

  it("plans a junction-only update (windowChanged=false) when a match is added", () => {
    const groups = groupsOf(
      match({ matchId: 1, kickoffTime: "14:00:00" }),
      match({ matchId: 2, kickoffTime: "18:00:00" }),
    );
    // Existing booking window already matches the calculated window for [14:00, 18:00]
    // start 14:00 - 60 = 13:00, end 18:00 + 90 + 60 = 20:30
    const existing = booking({ id: 7, calculatedStartTime: "13:00:00", calculatedEndTime: "20:30:00" });

    const plan = planReconciliation({
      groups,
      existingBookings: [existing],
      bookingMatchMap: new Map([[7, [1]]]),
      config: CONFIG,
      scope: { kind: "all" },
    });

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({
      bookingId: 7,
      windowChanged: false,
      addedMatchIds: [2],
      removedMatchIds: [],
      expectedMatchIds: [1, 2],
    });
    expect(plan.unchanged).toBe(0);
  });

  it("counts an unchanged booking when window and junctions all match", () => {
    const groups = groupsOf(match({ matchId: 1, kickoffTime: "18:00:00" }));
    const existing = booking({ id: 7, calculatedStartTime: "17:00:00", calculatedEndTime: "20:30:00" });

    const plan = planReconciliation({
      groups,
      existingBookings: [existing],
      bookingMatchMap: new Map([[7, [1]]]),
      config: CONFIG,
      scope: { kind: "all" },
    });

    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
    expect(plan.removals).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
    expect(plan.touchedBookingIds).toContain(7);
  });

  it("plans an all_matches_cancelled removal that deletes the now-empty booking", () => {
    const groups = groupsOf(match({ matchId: 1, isCancelled: true }));
    const existing = booking({ id: 7 });

    const plan = planReconciliation({
      groups,
      existingBookings: [existing],
      bookingMatchMap: new Map([[7, [1]]]),
      config: CONFIG,
      scope: { kind: "all" },
    });

    expect(plan.removals).toHaveLength(1);
    expect(plan.removals[0]).toMatchObject({
      bookingId: 7,
      reason: "all_matches_cancelled",
      displayMatchIds: [1],
      deletesBooking: true,
    });
    expect(plan.touchedBookingIds).toContain(7);
  });

  it("keeps the booking when an all-cancelled group leaves other junctions linked (scope matchIds)", () => {
    const groups = groupsOf(match({ matchId: 1, isCancelled: true }));
    const existing = booking({ id: 7 });

    const plan = planReconciliation({
      groups,
      existingBookings: [existing],
      bookingMatchMap: new Map([[7, [1, 2]]]), // match 2 still linked, outside this scope
      config: CONFIG,
      scope: { kind: "matchIds", matchIds: [1] },
    });

    expect(plan.removals).toHaveLength(1);
    expect(plan.removals[0]).toMatchObject({
      bookingId: 7,
      reason: "all_matches_cancelled",
      deletesBooking: false,
      removeMatchIds: [1],
    });
  });

  it("plans a no_matches removal for an orphaned booking under scope=all", () => {
    const groups = groupsOf(match({ matchId: 1, venueId: 10 }));
    const orphan = booking({ id: 99, venueId: 20, date: "2025-04-01" });

    const plan = planReconciliation({
      groups,
      existingBookings: [orphan],
      bookingMatchMap: new Map(),
      config: CONFIG,
      scope: { kind: "all" },
    });

    expect(plan.creates).toHaveLength(1); // venue 10 group
    const removal = plan.removals.find((r) => r.bookingId === 99);
    expect(removal).toMatchObject({
      reason: "no_matches",
      deletesBooking: true,
    });
  });

  it("under scope=matchIds removes only the scoped junctions from a stale booking and keeps it if others remain", () => {
    const groups = new Map<string, PlannerMatch[]>(); // m1 no longer a home game -> no groups
    const existing = booking({ id: 7 });

    const plan = planReconciliation({
      groups,
      existingBookings: [existing],
      bookingMatchMap: new Map([[7, [1, 2]]]),
      config: CONFIG,
      scope: { kind: "matchIds", matchIds: [1] },
    });

    expect(plan.removals).toHaveLength(1);
    expect(plan.removals[0]).toMatchObject({
      bookingId: 7,
      reason: "no_matches",
      removeMatchIds: [1],
      deletesBooking: false, // match 2 still linked
    });
  });

  it("under scope=matchIds does not remove bookings unrelated to the scoped match ids", () => {
    const groups = new Map<string, PlannerMatch[]>();
    const unrelated = booking({ id: 7 });

    const plan = planReconciliation({
      groups,
      existingBookings: [unrelated],
      bookingMatchMap: new Map([[7, [5, 6]]]), // no overlap with scope [1]
      config: CONFIG,
      scope: { kind: "matchIds", matchIds: [1] },
    });

    expect(plan.removals).toHaveLength(0);
  });
});
