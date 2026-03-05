"use client";

import {
  Calendar,
  Trophy,
  Users,
  Flag,
  KanbanSquare,
  CalendarCheck,
  MapPin,
  RefreshCw,
  Settings,
  UserCog,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@dragons/ui/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { UserButton } from "@daveyplate/better-auth-ui";

const navGroups = [
  {
    labelKey: "nav.groupLeague" as const,
    items: [
      { href: "/admin/matches" as const, labelKey: "nav.matches" as const, icon: Calendar },
      { href: "/admin/standings" as const, labelKey: "nav.standings" as const, icon: Trophy },
      { href: "/admin/teams" as const, labelKey: "nav.teams" as const, icon: Users },
      { href: "/admin/referees" as const, labelKey: "nav.referees" as const, icon: Flag },
    ],
  },
  {
    labelKey: "nav.groupOperations" as const,
    items: [
      { href: "/admin/board" as const, labelKey: "nav.board" as const, icon: KanbanSquare },
      { href: "/admin/bookings" as const, labelKey: "nav.bookings" as const, icon: CalendarCheck },
      { href: "/admin/venues" as const, labelKey: "nav.venues" as const, icon: MapPin },
    ],
  },
  {
    labelKey: "nav.groupSystem" as const,
    items: [
      { href: "/admin/sync" as const, labelKey: "nav.sync" as const, icon: RefreshCw },
      { href: "/admin/settings" as const, labelKey: "nav.settings" as const, icon: Settings },
      { href: "/admin/users" as const, labelKey: "nav.users" as const, icon: UserCog },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar>
      <SidebarContent>
        <div className="px-4 py-4">
          <Link href="/admin" className="text-lg font-semibold tracking-tight">
            {t("nav.brand")}
          </Link>
        </div>

        {navGroups.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                    >
                      <Link href={item.href} onClick={() => setOpenMobile(false)}>
                        <item.icon />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-2">
          <ThemeToggle />
          <LocaleSwitcher />
          <UserButton size="icon" align="center" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
