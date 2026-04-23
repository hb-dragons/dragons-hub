// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: {
    getAll: vi.fn((_: string): string[] => []),
    get: vi.fn((_: string): string | null => null),
  },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/admin/boards/1",
}));

import { useBoardFilters } from "./use-board-filters";

describe("useBoardFilters", () => {
  it("parses empty search params to defaults", () => {
    mocks.searchParams.getAll.mockReturnValue([]);
    mocks.searchParams.get.mockReturnValue(null);

    const { result } = renderHook(() => useBoardFilters());
    expect(result.current.filters).toEqual({
      assigneeIds: [],
      priority: null,
      q: "",
    });
  });

  it("reads multi-value assignee from search params", () => {
    mocks.searchParams.getAll.mockImplementation((k: string) =>
      k === "assignee" ? ["u_a", "u_b"] : [],
    );
    mocks.searchParams.get.mockImplementation((k: string) =>
      k === "priority" ? "urgent" : null,
    );

    const { result } = renderHook(() => useBoardFilters());
    expect(result.current.filters.assigneeIds).toEqual(["u_a", "u_b"]);
    expect(result.current.filters.priority).toBe("urgent");
  });

  it("setAssigneeIds calls router.replace with new URL", () => {
    mocks.searchParams.getAll.mockReturnValue([]);
    mocks.searchParams.get.mockReturnValue(null);
    mocks.replace.mockClear();

    const { result } = renderHook(() => useBoardFilters());
    act(() => result.current.setAssigneeIds(["u_alice"]));
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.stringContaining("assignee=u_alice"),
      { scroll: false },
    );
  });

  it("clear resets all filters", () => {
    mocks.searchParams.getAll.mockReturnValue(["u_a"]);
    mocks.searchParams.get.mockImplementation((k: string) =>
      k === "priority" ? "high" : k === "q" ? "book" : null,
    );
    mocks.replace.mockClear();

    const { result } = renderHook(() => useBoardFilters());
    act(() => result.current.clear());
    expect(mocks.replace).toHaveBeenCalledWith("/admin/boards/1", {
      scroll: false,
    });
  });

  it("ignores invalid priority values", () => {
    mocks.searchParams.getAll.mockReturnValue([]);
    mocks.searchParams.get.mockImplementation((k: string) =>
      k === "priority" ? "bogus" : null,
    );

    const { result } = renderHook(() => useBoardFilters());
    expect(result.current.filters.priority).toBeNull();
  });
});
