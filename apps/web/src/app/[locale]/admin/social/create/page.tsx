import { PostWizard } from "@/components/admin/social/post-wizard";
import { PageHeader } from "@/components/admin/shared/page-header";

export default function SocialCreatePage() {
  return (
    <div className="container mx-auto py-6">
      <PageHeader title="Social Post Generator" className="mb-6" />
      <PostWizard />
    </div>
  );
}
