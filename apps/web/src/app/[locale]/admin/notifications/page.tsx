import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { getServerApi } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { SWRConfig } from "swr";
import { makeQueries } from "@/lib/swr-queries";
import { NotificationCenter } from "@/components/admin/notifications/notification-center";
import type {
  NotificationListResult,
  FailedNotificationListResult,
} from "@/components/admin/notifications/types";
import { PageError } from "@/components/admin/shared/page-error";

export default async function NotificationsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "view")) notFound();

  const t = await getTranslations();
  let notifications: NotificationListResult | null = null;
  let failed: FailedNotificationListResult | null = null;
  let error: string | null = null;

  const sApi = await getServerApi();
  const sq = makeQueries(sApi);
  const notificationsQ = sq.notifications(20, 0);
  const failedEventsQ = sq.domainEventsFailed(1, 20);

  try {
    [notifications, failed] = await Promise.all([
      notificationsQ.fetcher(),
      failedEventsQ.fetcher(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("notifications.title")} subtitle={t("notifications.description")} />
        <PageError message={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("notifications.title")} subtitle={t("notifications.description")} />

      <SWRConfig
        value={{
          fallback: {
            [notificationsQ.key]: notifications,
            [failedEventsQ.key]: failed,
          },
        }}
      >
        <NotificationCenter />
      </SWRConfig>
    </div>
  );
}
