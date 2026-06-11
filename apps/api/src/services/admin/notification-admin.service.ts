import { getDb } from "../../config/database";
import { notificationLog, domainEvents, user } from "@dragons/db/schema";
import { eq, and, desc, count, ne, inArray } from "drizzle-orm";
import { parseRoles } from "@dragons/shared";
import { renderEventMessage } from "../notifications/templates/index";
import { logger } from "../../config/logger";

/**
 * The recipient keys that address a given user, mirroring how the pipeline
 * writes notification_log.recipient_id (user:<id>, referee:<id>, audience:<role>).
 * Inbox reads/writes must match against this SET, not the bare user id.
 */
export async function recipientKeysForUserId(userId: string): Promise<string[]> {
  const keys = [`user:${userId}`];
  const [u] = await getDb()
    .select({ refereeId: user.refereeId, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (u?.refereeId != null) keys.push(`referee:${u.refereeId}`);
  for (const role of parseRoles(u?.role)) keys.push(`audience:${role}`);
  return keys;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface NotificationCenterItem {
  id: number;
  eventId: string;
  watchRuleId: number | null;
  channelConfigId: number;
  recipientId: string | null;
  title: string;
  body: string;
  locale: string;
  status: string;
  sentAt: string | null;
  readAt: string | null;
  digestRunId: number | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  // Joined from domain_events
  eventType: string;
  entityName: string;
  entityType: string;
  entityId: number;
  deepLinkPath: string;
  urgency: string;
}

export interface NotificationCenterListResult {
  notifications: NotificationCenterItem[];
  total: number;
}

// ── listNotifications ───────────────────────────────────────────────────────

export async function listNotifications(params: {
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<NotificationCenterListResult> {
  const { userId, limit = 20, offset = 0 } = params;

  // userId scopes to that user's recipient keys; omitting it returns the whole
  // log (admin monitoring view).
  const where = userId
    ? inArray(notificationLog.recipientId, await recipientKeysForUserId(userId))
    : undefined;

  const [totalRow] = await getDb()
    .select({ count: count() })
    .from(notificationLog)
    .where(where);

  const rows = await getDb()
    .select({
      id: notificationLog.id,
      eventId: notificationLog.eventId,
      watchRuleId: notificationLog.watchRuleId,
      channelConfigId: notificationLog.channelConfigId,
      recipientId: notificationLog.recipientId,
      title: notificationLog.title,
      body: notificationLog.body,
      locale: notificationLog.locale,
      status: notificationLog.status,
      sentAt: notificationLog.sentAt,
      readAt: notificationLog.readAt,
      digestRunId: notificationLog.digestRunId,
      errorMessage: notificationLog.errorMessage,
      retryCount: notificationLog.retryCount,
      createdAt: notificationLog.createdAt,
      eventType: domainEvents.type,
      entityName: domainEvents.entityName,
      entityType: domainEvents.entityType,
      entityId: domainEvents.entityId,
      deepLinkPath: domainEvents.deepLinkPath,
      urgency: domainEvents.urgency,
    })
    .from(notificationLog)
    .innerJoin(domainEvents, eq(notificationLog.eventId, domainEvents.id))
    .where(where)
    .orderBy(desc(notificationLog.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    notifications: rows.map((r) => ({
      ...r,
      recipientId: r.recipientId,
      sentAt: r.sentAt?.toISOString() ?? null,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total: Number(totalRow!.count),
  };
}

// ── markRead ────────────────────────────────────────────────────────────────

export async function markRead(id: number, userId: string): Promise<boolean> {
  const keys = await recipientKeysForUserId(userId);
  const [updated] = await getDb()
    .update(notificationLog)
    .set({ status: "read", readAt: new Date() })
    .where(
      and(
        eq(notificationLog.id, id),
        inArray(notificationLog.recipientId, keys),
      ),
    )
    .returning({ id: notificationLog.id });

  return !!updated;
}

// ── markAllRead ─────────────────────────────────────────────────────────────

export async function markAllRead(userId: string): Promise<number> {
  const keys = await recipientKeysForUserId(userId);
  const result = await getDb()
    .update(notificationLog)
    .set({ status: "read", readAt: new Date() })
    .where(
      and(
        ne(notificationLog.status, "read"),
        inArray(notificationLog.recipientId, keys),
      ),
    )
    .returning({ id: notificationLog.id });

  return result.length;
}

// ── getUnreadCount ──────────────────────────────────────────────────────────

export async function getUnreadCount(userId: string): Promise<number> {
  const keys = await recipientKeysForUserId(userId);
  const [row] = await getDb()
    .select({ count: count() })
    .from(notificationLog)
    .where(
      and(
        inArray(notificationLog.recipientId, keys),
        ne(notificationLog.status, "read"),
      ),
    );

  return Number(row!.count);
}

// ── retryFailedNotification ─────────────────────────────────────────────────

export async function retryFailedNotification(
  notificationId: number,
): Promise<{ success: boolean; error?: string }> {
  // Load the failed notification and its domain event
  const [entry] = await getDb()
    .select({
      id: notificationLog.id,
      eventId: notificationLog.eventId,
      watchRuleId: notificationLog.watchRuleId,
      channelConfigId: notificationLog.channelConfigId,
      recipientId: notificationLog.recipientId,
      locale: notificationLog.locale,
      status: notificationLog.status,
      retryCount: notificationLog.retryCount,
      eventType: domainEvents.type,
      entityName: domainEvents.entityName,
      payload: domainEvents.payload,
    })
    .from(notificationLog)
    .innerJoin(domainEvents, eq(notificationLog.eventId, domainEvents.id))
    .where(eq(notificationLog.id, notificationId))
    .limit(1);

  if (!entry) {
    return { success: false, error: "Notification not found" };
  }

  if (entry.status !== "failed") {
    return { success: false, error: `Cannot retry notification with status "${entry.status}"` };
  }

  // Re-render the message (templates may have been updated)
  const payload = entry.payload as Record<string, unknown>;
  const message = renderEventMessage(entry.eventType, payload, entry.entityName, entry.locale);

  try {
    // Attempt to re-send via in-app adapter
    // For now, we update the existing entry rather than creating a new one
    await getDb()
      .update(notificationLog)
      .set({
        title: message.title,
        body: message.body,
        status: "sent",
        sentAt: new Date(),
        errorMessage: null,
        retryCount: entry.retryCount + 1,
      })
      .where(eq(notificationLog.id, notificationId));

    logger.info(
      { notificationId, eventId: entry.eventId, retryCount: entry.retryCount + 1 },
      "Notification retry succeeded",
    );

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await getDb()
      .update(notificationLog)
      .set({
        errorMessage,
        retryCount: entry.retryCount + 1,
      })
      .where(eq(notificationLog.id, notificationId));

    logger.warn(
      { notificationId, error: errorMessage },
      "Notification retry failed",
    );

    return { success: false, error: errorMessage };
  }
}
