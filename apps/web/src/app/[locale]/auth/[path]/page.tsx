import { AuthView } from "@daveyplate/better-auth-ui";
import { authViewPaths } from "@daveyplate/better-auth-ui/server";
import { Logo } from "@/components/brand/logo";
import { Wordmark } from "@/components/brand/wordmark";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-4 md:p-6">
      <div className="flex flex-col items-center gap-3">
        <Logo size={56} alt="" />
        <Wordmark width={180} alt="Dragons" />
      </div>
      <AuthView path={path} />
    </main>
  );
}
