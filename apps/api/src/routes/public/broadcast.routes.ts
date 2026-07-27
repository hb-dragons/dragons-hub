import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { buildBroadcastState } from "../../services/broadcast/publisher";
import { subscribeBroadcast } from "../../services/scoreboard/pubsub";
import { env } from "../../config/env";
import {
  tryAcquire,
  release,
} from "../../services/scoreboard/connection-cap";
import {
  createSseResponse,
  sseEvent,
} from "../../services/scoreboard/sse-helper";
import { rateLimit } from "../../middleware/rate-limit";
import type { AppEnv } from "../../types";

const publicBroadcastRoutes = new Hono<AppEnv>();

// `/state` is unauthenticated, so every caller shares the "anon" bucket. The
// device allowlist below already pins the endpoint to a single scoreboard, and
// the overlay reads it once per page load with `/stream` carrying the updates,
// so a per-minute ceiling well above normal overlay traffic still stops a
// scripted poll from turning one public GET into unbounded database load.
const STATE_RATE_LIMIT = { limit: 600, windowSeconds: 60, keyPrefix: "public-broadcast-state" };

publicBroadcastRoutes.get(
  "/state",
  rateLimit(STATE_RATE_LIMIT),
  describeRoute({
    description: "Current broadcast state for a device",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Broadcast state" },
      400: { description: "Bad request" },
      404: { description: "Unknown device" },
      429: { description: "Rate limited" },
    },
  }),
  async (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
    }
    // Same allowlist `/stream` enforces: without it any caller could probe
    // broadcast state for arbitrary device ids.
    if (deviceId !== env.SCOREBOARD_DEVICE_ID) {
      return c.json({ error: "Unknown device", code: "UNKNOWN_DEVICE" }, 404);
    }
    const state = await buildBroadcastState(deviceId);
    c.header("Cache-Control", "no-store");
    return c.json(state);
  },
);

publicBroadcastRoutes.get(
  "/stream",
  describeRoute({
    description: "SSE stream of broadcast state changes",
    tags: ["Broadcast"],
    responses: { 200: { description: "text/event-stream" } },
  }),
  async (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
    }
    if (deviceId !== env.SCOREBOARD_DEVICE_ID) {
      return c.json({ error: "Unknown device", code: "UNKNOWN_DEVICE" }, 404);
    }
    if (!tryAcquire(deviceId)) {
      c.header("Retry-After", "5");
      return c.json({ error: "Too many connections", code: "BUSY" }, 503);
    }

    return createSseResponse({
      onClose: () => release(deviceId),
      onStart: async (enqueue, isCancelled) => {
        const initial = await buildBroadcastState(deviceId);
        if (isCancelled()) return undefined;
        enqueue(sseEvent(undefined, "snapshot", initial));

        return subscribeBroadcast(deviceId, (state) => {
          enqueue(sseEvent(undefined, "snapshot", state));
        });
      },
    });
  },
);

export { publicBroadcastRoutes };
