import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { NotificationCenter } from "@/components/admin/notifications/notification-center";
import type {
  NotificationListResult,
  FailedNotificationListResult,
} from "@/components/admin/notifications/types";

export default async function NotificationsPage() {
  const t = await getTranslations();
  let notifications: NotificationListResult | null = null;
  let failed: FailedNotificationListResult | null = null;
  let error: string | null = null;

  try {
    [notifications, failed] = await Promise.all([
      fetchAPIServer<NotificationListResult>(
        "/admin/notifications?limit=20&offset=0",
      ),
      fetchAPIServer<FailedNotificationListResult>(
        "/admin/events/failed?page=1&limit=20",
      ),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("notifications.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("notifications.description")}
          </p>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("notifications.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("notifications.description")}
        </p>
      </div>

      <SWRConfig
        value={{
          fallback: {
            [SWR_KEYS.notifications(20, 0)]: notifications,
            [SWR_KEYS.domainEventsFailed(1, 20)]: failed,
          },
        }}
      >
        <NotificationCenter />
      </SWRConfig>
    </div>
  );
}
