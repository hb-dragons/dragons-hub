"use client";

import {
  Bell,
  ChevronRight,
  Gavel,
  Image,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  Trophy,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/navigation";
import { authClient } from "@/lib/auth-client";
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
import { Logo } from "@/components/brand/logo";
import { Wordmark } from "@/components/brand/wordmark";

const navGroups = [
  {
    labelKey: "nav.groupReferee" as const,
    icon: Gavel,
    roles: ["admin", "referee"],
    items: [
      { href: "/admin/referee/matches", labelKey: "nav.openAssignments" as const },
    ],
  },
  {
    labelKey: "nav.groupLeague" as const,
    icon: Trophy,
    roles: ["admin"],
    items: [
      { href: "/admin/matches", labelKey: "nav.matches" as const },
      { href: "/admin/standings", labelKey: "nav.standings" as const },
      { href: "/admin/teams", labelKey: "nav.teams" as const },
      { href: "/admin/referees", labelKey: "nav.referees" as const },
    ],
  },
  {
    labelKey: "nav.groupOperations" as const,
    icon: KanbanSquare,
    roles: ["admin"],
    items: [
      { href: "/admin/board", labelKey: "nav.board" as const },
      { href: "/admin/bookings", labelKey: "nav.bookings" as const },
      { href: "/admin/venues", labelKey: "nav.venues" as const },
    ],
  },
  {
    labelKey: "nav.groupSocial" as const,
    icon: Image,
    roles: ["admin"],
    items: [
      { href: "/admin/social/create", labelKey: "nav.createPost" as const },
    ],
  },
  {
    labelKey: "nav.groupNotifications" as const,
    icon: Bell,
    roles: ["admin"],
    items: [
      { href: "/admin/notifications", labelKey: "nav.notificationCenter" as const },
      { href: "/admin/notifications/rules", labelKey: "nav.watchRules" as const },
      { href: "/admin/notifications/channels", labelKey: "nav.channels" as const },
      { href: "/admin/notifications/events", labelKey: "nav.domainEvents" as const },
    ],
  },
  {
    labelKey: "nav.groupSystem" as const,
    icon: Settings,
    roles: ["admin"],
    items: [
      { href: "/admin/sync", labelKey: "nav.sync" as const },
      { href: "/admin/settings", labelKey: "nav.settings" as const },
      { href: "/admin/users", labelKey: "nav.users" as const },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const t = useTranslations();
  const { setOpenMobile } = useSidebar();
  const { data: session } = authClient.useSession();
  const userRole = (session?.user?.role ?? "user") as string;
  const visibleGroups = navGroups.filter((g) => g.roles.includes(userRole));

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/admin" aria-label="Dragons">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Logo size={20} alt="" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <Wordmark width={120} alt="" />
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/admin" || pathname === "/admin/dashboard"}
                tooltip={t("nav.dashboard")}
              >
                <Link href="/admin" onClick={() => setOpenMobile(false)}>
                  <LayoutDashboard />
                  <span>{t("nav.dashboard")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        {visibleGroups.map((group) => {
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
        <div className="flex items-center gap-2 px-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
          <ThemeToggle />
          <LocaleSwitcher />
          <UserButton size="icon" align="center" />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
