"use client";

import {
  Calendar,
  CalendarCheck,
  ChevronRight,
  Flag,
  KanbanSquare,
  MapPin,
  RefreshCw,
  Settings,
  Trophy,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/navigation";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dragons/ui/components/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@dragons/ui/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { UserButton } from "@daveyplate/better-auth-ui";

const navGroups = [
  {
    labelKey: "nav.groupLeague" as const,
    icon: Trophy,
    items: [
      { href: "/admin/matches" as const, labelKey: "nav.matches" as const },
      { href: "/admin/standings" as const, labelKey: "nav.standings" as const },
      { href: "/admin/teams" as const, labelKey: "nav.teams" as const },
      { href: "/admin/referees" as const, labelKey: "nav.referees" as const },
    ],
  },
  {
    labelKey: "nav.groupOperations" as const,
    icon: KanbanSquare,
    items: [
      { href: "/admin/board" as const, labelKey: "nav.board" as const },
      { href: "/admin/bookings" as const, labelKey: "nav.bookings" as const },
      { href: "/admin/venues" as const, labelKey: "nav.venues" as const },
    ],
  },
  {
    labelKey: "nav.groupSystem" as const,
    icon: Settings,
    items: [
      { href: "/admin/sync" as const, labelKey: "nav.sync" as const },
      { href: "/admin/settings" as const, labelKey: "nav.settings" as const },
      { href: "/admin/users" as const, labelKey: "nav.users" as const },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const t = useTranslations();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/admin">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Trophy className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-medium">{t("nav.brand")}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => {
          const groupIsActive = group.items.some((item) =>
            pathname.startsWith(item.href)
          );

          return (
            <SidebarGroup key={group.labelKey}>
              <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
              <SidebarMenu>
                <Collapsible
                  asChild
                  defaultOpen={groupIsActive}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={t(group.labelKey)}>
                        <group.icon />
                        <span>{t(group.labelKey)}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {group.items.map((item) => {
                          const isActive = pathname.startsWith(item.href);
                          return (
                            <SidebarMenuSubItem key={item.href}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isActive}
                              >
                                <Link
                                  href={item.href}
                                  onClick={() => setOpenMobile(false)}
                                >
                                  <span>{t(item.labelKey)}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-2">
          <ThemeToggle />
          <LocaleSwitcher />
          <UserButton size="icon" align="center" />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
