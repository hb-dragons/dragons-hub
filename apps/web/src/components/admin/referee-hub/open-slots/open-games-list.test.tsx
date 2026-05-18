// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { OpenGamesList } from "./open-games-list";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

const baseFilters = {
  status: "open" as const,
  league: [] as string[],
  dateFrom: null as string | null,
  dateTo: null as string | null,
  gameType: "both" as const,
};

const wrap = (ui: React.ReactNode) => (
  <SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>
);

describe("OpenGamesList", () => {
  it("renders rows from server response without client-side status filter", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { id: 1, apiMatchId: 100, kickoffDate: "2026-05-24", kickoffTime: "18:00", leagueShort: "OL",
            homeTeamName: "Dragons", guestTeamName: "Bears",
            sr1Status: "open", sr2Status: "assigned", sr1Name: null, sr2Name: "Meier",
            sr1RefereeApiId: null, sr2RefereeApiId: 999 },
        ],
        total: 1, limit: 50, offset: 0, hasMore: false,
      }),
    }));
    render(wrap(<OpenGamesList filters={baseFilters} selectedGameId={null} onSelect={() => {}} />));
    expect(await screen.findByText("Dragons vs Bears")).toBeInTheDocument();
  });

  it("renders empty state when no rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], total: 0, limit: 50, offset: 0, hasMore: false }),
    }));
    render(wrap(<OpenGamesList filters={baseFilters} selectedGameId={null} onSelect={() => {}} />));
    expect(await screen.findByText(/empty|no games/i)).toBeInTheDocument();
  });
});
