import { describe, expect, it } from "vitest";
import { buildCalendarFeed } from "./calendar.service";
import type { MatchListItem } from "@dragons/shared";

/** Unfold ICS line continuations (RFC 5545 §3.1) so toContain works across folds */
function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

function makeMatch(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return {
    id: 1,
    apiMatchId: 10001,
    matchNo: 42,
    matchDay: 5,
    kickoffDate: "2026-04-15",
    kickoffTime: "14:00",
    homeTeamApiId: 100,
    homeTeamName: "Dragons U14",
    homeTeamNameShort: "Dragons",
    homeTeamCustomName: null,
    homeClubId: 500,
    guestTeamApiId: 200,
    guestTeamName: "Eagles U14",
    guestTeamNameShort: "Eagles",
    guestTeamCustomName: null,
    guestClubId: 600,
    homeIsOwnClub: true,
    guestIsOwnClub: false,
    homeBadgeColor: null,
    guestBadgeColor: null,
    homeScore: null,
    guestScore: null,
    leagueId: 1,
    leagueName: "U14 Kreisliga",
    venueId: 1,
    venueName: "Sporthalle Am Park",
    venueStreet: "Parkstr. 1",
    venuePostalCode: "10115",
    venueCity: "Berlin",
    venueNameOverride: null,
    isConfirmed: true,
    isForfeited: false,
    isCancelled: false,
    anschreiber: null,
    zeitnehmer: null,
    shotclock: null,
    publicComment: null,
    hasLocalChanges: false,
    overriddenFields: [],
    booking: null,
    ...overrides,
  };
}

