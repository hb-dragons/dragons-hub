import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PostWizard } from "@/components/admin/social/post-wizard";
import { PageHeader } from "@/components/admin/shared/page-header";

export default async function SocialCreatePage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "view")) notFound();
  const t = await getTranslations("socialWizard");

  return (
    <div className="container mx-auto py-6">
      <PageHeader title={t("pageTitle")} className="mb-6" />
      <PostWizard />
    </div>
  );
}
