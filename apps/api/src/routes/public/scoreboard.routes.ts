import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { describeRoute } from "hono-openapi";
import { db } from "../../config/database";
import { liveScoreboards } from "@dragons/db/schema";
import { createScoreboardStream } from "../../services/scoreboard/sse";
import { env } from "../../config/env";
import { tryAcquire, release } from "../../services/scoreboard/connection-cap";

const publicScoreboardRoutes = new Hono();

publicScoreboardRoutes.get(
  "/latest",
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
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
    }
    const rows = await db
      .select()
      .from(liveScoreboards)
      .where(eq(liveScoreboards.deviceId, deviceId))
      .limit(1);
    if (rows.length === 0) {
      return c.json({ error: "No data", code: "NO_DATA" }, 404);
    }
    const row = rows[0]!; // length checked above
    const secondsSinceLastFrame = Math.max(
      0,
      Math.floor((Date.now() - new Date(row.lastFrameAt).getTime()) / 1000),
    );
    c.header("Cache-Control", "no-store");
    return c.json({ ...row, secondsSinceLastFrame });
  },
);

publicScoreboardRoutes.get(
  "/stream",
  describeRoute({
    description: "Server-Sent Events stream of decoded snapshots",
    tags: ["Scoreboard"],
    responses: { 200: { description: "text/event-stream" } },
  }),
  (c) => {
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
    const lastHeader = c.req.header("Last-Event-ID");
    const parsed = lastHeader ? Number.parseInt(lastHeader, 10) : Number.NaN;
    const lastEventId = Number.isFinite(parsed) ? parsed : undefined;
    return createScoreboardStream({
      deviceId,
      lastEventId,
      onClose: () => release(deviceId),
    });
  },
);

export { publicScoreboardRoutes };
