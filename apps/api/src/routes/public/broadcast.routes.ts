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

const publicBroadcastRoutes = new Hono();

publicBroadcastRoutes.get(
  "/state",
  describeRoute({
    description: "Current broadcast state for a device",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Broadcast state" },
      400: { description: "Bad request" },
    },
  }),
  async (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
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
