import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../config/database";
import {
  pushDevices,
  notificationLog,
  userNotificationPreferences,
} from "@dragons/db/schema";
import { logger } from "../../../config/logger";
import type { ExpoPushClient, ExpoPushMessage } from "../expo-push.client";
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

    const devices = (await getDb()
      .select()
      .from(pushDevices)
      .where(inArray(pushDevices.userId, params.recipientUserIds))) as DeviceRow[];

    if (devices.length === 0) {
      log.debug({ recipientUserIds: params.recipientUserIds }, "no push devices");
      return result;
    }

    const prefs = (await getDb()
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

      const locale = pickLocale(userPref, device.locale);
      const rendered = renderPushTemplate({
        eventType: params.eventType,
        payload: params.payload,
        locale,
        eventId: params.eventId,
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

    // Claim a notification_log row per UNIQUE userId BEFORE sending. The dedup
    // unique index (event_id, channel_config_id, COALESCE(recipient_id,'__group__'))
    // already collapsed a user's many devices to one row; push rows use
    // recipient_id = userId, so the claim is per-user. Inserting first makes a
    // re-processed outbox event a no-op (returning() comes back empty) instead of
    // physically re-delivering, which is what the old send-then-log order allowed.
    const firstByUser = new Map<string, Outgoing>();
    for (const o of outgoing) {
      if (!firstByUser.has(o.device.userId)) firstByUser.set(o.device.userId, o);
    }
    const claimValues = [...firstByUser.values()].map((o) => ({
      eventId: params.eventId,
      watchRuleId: params.watchRuleId,
      channelConfigId: params.channelConfigId,
      recipientId: o.device.userId,
      title: o.message.title,
      body: o.message.body,
      locale: o.locale,
      status: "pending",
    }));

    const claimedRows = await getDb()
      .insert(notificationLog)
      .values(claimValues)
      .onConflictDoNothing()
      .returning({ id: notificationLog.id, recipientId: notificationLog.recipientId });

    const claimIdByUser = new Map<string, number>();
    for (const row of claimedRows) {
      if (row.recipientId) claimIdByUser.set(row.recipientId, row.id);
    }

    // Only send to devices whose user we actually claimed; the rest are duplicates.
    const toSend = outgoing.filter((o) => claimIdByUser.has(o.device.userId));
    if (toSend.length === 0) return result;

    try {
      const tickets = await this.client.sendBatch(toSend.map((o) => o.message));

      // Per-user collapse means per-device receipt tracking is coarsened (it
      // already was — only one row survived per user). Aggregate every device's
      // ticket onto that user's single claim row: sent_ticket if any device
      // succeeded, else failed, keeping the first ok ticket's id/token.
      type DeviceResult = { ok: boolean; ticketId: string | null; token: string; error: string | null };
      const byUser = new Map<string, DeviceResult[]>();
      toSend.forEach((o, i) => {
        const ticket = tickets[i];
        const ok = ticket?.status === "ok";
        const list = byUser.get(o.device.userId) ?? [];
        list.push({
          ok,
          ticketId: ok ? ticket.id ?? null : null,
          token: o.device.token,
          error: ok ? null : (ticket?.message ?? ticket?.details?.error ?? "unknown"),
        });
        byUser.set(o.device.userId, list);
        if (ok) result.sent++;
        else result.failed++;
      });

      for (const [userId, devices] of byUser) {
        const claimId = claimIdByUser.get(userId)!;
        const okDevice = devices.find((d) => d.ok);
        const firstFail = devices.find((d) => !d.ok);
        await getDb()
          .update(notificationLog)
          .set({
            status: okDevice ? "sent_ticket" : "failed",
            sentAt: okDevice ? new Date() : null,
            providerTicketId: okDevice?.ticketId ?? null,
            recipientToken: okDevice ? okDevice.token : (firstFail?.token ?? null),
            errorMessage: okDevice ? null : (firstFail?.error ?? "unknown"),
          })
          .where(eq(notificationLog.id, claimId));
      }

      if (result.failed > 0) result.success = false;
      return result;
    } catch (err) {
      log.error({ err, eventId: params.eventId }, "Expo sendBatch failed");
      // The whole batch was undelivered (transient network failure). Release the
      // claim rows so the outbox reprocess can retry delivery, mirroring the
      // WhatsApp-group adapter. There is no automatic sweeper for stranded push
      // rows, so leaving them as "failed" would block all future delivery for
      // this event. Per-ticket terminal errors (e.g. DeviceNotRegistered) are
      // handled in the success path and keep their "failed" rows.
      await getDb()
        .delete(notificationLog)
        .where(inArray(notificationLog.id, [...claimIdByUser.values()]));
      return { success: false, sent: 0, failed: toSend.length };
    }
  }
}

// Authoritative locale selection:
//   1. If the user has a preferences row at all, honor that row's locale — they
//      visited the settings page and either kept the default or changed it.
//   2. Otherwise the pref row is absent; fall back to the device's reported
//      locale (installed system language). The default pref-row value of "de"
//      would otherwise override the device for every English user who never
//      opened the settings screen.
//   3. Final fallback "de" keeps the existing behaviour when both are missing.
function pickLocale(
  userPref: PrefRow | undefined,
  deviceLocale: string | null | undefined,
): Locale {
  const candidate = userPref
    ? (userPref.locale ?? "de")
    : (deviceLocale ?? "de");
  return candidate.toLowerCase().startsWith("en") ? "en" : "de";
}
