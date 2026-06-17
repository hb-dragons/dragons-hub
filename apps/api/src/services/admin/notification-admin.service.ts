import { getDb } from "../../config/database";
import { notificationLog, domainEvents, channelConfigs, user } from "@dragons/db/schema";
import { eq, and, desc, count, ne, inArray } from "drizzle-orm";
import { parseRoles } from "@dragons/shared";
import { dispatchImmediate } from "../notifications/notification-pipeline";
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
  if (u?.refereeId != null) {
    keys.push(`referee:${u.refereeId}`);
    // Referees carry no role post-RBAC-cleanup, so the referee link — not a
    // role — is what makes them part of the "referee" audience.
    keys.push("audience:referee");
  }
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
  const [entry] = await getDb()
    .select({
      id: notificationLog.id,
      eventId: notificationLog.eventId,
      watchRuleId: notificationLog.watchRuleId,
      channelConfigId: notificationLog.channelConfigId,
      recipientId: notificationLog.recipientId,
      status: notificationLog.status,
    })
    .from(notificationLog)
    .where(eq(notificationLog.id, notificationId))
    .limit(1);

  if (!entry) {
    return { success: false, error: "Notification not found" };
  }
  if (entry.status !== "failed") {
    return { success: false, error: `Cannot retry notification with status "${entry.status}"` };
  }
  if (entry.recipientId === null) {
    return { success: false, error: "Cannot retry a notification with no recipient" };
  }

  // dispatchImmediate re-renders from the live event row, so load the full event
  // and the channel config it targets.
  const [event] = await getDb()
    .select()
    .from(domainEvents)
    .where(eq(domainEvents.id, entry.eventId))
    .limit(1);
  /* v8 ignore next 3 -- defensive: notification_log.event_id is a FK, so the event always exists */
  if (!event) {
    return { success: false, error: "Originating event no longer exists" };
  }

  const [config] = await getDb()
    .select({ id: channelConfigs.id, type: channelConfigs.type, config: channelConfigs.config })
    .from(channelConfigs)
    .where(eq(channelConfigs.id, entry.channelConfigId))
    .limit(1);
  /* v8 ignore next 3 -- defensive: notification_log.channel_config_id is a FK, so the config always exists */
  if (!config) {
    return { success: false, error: "Channel config no longer exists" };
  }

  // Push rows are stored keyed by the BARE userId (the push adapter resolved the
  // prefixed recipient to userIds and keyed each row by userId). dispatchImmediate's
  // push branch re-resolves via resolveRecipientUserIds, which only matches the
  // prefixed "user:<id>" form — so restore the prefix for push. in_app/whatsapp
  // store (and dispatch expects) the prefixed recipient as-is.
  const dispatchRecipientId =
    config.type === "push" ? `user:${entry.recipientId}` : entry.recipientId;

  // Free the dedup slot: the channel adapters insert deduped on
  // (event_id, channel_config_id, recipient_id), so the existing failed row
  // would make the re-dispatch a no-op. Removing it lets the adapter write a
  // fresh row carrying the real delivery result.
  await getDb().delete(notificationLog).where(eq(notificationLog.id, notificationId));

  try {
    const delivered = await dispatchImmediate({
      event,
      config,
      watchRuleId: entry.watchRuleId,
      recipientId: dispatchRecipientId,
      channelType: config.type,
    });

    if (!delivered) {
      logger.warn(
        { notificationId, eventId: entry.eventId, channelType: config.type },
        "Notification retry did not deliver",
      );
      return { success: false, error: "Re-delivery failed" };
    }

    logger.info(
      { notificationId, eventId: entry.eventId, channelType: config.type },
      "Notification retry re-dispatched",
    );
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.warn({ notificationId, error: errorMessage }, "Notification retry threw");
    return { success: false, error: errorMessage };
  }
}
