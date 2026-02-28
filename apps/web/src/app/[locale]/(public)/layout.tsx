import { PublicHeader } from "@/components/public/public-header";
import { PublicBottomTabs } from "@/components/public/public-bottom-tabs";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-[calc(5rem+var(--safe-area-bottom))] md:pb-6">
        {children}
      </main>
      <PublicBottomTabs />
    </div>
  );
}
