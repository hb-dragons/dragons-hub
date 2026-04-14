import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { UserListTable } from "@/components/admin/users/user-list-table";

export default async function UsersPage() {
  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <PageHeader title={t("users.title")} subtitle={t("users.description")} />
      <UserListTable />
    </div>
  );
}
