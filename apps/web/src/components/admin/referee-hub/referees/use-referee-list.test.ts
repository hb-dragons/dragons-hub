// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { makeQueries } from "@/lib/swr-queries";
import { DEFAULT_REFEREE_LIST, REFEREE_LIST_PAGE_SIZE, refereeListQueryOpts } from "./referee-list-query";
import { useRefereeList } from "./use-referee-list";

// Paging itself is covered in hooks/use-paged-list.test.ts.

vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn() };
});

const page = () => ({
  data: { items: [], total: 120, limit: 50, offset: 0, hasMore: true },
  error: undefined,
  isLoading: false,
  isValidating: false,
  mutate: vi.fn(),
});

beforeEach(() => vi.mocked(useSWR).mockReset().mockReturnValue(page() as never));
afterEach(cleanup);

describe("useRefereeList", () => {
  it("requests exactly the key the server prefetch primes for the default view", () => {
    renderHook(() => useRefereeList(DEFAULT_REFEREE_LIST));
    // `admin/referees/page.tsx` primes this key through the same builder.
    const serverKey = makeQueries(api).refereesPaginated(refereeListQueryOpts(DEFAULT_REFEREE_LIST)).key;
    expect(vi.mocked(useSWR).mock.calls[0]![0]).toBe(serverKey);
  });

  it("puts scope, search and sort in the key, and leaves an empty search out", () => {
    renderHook(() => useRefereeList({ scope: "all", search: "mül", sort: "workloadDesc" }));
    const key = vi.mocked(useSWR).mock.calls[0]![0] as string;
    expect(key).toContain("scope=all");
    expect(key).toContain("search=m%C3%BCl");
    expect(key).toContain("sort=workloadDesc");
    expect(refereeListQueryOpts(DEFAULT_REFEREE_LIST).search).toBeUndefined();
  });

  it("keeps paged keys under the prefix the own-club toggle revalidates", () => {
    const { result } = renderHook(() => useRefereeList(DEFAULT_REFEREE_LIST));
    act(() => result.current.loadMore());
    const paged = vi.mocked(useSWR).mock.calls.at(-1)![0] as string;
    expect(paged).toMatch(/^\/admin\/referees\?.*&pages=2$/);
  });

  it("asks the API for each page at its own offset", async () => {
    const listReferees = vi.spyOn(api.refereeAdmin, "listReferees").mockResolvedValue(
      { items: [], total: 120, limit: 50, offset: 0, hasMore: false } as never,
    );
    const { result } = renderHook(() => useRefereeList(DEFAULT_REFEREE_LIST));
    act(() => result.current.loadMore());
    const call = vi.mocked(useSWR).mock.calls.find((c) => (c[0] as string).includes("pages=2"))!;
    await (call[1] as () => Promise<unknown>)();
    expect(listReferees.mock.calls.map(([q]) => q!.offset)).toEqual([0, REFEREE_LIST_PAGE_SIZE]);
    listReferees.mockRestore();
  });
});
