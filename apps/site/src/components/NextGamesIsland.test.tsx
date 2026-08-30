// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const getHomeDashboard = vi.fn();
vi.mock("@dragons/api-client", () => ({
  ApiClient: class {},
  createApi: () => ({ public: { getHomeDashboard: (...a: unknown[]) => getHomeDashboard(...a) } }),
}));

import NextGamesIsland from "./NextGamesIsland";
import { strings } from "../lib/strings";

/**
 * Issue #257. The island used to answer a failed fetch with three hardcoded
 * games, so an API outage did not degrade the landing page — it replaced the
 * fixture list with invented dates, times and venues that looked exactly like
 * real ones. These tests pin the three outcomes apart: real games, an honest
 * "nothing scheduled", and an honest "could not load".
 */

/** A real fixture far enough out to survive the week window in `nextGames`. */
function game(overrides: Record<string, unknown> = {}) {
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  return {
    id: 1,
    kickoffDate: soon,
    kickoffTime: "18:00:00",
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
    venueName: "Goetheschule",
    venueStreet: null,
    venuePostalCode: null,
    venueCity: null,
    venueNameOverride: null,
    homeScore: null,
    guestScore: null,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("NextGamesIsland", () => {
  it("renders the games the API returned", async () => {
    getHomeDashboard.mockResolvedValue({ upcomingGames: [game()] });
    render(<NextGamesIsland />);
    expect(await screen.findByText("Goetheschule", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Herren 1")).toBeInTheDocument();
  });

  it("renders the shared GameCard: colored dragons badge, opponent as text", async () => {
    getHomeDashboard.mockResolvedValue({ upcomingGames: [game()] });
    render(<NextGamesIsland />);
    const badge = await screen.findByText("Herren 1");
    expect(badge.className).toContain("bg-rose-100");
    expect(screen.getByText("CVJM Hannover 2").closest("a")).toBeNull();
  });

  it("says nothing is scheduled when the API returns no games", async () => {
    getHomeDashboard.mockResolvedValue({ upcomingGames: [] });
    render(<NextGamesIsland />);
    expect(await screen.findByText(strings.nextGames.empty)).toBeInTheDocument();
  });

  it("says it could not load when the fetch fails, and shows no games", async () => {
    getHomeDashboard.mockRejectedValue(new Error("network"));
    render(<NextGamesIsland />);
    expect(await screen.findByText(strings.nextGames.loadError)).toBeInTheDocument();
    // An outage must not read as "no games this week".
    expect(screen.queryByText(strings.nextGames.empty)).toBeNull();
  });

  // The regression this issue exists for: three specific invented games.
  it("never invents a game when the fetch fails", async () => {
    getHomeDashboard.mockRejectedValue(new Error("network"));
    render(<NextGamesIsland />);
    await screen.findByText(strings.nextGames.loadError);
    for (const invented of ["TK Hannover", "VfL Eintracht Hannover", "SG Weende", "IGS Roderbruch"]) {
      expect(screen.queryByText(invented, { exact: false })).toBeNull();
    }
  });

  it("shows the loading skeleton before the fetch settles", async () => {
    let resolve: (v: unknown) => void = () => {};
    getHomeDashboard.mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = render(<NextGamesIsland />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    resolve({ upcomingGames: [] });
    await waitFor(() => expect(screen.getByText(strings.nextGames.empty)).toBeInTheDocument());
  });

  /**
   * Build-time first paint: index.astro fetches the same dashboard during
   * `astro build` and passes the windowed list in as `initialGames`, so the
   * static HTML carries real games instead of a skeleton. The client refetch
   * then revalidates against the live API.
   */
  describe("with build-time initialGames", () => {
    it("renders them immediately, without a skeleton", () => {
      getHomeDashboard.mockReturnValue(new Promise(() => {}));
      const { container } = render(<NextGamesIsland initialGames={[game()]} />);
      expect(screen.getByText("Goetheschule", { exact: false })).toBeInTheDocument();
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(0);
    });

    it("swaps in the refetched list when the live data differs", async () => {
      getHomeDashboard.mockResolvedValue({
        upcomingGames: [game({ id: 2, venueName: "IGS Linden", homeTeamCustomName: "Herren 2" })],
      });
      render(<NextGamesIsland initialGames={[game()]} />);
      // Build-time list paints synchronously, live list replaces it.
      expect(screen.getByText("Goetheschule", { exact: false })).toBeInTheDocument();
      expect(await screen.findByText("IGS Linden", { exact: false })).toBeInTheDocument();
      expect(screen.queryByText("Goetheschule", { exact: false })).toBeNull();
    });

    it("keeps showing them when the refetch fails, without an error", async () => {
      getHomeDashboard.mockRejectedValue(new Error("network"));
      render(<NextGamesIsland initialGames={[game()]} />);
      // Let the rejection settle before asserting nothing changed.
      await waitFor(() => expect(getHomeDashboard).toHaveBeenCalled());
      expect(screen.getByText("Goetheschule", { exact: false })).toBeInTheDocument();
      expect(screen.queryByText(strings.nextGames.loadError)).toBeNull();
    });
  });
});
