import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { and, eq, isNull, like, desc } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "../../config/database";
import {
  pushDevices,
  notificationLog,
  channelConfigs,
  domainEvents,
} from "@dragons/db/schema";
import { ExpoPushClient, mapTicketError } from "../../services/notifications/expo-push.client";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { getRedis } from "../../config/redis";
import { requirePermission } from "../../middleware/rbac";
import { escapeLikePattern } from "../../services/utils/sql";
import type { AppEnv } from "../../types";
import { notificationTestSendBodySchema } from "@dragons/contracts";

const log = logger.child({ service: "admin-notification-test" });

const notificationTestRoutes = new Hono<AppEnv>();
const settingsUpdate = requirePermission("settings", "update");

const expoPushClient = new ExpoPushClient({
  accessToken: env.EXPO_ACCESS_TOKEN,
});

const TEST_PUSH_COOLDOWN_SEC = 10;
const TEST_PUSH_COOLDOWN_KEY_PREFIX = "rl:test-push:";

notificationTestRoutes.post(
  "/notifications/test-push",
  settingsUpdate,
  describeRoute({
    description:
      "Send a test push notification to the calling admin's own devices",
    tags: ["Admin", "Notifications"],
    responses: {
      200: { description: "Test push sent" },
      400: { description: "No devices registered" },
      401: { description: "Unauthorized" },
      403: { description: "Admin role required" },
    },
  }),
  async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const raw = await c.req.json().catch(() => ({}));
    const body = notificationTestSendBodySchema.parse(raw);
    const callerId = user.id;

    const cooldownKey = `${TEST_PUSH_COOLDOWN_KEY_PREFIX}${callerId}`;
    const claim = await getRedis().set(cooldownKey, "1", "EX", TEST_PUSH_COOLDOWN_SEC, "NX");
    if (claim !== "OK") {
      const ttl = await getRedis().ttl(cooldownKey);
      const retryAfter = ttl > 0 ? ttl : TEST_PUSH_COOLDOWN_SEC;
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "rate_limited", retryAfter }, 429);
    }

    const devices = await getDb()
      .select()
      .from(pushDevices)
      .where(eq(pushDevices.userId, callerId))
      // Ordered so that "the device the aggregate log row represents" (below) is
      // the oldest registration, not whatever the heap happened to return.
      .orderBy(pushDevices.id);

    if (devices.length === 0) {
      return c.json(
        {
          error: "no_devices",
          message: "Open the native app on a signed-in device first.",
        },
        400,
      );
    }

    const pushChannels = await getDb()
      .select()
      .from(channelConfigs)
      // Retired configs stay in the table to keep notification_log's FK valid.
      .where(and(eq(channelConfigs.type, "push"), isNull(channelConfigs.deletedAt)));
    const pushChannel = pushChannels[0];
    if (!pushChannel) {
      log.error("push channel_config row missing");
      return c.json({ error: "push_channel_missing" }, 500);
    }

    const sentAt = new Date();
    const eventId = `admin_test:${callerId}:${ulid()}`;
    const text = body.message ?? "Test push from Dragons admin";
    const messages = devices.map((d) => ({
      to: d.token,
      title: "Dragons — Test",
      body: text,
      data: {
        deepLink: "/",
        isTest: true,
        sentAt: sentAt.toISOString(),
        eventType: "admin.test",
      },
      sound: "default" as const,
      priority: "high" as const,
    }));

    let tickets: Awaited<ReturnType<ExpoPushClient["sendBatch"]>>;
    try {
      tickets = await expoPushClient.sendBatch(messages);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      log.error({ err, callerId }, "test push send failed");
      tickets = devices.map(() => ({ status: "error" as const, message }));
    }

    const perDevice = devices.map((d, i) => {
      const t = tickets[i];
      const ok = t?.status === "ok";
      return {
        platform: d.platform,
        token: d.token,
        locale: d.locale ?? "de",
        ok,
        status: ok ? "sent_ticket" : "failed",
        ticketId: ok ? (t.id ?? null) : null,
        error: mapTicketError(t),
      };
    });

    // ONE notification_log row per send, never one per device.
    //
    // `notification_log_dedup_idx` (migration 0018) makes
    // (event_id, channel_config_id, COALESCE(recipient_id, '__group__')) UNIQUE,
    // so a row *is* "this notification, for this recipient, on this channel".
    // Device fan-out is a delivery detail underneath that, not a second
    // notification — writing a row per device violated the index and 500'd every
    // admin with two or more devices (issue #122).
    //
    // The row therefore carries an aggregate delivery status, matching what
    // PushChannelAdapter already does for regular sends:
    //   sent_ticket  if at least one device was accepted by Expo, keeping that
    //                device's ticket id + token and errorMessage = null;
    //   failed       if every device failed, keeping the first failing device's
    //                token and error message.
    // Per-device detail still comes back in the response for the admin UI.
    const accepted = perDevice.find((d) => d.ok);
    const firstFailure = perDevice.find((d) => !d.ok);
    const representative = accepted ?? firstFailure!;
    const row = {
      eventId,
      channelConfigId: pushChannel.id,
      recipientId: callerId,
      recipientToken: representative.token,
      title: "Dragons — Test",
      body: text,
      locale: representative.locale,
      status: accepted ? "sent_ticket" : "failed",
      sentAt: accepted ? sentAt : null,
      providerTicketId: accepted?.ticketId ?? null,
      errorMessage: accepted ? null : representative.error,
    };

    // Synthetic domain_events row so notification_log FK is satisfied.
    // Wrapped in a transaction so the event + log rows land atomically.
    await getDb().transaction(async (tx) => {
      await tx.insert(domainEvents).values({
        id: eventId,
        type: "admin.test_push",
        source: "manual",
        urgency: "immediate",
        occurredAt: sentAt,
        actor: callerId,
        entityType: "user",
        entityId: 0,
        entityName: "admin test",
        deepLinkPath: "/",
        payload: {
          isTest: true,
          sentAt: sentAt.toISOString(),
          message: text,
        },
      });
      await tx.insert(notificationLog).values(row);
    });

    return c.json({
      deviceCount: devices.length,
      tickets: perDevice.map((d) => ({
        platform: d.platform,
        status: d.status,
        ticketId: d.ticketId,
        error: d.error,
      })),
    });
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
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const callerId = user.id;
    const rows = await getDb()
      .select()
      .from(notificationLog)
      .where(like(notificationLog.eventId, `admin_test:${escapeLikePattern(callerId)}:%`))
      .orderBy(desc(notificationLog.createdAt))
      .limit(10);

    return c.json({
      results: rows.map((r) => ({
        id: r.id,
        sentAt: r.sentAt ?? r.createdAt,
        recipientToken: maskToken(r.recipientToken),
        status: r.status,
        providerTicketId: r.providerTicketId,
        errorMessage: r.errorMessage,
      })),
    });
  },
);

function maskToken(token: string | null): string | null {
  if (!token) return null;
  if (token.length > 6) return "..." + token.slice(-6);
  return "..." + token.slice(-2);
}

export { notificationTestRoutes };
