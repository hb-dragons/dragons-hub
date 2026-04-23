import { notFound } from "next/navigation";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { PushTestCard } from "@/components/admin/push-test-card";

export default async function NotificationsSettingsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "update")) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Push notification testing and diagnostics."
      />
      <PushTestCard />
    </div>
  );
}
