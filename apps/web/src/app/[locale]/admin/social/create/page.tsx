import { notFound } from "next/navigation";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PostWizard } from "@/components/admin/social/post-wizard";
import { PageHeader } from "@/components/admin/shared/page-header";

export default async function SocialCreatePage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "view")) notFound();

  return (
    <div className="container mx-auto py-6">
      <PageHeader title="Social Post Generator" className="mb-6" />
      <PostWizard />
    </div>
  );
}
