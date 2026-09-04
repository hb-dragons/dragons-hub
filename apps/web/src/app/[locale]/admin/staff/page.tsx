import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { StaffPeopleList } from "@/components/admin/staff/staff-people-list";

/**
 * The staff pool (ADR 0009). Reading it needs `team:view`, the same gate the
 * team pages use; editing is gated on `team:manage` inside the list.
 */
export default async function StaffPeoplePage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "team", "view")) notFound();

  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <PageHeader title={t("staffPeople.title")} subtitle={t("staffPeople.subtitle")} />
      <StaffPeopleList canManage={can(session?.user ?? null, "team", "manage")} />
    </div>
  );
}
