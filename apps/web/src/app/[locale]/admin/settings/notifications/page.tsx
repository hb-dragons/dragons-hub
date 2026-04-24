import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { PushTestCard } from "@/components/admin/push-test-card";
import { MyNotificationsCard } from "@/components/admin/my-notifications-card";

export default async function NotificationsSettingsPage() {
  const session = await getServerSession();
  if (!session?.user) notFound();

  const t = await getTranslations("settings.pushTest");
  const isAdmin = can(session.user, "settings", "update");

  return (
    <div className="space-y-6">
      <PageHeader title={t("pageTitle")} subtitle={t("pageDescription")} />
      <MyNotificationsCard />
      {isAdmin ? <PushTestCard /> : null}
    </div>
  );
}
