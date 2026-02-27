import { Hono } from "hono";
import { z } from "zod";
import { db } from "../config/database";
import { pushDevices } from "@dragons/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "../config/auth";

const deviceRoutes = new Hono();

const registerBodySchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
});

// POST /register — Register push notification device token
deviceRoutes.post("/register", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  const { token, platform } = registerBodySchema.parse(await c.req.json());

  await db
    .insert(pushDevices)
    .values({ userId: session.user.id, token, platform })
    .onConflictDoUpdate({
      target: pushDevices.token,
      set: { userId: session.user.id, platform, updatedAt: new Date() },
    });

  return c.json({ success: true });
});

// DELETE /:token — Unregister device token
deviceRoutes.delete("/:token", async (c) => {
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
});

export { deviceRoutes };
