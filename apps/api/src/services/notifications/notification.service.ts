import { db } from "../../config/database";
import { logger } from "../../config/logger";
import { notifications } from "@dragons/db/schema";

const log = logger.child({ service: "notification" });

interface SendNotificationParams {
  recipientId: string;
  title: string;
  body: string;
}

export async function sendNotification(
  params: SendNotificationParams,
): Promise<void> {
  await db.insert(notifications).values({
    recipientId: params.recipientId,
    channel: "in_app",
    title: params.title,
    body: params.body,
    status: "sent",
    sentAt: new Date(),
  });

  log.info(
    { recipientId: params.recipientId, title: params.title },
    "In-app notification sent",
  );
}
