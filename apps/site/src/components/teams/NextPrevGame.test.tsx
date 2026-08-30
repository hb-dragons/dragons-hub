// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const getMatches = vi.fn();
vi.mock("../../lib/api", () => ({
  API_BASE: "https://api.test",
  api: { public: { getMatches: (...a: unknown[]) => getMatches(...a) } },
}));

import NextPrevGame from "./NextPrevGame";
import type { PlanGame } from "../../lib/full-plan";
import { planGameFixture } from "../../lib/full-plan.fixture";
import { strings } from "../../lib/strings";

afterEach(cleanup);
beforeEach(() => {
  getMatches.mockReset();
});

describe("NextPrevGame", () => {
  // "Kein Spiel gefunden" for a backend outage told the reader the season was
  // over rather than that the site could not reach the API (#271).
  it("separates a failed fetch from a team with no game", async () => {
    getMatches.mockRejectedValue(new Error("timeout"));

    render(<NextPrevGame teamApiId={7} />);

    await waitFor(() => {
      expect(screen.getAllByText(strings.teams.gamesLoadError)).toHaveLength(2);
    });
    expect(screen.queryByText(strings.spielplan.noGame)).not.toBeInTheDocument();
  });

  it("shows the empty card when the API has no game for the team", async () => {
    getMatches.mockResolvedValue({ items: [] });

    render(<NextPrevGame teamApiId={7} />);

    await waitFor(() => {
      expect(screen.getAllByText(strings.spielplan.noGame)).toHaveLength(2);
    });
  });

  /**
   * Build-time first paint: teams/[slug].astro derives both slots from the
   * full plan during `astro build`, so the static HTML carries the games
   * instead of skeletons. The client refetch then revalidates.
   */
  describe("with build-time slots", () => {
    function planGame(overrides: Partial<PlanGame> = {}): PlanGame {
      return planGameFixture({
        homeTeamApiId: 7,
        kickoffDate: "2026-08-22",
        homeScore: 72,
        guestScore: 46,
        ...overrides,
      });
    }

    it("renders them immediately, without skeletons", () => {
      getMatches.mockReturnValue(new Promise(() => {}));
      const { container } = render(
        <NextPrevGame
          teamApiId={7}
          initialPrev={planGame()}
          initialNext={planGame({ id: 2, venueName: "IGS Linden", homeScore: null, guestScore: null })}
        />,
      );
      expect(screen.getByText("Goetheschule", { exact: false })).toBeInTheDocument();
      expect(screen.getByText("IGS Linden", { exact: false })).toBeInTheDocument();
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(0);
    });

    it("keeps showing them when the refetch fails, without an error", async () => {
      getMatches.mockRejectedValue(new Error("timeout"));
      render(<NextPrevGame teamApiId={7} initialPrev={planGame()} initialNext={null} />);
      await waitFor(() => expect(getMatches).toHaveBeenCalledTimes(2));
      expect(screen.getByText("Goetheschule", { exact: false })).toBeInTheDocument();
      // Build said "no next game" — a failed refetch keeps the empty card.
      expect(screen.getByText(strings.spielplan.noGame)).toBeInTheDocument();
      expect(screen.queryByText(strings.teams.gamesLoadError)).not.toBeInTheDocument();
    });

    it("swaps in the refetched slot when the live data differs", async () => {
      getMatches.mockResolvedValue({ items: [planGame({ id: 3, venueName: "IGS Linden" })] });
      render(<NextPrevGame teamApiId={7} initialPrev={planGame()} initialNext={planGame()} />);
      await waitFor(() =>
        expect(screen.getAllByText("IGS Linden", { exact: false }).length).toBeGreaterThan(0),
      );
      expect(screen.queryByText("Goetheschule", { exact: false })).toBeNull();
    });
  });
});
