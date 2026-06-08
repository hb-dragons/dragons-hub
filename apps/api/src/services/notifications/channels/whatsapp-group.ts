import { eq } from "drizzle-orm";
import { db } from "../../../config/database";
import { notificationLog } from "@dragons/db/schema";
import type { ChannelSendParams, DeliveryResult } from "./types";
import { env } from "../../../config/env";
import { logger } from "../../../config/logger";

const log = logger.child({ service: "whatsapp-group-adapter" });

export class WhatsAppGroupAdapter {
  async send(params: ChannelSendParams, groupChatId: string): Promise<DeliveryResult> {
    // Claim a notification_log row first. The dedup unique index
    // (event_id, channel_config_id, COALESCE(recipient_id,'__group__')) makes a
    // re-processed event a no-op instead of a duplicate group post, and the row
    // is the delivery audit trail this channel previously lacked.
    let claimId: number;
    try {
      const rows = await db
        .insert(notificationLog)
        .values({
          eventId: params.eventId,
          watchRuleId: params.watchRuleId,
          channelConfigId: params.channelConfigId,
          recipientId: params.recipientId,
          title: params.title,
          body: params.body,
          locale: params.locale,
          status: "pending",
        })
        .onConflictDoNothing()
        .returning({ id: notificationLog.id });

      if (rows.length === 0) {
        // Already delivered for this event/channel/recipient — skip the send.
        return { success: true, duplicate: true };
      }
      claimId = rows[0]!.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error({ err, groupChatId }, "Failed to record WhatsApp notification");
      return { success: false, error: message };
    }

    // Release the claim on any failure so the event stays retryable.
    const releaseClaim = async () => {
      try {
        await db.delete(notificationLog).where(eq(notificationLog.id, claimId));
      } catch (err) {
        log.error({ err, claimId }, "Failed to release WhatsApp claim row");
      }
    };

    const wahaBaseUrl = env.WAHA_BASE_URL;
    const wahaSession = env.WAHA_SESSION;

    if (!wahaBaseUrl) {
      log.warn("WAHA_BASE_URL not configured, skipping WhatsApp delivery");
      await releaseClaim();
      return { success: false, error: "WAHA not configured" };
    }

    try {
      const response = await fetch(`${wahaBaseUrl}/api/sendText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: wahaSession,
          chatId: groupChatId,
          text: params.body,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error(
          { status: response.status, errorText, groupChatId },
          "WAHA sendText failed",
        );
        await releaseClaim();
        return { success: false, error: `WAHA error ${response.status}: ${errorText}` };
      }

      await db
        .update(notificationLog)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(notificationLog.id, claimId));

      log.info({ groupChatId, eventId: params.eventId }, "WhatsApp group message sent");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error({ err, groupChatId }, "Failed to send WhatsApp group message");
      await releaseClaim();
      return { success: false, error: message };
    }
  }
}
