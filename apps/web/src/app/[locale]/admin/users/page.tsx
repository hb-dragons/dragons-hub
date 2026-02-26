import { getTranslations } from "next-intl/server";
import { UserListTable } from "@/components/admin/users/user-list-table";

export default async function UsersPage() {
  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("users.title")}</h1>
        <p className="text-muted-foreground">{t("users.description")}</p>
      </div>
      <UserListTable />
    </div>
  );
}