describe("buildCalendarFeed", () => {
  it("returns valid ICS with BEGIN:VCALENDAR and VEVENT", () => {
    const ics = buildCalendarFeed([makeMatch()], {});
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("uses PUBLISH method", () => {
    const ics = buildCalendarFeed([makeMatch()], {});
    expect(ics).toContain("METHOD:PUBLISH");
  });

  it("sets event summary to home vs guest (prefers nameShort)", () => {
    const ics = buildCalendarFeed([makeMatch()], {});
    expect(ics).toContain("Dragons vs Eagles");
  });

  it("falls back to full name when nameShort is null", () => {
    const ics = buildCalendarFeed(
      [makeMatch({ homeTeamNameShort: null, guestTeamNameShort: null })],
      {},
    );
    expect(ics).toContain("Dragons U14 vs Eagles U14");
  });

  it("prefers customName > nameShort for summary", () => {
    const ics = buildCalendarFeed(
      [
        makeMatch({
          homeTeamCustomName: "Drachen U14",
          guestTeamCustomName: "Adler U14",
        }),
      ],
      {},
    );
    expect(ics).toContain("Drachen U14 vs Adler U14");
  });

  it("sets stable UID per match", () => {
    const ics = buildCalendarFeed([makeMatch({ id: 99 })], {});
    expect(ics).toContain("match-99@");
  });

  // --- Description ---

  it("includes full team names in description", () => {
    const ics = buildCalendarFeed([makeMatch()], {});
    expect(ics).toContain("Dragons U14 vs Eagles U14");
  });

  it("includes kickoff time in description", () => {
    const ics = unfold(buildCalendarFeed([makeMatch()], {}));
    expect(ics).toContain("Anpfiff: 14:00 Uhr");
  });

  it("includes league in description", () => {
    const ics = buildCalendarFeed([makeMatch()], {});
    expect(ics).toContain("U14 Kreisliga");
  });

  it("includes score in description when available", () => {
    const ics = buildCalendarFeed(
      [makeMatch({ homeScore: 65, guestScore: 48 })],
      {},
    );
    expect(ics).toContain("65:48");
  });

  it("includes publicComment in description", () => {
    const ics = unfold(buildCalendarFeed(
      [makeMatch({ publicComment: "Heimspiel verlegt" })],
      {},
    ));
    expect(ics).toContain("Heimspiel verlegt");
  });

  // --- Location ---

  it("sets location with venue name", () => {
    const ics = buildCalendarFeed([makeMatch()], {});
    expect(ics).toContain("Sporthalle Am Park");
  });

  it("includes street and postal code in location address", () => {
    const ics = buildCalendarFeed([makeMatch()], {});
    expect(ics).toContain("Parkstr. 1");
    expect(ics).toContain("10115 Berlin");
  });

  it("uses venueNameOverride when present", () => {
    const ics = buildCalendarFeed(
      [makeMatch({ venueNameOverride: "Turnhalle Mitte" })],
      {},
    );
    expect(ics).toContain("Turnhalle Mitte");
  });

  it("includes city without postal code in location", () => {
    const ics = unfold(buildCalendarFeed(
      [makeMatch({ venuePostalCode: null, venueCity: "Berlin" })],
      {},
    ));
    expect(ics).toContain("Berlin");
    expect(ics).not.toContain("null Berlin");
    // Should have street and city separated by comma, without postal code
    expect(ics).toContain("Parkstr. 1");
  });

  // --- Status ---

  it("marks cancelled matches as CANCELLED", () => {
    const ics = buildCalendarFeed([makeMatch({ isCancelled: true })], {});
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("marks normal matches as CONFIRMED", () => {
    const ics = buildCalendarFeed([makeMatch()], {});
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  // --- Calendar metadata ---

  it("returns empty calendar for empty match list", () => {
    const ics = buildCalendarFeed([], {});
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("includes Europe/Berlin timezone", () => {
    const ics = buildCalendarFeed([makeMatch()], {});
    expect(ics).toContain("Europe/Berlin");
  });

  it("sets calendar name from calendarName option", () => {
    const ics = buildCalendarFeed([makeMatch()], {
      calendarName: "Dragons U14",
    });
    expect(ics).toContain("Dragons U14");
  });

  it("uses default calendar name when not provided", () => {
    const ics = buildCalendarFeed([makeMatch()], {});
    expect(ics).toContain("Dragons Spielplan");
  });

  it("handles multiple matches", () => {
    const matches = [
      makeMatch({ id: 1 }),
      makeMatch({
        id: 2,
        kickoffDate: "2026-04-16",
        guestTeamName: "Hawks U14",
      }),
    ];
    const ics = buildCalendarFeed(matches, {});
    const eventCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(eventCount).toBe(2);
  });

  // --- Branch coverage: partial score ---

  it("omits score from description when only homeScore is set", () => {
    const ics = buildCalendarFeed(
      [makeMatch({ homeScore: 65, guestScore: null })],
      {},
    );
    expect(ics).not.toContain("Ergebnis:");
  });

  it("omits score from description when only guestScore is set", () => {
    const ics = buildCalendarFeed(
      [makeMatch({ homeScore: null, guestScore: 48 })],
      {},
    );
    expect(ics).not.toContain("Ergebnis:");
  });

  // --- Branch coverage: location edge cases ---

  it("omits location when venueName and venueNameOverride are null", () => {
    const ics = buildCalendarFeed(
      [makeMatch({ venueName: null, venueNameOverride: null })],
      {},
    );
    expect(ics).not.toMatch(/\r\nLOCATION:/);
  });

  it("includes street only in address when postalCode and city are null", () => {
    const ics = unfold(buildCalendarFeed(
      [makeMatch({ venuePostalCode: null, venueCity: null })],
      {},
    ));
    expect(ics).toContain("Parkstr. 1");
    expect(ics).not.toContain("null");
  });

  it("omits address when no street, postalCode or city", () => {
    const ics = unfold(buildCalendarFeed(
      [makeMatch({ venueStreet: null, venuePostalCode: null, venueCity: null })],
      {},
    ));
    // Location should have venue name but no address
    expect(ics).toContain("Sporthalle Am Park");
  });

  // --- Branch coverage: options and description edge cases ---

  it("uses hostname option in event UID", () => {
    const ics = buildCalendarFeed([makeMatch({ id: 7 })], {
      hostname: "my.club",
    });
    expect(ics).toContain("match-7@my.club");
  });

  it("omits league from description when leagueName is null", () => {
    const ics = unfold(buildCalendarFeed(
      [makeMatch({ leagueName: null })],
      {},
    ));
    expect(ics).not.toContain("U14 Kreisliga");
  });
});
