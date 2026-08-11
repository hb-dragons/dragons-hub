/**
 * The load-bearing regression test for the "fail open is unreachable" defect.
 *
 * `rate-limit.test.ts` mocks `getRedis()` into rejecting. That proves what the
 * catch block *contains*, but nothing about whether the catch is ever reached —
 * and the defect was that it never was. With `maxRetriesPerRequest: null` plus
 * ioredis' default offline queue, a command issued while Redis is unreachable is
 * buffered indefinitely: it neither resolves nor rejects, so the middleware
 * never returns and the request hangs until the client or load balancer gives up.
 *
 * So this test drives the *real* ioredis client built by the real
 * `config/redis.ts`, pointed at 127.0.0.1:1 — a port nothing can be listening on
 * without root, so every connect attempt gets an immediate ECONNREFUSED. That
 * puts the client in exactly the state a real outage does (disconnected,
 * retrying, offline queue filling) without going near the shared dev Redis.
 *
 * The assertion is on *bounded return*, not on the log line: if the request-path
 * client ever regresses to `maxRetriesPerRequest: null`, the middleware stops
 * returning at all and this test fails on the deadline.
 */
import { describe, expect, it, vi, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../types";

const log = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("../config/logger", () => ({ logger: log }));

// Nothing can bind :1 without root, so connects fail instantly and repeatably.
vi.stubEnv("REDIS_URL", "redis://127.0.0.1:1");

// Generous enough that a slow CI box won't flake, far below the ~forever that
// the buggy config produces (and below vitest's 5s per-test timeout, so a
// regression fails on this assertion with a clear message rather than a timeout).
const DEADLINE_MS = 3000;

const HUNG = Symbol("hung");

function deadline(ms: number): { race: Promise<typeof HUNG>; cancel: () => void } {
  let timer: NodeJS.Timeout;
  const race = new Promise<typeof HUNG>((resolve) => {
    timer = setTimeout(() => resolve(HUNG), ms);
  });
  return { race, cancel: () => clearTimeout(timer) };
}

afterAll(async () => {
  const { getRedis } = await import("../config/redis");
  // disconnect(), not quit(): the client never connected, so there is no
  // connection to close gracefully — this just kills the reconnect timers.
  getRedis().disconnect();
});

describe("rateLimit against an unreachable Redis", () => {
  it("returns a response within a bounded time instead of hanging", async () => {
    const { rateLimit } = await import("./rate-limit");

    const app = new Hono<AppEnv>();
    app.post(
      "/x",
      rateLimit({ limit: 2, windowSeconds: 60, keyPrefix: "qa" }),
      (c) => c.json({ ok: true }),
    );

    const { race, cancel } = deadline(DEADLINE_MS);
    const started = Date.now();
    const outcome = await Promise.race([
      app.request("/x", { method: "POST" }),
      race,
    ]);
    cancel();

    expect(
      outcome,
      `rateLimit did not return within ${DEADLINE_MS}ms with Redis unreachable — ` +
        "the request-path Redis client is queuing commands forever instead of " +
        "rejecting them, so the fail-open catch is unreachable",
    ).not.toBe(HUNG);

    // Fail open: the route is served, not 429'd and not 500'd.
    const res = outcome as Response;
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    // And the warning the middleware claims to log is actually logged.
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ keyPrefix: "qa" }),
      expect.stringContaining("failing open"),
    );

    expect(Date.now() - started).toBeLessThan(DEADLINE_MS);
  });
});
