import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../types";

const m = vi.hoisted(() => ({ incrementSlidingWindow: vi.fn() }));
vi.mock("../config/redis", () => ({
  incrementSlidingWindow: (...args: unknown[]) => m.incrementSlidingWindow(...args),
}));

const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("../config/logger", () => ({ logger: log }));

// --- Imports (after mocks) ---
import { rateLimit } from "./rate-limit";

function makeApp(limit = 2) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "u1" } as never);
    await next();
  });
  app.post("/x", rateLimit({ limit, windowSeconds: 60, keyPrefix: "qa" }), (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows requests under the limit", async () => {
    m.incrementSlidingWindow.mockResolvedValue([1, 0]);
    const res = await makeApp().request("/x", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("returns 429 with Retry-After when over the limit", async () => {
    m.incrementSlidingWindow.mockResolvedValue([3, 0]);
    const res = await makeApp().request("/x", { method: "POST" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("fails open with a warning when Redis errors", async () => {
    m.incrementSlidingWindow.mockRejectedValue(new Error("redis down"));
    const res = await makeApp().request("/x", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(log.warn).toHaveBeenCalled();
  });

  // The counter and its TTL travel in one atomic call (see config/redis.ts);
  // the middleware's job is to hand it the two window keys and the window length.
  it("counts against a per-user, per-window key and reads the one before it", async () => {
    m.incrementSlidingWindow.mockResolvedValue([1, 0]);
    await makeApp().request("/x", { method: "POST" });

    expect(m.incrementSlidingWindow).toHaveBeenCalledTimes(1);
    const [key, prevKey, windowSeconds] = m.incrementSlidingWindow.mock.calls[0]!;
    expect(key).toMatch(/^qa:u1:\d+$/);
    expect(prevKey).toMatch(/^qa:u1:\d+$/);
    expect(windowSeconds).toBe(60);

    // The previous key is the immediately preceding window, or the decay maths
    // weights the wrong bucket.
    const index = (k: string) => Number(k.split(":")[2]);
    expect(index(prevKey as string)).toBe(index(key as string) - 1);
  });

  it("buckets anonymous callers under a shared key", async () => {
    m.incrementSlidingWindow.mockResolvedValue([1, 0]);
    const app = new Hono<AppEnv>();
    app.post("/x", rateLimit({ limit: 2, windowSeconds: 60, keyPrefix: "qa" }), (c) => c.json({ ok: true }));
    await app.request("/x", { method: "POST" });

    const [key, prevKey] = m.incrementSlidingWindow.mock.calls[0]!;
    expect(key).toMatch(/^qa:anon:\d+$/);
    expect(prevKey).toMatch(/^qa:anon:\d+$/);
  });

  /**
   * A fixed window lets a caller spend the whole budget in the last instant of
   * window N and the whole budget again in the first instant of window N+1 —
   * 2x the configured limit in a span barely wider than one window.
   *
   * These cases drive the middleware against an in-memory stand-in for the Lua
   * script (INCR the current bucket, GET the previous one). It ignores expiry,
   * which is faithful enough: the real TTL is two windows, so both buckets these
   * cases touch are still live.
   */
  describe("burst across a window boundary", () => {
    // A multiple of 60_000, so the clock starts exactly on a window boundary
    // and `elapsed` is 0 rather than some arbitrary fraction.
    const WINDOW_START = 60_000 * 29_750_000;

    function inMemoryCounters() {
      const store = new Map<string, number>();
      m.incrementSlidingWindow.mockImplementation(
        (key: string, prevKey: string) => {
          const current = (store.get(key) ?? 0) + 1;
          store.set(key, current);
          return Promise.resolve([current, store.get(prevKey) ?? 0]);
        },
      );
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(WINDOW_START);
      inMemoryCounters();
    });

    afterEach(() => vi.useRealTimers());

    async function post(app: Hono<AppEnv>): Promise<number> {
      const res = await app.request("/x", { method: "POST" });
      return res.status;
    }

    it("spends the budget, then refuses a second budget across the boundary", async () => {
      const app = makeApp(2);

      // Fill the window right at its end.
      vi.setSystemTime(WINDOW_START + 59_999);
      expect(await post(app)).toBe(200);
      expect(await post(app)).toBe(200);
      expect(await post(app)).toBe(429);

      // One millisecond later a new fixed window would hand over a fresh
      // budget. The previous window's 2 requests are still fully inside the
      // trailing 60s, so they must still count.
      vi.setSystemTime(WINDOW_START + 60_000);
      expect(
        await post(app),
        "a fresh budget was granted the instant the window rolled over — " +
          "the previous window's usage is not being carried",
      ).toBe(429);
    });

    /**
     * Spend the whole budget in window N, jump to a given fraction of window
     * N+1, then count how many requests get through back-to-back.
     *
     * Note that a rejected request still INCRs the current bucket, so a caller
     * that keeps hammering extends its own penalty. That is inherent to counting
     * with INCR and was equally true of the fixed window; these cases measure
     * the admitted run, which is what a well-behaved caller sees.
     */
    async function admittedAfterBoundary(
      limit: number,
      fraction: number,
    ): Promise<number> {
      const app = makeApp(limit);

      vi.setSystemTime(WINDOW_START + 59_999);
      for (let i = 0; i < limit; i++) expect(await post(app)).toBe(200);

      vi.setSystemTime(WINDOW_START + 60_000 + Math.round(60_000 * fraction));
      let admitted = 0;
      while ((await post(app)) === 200) admitted++;
      return admitted;
    }

    it("grants no budget at the instant of the boundary", async () => {
      // The previous window is spent and none of it has aged out yet.
      expect(await admittedAfterBoundary(10, 0)).toBe(0);
    });

    // The fractions below are deliberately off the half: they put the admission
    // threshold on a .5 rather than exactly on an integer, so the assertion does
    // not turn on which way a float lands when the estimate equals the limit.
    it("grants roughly half the budget half way through the new window", async () => {
      // previous=10 weighted 0.45 leaves room for 5.5, so 5 get through.
      expect(await admittedAfterBoundary(10, 0.55)).toBe(5);
    });

    it("grants almost the full budget near the end of the new window", async () => {
      // previous=10 weighted 0.05 leaves room for 9.5, so 9 get through.
      expect(await admittedAfterBoundary(10, 0.95)).toBe(9);
    });

    it("never admits more than the limit over any single-window span", async () => {
      const app = makeApp(5);
      const SPAN_MS = 60_000;

      // Start late in window N, not at its beginning: the fixed-window burst
      // only appears when the budget is spent right up against the boundary.
      // Hammering from the window start spends it early, leaves a long idle gap
      // before the rollover, and no trailing span ever holds 2x the limit — so
      // that version of this test passes on the broken implementation too.
      const stamps: number[] = [];
      for (let t = 50_000; t < 50_000 + SPAN_MS * 2; t += 2_000) {
        vi.setSystemTime(WINDOW_START + t);
        if ((await post(app)) === 200) stamps.push(t);
      }
      expect(stamps.length).toBeGreaterThan(0);

      // Worst trailing window anywhere in the run.
      let worst = 0;
      for (const start of stamps) {
        const inSpan = stamps.filter((s) => s >= start && s < start + SPAN_MS).length;
        worst = Math.max(worst, inSpan);
      }
      expect(worst, `admitted ${worst} in one ${SPAN_MS}ms span with limit 5`).toBeLessThanOrEqual(5);
    });
  });
});
