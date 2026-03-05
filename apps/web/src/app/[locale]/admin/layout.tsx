import { SidebarProvider, SidebarInset, SidebarTrigger } from "@dragons/ui/components/sidebar";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { Separator } from "@dragons/ui/components/separator";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-6 md:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-semibold">Dragons Admin</span>
        </header>
        <main className="flex-1 px-6 py-6 pb-[calc(1.5rem+var(--safe-area-bottom))]">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
