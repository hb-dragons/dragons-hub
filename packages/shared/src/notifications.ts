export interface NotificationItem {
  id: number;
  recipientId: string;
  channel: string;
  title: string;
  body: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationListResult {
  notifications: NotificationItem[];
  total: number;
}

// ── User-toggleable event types ──────────────────────────────────────────────

// Event types a user can mute in their own notification preferences.
// System-only event types (e.g. sync.completed, override.*) are excluded.
export const USER_TOGGLEABLE_EVENTS = [
  "task.assigned",
  "task.unassigned",
  "task.comment.added",
  "task.due.reminder",
  "match.created",
  "match.schedule.changed",
  "match.venue.changed",
  "match.cancelled",
  "match.score.changed",
  "referee.assigned",
  "referee.unassigned",
  "referee.reassigned",
  "referee.slots.needed",
  "referee.slots.reminder",
  "booking.created",
  "booking.status.changed",
] as const;

export type UserToggleableEventType = (typeof USER_TOGGLEABLE_EVENTS)[number];

export function isUserToggleableEventType(
  value: string,
): value is UserToggleableEventType {
  return (USER_TOGGLEABLE_EVENTS as readonly string[]).includes(value);
}
