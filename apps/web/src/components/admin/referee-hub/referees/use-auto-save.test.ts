// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAutoSave } from "./use-auto-save";

describe("useAutoSave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts idle", () => {
    const { result } = renderHook(() => useAutoSave({ save: vi.fn().mockResolvedValue(undefined), debounceMs: 800 }));
    expect(result.current.status).toBe("idle");
  });

  it("transitions to dirty on markDirty, then saving + saved after debounce", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ save, debounceMs: 800 }));
    act(() => result.current.markDirty());
    expect(result.current.status).toBe("dirty");
    await act(async () => { vi.advanceTimersByTime(800); await vi.runAllTimersAsync(); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
  });

  it("collapses rapid markDirty into a single save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ save, debounceMs: 800 }));
    act(() => { result.current.markDirty(); result.current.markDirty(); result.current.markDirty(); });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saveNow bypasses debounce", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ save, debounceMs: 800 }));
    act(() => result.current.markDirty());
    await act(async () => { await result.current.saveNow(); });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("status becomes 'error' on save failure", async () => {
    const save = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAutoSave({ save, debounceMs: 800 }));
    act(() => result.current.markDirty());
    await act(async () => { vi.advanceTimersByTime(800); await vi.runAllTimersAsync(); });
    expect(result.current.status).toBe("error");
  });

  it("does not save after unmount", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAutoSave({ save, debounceMs: 800 }));
    act(() => result.current.markDirty());
    unmount();
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(save).not.toHaveBeenCalled();
  });
});
