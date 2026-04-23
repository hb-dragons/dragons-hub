import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { db } from "../config/database";
import { pushDevices } from "@dragons/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "../config/auth";

const deviceRoutes = new Hono();

const registerBodySchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  locale: z.string().min(2).max(15).optional(),
});

// POST /register — Register push notification device token
deviceRoutes.post(
  "/register",
  describeRoute({
    description: "Register push notification device token",
    tags: ["Devices"],
    responses: {
      200: { description: "Device registered" },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }

    const { token, platform, locale } = registerBodySchema.parse(await c.req.json());

    await db
      .insert(pushDevices)
      .values({ userId: session.user.id, token, platform, locale })
      .onConflictDoUpdate({
        target: pushDevices.token,
        set: {
          userId: session.user.id,
          platform,
          locale,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      });

    return c.json({ success: true });
  },
);

// DELETE /:token — Unregister device token
deviceRoutes.delete(
  "/:token",
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

    const token = c.req.param("token");
    await db
      .delete(pushDevices)
      .where(
        and(eq(pushDevices.token, token), eq(pushDevices.userId, session.user.id)),
      );

    return c.json({ success: true });
  },
);

export { deviceRoutes };
