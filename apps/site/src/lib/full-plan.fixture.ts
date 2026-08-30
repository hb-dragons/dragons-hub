import type { PlanGame } from "./full-plan";

/**
 * One fully-populated {@link PlanGame} for tests — the island and selector
 * suites all render the same shape, so the factory lives once here instead
 * of drifting apart as per-file copies. (full-plan.test.ts deliberately keeps
 * its own untyped wire-shape factory: it exercises the zod parser against
 * raw response bodies, extra fields included.)
 */
export function planGameFixture(overrides: Partial<PlanGame> = {}): PlanGame {
  return {
    id: 1,
    matchNo: 101,
    kickoffDate: "2026-09-05",
    kickoffTime: "18:00:00",
    homeTeamApiId: 322001,
    guestTeamApiId: 411002,
    homeTeamName: "Hanover Basketball Dragons",
    guestTeamName: "CVJM Hannover 2",
    homeTeamCustomName: "Herren 1",
    guestTeamCustomName: null,
    homeIsOwnClub: true,
    guestIsOwnClub: false,
    homeClubId: 4121,
    guestClubId: 4213,
    homeBadgeColor: "rose",
    guestBadgeColor: null,
    leagueName: null,
    venueName: "Goetheschule",
    venueStreet: null,
    venuePostalCode: null,
    venueCity: null,
    venueNameOverride: null,
    homeScore: null,
    guestScore: null,
    publicComment: null,
    ...overrides,
  };
}
