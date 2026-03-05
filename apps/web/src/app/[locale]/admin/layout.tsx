import { SidebarProvider, SidebarInset, SidebarTrigger } from "@dragons/ui/components/sidebar";
import { TooltipProvider } from "@dragons/ui/components/tooltip";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
          <SidebarTrigger />
          <AdminBreadcrumb />
        </header>
        <div className="flex-1 px-6 py-6 pb-[calc(1.5rem+var(--safe-area-bottom))]">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}
