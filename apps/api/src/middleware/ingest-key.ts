import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { env } from "../config/env";

const RATE_LIMIT_PER_SECOND = 30;
const counters = new Map<string, { window: number; count: number }>();

export function __resetRateLimitForTest(): void {
  counters.clear();
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
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

  const window = Math.floor(Date.now() / 1000);
  const key = `${deviceId}:${window}`;
  const slot = counters.get(key) ?? { window, count: 0 };
  slot.count += 1;
  counters.set(key, slot);
  if (counters.size > 1024) {
    for (const [k, v] of counters) {
      if (v.window < window - 1) counters.delete(k);
    }
  }
  if (slot.count > RATE_LIMIT_PER_SECOND) {
    c.header("Retry-After", "1");
    return c.json({ error: "Rate limited", code: "RATE_LIMITED" }, 429);
  }

  c.set("scoreboardDeviceId" as never, deviceId as never);
  await next();
};
