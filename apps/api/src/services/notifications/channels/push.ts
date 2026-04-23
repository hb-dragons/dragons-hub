import { inArray } from "drizzle-orm";
import { db } from "../../../config/database";
import {
  pushDevices,
  notificationLog,
  userNotificationPreferences,
} from "@dragons/db/schema";
import { logger } from "../../../config/logger";
import { ExpoPushClient, type ExpoPushMessage } from "../expo-push.client";
import { renderPushTemplate, type Locale } from "../templates/push";

const log = logger.child({ service: "push-adapter" });

export interface PushSendParams {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  watchRuleId: number | null;
  channelConfigId: number;
  recipientUserIds: string[];
}

export interface PushSendResult {
  success: boolean;
  sent: number;
  failed: number;
}

type DeviceRow = typeof pushDevices.$inferSelect;
type PrefRow = typeof userNotificationPreferences.$inferSelect;

export class PushChannelAdapter {
  constructor(private readonly client: ExpoPushClient) {}

  async send(params: PushSendParams): Promise<PushSendResult> {
    const result: PushSendResult = { success: true, sent: 0, failed: 0 };

    // Probe render with "de" first — if no template exists, skip entirely
    const probe = renderPushTemplate({
      eventType: params.eventType,
      payload: params.payload,
      locale: "de",
    });
    if (!probe) {
      log.debug({ eventType: params.eventType }, "no push template, skipping");
      return result;
    }

    if (params.recipientUserIds.length === 0) return result;

    const devices = (await db
      .select()
      .from(pushDevices)
      .where(inArray(pushDevices.userId, params.recipientUserIds))) as DeviceRow[];

    if (devices.length === 0) {
      log.debug({ recipientUserIds: params.recipientUserIds }, "no push devices");
      return result;
    }

    const prefs = (await db
      .select()
      .from(userNotificationPreferences)
      .where(inArray(userNotificationPreferences.userId, params.recipientUserIds))) as PrefRow[];
    const prefByUser = new Map(prefs.map((p) => [p.userId, p]));

    type Outgoing = {
      device: DeviceRow;
      message: ExpoPushMessage;
      locale: Locale;
    };

    const outgoing: Outgoing[] = [];

    for (const device of devices) {
      const userPref = prefByUser.get(device.userId);
      if (userPref?.mutedEventTypes?.includes(params.eventType)) continue;

      const locale = pickLocale(userPref?.locale, device.locale);
      const rendered = renderPushTemplate({
        eventType: params.eventType,
        payload: params.payload,
        locale,
      });
      if (!rendered) continue;

      outgoing.push({
        device,
        locale,
        message: {
          to: device.token,
          title: rendered.title,
          body: rendered.body,
          data: rendered.data,
          sound: "default",
          priority: "high",
        },
      });
    }

    if (outgoing.length === 0) return result;

    try {
      const tickets = await this.client.sendBatch(outgoing.map((o) => o.message));
      const rows = outgoing.map((o, i) => {
        const ticket = tickets[i];
        const ok = ticket?.status === "ok";
        return {
          eventId: params.eventId,
          watchRuleId: params.watchRuleId,
          channelConfigId: params.channelConfigId,
          recipientId: o.device.userId,
          recipientToken: o.device.token,
          title: o.message.title,
          body: o.message.body,
          locale: o.locale,
          status: ok ? "sent_ticket" : "failed",
          sentAt: ok ? new Date() : null,
          providerTicketId: ok ? ticket.id ?? null : null,
          errorMessage: ok ? null : (ticket?.message ?? ticket?.details?.error ?? "unknown"),
        };
      });
      await db.insert(notificationLog).values(rows);

      result.sent = rows.filter((r) => r.status === "sent_ticket").length;
      result.failed = rows.length - result.sent;
      if (result.failed > 0) result.success = false;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      log.error({ err, eventId: params.eventId }, "Expo sendBatch failed");
      const rows = outgoing.map((o) => ({
        eventId: params.eventId,
        watchRuleId: params.watchRuleId,
        channelConfigId: params.channelConfigId,
        recipientId: o.device.userId,
        recipientToken: o.device.token,
        title: o.message.title,
        body: o.message.body,
        locale: o.locale,
        status: "failed",
        sentAt: null,
        providerTicketId: null,
        errorMessage: message,
      }));
      await db.insert(notificationLog).values(rows);
      return { success: false, sent: 0, failed: outgoing.length };
    }
  }
}

function pickLocale(userLocale: string | undefined | null, deviceLocale: string | null | undefined): Locale {
  const candidate = userLocale ?? deviceLocale ?? "de";
  return candidate.toLowerCase().startsWith("en") ? "en" : "de";
}
