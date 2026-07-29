import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../config/env", () => ({
  env: {
    SCOREBOARD_INGEST_KEY: "k".repeat(48),
    SCOREBOARD_DEVICE_ID: "dragons-1",
  },
}));

const counters = new Map<string, number>();
const redisState = { fail: false };
vi.mock("../config/redis", () => ({
  // Stands in for the real EVAL-backed helper: bump the counter and stamp the
  // TTL in one step, so there is no window where a key exists without an expiry.
  async incrementWithTtl(key: string) {
    if (redisState.fail) throw new Error("redis down");
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return next;
  },
}));

const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("../config/logger", () => ({ logger: log }));

import { requireIngestKey } from "./ingest-key";

function makeApp() {
  const app = new Hono();
  app.use("*", requireIngestKey);
  app.get("/x", (c) => c.json({ ok: true }));
  return app;
}

beforeEach(() => {
  counters.clear();
  redisState.fail = false;
  log.warn.mockClear();
});

describe("requireIngestKey", () => {
  it("rejects missing Authorization", async () => {
    const res = await makeApp().request("/x", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("rejects wrong bearer", async () => {
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: { Authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects missing Device_ID", async () => {
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: { Authorization: `Bearer ${"k".repeat(48)}` },
    });
    expect(res.status).toBe(400);
  });

  it("rejects unknown Device_ID", async () => {
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${"k".repeat(48)}`,
        Device_ID: "other",
      },
    });
    expect(res.status).toBe(400);
  });

  it("allows valid headers", async () => {
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${"k".repeat(48)}`,
        Device_ID: "dragons-1",
      },
    });
    expect(res.status).toBe(200);
  });

  // The limiter buckets its key by wall-clock second (`Math.floor(Date.now() /
  // 1000)`), so a loop of 31 requests that straddles a second boundary starts
  // counting again from 1 in the new bucket and the last request is a genuine
  // 200. That made this assertion fail roughly `loopDuration / 1000ms` of the
  // time — a couple of percent unloaded, far more on a 2-core CI runner
  // (issue #158). Pinning `Date.now` removes the race rather than widening the
  // margin, and lets the rollover be asserted directly below.
  function pinClock(atMs: number) {
    const spy = vi.spyOn(Date, "now").mockReturnValue(atMs);
    return spy;
  }

  async function get(app: ReturnType<typeof makeApp>) {
    return app.request("/x", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${"k".repeat(48)}`,
        Device_ID: "dragons-1",
      },
    });
  }

  it("rate-limits over 30 requests per second per device", async () => {
    const clock = pinClock(1_800_000_000_000);
    try {
      const app = makeApp();
      let last = 200;
      for (let i = 0; i < 31; i++) {
        last = (await get(app)).status;
      }
      expect(last).toBe(429);
    } finally {
      clock.mockRestore();
    }
  });

  it("allows the 30th request in a window but not the 31st", async () => {
    const clock = pinClock(1_800_000_000_000);
    try {
      const app = makeApp();
      const statuses: number[] = [];
      for (let i = 0; i < 31; i++) {
        statuses.push((await get(app)).status);
      }
      expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
      expect(statuses[30]).toBe(429);
    } finally {
      clock.mockRestore();
    }
  });

  // The reset on the boundary is the intended design, not the bug — it was just
  // never asserted, because there was no way to reach it deterministically.
  it("starts a fresh allowance in the next one-second window", async () => {
    const clock = pinClock(1_800_000_000_000);
    try {
      const app = makeApp();
      for (let i = 0; i < 31; i++) await get(app);
      expect((await get(app)).status).toBe(429);

      clock.mockReturnValue(1_800_000_001_000);
      expect((await get(app)).status).toBe(200);
    } finally {
      clock.mockRestore();
    }
  });

  it("fails open with a warning when Redis errors (ingest does not need Redis)", async () => {
    redisState.fail = true;
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${"k".repeat(48)}`,
        Device_ID: "dragons-1",
      },
    });
    expect(res.status).toBe(200);
    expect(log.warn).toHaveBeenCalled();
  });
});
