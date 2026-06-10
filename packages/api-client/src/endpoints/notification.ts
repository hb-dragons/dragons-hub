import type {
  NotificationListResult,
  NotificationActionResponse,
  NotificationMarkAllReadResponse,
  NotificationPreferences,
} from "@dragons/shared";
import type {
  NotificationListQuery,
  NotificationPreferencesBody,
} from "@dragons/contracts";
import type { ApiClient } from "../client";

export function notificationEndpoints(client: ApiClient) {
  return {
    list(query?: Partial<NotificationListQuery>): Promise<NotificationListResult> {
      return client.get(
        "/admin/notifications",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    markRead(id: number): Promise<NotificationActionResponse> {
      return client.patch(`/admin/notifications/${id}/read`);
    },
    markAllRead(): Promise<NotificationMarkAllReadResponse> {
      return client.patch("/admin/notifications/read-all");
    },
    retry(id: number): Promise<NotificationActionResponse> {
      return client.post(`/admin/notifications/${id}/retry`);
    },
    getPreferences(): Promise<NotificationPreferences> {
      return client.get("/admin/notifications/preferences");
    },
    updatePreferences(
      body: NotificationPreferencesBody,
    ): Promise<NotificationPreferences> {
      return client.patch("/admin/notifications/preferences", body);
    },
  };
}
