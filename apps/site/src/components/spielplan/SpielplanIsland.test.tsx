// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const getMatches = vi.fn();
vi.mock("../../lib/api", () => ({
  API_BASE: "https://api.example",
  api: { public: { getMatches: (...a: unknown[]) => getMatches(...a) } },
}));

import SpielplanIsland from "./SpielplanIsland";
import type { PlanGame } from "../../lib/full-plan";
import { planGameFixture as game } from "../../lib/full-plan.fixture";
import { strings } from "../../lib/strings";

function page(items: PlanGame[]) {
  return { items, hasMore: false };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SpielplanIsland", () => {
  it("renders the fetched plan", async () => {
    getMatches.mockResolvedValue(page([game()]));
    render(<SpielplanIsland />);
    expect(await screen.findByText("Goetheschule", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(`1 ${strings.spielplan.gamesCount}`)).toBeInTheDocument();
  });

  it("shows the loading skeleton before the fetch settles", () => {
    getMatches.mockReturnValue(new Promise(() => {}));
    const { container } = render(<SpielplanIsland />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("says it could not load when the fetch fails", async () => {
    getMatches.mockRejectedValue(new Error("network"));
    render(<SpielplanIsland />);
    expect(await screen.findByText(strings.spielplan.loadError)).toBeInTheDocument();
  });

  /**
   * Build-time first paint: spielplan/index.astro fetches the same plan
   * during `astro build` and passes it as `initialGames`, so the static HTML
   * carries real games instead of a skeleton. The client refetch then
   * revalidates against the live API.
   */
  describe("with build-time initialGames", () => {
    it("renders them immediately, without a skeleton", () => {
      getMatches.mockReturnValue(new Promise(() => {}));
      const { container } = render(<SpielplanIsland initialGames={[game()]} />);
      expect(screen.getByText("Goetheschule", { exact: false })).toBeInTheDocument();
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(0);
    });

    it("swaps in the refetched plan when the live data differs", async () => {
      getMatches.mockResolvedValue(page([game({ id: 2, venueName: "IGS Linden" })]));
      render(<SpielplanIsland initialGames={[game()]} />);
      expect(screen.getByText("Goetheschule", { exact: false })).toBeInTheDocument();
      expect(await screen.findByText("IGS Linden", { exact: false })).toBeInTheDocument();
      expect(screen.queryByText("Goetheschule", { exact: false })).toBeNull();
    });

    it("keeps showing them when the refetch fails, without an error", async () => {
      getMatches.mockRejectedValue(new Error("network"));
      render(<SpielplanIsland initialGames={[game()]} />);
      await waitFor(() => expect(getMatches).toHaveBeenCalled());
      expect(screen.getByText("Goetheschule", { exact: false })).toBeInTheDocument();
      expect(screen.queryByText(strings.spielplan.loadError)).toBeNull();
    });
  });
});
