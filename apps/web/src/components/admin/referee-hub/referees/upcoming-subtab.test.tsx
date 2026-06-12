// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { UpcomingSubtab } from "./upcoming-subtab";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
}));

const wrap = (ui: React.ReactNode) => (
  <SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>
);

const referee = {
  id: 42,
  apiId: 555,
  firstName: "A",
  lastName: "B",
  licenseNumber: 1,
  matchCount: 0,
  allowAllHomeGames: false,
  allowAwayGames: false,
  isOwnClub: true,
  createdAt: "",
  updatedAt: "",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UpcomingSubtab", () => {
  it("fetches assigned games via assignedRefereeApiId param", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, limit: 100, offset: 0, hasMore: false }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(wrap(<UpcomingSubtab referee={referee} />));

    // Wait for the "assigned" section title specifically (not assignedEmpty)
    await waitFor(
      () => expect(screen.getByText(/refereeHub\.referees\.upcoming\.assigned\b/)).toBeInTheDocument(),
      { timeout: 2000 },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("assignedRefereeApiId=555"),
      expect.anything(),
    );
  });

  it("fetches eligible games via /eligible-open-games", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, limit: 100, offset: 0, hasMore: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              apiMatchId: 1,
              kickoffDate: "2026-05-24",
              kickoffTime: "18:00",
              homeTeamName: "A",
              guestTeamName: "B",
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(wrap(<UpcomingSubtab referee={referee} />));

    await waitFor(() => expect(screen.getByText("A vs B")).toBeInTheDocument(), { timeout: 2000 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/referees/42/eligible-open-games"),
      expect.anything(),
    );
  });
});
