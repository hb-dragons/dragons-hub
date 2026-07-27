import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../types";

const m = vi.hoisted(() => ({ incrementWithTtl: vi.fn() }));
vi.mock("../config/redis", () => ({
  incrementWithTtl: (...args: unknown[]) => m.incrementWithTtl(...args),
}));

const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("../config/logger", () => ({ logger: log }));

// --- Imports (after mocks) ---
import { rateLimit } from "./rate-limit";

function makeApp() {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "u1" } as never);
    await next();
  });
  app.post("/x", rateLimit({ limit: 2, windowSeconds: 60, keyPrefix: "qa" }), (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows requests under the limit", async () => {
    m.incrementWithTtl.mockResolvedValue(1);
    const res = await makeApp().request("/x", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("returns 429 with Retry-After when over the limit", async () => {
    m.incrementWithTtl.mockResolvedValue(3);
    const res = await makeApp().request("/x", { method: "POST" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("fails open with a warning when Redis errors", async () => {
    m.incrementWithTtl.mockRejectedValue(new Error("redis down"));
    const res = await makeApp().request("/x", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(log.warn).toHaveBeenCalled();
  });

  // The counter and its TTL travel in one atomic call (see config/redis.ts);
  // the middleware's job is to hand it the window key and the window length.
  it("counts against a per-user, per-window key with the window as its TTL", async () => {
    m.incrementWithTtl.mockResolvedValue(1);
    await makeApp().request("/x", { method: "POST" });

    expect(m.incrementWithTtl).toHaveBeenCalledTimes(1);
    expect(m.incrementWithTtl).toHaveBeenCalledWith(
      expect.stringMatching(/^qa:u1:\d+$/),
      60,
    );
  });

  it("buckets anonymous callers under a shared key", async () => {
    m.incrementWithTtl.mockResolvedValue(1);
    const app = new Hono<AppEnv>();
    app.post("/x", rateLimit({ limit: 2, windowSeconds: 60, keyPrefix: "qa" }), (c) => c.json({ ok: true }));
    await app.request("/x", { method: "POST" });

    expect(m.incrementWithTtl).toHaveBeenCalledWith(
      expect.stringMatching(/^qa:anon:\d+$/),
      60,
    );
  });
});
