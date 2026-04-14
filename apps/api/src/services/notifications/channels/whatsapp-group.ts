import type { ChannelSendParams, DeliveryResult } from "./types";
import { env } from "../../../config/env";
import { logger } from "../../../config/logger";

const log = logger.child({ service: "whatsapp-group-adapter" });

export class WhatsAppGroupAdapter {
  async send(params: ChannelSendParams, groupChatId: string): Promise<DeliveryResult> {
    const wahaBaseUrl = env.WAHA_BASE_URL;
    const wahaSession = env.WAHA_SESSION;

    if (!wahaBaseUrl) {
      log.warn("WAHA_BASE_URL not configured, skipping WhatsApp delivery");
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
        return { success: false, error: `WAHA error ${response.status}: ${errorText}` };
      }

      log.info({ groupChatId, eventId: params.eventId }, "WhatsApp group message sent");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error({ err, groupChatId }, "Failed to send WhatsApp group message");
      return { success: false, error: message };
    }
  }
}
