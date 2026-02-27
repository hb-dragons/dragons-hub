import { Header } from "@/components/admin/header";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 pb-[calc(1.5rem+var(--safe-area-bottom))]">
        {children}
      </main>
    </div>
  );
}
