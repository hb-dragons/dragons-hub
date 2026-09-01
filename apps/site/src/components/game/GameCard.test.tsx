// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { GameCard, type GameCardMatch } from "./GameCard";

function match(overrides: Partial<GameCardMatch> = {}): GameCardMatch {
  return {
    id: 1,
    kickoffDate: "2026-09-12",
    kickoffTime: "14:00:00",
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
    homeScore: null,
    guestScore: null,
    venueName: "Goetheschule",
    venueStreet: null,
    venuePostalCode: null,
    venueCity: null,
    venueNameOverride: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe("GameCard team sides", () => {
  it("renders the dragons team as a badge in its configured color", () => {
    render(<GameCard game={match()} />);
    const badge = screen.getByText("Herren 1");
    expect(badge.className).toContain("bg-rose-100");
    expect(badge.closest("a")).toHaveAttribute("href", "/teams/herren-1/");
  });

  it("renders the opponent as plain text, not a badge", () => {
    render(<GameCard game={match()} />);
    const opponent = screen.getByText("CVJM Hannover 2");
    expect(opponent.className).not.toContain("rounded-md");
    expect(opponent.className).not.toContain("border");
    expect(opponent.closest("a")).toBeNull();
  });

  it("keeps the badge sides straight when the dragons play away", () => {
    render(
      <GameCard
        game={match({
          homeTeamName: "CVJM Hannover 2",
          guestTeamName: "Hanover Basketball Dragons",
          homeTeamCustomName: null,
          guestTeamCustomName: "Damen 1",
          homeIsOwnClub: false,
          guestIsOwnClub: true,
          homeBadgeColor: null,
          guestBadgeColor: "teal",
        })}
      />,
    );
    const badge = screen.getByText("Damen 1");
    expect(badge.className).toContain("bg-teal-100");
    expect(screen.getByText("CVJM Hannover 2").closest("a")).toBeNull();
  });
});

describe("GameCard venue strip", () => {
  // The badge clearance above the strip (#261/#272) assumes one text line;
  // a wrapping venue name climbs into the team badges.
  const longVenue = "Sporthalle Birkenstraße / Otfried-Preußler-Schule";

  it("truncates a long venue name instead of wrapping (maps link)", () => {
    render(
      <GameCard
        game={match({ venueName: longVenue, venueCity: "Hannover" })}
      />,
    );
    const label = screen.getByText(longVenue);
    expect(label.tagName).toBe("A");
    expect(label.className).toContain("truncate");
  });

  it("truncates the plain-text venue when no address exists for a maps link", () => {
    render(<GameCard game={match({ venueName: longVenue })} />);
    const label = screen.getByText(longVenue);
    expect(label.tagName).toBe("SPAN");
    expect(label.className).toContain("truncate");
  });
});
