import { db } from "../../config/database";
import { notifications } from "@dragons/db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: number;
  recipientId: string;
  channel: string;
  title: string;
  body: string;
  relatedTaskId: number | null;
  relatedBookingId: number | null;
  status: string;
  sentAt: Date | null;
  createdAt: Date;
}

export interface NotificationListResult {
  notifications: NotificationItem[];
  total: number;
}

// ── listNotifications ───────────────────────────────────────────────────────

export async function listNotifications(params: {
  userId: string;
  limit?: number;
  offset?: number;
}): Promise<NotificationListResult> {
  const { userId, limit = 20, offset = 0 } = params;

  const where = eq(notifications.recipientId, userId);

  const [totalRow] = await db
    .select({ count: count() })
    .from(notifications)
    .where(where);

  const rows = await db
    .select({
      id: notifications.id,
      recipientId: notifications.recipientId,
      channel: notifications.channel,
      title: notifications.title,
      body: notifications.body,
      relatedTaskId: notifications.relatedTaskId,
      relatedBookingId: notifications.relatedBookingId,
      status: notifications.status,
      sentAt: notifications.sentAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    notifications: rows,
    total: Number(totalRow!.count),
  };
}

// ── markRead ────────────────────────────────────────────────────────────────

export async function markRead(id: number): Promise<boolean> {
  const [updated] = await db
    .update(notifications)
    .set({ status: "read" })
    .where(eq(notifications.id, id))
    .returning({ id: notifications.id });

  return !!updated;
}

// ── markAllRead ─────────────────────────────────────────────────────────────

export async function markAllRead(userId: string): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ status: "read" })
    .where(
      and(
        eq(notifications.recipientId, userId),
        sql`${notifications.status} != 'read'`,
      ),
    )
    .returning({ id: notifications.id });

  return result.length;
}

// ── getUnreadCount ──────────────────────────────────────────────────────────

export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, userId),
        sql`${notifications.status} != 'read'`,
      ),
    );

  return Number(row!.count);
}
