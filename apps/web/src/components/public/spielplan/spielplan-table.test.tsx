// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MatchListItem } from "@dragons/shared";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    dateTime: (value: Date) => value.toISOString().slice(0, 10),
  }),
}));
import { SpielplanTable } from "./spielplan-table";

function makeMatch(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return {
    id: 1,
    apiMatchId: 100,
    matchNo: 971001,
    matchDay: 3,
    kickoffDate: "2026-09-06",
    kickoffTime: "15:30:00",
    homeTeamApiId: 10,
    homeTeamName: "TSV Musterstadt",
    homeTeamNameShort: null,
    homeTeamCustomName: null,
    homeClubId: 500,
    guestTeamApiId: 20,
    guestTeamName: "HB Dragons Hannover",
    guestTeamNameShort: null,
    guestTeamCustomName: "Herren 2",
    guestClubId: 4121,
    homeIsOwnClub: false,
    guestIsOwnClub: true,
    homeBadgeColor: null,
    guestBadgeColor: null,
    homeScore: null,
    guestScore: null,
    leagueId: 7,
    leagueName: "Bezirksliga Mitte",
    venueId: 9,
    venueName: "Sporthalle Musterstadt",
    venueStreet: null,
    venuePostalCode: null,
    venueCity: null,
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

afterEach(cleanup);

describe("<SpielplanTable>", () => {
  it("shows active and cancelled games by default but hides forfeited ones", () => {
    render(
      <SpielplanTable
        matches={[
          makeMatch({ id: 1, homeTeamName: "Aktiv Gegner" }),
          makeMatch({ id: 2, homeTeamName: "Abgesagt Gegner", isCancelled: true }),
          makeMatch({ id: 3, homeTeamName: "Kampflos Gegner", isForfeited: true }),
        ]}
      />,
    );

    expect(screen.getByText("Aktiv Gegner")).toBeInTheDocument();
    expect(screen.getByText("Abgesagt Gegner")).toBeInTheDocument();
    expect(screen.queryByText("Kampflos Gegner")).not.toBeInTheDocument();
  });

  it("shows only the compact column set by default — no Nr./Liga/Halle, duties, score or comment", () => {
    render(
      <SpielplanTable
        matches={[
          makeMatch({
            anschreiber: "Damen 1",
            zeitnehmer: "U18",
            shotclock: "Herren 1",
            homeScore: 78,
            guestScore: 65,
            publicComment: "Kuchenverkauf",
          }),
        ]}
      />,
    );

    expect(screen.getByText("TSV Musterstadt")).toBeInTheDocument();
    expect(screen.queryByText("Damen 1")).not.toBeInTheDocument();
    expect(screen.queryByText("U18")).not.toBeInTheDocument();
    expect(screen.queryByText("Herren 1")).not.toBeInTheDocument();
    expect(screen.queryByText("78:65")).not.toBeInTheDocument();
    expect(screen.queryByText("Kuchenverkauf")).not.toBeInTheDocument();
    expect(screen.queryByText("971001")).not.toBeInTheDocument();
    expect(screen.queryByText("Bezirksliga Mitte")).not.toBeInTheDocument();
    expect(screen.queryByText("Sporthalle Musterstadt")).not.toBeInTheDocument();
    // The comment marker still flags the game even with its column hidden.
    expect(screen.getByLabelText("hasComment")).toBeInTheDocument();
  });

  it("opens a read-only detail panel on row click with venue, score, Kampfgericht and comment", () => {
    render(
      <SpielplanTable
        matches={[
          makeMatch({
            anschreiber: "Damen 1",
            zeitnehmer: "U18",
            shotclock: "Herren 1",
            homeScore: 78,
            guestScore: 65,
            publicComment: "Kuchenverkauf",
            venueStreet: "Musterweg 1",
            venuePostalCode: "30159",
            venueCity: "Hannover",
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByText("TSV Musterstadt"));

    expect(screen.getByText("Damen 1")).toBeInTheDocument();
    expect(screen.getByText("U18")).toBeInTheDocument();
    expect(screen.getByText("Herren 1")).toBeInTheDocument();
    expect(screen.getByText("78:65")).toBeInTheDocument();
    expect(screen.getByText("Kuchenverkauf")).toBeInTheDocument();
    expect(screen.getByText("Sporthalle Musterstadt")).toBeInTheDocument();
    expect(screen.getByText(/Musterweg 1/)).toBeInTheDocument();
    expect(screen.getByText(/30159 Hannover/)).toBeInTheDocument();
    expect(screen.getByText("Bezirksliga Mitte")).toBeInTheDocument();
  });

  it("filters rows through the search box", () => {
    render(
      <SpielplanTable
        matches={[
          makeMatch({ id: 1, homeTeamName: "TSV Suchbar" }),
          makeMatch({ id: 2, homeTeamName: "SV Anders" }),
        ]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("searchPlaceholder"), {
      target: { value: "suchbar" },
    });

    expect(screen.getByText("TSV Suchbar")).toBeInTheDocument();
    expect(screen.queryByText("SV Anders")).not.toBeInTheDocument();
  });

  it("shows the filtered game count", () => {
    render(
      <SpielplanTable
        matches={[makeMatch({ id: 1 }), makeMatch({ id: 2, isForfeited: true })]}
      />,
    );

    expect(screen.getByText(/1 gamesCount/)).toBeInTheDocument();
  });

  it("offers no export button", () => {
    render(<SpielplanTable matches={[makeMatch()]} />);
    expect(screen.queryByRole("button", { name: /export/ })).not.toBeInTheDocument();
  });

  it("keeps the reset button inside the collapsible filter area", () => {
    render(<SpielplanTable matches={[makeMatch()]} />);

    // The default status filter counts as an active filter, so reset is shown.
    const reset = screen.getByRole("button", { name: /reset/ });
    expect(document.querySelector('[data-slot="extra-filters"]')).toContainElement(reset);
  });

  it("marks games that carry a public comment, even with the comment column hidden", () => {
    render(
      <SpielplanTable
        matches={[
          makeMatch({ id: 1, publicComment: "Kuchenverkauf" }),
          makeMatch({ id: 2, homeTeamName: "SV Ohne" }),
        ]}
      />,
    );

    expect(screen.getAllByLabelText("hasComment")).toHaveLength(1);
  });

  it("tucks the secondary filters behind the filter toggle on mobile", () => {
    render(<SpielplanTable matches={[makeMatch()]} />);

    const extra = document.querySelector('[data-slot="extra-filters"]');
    expect(extra?.className).toContain("hidden");

    fireEvent.click(screen.getByRole("button", { name: "moreFilters" }));
    expect(
      document.querySelector('[data-slot="extra-filters"]')?.className,
    ).not.toContain("hidden");
  });

  it("keeps search and the team filter always visible outside the toggle area", () => {
    render(<SpielplanTable matches={[makeMatch()]} />);

    const extra = document.querySelector('[data-slot="extra-filters"]');
    const search = screen.getByPlaceholderText("searchPlaceholder");
    // Matches both the faceted-filter trigger and the column-header sort
    // button — neither may live in the collapsible area.
    const teamButtons = screen.getAllByRole("button", { name: /columns\.team/ });

    expect(extra).not.toContainElement(search);
    for (const button of teamButtons) {
      expect(extra).not.toContainElement(button);
    }
  });

  it("scrolls inside its own container with a sticky header, for phone use", () => {
    render(<SpielplanTable matches={[makeMatch()]} />);

    expect(document.querySelector('[data-slot="table-header"]')).toHaveClass("sticky");
    const container = document.querySelector('[data-slot="table-container"]');
    expect(container?.className).toContain("overflow-auto");
  });

  it("tints Dragons home game rows", () => {
    render(
      <SpielplanTable
        matches={[
          makeMatch({
            homeIsOwnClub: true,
            guestIsOwnClub: false,
            homeTeamName: "HB Dragons Hannover",
            homeTeamCustomName: "Herren 2",
            guestTeamName: "TSV Musterstadt",
            guestTeamCustomName: null,
          }),
        ]}
      />,
    );

    const row = screen.getByText("TSV Musterstadt").closest("tr");
    expect(row?.className).toContain("bg-primary/5");
  });
});
