import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { getDb } from "../config/database";
import { pushDevices } from "@dragons/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "../config/auth";
import { deviceRegisterBodySchema } from "@dragons/contracts";
import { validationHook } from "../middleware/validation";
import { logger } from "../config/logger";

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
    if (!session) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }

    const { token, platform, locale } = c.req.valid("json");

    // Possession of an Expo push token is not proof of ownership — the token is
    // treated as a secret elsewhere (redacted from log paths, masked in test-push
    // responses), so it must not be sufficient to move a device between accounts.
    // `setWhere` folds the ownership check into the upsert, so concurrent
    // registrations cannot race past it: a conflicting row owned by someone else
    // updates nothing and returns no row. The rightful owner reclaims the token
    // by unregistering it (DELETE /:token), which is the client's logout path.
    const [row] = await getDb()
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
        setWhere: eq(pushDevices.userId, session.user.id),
      })
      .returning({ id: pushDevices.id });

    if (!row) {
      // Token deliberately omitted from the log line: it is a credential-grade
      // value, and the rejected caller already holds it.
      logger.warn(
        { userId: session.user.id, platform },
        "Rejected push device registration: token is registered to another user",
      );
      return c.json(
        {
          error: "Push token is registered to a different account",
          code: "TOKEN_OWNED_BY_ANOTHER_USER",
        },
        409,
      );
    }

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
    await getDb()
      .delete(pushDevices)
      .where(
        and(eq(pushDevices.token, token), eq(pushDevices.userId, session.user.id)),
      );

    return c.json({ success: true });
  },
);

export { deviceRoutes };
