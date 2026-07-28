import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireAnyRole } from "../../middleware/rbac";
import { validationHook } from "../../middleware/validation";
import {
  listSnapshots,
  getDeviceHealth,
} from "../../services/scoreboard/live-snapshot";
import {
  scoreboardListQuerySchema,
  scoreboardDeviceQuerySchema,
} from "@dragons/contracts";
import {
  isConfiguredDevice,
  UNKNOWN_DEVICE_BODY,
} from "../../services/scoreboard/device-allowlist";
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
      404: { description: "Unknown device" },
    },
  }),
  async (c) => {
    const query = c.req.valid("query");
    if (!isConfiguredDevice(query.deviceId)) {
      return c.json(UNKNOWN_DEVICE_BODY, 404);
    }
    const rows = await listSnapshots(query);
    return c.json(rows);
  },
);

adminScoreboardRoutes.get(
  "/health",
  requireAnyRole("admin"),
  validator("query", scoreboardDeviceQuerySchema, validationHook),
  describeRoute({
    description: "Connection health for the scoreboard ingest",
    tags: ["Scoreboard"],
    responses: {
      200: { description: "Health" },
      400: { description: "Bad request" },
      404: { description: "Unknown device" },
    },
  }),
  async (c) => {
    const { deviceId } = c.req.valid("query");
    if (!isConfiguredDevice(deviceId)) {
      return c.json(UNKNOWN_DEVICE_BODY, 404);
    }
    const health = await getDeviceHealth(deviceId);
    return c.json(health);
  },
);

export { adminScoreboardRoutes };
