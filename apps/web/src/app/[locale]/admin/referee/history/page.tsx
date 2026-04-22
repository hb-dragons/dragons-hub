import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { HistoryPage } from "@/components/referee/history/history-page";

export default async function RefereeHistoryPage() {
  const session = await getServerSession();
  const user = session?.user ?? null;
  if (!can(user, "assignment", "view")) notFound();

  const t = await getTranslations("refereeHistory");
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <HistoryPage />
    </div>
  );
}
