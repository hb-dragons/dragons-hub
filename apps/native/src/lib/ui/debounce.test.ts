import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncer, SEARCH_DEBOUNCE_MS } from "./debounce";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createDebouncer", () => {
  it("does not run the callback before the delay elapses", () => {
    const run = vi.fn();
    const d = createDebouncer();

    d.schedule(run, 250);
    vi.advanceTimersByTime(249);

    expect(run).not.toHaveBeenCalled();
  });

  it("runs the callback once the delay elapses", () => {
    const run = vi.fn();
    const d = createDebouncer();

    d.schedule(run, 250);
    vi.advanceTimersByTime(250);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst of keystrokes into a single trailing call", () => {
    // The bug: three search sheets fired one request per keystroke, and SWR's
    // dedupingInterval could not help because every key was distinct.
    const seen: string[] = [];
    const d = createDebouncer();

    for (const q of ["S", "Sc", "Sch", "Schm", "Schmi"]) {
      d.schedule(() => seen.push(q), SEARCH_DEBOUNCE_MS);
      vi.advanceTimersByTime(30);
    }
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(seen).toEqual(["Schmi"]);
  });

  it("restarts the window on every schedule, so a slow typist still gets each pause", () => {
    const seen: string[] = [];
    const d = createDebouncer();

    d.schedule(() => seen.push("a"), 250);
    vi.advanceTimersByTime(250);
    d.schedule(() => seen.push("b"), 250);
    vi.advanceTimersByTime(250);

    expect(seen).toEqual(["a", "b"]);
  });

  it("cancel() drops a pending callback", () => {
    const run = vi.fn();
    const d = createDebouncer();

    d.schedule(run, 250);
    d.cancel();
    vi.advanceTimersByTime(1000);

    expect(run).not.toHaveBeenCalled();
  });

  it("cancel() is safe with nothing pending", () => {
    const d = createDebouncer();
    expect(() => {
      d.cancel();
      d.cancel();
    }).not.toThrow();
  });

  it("runs immediately when the delay is zero or negative", () => {
    const run = vi.fn();
    const d = createDebouncer();

    d.schedule(run, 0);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a zero-delay schedule still supersedes a pending one", () => {
    const stale = vi.fn();
    const fresh = vi.fn();
    const d = createDebouncer();

    d.schedule(stale, 250);
    d.schedule(fresh, 0);
    vi.advanceTimersByTime(1000);

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("exposes a search debounce long enough to skip intermediate keystrokes", () => {
    expect(SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(200);
    expect(SEARCH_DEBOUNCE_MS).toBeLessThanOrEqual(500);
  });
});
