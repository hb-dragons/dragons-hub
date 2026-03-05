import { getTranslations } from "next-intl/server";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@dragons/ui/components/sidebar";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { Separator } from "@dragons/ui/components/separator";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-6 md:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-semibold">{t("nav.brand")}</span>
        </header>
        <div className="flex-1 px-6 py-6 pb-[calc(1.5rem+var(--safe-area-bottom))]">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
