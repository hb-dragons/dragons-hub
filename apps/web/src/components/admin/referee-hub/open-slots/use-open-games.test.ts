// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import useSWR from "swr";
import { todayInClubZone } from "@dragons/shared";
import { api } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { normalizeRefereeGamesQuery } from "@/lib/referee-games-query";
import { DEFAULT_FILTERS, OPEN_GAMES_PAGE_SIZE, openGamesQueryOpts } from "./open-games-query";
import { useOpenGames } from "./use-open-games";

vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn() };
});

const page = (over: Record<string, unknown> = {}) => ({
  data: { items: [{ apiMatchId: 1 }], total: 250, limit: 200, offset: 0, hasMore: true },
  error: undefined,
  isLoading: false,
  isValidating: false,
  mutate: vi.fn(),
  ...over,
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

  it("reports the rows and the total, and no total while the list fails", () => {
    vi.mocked(useSWR).mockReturnValue(page() as never);
    const { result, rerender } = renderHook(() => useOpenGames(DEFAULT_FILTERS));
    expect(result.current.games).toEqual([{ apiMatchId: 1 }]);
    expect(result.current.total).toBe(250);

    vi.mocked(useSWR).mockReturnValue(page({ error: new Error("down") }) as never);
    rerender();
    expect(result.current.total).toBeNull();
  });

  it("loads the next page on request, and not again while it is in flight", () => {
    vi.mocked(useSWR).mockReturnValue(page() as never);
    const { result, rerender } = renderHook(() => useOpenGames(DEFAULT_FILTERS));

    act(() => result.current.loadMore());
    const keys = vi.mocked(useSWR).mock.calls.map((c) => c[0] as string);
    expect(keys.at(-1)).toMatch(/&pages=2$/);

    vi.mocked(useSWR).mockReturnValue(page({ isValidating: true }) as never);
    rerender();
    act(() => result.current.loadMore());
    expect(result.current.isLoadingMore).toBe(true);
    expect((vi.mocked(useSWR).mock.calls.at(-1)![0] as string)).toMatch(/&pages=2$/);
  });

  it("does not ask for more once the last page is in", () => {
    vi.mocked(useSWR).mockReturnValue(page({ data: { items: [], total: 1, hasMore: false } }) as never);
    const { result } = renderHook(() => useOpenGames(DEFAULT_FILTERS));
    act(() => result.current.loadMore());
    expect(vi.mocked(useSWR).mock.calls.every((c) => !(c[0] as string).includes("pages="))).toBe(true);
  });

  it("starts over at one page when the filters change", () => {
    vi.mocked(useSWR).mockReturnValue(page() as never);
    const { result, rerender } = renderHook(({ f }) => useOpenGames(f), { initialProps: { f: DEFAULT_FILTERS } });
    act(() => result.current.loadMore());
    rerender({ f: { ...DEFAULT_FILTERS, gameType: "home" } });
    const last = vi.mocked(useSWR).mock.calls.at(-1)![0] as string;
    expect(last).toContain("gameType=home");
    expect(last).not.toContain("pages=");
  });

  it("fetches every loaded page and joins them in order", async () => {
    vi.mocked(useSWR).mockReturnValue(page() as never);
    const getGames = vi.spyOn(api.referees, "getGames").mockImplementation(async (q) => ({
      items: [{ apiMatchId: q!.offset! + 1 }],
      total: 250,
      limit: 200,
      offset: q!.offset!,
      hasMore: q!.offset! === 0,
    }) as never);
    const { result } = renderHook(() => useOpenGames(DEFAULT_FILTERS));
    act(() => result.current.loadMore());

    const call = vi.mocked(useSWR).mock.calls.find((c) => (c[0] as string).includes("pages=2"))!;
    const joined = await (call[1] as () => Promise<{ items: Array<{ apiMatchId: number }>; hasMore: boolean }>)();

    expect(getGames.mock.calls.map(([q]) => q!.offset)).toEqual([0, OPEN_GAMES_PAGE_SIZE]);
    expect(joined.items.map((i) => i.apiMatchId)).toEqual([1, OPEN_GAMES_PAGE_SIZE + 1]);
    expect(joined.hasMore).toBe(false);
    getGames.mockRestore();
  });

  it("retries through SWR", () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue(page({ mutate }) as never);
    const { result } = renderHook(() => useOpenGames(DEFAULT_FILTERS));
    result.current.retry();
    expect(mutate).toHaveBeenCalled();
  });
});
