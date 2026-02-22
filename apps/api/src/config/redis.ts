import Redis from "ioredis";
import { env } from "./env";

let _redis: Redis | undefined;

export const redis: Redis = new Proxy({} as Redis, {
  get(_target, prop) {
    if (!_redis) {
      _redis = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null, // Required by BullMQ
      });

      _redis.on("connect", () => {
        console.log("[Redis] Connected");
      });

      _redis.on("error", (err) => {
        console.error("[Redis] Connection error:", err.message);
      });
    }
    return (_redis as unknown as Record<string | symbol, unknown>)[prop];
  },
});
