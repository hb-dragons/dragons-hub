// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SWRConfig } from "swr";
import useSWR from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { normalizeRefereeGamesQuery } from "@/lib/referee-games-query";
import { OPEN_GAMES_PREFETCH_OPTS } from "./open-games-query";
import { OpenGamesList } from "./open-games-list";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
}));
vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return {
    ...actual,
    default: vi.fn(actual.default),
  };
});

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
  beforeEach(() => {
    vi.mocked(useSWR).mockReset();
  });
  afterEach(cleanup);

  it("renders rows from server response without client-side status filter", async () => {
    vi.mocked(useSWR).mockReturnValue({
      data: {
        items: [
          {
            id: 1, apiMatchId: 100, kickoffDate: "2026-05-24", kickoffTime: "18:00",
            leagueShort: "OL", homeTeamName: "Dragons", guestTeamName: "Bears",
            sr1Status: "open", sr2Status: "assigned", sr1Name: null, sr2Name: "Meier",
            sr1RefereeApiId: null, sr2RefereeApiId: 999,
          },
        ],
        total: 1, limit: 50, offset: 0, hasMore: false,
      },
      error: undefined,
      isLoading: false,
    } as never);
    render(wrap(<OpenGamesList filters={baseFilters} selectedGameId={null} onSelect={() => {}} />));
    expect(await screen.findByText("Dragons vs Bears")).toBeInTheDocument();
  });

  it("renders empty state when no rows", async () => {
    vi.mocked(useSWR).mockReturnValue({
      data: { items: [], total: 0, limit: 50, offset: 0, hasMore: false },
      error: undefined,
      isLoading: false,
    } as never);
    render(wrap(<OpenGamesList filters={baseFilters} selectedGameId={null} onSelect={() => {}} />));
    expect(await screen.findByText(/empty|no games/i)).toBeInTheDocument();
  });

  it("maps filters.status=open to slotStatus=open in the SWR key", () => {
    let observed = "";
    vi.mocked(useSWR).mockImplementation((key: unknown) => {
      observed = key as string;
      return { data: { items: [] } } as never;
    });
    render(wrap(<OpenGamesList
      filters={{ status: "open", league: [], dateFrom: null, dateTo: null, gameType: "both" }}
      selectedGameId={null}
      onSelect={() => {}}
    />));
    expect(observed).toContain("slotStatus=open");
    expect(observed).not.toMatch(/slotStatus=any/);
  });

  it("offers a retry affordance when the list fails to load", () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error("down"),
      isLoading: false,
      mutate,
    } as never);
    render(wrap(<OpenGamesList filters={baseFilters} selectedGameId={null} onSelect={() => {}} />));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/empty|no games/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /tryAgain/i }));
    expect(mutate).toHaveBeenCalled();
  });

  it("requests exactly the key the server prefetch primes for default filters", () => {
    let observed = "";
    vi.mocked(useSWR).mockImplementation((key: unknown) => {
      observed = key as string;
      return { data: { items: [] } } as never;
    });
    render(wrap(<OpenGamesList filters={baseFilters} selectedGameId={null} onSelect={() => {}} />));
    // `admin/referees/page.tsx` primes this exact key. If either side drifts the
    // SSR payload is silently discarded and the pane shows "Loading…".
    expect(observed).toBe(
      SWR_KEYS.refereeGamesFiltered(
        normalizeRefereeGamesQuery(OPEN_GAMES_PREFETCH_OPTS),
      ),
    );
  });

  it("maps filters.status=any to no slotStatus param (server returns all)", () => {
    let observed = "";
    vi.mocked(useSWR).mockImplementation((key: unknown) => {
      observed = key as string;
      return { data: { items: [] } } as never;
    });
    render(wrap(<OpenGamesList
      filters={{ status: "any", league: [], dateFrom: null, dateTo: null, gameType: "both" }}
      selectedGameId={null}
      onSelect={() => {}}
    />));
    expect(observed).not.toContain("slotStatus=");
  });
});
