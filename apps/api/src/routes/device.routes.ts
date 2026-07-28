import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { auth } from "../config/auth";
import { deviceRegisterBodySchema, deviceTokenParamSchema } from "@dragons/contracts";
import { validationHook } from "../middleware/validation";
import {
  registerPushDevice,
  unregisterPushDevice,
} from "../services/notifications/push-device.service";

const deviceRoutes = new Hono();

// POST /register — Register push notification device token
deviceRoutes.post(
  "/register",
  validator("json", deviceRegisterBodySchema, validationHook),
  describeRoute({
    description: "Register push notification device token",
    tags: ["Devices"],
    responses: {
      200: { description: "Device registered" },
      401: { description: "Unauthorized" },
      409: { description: "Token registered to a different account" },
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    const { token, platform, locale } = c.req.valid("json");
    await registerPushDevice({ userId: session.user.id, token, platform, locale });
    return c.json({ success: true });
  },
);

// DELETE /:token — Unregister device token
deviceRoutes.delete(
  "/:token",
  validator("param", deviceTokenParamSchema, validationHook),
  describeRoute({
    description: "Unregister device token",
    tags: ["Devices"],
    responses: {
      200: { description: "Device unregistered" },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }

    const { token } = c.req.valid("param");
    await unregisterPushDevice(session.user.id, token);

    return c.json({ success: true });
  },
);

export { deviceRoutes };
