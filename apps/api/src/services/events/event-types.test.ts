import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EVENT_TYPES } from "@dragons/shared";
import { isWithin7Days, classifyUrgency } from "./event-types";

describe("isWithin7Days", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fix time to 2026-03-16T12:00:00Z
    vi.setSystemTime(new Date("2026-03-16T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false for null", () => {
    expect(isWithin7Days(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isWithin7Days(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isWithin7Days("")).toBe(false);
  });

  it("returns false for invalid date string", () => {
    expect(isWithin7Days("not-a-date")).toBe(false);
  });

  it("returns true for today", () => {
    expect(isWithin7Days("2026-03-16T12:00:00Z")).toBe(true);
  });

  it("returns true for 6 days in the future", () => {
    expect(isWithin7Days("2026-03-22T12:00:00Z")).toBe(true);
  });

  it("returns true for exactly 7 days in the future", () => {
    expect(isWithin7Days("2026-03-23T12:00:00Z")).toBe(true);
  });

  it("returns false for 8 days in the future", () => {
    expect(isWithin7Days("2026-03-24T12:00:00Z")).toBe(false);
  });

  it("returns true for 3 days in the past", () => {
    expect(isWithin7Days("2026-03-13T12:00:00Z")).toBe(true);
  });

  it("returns true for exactly 7 days in the past", () => {
    expect(isWithin7Days("2026-03-09T12:00:00Z")).toBe(true);
  });

  it("returns false for 8 days in the past", () => {
    expect(isWithin7Days("2026-03-08T12:00:00Z")).toBe(false);
  });

  it("handles date-only strings", () => {
    expect(isWithin7Days("2026-03-20")).toBe(true);
  });
});

describe("classifyUrgency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Always immediate events ---

  it("classifies match.cancelled as immediate", () => {
    expect(classifyUrgency(EVENT_TYPES.MATCH_CANCELLED, {})).toBe("immediate");
  });

  it("classifies match.forfeited as immediate", () => {
    expect(classifyUrgency(EVENT_TYPES.MATCH_FORFEITED, {})).toBe("immediate");
  });

  it("classifies booking.needs_reconfirmation as immediate", () => {
    expect(
      classifyUrgency(EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION, {}),
    ).toBe("immediate");
  });

  // --- Always routine events ---

  it("classifies match.created as routine", () => {
    expect(classifyUrgency(EVENT_TYPES.MATCH_CREATED, {})).toBe("routine");
  });

  it("classifies match.confirmed as routine", () => {
    expect(classifyUrgency(EVENT_TYPES.MATCH_CONFIRMED, {})).toBe("routine");
  });

  it("classifies match.result_entered as routine", () => {
    expect(classifyUrgency(EVENT_TYPES.MATCH_RESULT_ENTERED, {})).toBe(
      "routine",
    );
  });

  it("classifies match.result_changed as routine", () => {
    expect(classifyUrgency(EVENT_TYPES.MATCH_RESULT_CHANGED, {})).toBe(
      "routine",
    );
  });

  it("classifies match.score.changed as routine", () => {
    expect(classifyUrgency(EVENT_TYPES.MATCH_SCORE_CHANGED, {})).toBe(
      "routine",
    );
  });

  it("classifies referee.assigned as routine", () => {
    expect(classifyUrgency(EVENT_TYPES.REFEREE_ASSIGNED, {})).toBe("routine");
  });

  it("classifies referee.unassigned as routine", () => {
    expect(classifyUrgency(EVENT_TYPES.REFEREE_UNASSIGNED, {})).toBe("routine");
  });

  it("classifies referee.reassigned as routine", () => {
    expect(classifyUrgency(EVENT_TYPES.REFEREE_REASSIGNED, {})).toBe("routine");
  });

  it("classifies booking.created as routine", () => {
    expect(classifyUrgency(EVENT_TYPES.BOOKING_CREATED, {})).toBe("routine");
  });

  it("classifies booking.status.changed as routine", () => {
    expect(classifyUrgency(EVENT_TYPES.BOOKING_STATUS_CHANGED, {})).toBe(
      "routine",
    );
  });

  it("classifies override.applied as routine", () => {
    expect(classifyUrgency(EVENT_TYPES.OVERRIDE_APPLIED, {})).toBe("routine");
  });

  it("classifies override.reverted as routine when no date info", () => {
    expect(classifyUrgency(EVENT_TYPES.OVERRIDE_REVERTED, {})).toBe("routine");
  });

  it("classifies override.reverted as immediate when kickoffDate is near", () => {
    const payload = { kickoffDate: "2026-03-18" };
    expect(classifyUrgency(EVENT_TYPES.OVERRIDE_REVERTED, payload)).toBe("immediate");
  });

  it("classifies override.reverted as routine when kickoffDate is far", () => {
    const payload = { kickoffDate: "2026-06-01" };
    expect(classifyUrgency(EVENT_TYPES.OVERRIDE_REVERTED, payload)).toBe("routine");
  });

  it("classifies override.conflict as immediate", () => {
    expect(classifyUrgency(EVENT_TYPES.OVERRIDE_CONFLICT, {})).toBe("immediate");
  });

  it("classifies sync.completed as routine", () => {
    expect(classifyUrgency(EVENT_TYPES.SYNC_COMPLETED, {})).toBe("routine");
  });

  // --- Date-dependent events ---

  describe("match.schedule.changed", () => {
    it("is immediate when changes contain a near-future date", () => {
      const payload = {
        changes: [
          {
            field: "kickoffDate",
            oldValue: "2026-03-18T18:00:00Z",
            newValue: "2026-03-20T19:00:00Z",
          },
        ],
      };
      expect(classifyUrgency(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, payload)).toBe(
        "immediate",
      );
    });

    it("is immediate when old date is within 7 days", () => {
      const payload = {
        changes: [
          {
            field: "kickoffDate",
            oldValue: "2026-03-17T18:00:00Z",
            newValue: "2026-06-01T19:00:00Z",
          },
        ],
      };
      expect(classifyUrgency(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, payload)).toBe(
        "immediate",
      );
    });

    it("is routine when all dates are far away", () => {
      const payload = {
        changes: [
          {
            field: "kickoffDate",
            oldValue: "2026-06-01T18:00:00Z",
            newValue: "2026-06-15T19:00:00Z",
          },
        ],
      };
      expect(classifyUrgency(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, payload)).toBe(
        "routine",
      );
    });

    it("is immediate when top-level kickoffDate is within 7 days (time-only change)", () => {
      const payload = {
        kickoffDate: "2026-03-18",
        changes: [
          {
            field: "kickoffTime",
            oldValue: "19:30:00",
            newValue: "20:00:00",
          },
        ],
      };
      expect(classifyUrgency(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, payload)).toBe(
        "immediate",
      );
    });

    it("is routine when top-level kickoffDate is far away (time-only change)", () => {
      const payload = {
        kickoffDate: "2026-06-01",
        changes: [
          {
            field: "kickoffTime",
            oldValue: "19:30:00",
            newValue: "20:00:00",
          },
        ],
      };
      expect(classifyUrgency(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, payload)).toBe(
        "routine",
      );
    });

    it("is routine when there are no changes", () => {
      expect(classifyUrgency(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, {})).toBe(
        "routine",
      );
    });
  });

  describe("match.venue.changed", () => {
    it("is immediate when kickoffDate is within 7 days", () => {
      const payload = {
        kickoffDate: "2026-03-20T18:00:00Z",
      };
      expect(classifyUrgency(EVENT_TYPES.MATCH_VENUE_CHANGED, payload)).toBe(
        "immediate",
      );
    });

    it("is routine when kickoffDate is far away", () => {
      const payload = {
        kickoffDate: "2026-06-01T18:00:00Z",
      };
      expect(classifyUrgency(EVENT_TYPES.MATCH_VENUE_CHANGED, payload)).toBe(
        "routine",
      );
    });

    it("is routine with no date info", () => {
      expect(classifyUrgency(EVENT_TYPES.MATCH_VENUE_CHANGED, {})).toBe(
        "routine",
      );
    });
  });

  // --- Edge cases ---

  it("treats unknown event types as routine", () => {
    expect(classifyUrgency("unknown.event", {})).toBe("routine");
  });

  it("handles changes array with non-date fields", () => {
    const payload = {
      changes: [
        {
          field: "venueName",
          oldValue: "Old Gym",
          newValue: "New Gym",
        },
      ],
    };
    expect(classifyUrgency(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, payload)).toBe(
      "routine",
    );
  });

  it("handles changes array with null entries", () => {
    const payload = {
      changes: [null, undefined, 42],
    };
    expect(classifyUrgency(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, payload)).toBe(
      "routine",
    );
  });

  // --- Referee slot events ---

  describe("referee.slots.needed", () => {
    it("is immediate when kickoff within 7 days", () => {
      const payload = { kickoffDate: "2026-03-20" };
      expect(classifyUrgency(EVENT_TYPES.REFEREE_SLOTS_NEEDED, payload)).toBe(
        "immediate",
      );
    });

    it("is routine when kickoff > 7 days away", () => {
      const payload = { kickoffDate: "2026-06-01" };
      expect(classifyUrgency(EVENT_TYPES.REFEREE_SLOTS_NEEDED, payload)).toBe(
        "routine",
      );
    });

    it("is routine with no date info", () => {
      expect(classifyUrgency(EVENT_TYPES.REFEREE_SLOTS_NEEDED, {})).toBe(
        "routine",
      );
    });
  });

  it("classifies referee.slots.reminder as always immediate", () => {
    const payload = { kickoffDate: "2099-12-31" };
    expect(classifyUrgency(EVENT_TYPES.REFEREE_SLOTS_REMINDER, payload)).toBe(
      "immediate",
    );
  });

  it("classifies referee.slots.reminder as immediate with no date info", () => {
    expect(classifyUrgency(EVENT_TYPES.REFEREE_SLOTS_REMINDER, {})).toBe(
      "immediate",
    );
  });
});
