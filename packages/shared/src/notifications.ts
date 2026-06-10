/**
 * Notification Center response shapes.
 *
 * Mirrors the API's `NotificationCenterItem`/`NotificationCenterListResult`
 * returned by `listNotifications` (notification_log joined onto domain_events).
 */
export interface NotificationItem {
  id: number;
  eventId: string;
  watchRuleId: number | null;
  channelConfigId: number;
  recipientId: string | null;
  title: string;
  body: string;
  locale: string;
  status: string;
  sentAt: string | null;
  readAt: string | null;
  digestRunId: number | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  // Joined from domain_events
  eventType: string;
  entityName: string;
  entityType: string;
  entityId: number;
  deepLinkPath: string;
  urgency: string;
}

export interface NotificationListResult {
  notifications: NotificationItem[];
  total: number;
}

/** Response of PATCH /admin/notifications/:id/read and POST /admin/notifications/:id/retry. */
export interface NotificationActionResponse {
  success: boolean;
}

/** Response of PATCH /admin/notifications/read-all. */
export interface NotificationMarkAllReadResponse {
  updated: number;
}

/** GET/PATCH /admin/notifications/preferences — the caller's notification preferences. */
export interface NotificationPreferences {
  mutedEventTypes: string[];
  locale: "de" | "en";
}

/**
 * Failed notification delivery from GET /admin/events/failed
 * (notification_log rows with status "failed", joined onto domain_events).
 */
export interface FailedNotificationItem {
  id: number;
  eventId: string;
  watchRuleId: number | null;
  channelConfigId: number;
  recipientId: string | null;
  title: string;
  body: string;
  locale: string;
  status: string;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  // Joined from domain_events
  eventType: string;
  entityName: string;
  deepLinkPath: string;
}

export interface FailedNotificationListResult {
  notifications: FailedNotificationItem[];
  total: number;
}
