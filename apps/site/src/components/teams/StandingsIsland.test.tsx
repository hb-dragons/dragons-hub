// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const getStandings = vi.fn();
vi.mock("../../lib/api", () => ({
  API_BASE: "https://api.test",
  api: { public: { getStandings: (...a: unknown[]) => getStandings(...a) } },
}));

import StandingsIsland from "./StandingsIsland";
import { strings } from "../../lib/strings";

afterEach(cleanup);
beforeEach(() => {
  getStandings.mockReset();
});

describe("StandingsIsland", () => {
  // A timed-out or failed fetch used to render the full column header above
  // zero rows, which reads as "this league has no teams" (#271).
  it("shows an error instead of an empty table when the fetch fails", async () => {
    getStandings.mockRejectedValue(new Error("timeout"));

    render(<StandingsIsland teamApiId={7} />);

    await waitFor(() => {
      expect(screen.getByText(strings.teams.standingsError)).toBeInTheDocument();
    });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders the table once the standings arrive", async () => {
    getStandings.mockResolvedValue([
      {
        standings: [
          {
            teamApiId: 7,
            teamName: "HB Dragons 1",
            position: 1,
            played: 4,
            won: 3,
            lost: 1,
            leaguePoints: 6,
            pointsFor: 300,
            pointsAgainst: 250,
          },
        ],
      },
    ]);

    render(<StandingsIsland teamApiId={7} />);

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.getByText("HB Dragons 1")).toBeInTheDocument();
  });

  /**
   * Build-time first paint: teams/[slug].astro adapts the team's league rows
   * from the build's standings fetch, so the static HTML carries the table.
   */
  describe("with build-time initialRows", () => {
    const row = {
      rank: 1,
      name: "HB Dragons 1",
      games: 4,
      wins: 3,
      losses: 1,
      points: 6,
      pointsFor: 300,
      pointsAgainst: 250,
      resigned: false,
    };

    it("renders the table immediately, without a skeleton", () => {
      getStandings.mockReturnValue(new Promise(() => {}));
      const { container } = render(<StandingsIsland teamApiId={7} initialRows={[row]} />);
      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getByText("HB Dragons 1")).toBeInTheDocument();
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(0);
    });

    it("keeps showing it when the refetch fails, without an error", async () => {
      getStandings.mockRejectedValue(new Error("timeout"));
      render(<StandingsIsland teamApiId={7} initialRows={[row]} />);
      await waitFor(() => expect(getStandings).toHaveBeenCalled());
      expect(screen.getByText("HB Dragons 1")).toBeInTheDocument();
      expect(screen.queryByText(strings.teams.standingsError)).not.toBeInTheDocument();
    });

    it("swaps in the refetched rows when the live data differs", async () => {
      getStandings.mockResolvedValue([
        {
          standings: [
            {
              teamApiId: 7,
              teamName: "HB Dragons 2",
              position: 2,
              played: 5,
              won: 3,
              lost: 2,
              leaguePoints: 6,
              pointsFor: 310,
              pointsAgainst: 280,
            },
          ],
        },
      ]);
      render(<StandingsIsland teamApiId={7} initialRows={[row]} />);
      expect(await screen.findByText("HB Dragons 2")).toBeInTheDocument();
      expect(screen.queryByText("HB Dragons 1")).toBeNull();
    });
  });
});
