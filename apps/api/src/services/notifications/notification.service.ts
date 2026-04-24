import { db } from "../../config/database";
import { logger } from "../../config/logger";
import { notifications } from "@dragons/db/schema";

const log = logger.child({ service: "notification" });

// ── Types ───────────────────────────────────────────────────────────────────

interface SendNotificationParams {
  recipientId: string;
  title: string;
  body: string;
}

// ── sendNotification ────────────────────────────────────────────────────────

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

// ── notifyTaskAssigned ──────────────────────────────────────────────────────

export async function notifyTaskAssigned(
  taskId: number,
  assigneeId: string,
  taskTitle: string,
): Promise<void> {
  await sendNotification({
    recipientId: assigneeId,
    title: `Task assigned: ${taskTitle}`,
    body: `You have been assigned to task: ${taskTitle}`,
  });
}

// ── notifyBookingNeedsAction ────────────────────────────────────────────────

export async function notifyBookingNeedsAction(
  venueBookingId: number,
  assigneeId: string,
  venueName: string,
  date: string,
): Promise<void> {
  await sendNotification({
    recipientId: assigneeId,
    title: `Venue booking needs attention: ${venueName} on ${date}`,
    body: `The venue booking for ${venueName} on ${date} requires your attention.`,
  });
}

// ── notifyTaskComment ───────────────────────────────────────────────────────

export async function notifyTaskComment(
  taskId: number,
  assigneeId: string,
  commenterName: string,
  taskTitle: string,
): Promise<void> {
  await sendNotification({
    recipientId: assigneeId,
    title: `${commenterName} commented on: ${taskTitle}`,
    body: `${commenterName} left a comment on task: ${taskTitle}`,
  });
}
