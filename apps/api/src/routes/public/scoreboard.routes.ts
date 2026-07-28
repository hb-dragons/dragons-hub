import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { validationHook } from "../../middleware/validation";
import { getLatestSnapshot } from "../../services/scoreboard/live-snapshot";
import { createScoreboardStream } from "../../services/scoreboard/sse";
import {
  isConfiguredDevice,
  UNKNOWN_DEVICE_BODY,
} from "../../services/scoreboard/device-allowlist";
import { tryAcquire, release } from "../../services/scoreboard/connection-cap";
import { computeSecondsSince } from "../../services/scoreboard/constants";
import {
  scoreboardLastEventIdSchema,
  scoreboardDeviceQuerySchema,
} from "@dragons/contracts";

const publicScoreboardRoutes = new Hono();

publicScoreboardRoutes.get(
  "/latest",
  validator("query", scoreboardDeviceQuerySchema, validationHook),
  describeRoute({
    description: "Latest decoded snapshot for a device",
    tags: ["Scoreboard"],
    responses: {
      200: { description: "Snapshot" },
      400: { description: "Bad request" },
      404: { description: "No data" },
    },
  }),
  async (c) => {
    const { deviceId } = c.req.valid("query");
    const row = await getLatestSnapshot(deviceId);
    if (!row) return c.json({ error: "No data", code: "NO_DATA" }, 404);
    c.header("Cache-Control", "no-store");
    return c.json({
      ...row,
      secondsSinceLastFrame: computeSecondsSince(row.lastFrameAt),
    });
  },
);

publicScoreboardRoutes.get(
  "/stream",
  validator("query", scoreboardDeviceQuerySchema, validationHook),
  describeRoute({
    description: "Server-Sent Events stream of decoded snapshots",
    tags: ["Scoreboard"],
    responses: { 200: { description: "text/event-stream" } },
  }),
  (c) => {
    const { deviceId } = c.req.valid("query");
    if (!isConfiguredDevice(deviceId)) {
      return c.json(UNKNOWN_DEVICE_BODY, 404);
    }
    if (!tryAcquire(deviceId)) {
      c.header("Retry-After", "5");
      return c.json({ error: "Too many connections", code: "BUSY" }, 503);
    }
    // Parse the SSE reconnection header through the contract schema. It
    // `.catch(undefined)`s, so a malformed header degrades to a fresh stream
    // rather than rejecting the reconnection.
    const lastEventId = scoreboardLastEventIdSchema.parse(
      c.req.header("Last-Event-ID"),
    );
    return createScoreboardStream({
      deviceId,
      lastEventId,
      onClose: () => release(deviceId),
    });
  },
);

export { publicScoreboardRoutes };
