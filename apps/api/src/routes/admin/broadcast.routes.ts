import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireAnyRole } from "../../middleware/rbac";
import {
  getBroadcastConfig,
  loadJoinedMatch,
  setBroadcastLive,
  upsertBroadcastConfig,
} from "../../services/broadcast/config";
import { listBroadcastableMatches } from "../../services/broadcast/match-picker";
import {
  invalidateMatchCache,
  publishBroadcastForDevice,
} from "../../services/broadcast/publisher";
import { validationHook } from "../../middleware/validation";
import {
  isConfiguredDevice,
  UNKNOWN_DEVICE_BODY,
} from "../../services/scoreboard/device-allowlist";
import {
  broadcastUpsertSchema,
  broadcastStartStopSchema,
  broadcastMatchesQuerySchema,
  scoreboardDeviceQuerySchema,
} from "@dragons/contracts";
import type { AppEnv } from "../../types";

const adminBroadcastRoutes = new Hono<AppEnv>();

adminBroadcastRoutes.get(
  "/config",
  requireAnyRole("admin"),
  validator("query", scoreboardDeviceQuerySchema, validationHook),
  describeRoute({
    description: "Get the broadcast config for a device",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Config + joined match" },
      400: { description: "Invalid query" },
      404: { description: "Unknown device" },
    },
  }),
  async (c) => {
    const { deviceId } = c.req.valid("query");
    if (!isConfiguredDevice(deviceId)) {
      return c.json(UNKNOWN_DEVICE_BODY, 404);
    }
    const config = await getBroadcastConfig(deviceId);
    const match = config
      ? await loadJoinedMatch({
          matchId: config.matchId,
          homeAbbr: config.homeAbbr,
          guestAbbr: config.guestAbbr,
          homeColorOverride: config.homeColorOverride,
          guestColorOverride: config.guestColorOverride,
        })
      : null;
    return c.json({ config, match });
  },
);

adminBroadcastRoutes.put(
  "/config",
  requireAnyRole("admin"),
  validator("json", broadcastUpsertSchema, validationHook),
  describeRoute({
    description: "Upsert the broadcast config for a device",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid body" },
      404: { description: "Unknown device" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    if (!isConfiguredDevice(body.deviceId)) {
      return c.json(UNKNOWN_DEVICE_BODY, 404);
    }
    const config = await upsertBroadcastConfig(body);
    invalidateMatchCache(body.deviceId);
    await publishBroadcastForDevice(body.deviceId);
    return c.json({ config });
  },
);

adminBroadcastRoutes.post(
  "/start",
  requireAnyRole("admin"),
  validator("json", broadcastStartStopSchema, validationHook),
  describeRoute({
    description: "Set isLive=true",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Started" },
      400: { description: "No match bound" },
      404: { description: "Unknown device" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    if (!isConfiguredDevice(body.deviceId)) {
      return c.json(UNKNOWN_DEVICE_BODY, 404);
    }
    // BroadcastError carries its own status; middleware/error.ts maps it.
    const config = await setBroadcastLive(body.deviceId, true);
    await publishBroadcastForDevice(body.deviceId);
    return c.json({ config });
  },
);

adminBroadcastRoutes.post(
  "/stop",
  requireAnyRole("admin"),
  validator("json", broadcastStartStopSchema, validationHook),
  describeRoute({
    description: "Set isLive=false",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Stopped" },
      404: { description: "Unknown device" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    if (!isConfiguredDevice(body.deviceId)) {
      return c.json(UNKNOWN_DEVICE_BODY, 404);
    }
    const config = await setBroadcastLive(body.deviceId, false);
    await publishBroadcastForDevice(body.deviceId);
    return c.json({ config });
  },
);

adminBroadcastRoutes.get(
  "/matches",
  requireAnyRole("admin"),
  validator("query", broadcastMatchesQuerySchema, validationHook),
  describeRoute({
    description: "Own-club matches available for broadcast binding",
    tags: ["Broadcast"],
    responses: { 200: { description: "List of matches" } },
  }),
  async (c) => {
    const { q, scope } = c.req.valid("query");
    return c.json({ matches: await listBroadcastableMatches({ q, scope }) });
  },
);

export { adminBroadcastRoutes };
