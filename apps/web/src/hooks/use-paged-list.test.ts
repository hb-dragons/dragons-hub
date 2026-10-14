// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import useSWR from "swr";
import { pagesKey, usePagedList } from "./use-paged-list";

vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn() };
});

const FIRST = "/things?limit=50&offset=0";

const swr = (over: Record<string, unknown> = {}) => ({
  data: { items: [{ id: 1 }], total: 120, limit: 50, offset: 0, hasMore: true },
  error: undefined,
  isLoading: false,
  isValidating: false,
  mutate: vi.fn(),
  ...over,
});

const keys = () => vi.mocked(useSWR).mock.calls.map((c) => c[0] as string);

beforeEach(() => vi.mocked(useSWR).mockReset());
afterEach(cleanup);

describe("pagesKey", () => {
  it("leaves the first page's key alone, so a server prefetch lands", () => {
    expect(pagesKey(FIRST, 1)).toBe(FIRST);
  });

  it("extends the key for more pages, keeping its prefix", () => {
    expect(pagesKey(FIRST, 3)).toBe(`${FIRST}&pages=3`);
    expect(pagesKey(FIRST, 3).startsWith("/things?")).toBe(true);
  });
});

describe("usePagedList", () => {
  it("reports the rows and the total, and no total while the list fails", () => {
    vi.mocked(useSWR).mockReturnValue(swr() as never);
    const { result, rerender } = renderHook(() => usePagedList(FIRST, vi.fn()));
    expect(result.current.items).toEqual([{ id: 1 }]);
    expect(result.current.total).toBe(120);
    expect(keys()[0]).toBe(FIRST);

    vi.mocked(useSWR).mockReturnValue(swr({ error: new Error("down") }) as never);
    rerender();
    expect(result.current.total).toBeNull();
  });

  it("counts as loading only until the first data is in", () => {
    vi.mocked(useSWR).mockReturnValue(swr({ data: undefined, isLoading: true }) as never);
    const { result } = renderHook(() => usePagedList(FIRST, vi.fn()));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.items).toEqual([]);
  });

  it("loads the next page on request, and not again while it is in flight", () => {
    vi.mocked(useSWR).mockReturnValue(swr() as never);
    const { result, rerender } = renderHook(() => usePagedList(FIRST, vi.fn()));

    act(() => result.current.loadMore());
    expect(keys().at(-1)).toBe(`${FIRST}&pages=2`);

    vi.mocked(useSWR).mockReturnValue(swr({ isValidating: true }) as never);
    rerender();
    act(() => result.current.loadMore());
    expect(result.current.isLoadingMore).toBe(true);
    expect(keys().at(-1)).toBe(`${FIRST}&pages=2`);
  });

  it("does not ask for more once the last page is in", () => {
    vi.mocked(useSWR).mockReturnValue(swr({ data: { items: [], total: 1, hasMore: false } }) as never);
    const { result } = renderHook(() => usePagedList(FIRST, vi.fn()));
    act(() => result.current.loadMore());
    expect(keys().every((k) => !k.includes("pages="))).toBe(true);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it("starts over at one page when the first-page key changes", () => {
    vi.mocked(useSWR).mockReturnValue(swr() as never);
    const { result, rerender } = renderHook(({ k }) => usePagedList(k, vi.fn()), { initialProps: { k: FIRST } });
    act(() => result.current.loadMore());
    rerender({ k: "/things?limit=50&offset=0&q=x" });
    expect(keys().at(-1)).toBe("/things?limit=50&offset=0&q=x");
  });

  it("fetches every loaded page and joins them in order, reporting the last page's hasMore", async () => {
    vi.mocked(useSWR).mockReturnValue(swr() as never);
    const fetchPage = vi.fn(async (page: number) => ({
      items: [{ id: page + 1 }], total: 120, limit: 50, offset: page * 50, hasMore: page === 0,
    }));
    const { result } = renderHook(() => usePagedList(FIRST, fetchPage));
    act(() => result.current.loadMore());

    const call = vi.mocked(useSWR).mock.calls.find((c) => c[0] === `${FIRST}&pages=2`)!;
    const joined = await (call[1] as () => Promise<{ items: { id: number }[]; hasMore: boolean; offset: number }>)();

    expect(fetchPage.mock.calls.map(([p]) => p)).toEqual([0, 1]);
    expect(joined.items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(joined.hasMore).toBe(false);
    expect(joined.offset).toBe(0);
  });

  it("retries through SWR", () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue(swr({ mutate }) as never);
    const { result } = renderHook(() => usePagedList(FIRST, vi.fn()));
    result.current.retry();
    expect(mutate).toHaveBeenCalled();
  });
});
