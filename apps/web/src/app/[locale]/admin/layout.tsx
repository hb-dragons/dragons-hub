import { redirect } from "next/navigation";
import { parseRoles } from "@dragons/shared";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@dragons/ui/components/sidebar";
import { TooltipProvider } from "@dragons/ui/components/tooltip";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { getServerSession } from "@/lib/auth-server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth/sign-in");
  if (parseRoles(session.user.role).length === 0) redirect("/");

  return (
    <TooltipProvider>
    <SidebarProvider>
      <AppSidebar
        user={{
          role: session.user.role,
          refereeId: session.user.refereeId,
        }}
      />
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
