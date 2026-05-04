import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { env } from "../config/env";
import { redis } from "../config/redis";

const RATE_LIMIT_PER_SECOND = 30;
const RATE_LIMIT_KEY_PREFIX = "rl:ingest:";

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

async function incrementRateLimit(deviceId: string): Promise<number> {
  const window = Math.floor(Date.now() / 1000);
  const key = `${RATE_LIMIT_KEY_PREFIX}${deviceId}:${window}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 2);
  return count;
}

export const requireIngestKey: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header("authorization") ?? "";
  const expected = `Bearer ${env.SCOREBOARD_INGEST_KEY}`;
  if (!constantTimeEquals(auth, expected)) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  const deviceId = c.req.header("device_id") ?? c.req.header("Device_ID");
  if (!deviceId) {
    return c.json(
      { error: "Missing Device_ID header", code: "MISSING_DEVICE_ID" },
      400,
    );
  }
  if (deviceId !== env.SCOREBOARD_DEVICE_ID) {
    return c.json(
      { error: "Unknown device", code: "UNKNOWN_DEVICE_ID" },
      400,
    );
  }

  const count = await incrementRateLimit(deviceId);
  if (count > RATE_LIMIT_PER_SECOND) {
    c.header("Retry-After", "1");
    return c.json({ error: "Rate limited", code: "RATE_LIMITED" }, 429);
  }

  c.set("scoreboardDeviceId" as never, deviceId as never);
  await next();
};
