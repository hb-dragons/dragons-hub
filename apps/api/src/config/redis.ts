import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

export function createRedisClient(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

let _redis: Redis | undefined;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
    });

    _redis.on("connect", () => {
      logger.info("Redis connected");
    });

    _redis.on("error", (err) => {
      logger.error({ err }, "Redis connection error");
    });
  }
  return _redis;
}
