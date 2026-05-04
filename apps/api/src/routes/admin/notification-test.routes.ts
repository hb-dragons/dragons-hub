import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { eq, like, desc } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "../../config/database";
import {
  pushDevices,
  notificationLog,
  channelConfigs,
  domainEvents,
} from "@dragons/db/schema";
import { ExpoPushClient } from "../../services/notifications/expo-push.client";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { redis } from "../../config/redis";
import { requirePermission } from "../../middleware/rbac";
import { escapeLikePattern } from "../../services/utils/sql";
import type { AppEnv } from "../../types";

const log = logger.child({ service: "admin-notification-test" });

const notificationTestRoutes = new Hono<AppEnv>();
const settingsUpdate = requirePermission("settings", "update");

const sendBodySchema = z.object({
  message: z.string().min(1).max(180).optional(),
});

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
    const body = sendBodySchema.parse(raw);
    const callerId = user.id;

    const cooldownKey = `${TEST_PUSH_COOLDOWN_KEY_PREFIX}${callerId}`;
    const claim = await redis.set(cooldownKey, "1", "EX", TEST_PUSH_COOLDOWN_SEC, "NX");
    if (claim !== "OK") {
      const ttl = await redis.ttl(cooldownKey);
      const retryAfter = ttl > 0 ? ttl : TEST_PUSH_COOLDOWN_SEC;
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "rate_limited", retryAfter }, 429);
    }

    const devices = await db
      .select()
      .from(pushDevices)
      .where(eq(pushDevices.userId, callerId));

    if (devices.length === 0) {
      return c.json(
        {
          error: "no_devices",
          message: "Open the native app on a signed-in device first.",
        },
        400,
      );
    }

    const pushChannels = await db
      .select()
      .from(channelConfigs)
      .where(eq(channelConfigs.type, "push"));
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
      title: "🏀 Dragons — Test",
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

    const rows = devices.map((d, i) => {
      const t = tickets[i];
      const ok = t?.status === "ok";
      return {
        eventId,
        channelConfigId: pushChannel.id,
        recipientId: callerId,
        recipientToken: d.token,
        title: "🏀 Dragons — Test",
        body: text,
        locale: d.locale ?? "de",
        status: ok ? "sent_ticket" : "failed",
        sentAt: ok ? sentAt : null,
        providerTicketId: ok ? (t.id ?? null) : null,
        errorMessage: ok
          ? null
          : (t?.details?.error ?? t?.message ?? "unknown"),
      };
    });

    // Synthetic domain_events row so notification_log FK is satisfied.
    // Wrapped in a transaction so the event + log rows land atomically.
    await db.transaction(async (tx) => {
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
      await tx.insert(notificationLog).values(rows);
    });

    return c.json({
      deviceCount: devices.length,
      tickets: rows.map((r, i) => ({
        platform: devices[i]!.platform,
        status: r.status,
        ticketId: r.providerTicketId,
        error: r.errorMessage,
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
    const rows = await db
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
  return token.length > 6 ? "..." + token.slice(-6) : token;
}

export { notificationTestRoutes };
