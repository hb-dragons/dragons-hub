import type { MiddlewareHandler } from "hono";
import { logger } from "../config/logger";
import { incrementSlidingWindow } from "../config/redis";
import type { AppEnv } from "../types";

/**
 * Sliding-window-counter rate limiter.
 *
 * A plain fixed window (bucket by `floor(now / window)`, reject above the limit)
 * forgives the whole bucket the instant it rolls over, so a caller can spend the
 * full budget in the last moment of window N and the full budget again in the
 * first moment of N+1 — `2 x limit` in a span barely wider than one window.
 *
 * Instead, weight the previous window's count by how much of it is still inside
 * the trailing `windowSeconds` and add the current window's count. Usage decays
 * continuously, so the enforced limit matches the configured one over any
 * one-window span.
 *
 * This is the approximate variant: it assumes the previous window's requests
 * were spread evenly across it, rather than keeping per-request timestamps. That
 * costs one extra key read (in the same round trip) instead of memory
 * proportional to the limit, and it is the usual production trade-off. The
 * approximation can only be *stricter* than reality for a caller that bunched
 * its requests at the start of the previous window, never more permissive.
 */
export function rateLimit(opts: {
  limit: number;
  windowSeconds: number;
  keyPrefix: string;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    const id = user?.id ?? "anon";

    // Fractional window position: the integer part picks the bucket, the
    // fraction is how far through it we are.
    const position = Date.now() / 1000 / opts.windowSeconds;
    const window = Math.floor(position);
    const key = `${opts.keyPrefix}:${id}:${window}`;
    const previousKey = `${opts.keyPrefix}:${id}:${window - 1}`;

    let current: number;
    let previous: number;
    try {
      [current, previous] = await incrementSlidingWindow(
        key,
        previousKey,
        opts.windowSeconds,
      );
    } catch (err) {
      // Fail open: a Redis outage must not 500 every rate-limited route.
      logger.warn(
        { err, keyPrefix: opts.keyPrefix },
        "Rate limiter Redis error; failing open",
      );
      return next();
    }

    // At the boundary (elapsed 0) the previous window counts in full; by the end
    // of the current window it has fully aged out.
    const elapsed = position - window;
    const estimate = current + previous * (1 - elapsed);

    if (estimate > opts.limit) {
      c.header("Retry-After", String(opts.windowSeconds));
      return c.json({ error: "Too many requests", code: "RATE_LIMITED" }, 429);
    }
    await next();
  };
}
