import type { MiddlewareHandler } from "hono";
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
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, opts.windowSeconds);
    }
    if (count > opts.limit) {
      c.header("Retry-After", String(opts.windowSeconds));
      return c.json({ error: "Too many requests", code: "RATE_LIMITED" }, 429);
    }
    await next();
  };
}
