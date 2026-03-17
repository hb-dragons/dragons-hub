import { db } from "../../../config/database";
import { notificationLog } from "@dragons/db/schema";
import type { ChannelAdapter, ChannelSendParams, DeliveryResult } from "./types";

export class InAppChannelAdapter implements ChannelAdapter {
  async send(params: ChannelSendParams): Promise<DeliveryResult> {
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
          status: "sent",
          sentAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: notificationLog.id });

      return { success: true, duplicate: rows.length === 0 };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error during in-app delivery";
      return { success: false, error: message };
    }
  }
}
