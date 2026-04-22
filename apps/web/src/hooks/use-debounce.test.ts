// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "./use-debounce";

describe("useDebounce", () => {
  it("returns initial value synchronously", () => {
    const { result } = renderHook(() => useDebounce("a", 200));
    expect(result.current).toBe("a");
  });

  it("delays subsequent updates by the interval", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ v }) => useDebounce(v, 200),
      { initialProps: { v: "a" } },
    );
    rerender({ v: "b" });
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(199); });
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current).toBe("b");
    vi.useRealTimers();
  });
});
