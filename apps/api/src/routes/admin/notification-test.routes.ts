import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requirePermission } from "../../middleware/rbac";
import { rateLimit } from "../../middleware/rate-limit";
import { validationHook } from "../../middleware/validation";
import {
  sendAdminTestPush,
  listRecentTestPushes,
} from "../../services/notifications/test-push.service";
import type { AppEnv } from "../../types";
import { notificationTestSendBodySchema } from "@dragons/contracts";

const notificationTestRoutes = new Hono<AppEnv>();
const settingsUpdate = requirePermission("settings", "update");

notificationTestRoutes.post(
  "/notifications/test-push",
  // Ordering matters both ways: `settingsUpdate` must run before `rateLimit`
  // because rate-limit.ts reads c.get("user") to key the bucket per caller —
  // swapping them would bucket every unauthenticated caller as "anon" and
  // share one global cooldown. `validator` must run before `rateLimit` because
  // this route's window is `limit: 1` — a malformed body that increments the
  // counter before validation rejects it would burn the caller's only slot on
  // a request that never sent a real test push, 429ing their next, valid, one.
  settingsUpdate,
  validator("json", notificationTestSendBodySchema, validationHook),
  rateLimit({ limit: 1, windowSeconds: 10, keyPrefix: "test-push" }),
  describeRoute({
    description:
      "Send a test push notification to the calling admin's own devices",
    tags: ["Admin", "Notifications"],
    responses: {
      200: { description: "Test push sent" },
      400: { description: "No devices registered" },
      401: { description: "Unauthorized" },
      403: { description: "Admin role required" },
      429: { description: "Rate limited" },
    },
  }),
  async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    const { message } = c.req.valid("json");
    return c.json(await sendAdminTestPush({ callerId: user.id, message }));
  },
);

notificationTestRoutes.get(
  "/notifications/test-push/recent",
  settingsUpdate,
  describeRoute({
    description: "Recent test push results for the calling admin",
    tags: ["Admin", "Notifications"],
    responses: { 200: { description: "Recent test pushes" } },
  }),
  async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    return c.json({ results: await listRecentTestPushes(user.id) });
  },
);

export { notificationTestRoutes };
