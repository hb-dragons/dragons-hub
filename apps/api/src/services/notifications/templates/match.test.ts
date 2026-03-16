import { describe, expect, it } from "vitest";
import { renderMatchMessage } from "./match";
import { renderEventMessage } from "./index";
import { EVENT_TYPES } from "@dragons/shared";

describe("renderMatchMessage", () => {
  describe("match.time_changed", () => {
    const payload = {
      matchNo: 42,
      homeTeam: "Dragons",
      guestTeam: "Tigers",
      leagueName: "Bezirksliga",
      changes: [
        { field: "kickoffDate", oldValue: "2026-03-20", newValue: "2026-03-22" },
      ],
    };

    it("renders schedule change in German", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_TIME_CHANGED,
        payload,
        "Dragons vs Tigers",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Spielverlegung");
      expect(result!.title).toContain("Dragons vs Tigers");
      expect(result!.body).toContain("Dragons vs Tigers");
      expect(result!.body).toContain("Bezirksliga");
      expect(result!.body).toContain("verlegt");
      expect(result!.body).toContain("2026-03-22");
      expect(result!.body).toContain("2026-03-20");
    });

    it("renders schedule change in English", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_TIME_CHANGED,
        payload,
        "Dragons vs Tigers",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Schedule change");
      expect(result!.body).toContain("rescheduled");
      expect(result!.body).toContain("2026-03-22");
    });

    it("renders without changes array gracefully", () => {
      const noChanges = { ...payload, changes: undefined };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_TIME_CHANGED,
        noChanges,
        "Dragons vs Tigers",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("verlegt");
      expect(result!.body).not.toContain("Neu:");
    });
  });

  describe("match.cancelled", () => {
    const payload = {
      matchNo: 7,
      homeTeam: "Dragons",
      guestTeam: "Lions",
      leagueName: "Kreisliga",
      reason: "Hallensperrung",
    };

    it("renders cancellation in German with reason", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_CANCELLED,
        payload,
        "Dragons vs Lions",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Spielabsage");
      expect(result!.body).toContain("abgesagt");
      expect(result!.body).toContain("Hallensperrung");
    });

    it("renders cancellation in German without reason", () => {
      const noReason = { ...payload, reason: null };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_CANCELLED,
        noReason,
        "Dragons vs Lions",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("abgesagt");
      expect(result!.body).not.toContain("(null");
    });

    it("renders cancellation in English", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_CANCELLED,
        payload,
        "Dragons vs Lions",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Game cancelled");
      expect(result!.body).toContain("cancelled");
    });
  });

  describe("match.venue_changed", () => {
    const payload = {
      matchNo: 10,
      homeTeam: "Dragons",
      guestTeam: "Bears",
      leagueName: "Bezirksliga",
      oldVenueId: 1,
      oldVenueName: "Alte Halle",
      newVenueId: 2,
      newVenueName: "Neue Halle",
    };

    it("renders venue change in German", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_VENUE_CHANGED,
        payload,
        "Dragons vs Bears",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Hallen\u{00E4}nderung");
      expect(result!.body).toContain("Neue Halle");
      expect(result!.body).toContain("Alte Halle");
    });

    it("renders venue change in English", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_VENUE_CHANGED,
        payload,
        "Dragons vs Bears",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Venue change");
      expect(result!.body).toContain("New venue: Neue Halle");
    });
  });

  describe("match.forfeited", () => {
    it("renders forfeited in German", () => {
      const payload = {
        matchNo: 5,
        homeTeam: "Dragons",
        guestTeam: "Eagles",
        leagueName: "Kreisliga",
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_FORFEITED,
        payload,
        "Dragons vs Eagles",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Spielwertung");
      expect(result!.body).toContain("gewertet");
    });
  });

  describe("match.scheduled", () => {
    it("renders new game in German with formatted date", () => {
      const payload = {
        matchNo: 99,
        homeTeam: "Dragons",
        guestTeam: "Wolves",
        leagueId: 1,
        leagueName: "Bezirksliga",
        kickoffDate: "2026-04-15",
        kickoffTime: "18:00",
        venueId: null,
        venueName: null,
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_SCHEDULED,
        payload,
        "Dragons vs Wolves",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Neues Spiel");
      expect(result!.body).toContain("15.04.");
      expect(result!.body).toContain("18:00");
    });

    it("renders new game in English with formatted date", () => {
      const payload = {
        matchNo: 99,
        homeTeam: "Dragons",
        guestTeam: "Wolves",
        leagueId: 1,
        leagueName: "Bezirksliga",
        kickoffDate: "2026-04-15",
        kickoffTime: "18:00",
        venueId: null,
        venueName: null,
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_SCHEDULED,
        payload,
        "Dragons vs Wolves",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("New game");
      expect(result!.body).toContain("04/15");
    });
  });

  describe("match.result_entered", () => {
    it("renders score in German", () => {
      const payload = {
        matchNo: 3,
        homeTeam: "Dragons",
        guestTeam: "Hawks",
        leagueName: "Bezirksliga",
        homeScore: 78,
        guestScore: 65,
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_RESULT_ENTERED,
        payload,
        "Dragons vs Hawks",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Ergebnis");
      expect(result!.body).toContain("78:65");
    });
  });

  describe("match.result_changed", () => {
    it("renders score correction in German", () => {
      const payload = {
        matchNo: 3,
        homeTeam: "Dragons",
        guestTeam: "Hawks",
        leagueName: "Bezirksliga",
        oldHomeScore: 78,
        oldGuestScore: 65,
        newHomeScore: 80,
        newGuestScore: 65,
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_RESULT_CHANGED,
        payload,
        "Dragons vs Hawks",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Ergebnis\u{00E4}nderung");
      expect(result!.body).toContain("80:65");
      expect(result!.body).toContain("78:65");
    });
  });

  describe("unknown event type", () => {
    it("returns null for non-match events", () => {
      const result = renderMatchMessage(
        "booking.created",
        {},
        "entity",
        "de",
      );
      expect(result).toBeNull();
    });
  });
});

describe("renderEventMessage (registry)", () => {
  it("routes match events to the match renderer", () => {
    const result = renderEventMessage(
      EVENT_TYPES.MATCH_CANCELLED,
      { matchNo: 1, homeTeam: "A", guestTeam: "B", leagueName: "L", reason: null },
      "A vs B",
      "de",
    );
    expect(result.title).toContain("Spielabsage");
  });

  it("routes referee events to the referee renderer", () => {
    const result = renderEventMessage(
      EVENT_TYPES.REFEREE_ASSIGNED,
      { matchNo: 1, homeTeam: "A", guestTeam: "B", refereeName: "Max", role: "1. SR" },
      "A vs B",
      "de",
    );
    expect(result.title).toContain("Schiedsrichter");
  });

  it("routes booking events to the booking renderer", () => {
    const result = renderEventMessage(
      EVENT_TYPES.BOOKING_CREATED,
      { venueName: "Halle", date: "2026-04-01", startTime: "18:00", endTime: "20:00", matchCount: 1 },
      "Halle",
      "de",
    );
    expect(result.title).toContain("Hallenbuchung");
  });

  it("routes override events to the override renderer", () => {
    const result = renderEventMessage(
      EVENT_TYPES.OVERRIDE_APPLIED,
      { matchNo: 1, homeTeam: "A", guestTeam: "B", field: "venue", originalValue: "X", overrideValue: "Y", appliedBy: "admin" },
      "A vs B",
      "de",
    );
    expect(result.title).toContain("Override");
  });

  it("returns fallback for unknown event types", () => {
    const result = renderEventMessage(
      "unknown.event" as string,
      {},
      "Something",
      "de",
    );
    expect(result.title).toBe("Ereignis: unknown.event");
    expect(result.body).toBe("Something");
  });

  it("returns English fallback for unknown event types", () => {
    const result = renderEventMessage(
      "unknown.event" as string,
      {},
      "Something",
      "en",
    );
    expect(result.title).toBe("Event: unknown.event");
  });
});
