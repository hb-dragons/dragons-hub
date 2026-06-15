import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../types";

const m = vi.hoisted(() => ({ incr: vi.fn(), expire: vi.fn() }));
vi.mock("../config/redis", () => ({ getRedis: () => ({ incr: m.incr, expire: m.expire }) }));

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

  it("allows requests under the limit and sets TTL on the first hit", async () => {
    m.incr.mockResolvedValue(1);
    const res = await makeApp().request("/x", { method: "POST" });
    expect(res.status).toBe(200);
    expect(m.expire).toHaveBeenCalledWith(expect.stringContaining("qa:u1:"), 60);
  });

  it("returns 429 with Retry-After when over the limit", async () => {
    m.incr.mockResolvedValue(3);
    const res = await makeApp().request("/x", { method: "POST" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" });
  });
});
