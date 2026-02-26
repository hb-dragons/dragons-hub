import { logger } from "../../config/logger";

const log = logger.child({ service: "whatsapp-provider" });

export async function sendWhatsApp(
  phoneNumber: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  // TODO: Implement actual WhatsApp Business API integration
  log.info({ phoneNumber, messageLength: message.length }, "WhatsApp message would be sent (placeholder)");
  return { success: false, error: "WhatsApp provider not configured" };
}
