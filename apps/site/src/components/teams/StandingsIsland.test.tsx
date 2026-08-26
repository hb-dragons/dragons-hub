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
});
