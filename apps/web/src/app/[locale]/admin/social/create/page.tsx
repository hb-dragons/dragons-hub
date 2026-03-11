import { PostWizard } from "@/components/admin/social/post-wizard";

export default function SocialCreatePage() {
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold tracking-tight mb-6">Social Post Generator</h1>
      <PostWizard />
    </div>
  );
}
