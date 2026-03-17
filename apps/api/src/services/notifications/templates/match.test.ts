import { describe, expect, it } from "vitest";
import { renderMatchMessage } from "./match";
import { renderEventMessage } from "./index";
import { EVENT_TYPES } from "@dragons/shared";

describe("renderMatchMessage", () => {
  describe("match.schedule.changed", () => {
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
        EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
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
        EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
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
        EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
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

  describe("match.venue.changed", () => {
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

  describe("match.created", () => {
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
        EVENT_TYPES.MATCH_CREATED,
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
        EVENT_TYPES.MATCH_CREATED,
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

  describe("match.score.changed", () => {
    it("renders new score in German", () => {
      const payload = {
        matchNo: 3,
        homeTeam: "Dragons",
        guestTeam: "Hawks",
        leagueName: "Bezirksliga",
        homeScore: 78,
        guestScore: 65,
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_SCORE_CHANGED,
        payload,
        "Dragons vs Hawks",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Ergebnis");
      expect(result!.body).toContain("78:65");
    });

    it("renders new score in English without old scores", () => {
      const payload = {
        matchNo: 3,
        homeTeam: "Dragons",
        guestTeam: "Hawks",
        leagueName: "Bezirksliga",
        homeScore: 78,
        guestScore: 65,
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_SCORE_CHANGED,
        payload,
        "Dragons vs Hawks",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Score update");
      expect(result!.body).toContain("78:65");
    });

    it("renders score correction with old scores in German", () => {
      const payload = {
        matchNo: 3,
        homeTeam: "Dragons",
        guestTeam: "Hawks",
        leagueName: "Bezirksliga",
        homeScore: 80,
        guestScore: 65,
        oldHomeScore: 78,
        oldGuestScore: 65,
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_SCORE_CHANGED,
        payload,
        "Dragons vs Hawks",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Ergebnis\u{00E4}nderung");
      expect(result!.body).toContain("80:65");
      expect(result!.body).toContain("78:65");
    });

    it("renders score correction with old scores in English", () => {
      const payload = {
        matchNo: 3,
        homeTeam: "Dragons",
        guestTeam: "Hawks",
        leagueName: "Bezirksliga",
        homeScore: 80,
        guestScore: 65,
        oldHomeScore: 78,
        oldGuestScore: 65,
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_SCORE_CHANGED,
        payload,
        "Dragons vs Hawks",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Score correction");
      expect(result!.body).toContain("80:65");
      expect(result!.body).toContain("was: 78:65");
    });
  });

  describe("match.schedule.changed (non-date changes)", () => {
    it("renders without detail when changes has no date/time fields", () => {
      const payload = {
        homeTeam: "Dragons",
        guestTeam: "Tigers",
        leagueName: "Bezirksliga",
        changes: [
          { field: "venueId", oldValue: 1, newValue: 2 },
        ],
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
        payload,
        "Dragons vs Tigers",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).not.toContain("Neu:");
    });

    it("renders with empty changes array", () => {
      const payload = {
        homeTeam: "Dragons",
        guestTeam: "Tigers",
        leagueName: "Bezirksliga",
        changes: [],
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
        payload,
        "Dragons vs Tigers",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).not.toContain("Neu:");
    });
  });

  describe("match.created edge cases", () => {
    it("renders without kickoff date", () => {
      const payload = {
        homeTeam: "Dragons",
        guestTeam: "Bears",
        leagueName: "Bezirksliga",
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_CREATED,
        payload,
        "Dragons vs Bears",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Neues Spiel");
    });

    it("renders without kickoff time", () => {
      const payload = {
        homeTeam: "Dragons",
        guestTeam: "Bears",
        leagueName: "Bezirksliga",
        kickoffDate: "2026-05-01",
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_CREATED,
        payload,
        "Dragons vs Bears",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("01.05.");
      expect(result!.body).not.toContain("undefined");
    });
  });

  describe("match.forfeited in English", () => {
    it("renders forfeited in English", () => {
      const payload = {
        homeTeam: "Dragons",
        guestTeam: "Eagles",
        leagueName: "Kreisliga",
      };
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_FORFEITED,
        payload,
        "Dragons vs Eagles",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Game forfeited");
      expect(result!.body).toContain("forfeited");
    });
  });

  describe("match.result_entered in English", () => {
    it("renders score in English", () => {
      const payload = {
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
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Score update");
      expect(result!.body).toContain("78:65");
    });
  });

  describe("match.result_changed in English", () => {
    it("renders score correction in English", () => {
      const payload = {
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
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Score correction");
      expect(result!.body).toContain("80:65");
      expect(result!.body).toContain("was: 78:65");
    });
  });

  describe("match.removed", () => {
    it("renders removed in German", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_REMOVED,
        {},
        "Match #42",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Spiel entfernt");
      expect(result!.body).toContain("Spielplan entfernt");
    });

    it("renders removed in English", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_REMOVED,
        {},
        "Match #42",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Match removed");
    });
  });

  describe("missing field fallbacks", () => {
    it("renders match.result_changed with missing score fields (de)", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_RESULT_CHANGED,
        { matchNo: 1 },
        "Game",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("?:?");
      expect(result!.body).not.toContain("undefined");
    });

    it("renders match.result_changed with missing score fields (en)", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_RESULT_CHANGED,
        { matchNo: 1 },
        "Game",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Score correction");
      expect(result!.body).toContain("?:?");
      expect(result!.body).toContain("was: ?:?");
    });

    it("renders match.result_entered with missing team and score fields", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_RESULT_ENTERED,
        {},
        "Game",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("?:?");
      expect(result!.body).toContain(" vs ");
      expect(result!.body).not.toContain("undefined");
    });

    it("renders match.cancelled with missing team and league fields", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_CANCELLED,
        {},
        "Game",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain(" vs ");
      expect(result!.body).not.toContain("undefined");
    });

    it("renders match.cancelled with missing fields (en)", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_CANCELLED,
        {},
        "Game",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("cancelled");
      expect(result!.body).not.toContain("undefined");
    });

    it("renders match.venue_changed with missing venue names", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_VENUE_CHANGED,
        {},
        "Game",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("?");
      expect(result!.body).not.toContain("undefined");
    });

    it("renders match.venue_changed with missing fields (en)", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_VENUE_CHANGED,
        {},
        "Game",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("New venue: ?");
      expect(result!.body).not.toContain("undefined");
    });

    it("renders match.forfeited with missing team fields", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_FORFEITED,
        {},
        "Game",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain(" vs ");
      expect(result!.body).not.toContain("undefined");
    });

    it("renders match.score_changed with missing all fields (de)", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_SCORE_CHANGED,
        {},
        "Game",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("?:?");
      expect(result!.body).not.toContain("undefined");
    });

    it("renders match.created with missing all fields (en)", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_CREATED,
        {},
        "Game",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("New game");
      expect(result!.body).not.toContain("undefined");
    });

    it("renders match.schedule_changed with missing team/league fields", () => {
      const result = renderMatchMessage(
        EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
        {},
        "Game",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain(" vs ");
      expect(result!.body).not.toContain("undefined");
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
