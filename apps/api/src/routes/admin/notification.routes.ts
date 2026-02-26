import { Hono } from "hono";
import {
  listNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
} from "../../services/admin/notification-admin.service";
import {
  notificationIdParamSchema,
  notificationListQuerySchema,
  notificationUserIdQuerySchema,
} from "./notification.schemas";

const notificationRoutes = new Hono();

// GET /admin/notifications - List notifications for a user
notificationRoutes.get("/notifications", async (c) => {
  const query = notificationListQuerySchema.parse(c.req.query());
  const result = await listNotifications(query);
  return c.json(result);
});

// PATCH /admin/notifications/:id/read - Mark one notification as read
notificationRoutes.patch("/notifications/:id/read", async (c) => {
  const { id } = notificationIdParamSchema.parse({ id: c.req.param("id") });
  const success = await markRead(id);

  if (!success) {
    return c.json({ error: "Notification not found", code: "NOT_FOUND" }, 404);
  }

  return c.json({ success: true });
});

// PATCH /admin/notifications/read-all - Mark all user's notifications as read
notificationRoutes.patch("/notifications/read-all", async (c) => {
  const { userId } = notificationUserIdQuerySchema.parse(c.req.query());
  const count = await markAllRead(userId);
  return c.json({ updated: count });
});

// GET /admin/notifications/unread-count - Unread count for a user
notificationRoutes.get("/notifications/unread-count", async (c) => {
  const { userId } = notificationUserIdQuerySchema.parse(c.req.query());
  const count = await getUnreadCount(userId);
  return c.json({ count });
});

export { notificationRoutes };
