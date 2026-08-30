import { describe, expect, it } from "vitest";

import type { PlanGame } from "./full-plan";
import { planGameFixture } from "./full-plan.fixture";
import { UPCOMING_EVENT_LIMIT, upcomingMatches } from "./spielplan-events";

function planGame(overrides: Partial<PlanGame> = {}): PlanGame {
  return planGameFixture({ kickoffDate: "2026-10-10", kickoffTime: "15:00:00", ...overrides });
}

describe("upcomingMatches", () => {
  it("keeps games from today in the club zone on, dropping the past", () => {
    const plan = [
      planGame({ id: 1, kickoffDate: "2026-07-31" }),
      planGame({ id: 2, kickoffDate: "2026-08-01" }),
      planGame({ id: 3, kickoffDate: "2026-08-08" }),
    ];
    // 23:30 UTC on Jul 31 is already Aug 1 in Europe/Berlin.
    const upcoming = upcomingMatches(plan, new Date("2026-07-31T23:30:00Z"));
    expect(upcoming.map((game) => game.id)).toEqual([2, 3]);
  });

  it("caps the snapshot at the event limit", () => {
    const plan = Array.from({ length: UPCOMING_EVENT_LIMIT + 3 }, (_, i) =>
      planGame({ id: i + 1, kickoffDate: "2026-10-10" }),
    );
    const upcoming = upcomingMatches(plan, new Date("2026-08-30T12:00:00Z"));
    expect(upcoming).toHaveLength(UPCOMING_EVENT_LIMIT);
    expect(upcoming[0]?.id).toBe(1);
  });

  it("is empty for a fully played plan", () => {
    const plan = [planGame({ kickoffDate: "2026-03-01" })];
    expect(upcomingMatches(plan, new Date("2026-08-30T12:00:00Z"))).toEqual([]);
  });
});
