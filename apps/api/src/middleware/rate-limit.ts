import type { MiddlewareHandler } from "hono";
import { logger } from "../config/logger";
import { getRedis } from "../config/redis";
import type { AppEnv } from "../types";

export function rateLimit(opts: {
  limit: number;
  windowSeconds: number;
  keyPrefix: string;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    const id = user?.id ?? "anon";
    const window = Math.floor(Date.now() / 1000 / opts.windowSeconds);
    const key = `${opts.keyPrefix}:${id}:${window}`;

    let count: number;
    try {
      const redis = getRedis();
      count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, opts.windowSeconds);
      }
    } catch (err) {
      // Fail open: a Redis outage must not 500 every rate-limited route.
      logger.warn(
        { err, keyPrefix: opts.keyPrefix },
        "Rate limiter Redis error; failing open",
      );
      return next();
    }

    if (count > opts.limit) {
      c.header("Retry-After", String(opts.windowSeconds));
      return c.json({ error: "Too many requests", code: "RATE_LIMITED" }, 429);
    }
    await next();
  };
}
