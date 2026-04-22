import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { UserListTable } from "@/components/admin/users/user-list-table";

export default async function UsersPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "update")) notFound();

  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <PageHeader title={t("users.title")} subtitle={t("users.description")} />
      <UserListTable />
    </div>
  );
}
