import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { PushTestCard } from "@/components/admin/push-test-card";

export default async function NotificationsSettingsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "update")) notFound();

  const t = await getTranslations("settings.pushTest");

  return (
    <div className="space-y-6">
      <PageHeader title={t("pageTitle")} subtitle={t("pageDescription")} />
      <PushTestCard />
    </div>
  );
}
