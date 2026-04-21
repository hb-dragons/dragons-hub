import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import {
  listNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
  retryFailedNotification,
} from "../../services/admin/notification-admin.service";
import { requirePermission } from "../../middleware/rbac";
import type { AppEnv } from "../../types";
import {
  notificationIdParamSchema,
  notificationListQuerySchema,
  notificationUserIdQuerySchema,
} from "./notification.schemas";

const notificationRoutes = new Hono<AppEnv>();
notificationRoutes.use("*", requirePermission("settings", "update"));

// GET /admin/notifications - List notifications for a user
notificationRoutes.get(
  "/notifications",
  describeRoute({
    description: "List notifications for a user from the notification log",
    tags: ["Notifications"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = notificationListQuerySchema.parse(c.req.query());
    const result = await listNotifications(query);
    return c.json(result);
  },
);

// PATCH /admin/notifications/:id/read - Mark one notification as read
notificationRoutes.patch(
  "/notifications/:id/read",
  describeRoute({
    description: "Mark one notification as read",
    tags: ["Notifications"],
    responses: {
      200: { description: "Success" },
      404: { description: "Notification not found" },
    },
  }),
  async (c) => {
    const { id } = notificationIdParamSchema.parse({ id: c.req.param("id") });
    const success = await markRead(id);

    if (!success) {
      return c.json(
        { error: "Notification not found", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json({ success: true });
  },
);

// PATCH /admin/notifications/read-all - Mark all user's notifications as read
notificationRoutes.patch(
  "/notifications/read-all",
  describeRoute({
    description: "Mark all user notifications as read",
    tags: ["Notifications"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = c.req.query();
    const userId = query.userId || undefined;
    const count = await markAllRead(userId);
    return c.json({ updated: count });
  },
);

// GET /admin/notifications/unread-count - Unread count for a user
notificationRoutes.get(
  "/notifications/unread-count",
  describeRoute({
    description: "Get unread count for a user",
    tags: ["Notifications"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const { userId } = notificationUserIdQuerySchema.parse(c.req.query());
    const count = await getUnreadCount(userId);
    return c.json({ count });
  },
);

// POST /admin/notifications/:id/retry - Retry a failed notification
notificationRoutes.post(
  "/notifications/:id/retry",
  describeRoute({
    description: "Retry a failed notification delivery",
    tags: ["Notifications"],
    responses: {
      200: { description: "Retry succeeded" },
      400: { description: "Cannot retry (not in failed state)" },
      404: { description: "Notification not found" },
    },
  }),
  async (c) => {
    const { id } = notificationIdParamSchema.parse({ id: c.req.param("id") });
    const result = await retryFailedNotification(id);

    if (!result.success && result.error === "Notification not found") {
      return c.json({ error: result.error, code: "NOT_FOUND" }, 404);
    }

    if (!result.success) {
      return c.json({ error: result.error, code: "RETRY_FAILED" }, 400);
    }

    return c.json({ success: true });
  },
);

export { notificationRoutes };
