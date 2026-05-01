import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { requireAnyRole } from "../../middleware/rbac";
import {
  getBroadcastConfig,
  loadJoinedMatch,
  setBroadcastLive,
  upsertBroadcastConfig,
} from "../../services/broadcast/config";
import {
  invalidateMatchCache,
  publishBroadcastForDevice,
} from "../../services/broadcast/publisher";
import type { AppEnv } from "../../types";

const adminBroadcastRoutes = new Hono<AppEnv>();

const upsertSchema = z.object({
  deviceId: z.string().min(1),
  matchId: z.number().int().positive().nullable().optional(),
  homeAbbr: z.string().max(8).nullable().optional(),
  guestAbbr: z.string().max(8).nullable().optional(),
  homeColorOverride: z.string().max(20).nullable().optional(),
  guestColorOverride: z.string().max(20).nullable().optional(),
});

const startStopSchema = z.object({ deviceId: z.string().min(1) });

adminBroadcastRoutes.get(
  "/config",
  requireAnyRole("admin"),
  describeRoute({
    description: "Get the broadcast config for a device",
    tags: ["Broadcast"],
    responses: { 200: { description: "Config + joined match" } },
  }),
  async (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
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
  describeRoute({
    description: "Upsert the broadcast config for a device",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid body" },
    },
  }),
  async (c) => {
    const parsed = upsertSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid body", code: "BAD_REQUEST" }, 400);
    }
    const config = await upsertBroadcastConfig(parsed.data);
    invalidateMatchCache(parsed.data.deviceId);
    await publishBroadcastForDevice(parsed.data.deviceId);
    return c.json({ config });
  },
);

adminBroadcastRoutes.post(
  "/start",
  requireAnyRole("admin"),
  describeRoute({
    description: "Set isLive=true",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Started" },
      400: { description: "No match bound" },
    },
  }),
  async (c) => {
    const parsed = startStopSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid body", code: "BAD_REQUEST" }, 400);
    }
    try {
      const config = await setBroadcastLive(parsed.data.deviceId, true);
      await publishBroadcastForDevice(parsed.data.deviceId);
      return c.json({ config });
    } catch (err) {
      return c.json(
        { error: (err as Error).message, code: "BAD_REQUEST" },
        400,
      );
    }
  },
);

adminBroadcastRoutes.post(
  "/stop",
  requireAnyRole("admin"),
  describeRoute({
    description: "Set isLive=false",
    tags: ["Broadcast"],
    responses: { 200: { description: "Stopped" } },
  }),
  async (c) => {
    const parsed = startStopSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid body", code: "BAD_REQUEST" }, 400);
    }
    const config = await setBroadcastLive(parsed.data.deviceId, false);
    await publishBroadcastForDevice(parsed.data.deviceId);
    return c.json({ config });
  },
);

export { adminBroadcastRoutes };
