import { Hono } from "hono";
import { and, desc, eq, gt } from "drizzle-orm";
import { describeRoute, validator } from "hono-openapi";
import { requireAnyRole } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import { db } from "../../config/database";
import {
  liveScoreboards,
  scoreboardSnapshots,
} from "@dragons/db/schema";
import {
  computeSecondsSince,
  SCOREBOARD_ONLINE_THRESHOLD_MS,
} from "../../services/scoreboard/constants";
import { scoreboardListQuerySchema } from "@dragons/contracts";
import type { AppEnv } from "../../types";

const adminScoreboardRoutes = new Hono<AppEnv>();

adminScoreboardRoutes.get(
  "/snapshots",
  requireAnyRole("admin"),
  validator("query", scoreboardListQuerySchema, validationHook),
  describeRoute({
    description: "Recent decoded snapshots for a device",
    tags: ["Scoreboard"],
    responses: {
      200: { description: "Snapshots" },
      400: { description: "Bad request" },
    },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const where =
      query.afterId !== undefined
        ? and(
            eq(scoreboardSnapshots.deviceId, query.deviceId),
            gt(scoreboardSnapshots.id, query.afterId),
          )
        : eq(scoreboardSnapshots.deviceId, query.deviceId);
    const rows = await db
      .select()
      .from(scoreboardSnapshots)
      .where(where)
      .orderBy(desc(scoreboardSnapshots.id))
      .limit(query.limit);
    return c.json(rows);
  },
);

adminScoreboardRoutes.get(
  "/health",
  requireAnyRole("admin"),
  describeRoute({
    description: "Connection health for the scoreboard ingest",
    tags: ["Scoreboard"],
    responses: { 200: { description: "Health" } },
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
      return c.json({
        deviceId,
        lastFrameAt: null,
        secondsSinceLastFrame: null,
        online: false,
      });
    }
    const row = rows[0]!;
    const secondsSinceLastFrame = computeSecondsSince(row.lastFrameAt);
    return c.json({
      deviceId,
      lastFrameAt: row.lastFrameAt,
      secondsSinceLastFrame,
      online: secondsSinceLastFrame * 1000 < SCOREBOARD_ONLINE_THRESHOLD_MS,
    });
  },
);

export { adminScoreboardRoutes };
