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
});
