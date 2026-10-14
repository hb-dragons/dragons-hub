// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import useSWR from "swr";
import { todayInClubZone } from "@dragons/shared";
import { api } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { normalizeRefereeGamesQuery } from "@/lib/referee-games-query";
import { DEFAULT_FILTERS, OPEN_GAMES_PAGE_SIZE, isOpenGamesListKey, openGamesQueryOpts } from "./open-games-query";
import { useOpenGames } from "./use-open-games";

// Paging itself is covered in hooks/use-paged-list.test.ts; this file covers
// what is specific to the open-games list.

vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn() };
});

const page = () => ({
  data: { items: [{ apiMatchId: 1 }], total: 250, limit: 200, offset: 0, hasMore: true },
  error: undefined,
  isLoading: false,
  isValidating: false,
  mutate: vi.fn(),
});

beforeEach(() => vi.mocked(useSWR).mockReset());
afterEach(cleanup);

describe("useOpenGames", () => {
  it("requests exactly the key the server prefetch primes for default filters", () => {
    vi.mocked(useSWR).mockReturnValue(page() as never);
    renderHook(() => useOpenGames(DEFAULT_FILTERS));
    // `admin/referees/page.tsx` primes this exact key. If either side drifts the
    // SSR payload is silently discarded and the agenda shows "Loading…".
    expect(vi.mocked(useSWR).mock.calls[0]![0]).toBe(
      SWR_KEYS.refereeGamesFiltered(
        normalizeRefereeGamesQuery(openGamesQueryOpts(DEFAULT_FILTERS, todayInClubZone())),
      ),
    );
  });

  it("puts the filters in the key", () => {
    vi.mocked(useSWR).mockReturnValue(page() as never);
    renderHook(() => useOpenGames({ ...DEFAULT_FILTERS, status: "any", search: "dra" }));
    const key = vi.mocked(useSWR).mock.calls[0]![0] as string;
    expect(key).toContain("slotStatus=any");
    expect(key).toContain("search=dra");
  });

  it("names the rows games", () => {
    vi.mocked(useSWR).mockReturnValue(page() as never);
    const { result } = renderHook(() => useOpenGames(DEFAULT_FILTERS));
    expect(result.current.games).toEqual([{ apiMatchId: 1 }]);
    expect(result.current.total).toBe(250);
  });

  it("keeps paged keys inside the revalidation an assignment triggers", () => {
    vi.mocked(useSWR).mockReturnValue(page() as never);
    const { result } = renderHook(() => useOpenGames(DEFAULT_FILTERS));
    act(() => result.current.loadMore());
    const paged = vi.mocked(useSWR).mock.calls.at(-1)![0] as string;
    expect(paged).toMatch(/&pages=2$/);
    expect(isOpenGamesListKey(paged)).toBe(true);
  });

  it("asks the API for each page at its own offset", async () => {
    vi.mocked(useSWR).mockReturnValue(page() as never);
    const getGames = vi.spyOn(api.referees, "getGames").mockResolvedValue(
      { items: [], total: 250, limit: 200, offset: 0, hasMore: false } as never,
    );
    const { result } = renderHook(() => useOpenGames(DEFAULT_FILTERS));
    act(() => result.current.loadMore());

    const call = vi.mocked(useSWR).mock.calls.find((c) => (c[0] as string).includes("pages=2"))!;
    await (call[1] as () => Promise<unknown>)();

    expect(getGames.mock.calls.map(([q]) => q!.offset)).toEqual([0, OPEN_GAMES_PAGE_SIZE]);
    getGames.mockRestore();
  });
});
