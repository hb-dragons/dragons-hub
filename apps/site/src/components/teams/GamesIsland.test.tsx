// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const getMatches = vi.fn();
vi.mock("../../lib/api", () => ({
  API_BASE: "https://api.test",
  api: { public: { getMatches: (...a: unknown[]) => getMatches(...a) } },
}));

import GamesIsland from "./GamesIsland";
import type { PlanGame } from "../../lib/full-plan";
import { planGameFixture } from "../../lib/full-plan.fixture";
import { strings } from "../../lib/strings";

function game(overrides: Partial<PlanGame> = {}): PlanGame {
  return planGameFixture({ homeTeamApiId: 7, ...overrides });
}

afterEach(cleanup);
beforeEach(() => {
  getMatches.mockReset();
});

describe("GamesIsland", () => {
  it("renders the team's games once they arrive", async () => {
    getMatches.mockResolvedValue({ items: [game()], hasMore: false });
    render(<GamesIsland teamApiId={7} />);
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.getByText("Goetheschule")).toBeInTheDocument();
  });

  it("shows both crests: the Dragons logo and the opponent's club logo", async () => {
    getMatches.mockResolvedValue({ items: [game()], hasMore: false });
    render(<GamesIsland teamApiId={7} />);
    expect(await screen.findByText("Dragons")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Dragons" })).toHaveAttribute("src", "/img/logo.svg");
    expect(screen.getByRole("img", { name: "CVJM Hannover 2" })).toBeInTheDocument();
  });

  it("shows an error instead of an empty table when the fetch fails", async () => {
    getMatches.mockRejectedValue(new Error("timeout"));
    render(<GamesIsland teamApiId={7} />);
    await waitFor(() => {
      expect(screen.getByText(strings.spielplan.loadError)).toBeInTheDocument();
    });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  /**
   * Build-time first paint: teams/[slug].astro filters the full plan to the
   * team during `astro build`, so the static HTML carries the games table.
   */
  describe("with build-time initialGames", () => {
    it("renders the table immediately, without a skeleton", () => {
      getMatches.mockReturnValue(new Promise(() => {}));
      const { container } = render(<GamesIsland teamApiId={7} initialGames={[game()]} />);
      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getByText("Goetheschule")).toBeInTheDocument();
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(0);
    });

    it("keeps showing it when the refetch fails, without an error", async () => {
      getMatches.mockRejectedValue(new Error("timeout"));
      render(<GamesIsland teamApiId={7} initialGames={[game()]} />);
      await waitFor(() => expect(getMatches).toHaveBeenCalled());
      expect(screen.getByText("Goetheschule")).toBeInTheDocument();
      expect(screen.queryByText(strings.spielplan.loadError)).not.toBeInTheDocument();
    });

    it("swaps in the refetched games when the live data differs", async () => {
      getMatches.mockResolvedValue({
        items: [game({ id: 2, venueName: "IGS Linden" })],
        hasMore: false,
      });
      render(<GamesIsland teamApiId={7} initialGames={[game()]} />);
      expect(await screen.findByText("IGS Linden")).toBeInTheDocument();
      expect(screen.queryByText("Goetheschule")).toBeNull();
    });
  });
});
