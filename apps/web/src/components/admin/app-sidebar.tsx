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
import { Wordmark } from "@/components/brand/wordmark";
import { can, canViewOpenGames, type Resource, type Action } from "@dragons/shared";

type Perm = { [R in Resource]: { resource: R; action: Action<R> } }[Resource];
type GateUser = Parameters<typeof can>[0];
type Gate = (user: GateUser) => boolean;

const navGroups = [
  {
    labelKey: "nav.groupReferee" as const,
    icon: Gavel,
    items: [
      {
        href: "/admin/referee/matches",
        labelKey: "nav.openAssignments" as const,
        gate: canViewOpenGames as Gate,
      },
      {
        href: "/admin/referee/history",
        labelKey: "nav.refereeHistory" as const,
        gate: canViewOpenGames as Gate,
      },
    ],
  },
  {
    labelKey: "nav.groupLeague" as const,
    icon: Trophy,
    items: [
      {
        href: "/admin/matches",
        labelKey: "nav.matches" as const,
        perm: { resource: "match", action: "view" } as const,
      },
      {
        href: "/admin/standings",
        labelKey: "nav.standings" as const,
        perm: { resource: "standing", action: "view" } as const,
      },
      {
        href: "/admin/teams",
        labelKey: "nav.teams" as const,
        perm: { resource: "team", action: "view" } as const,
      },
      {
        href: "/admin/referees",
        labelKey: "nav.referees" as const,
        perm: { resource: "referee", action: "view" } as const,
      },
    ],
  },
  {
    labelKey: "nav.groupOperations" as const,
    icon: KanbanSquare,
    items: [
      {
        href: "/admin/boards",
        labelKey: "nav.board" as const,
        perm: { resource: "board", action: "view" } as const,
      },
      {
        href: "/admin/bookings",
        labelKey: "nav.bookings" as const,
        perm: { resource: "booking", action: "view" } as const,
      },
      {
        href: "/admin/venues",
        labelKey: "nav.venues" as const,
        perm: { resource: "venue", action: "view" } as const,
      },
    ],
  },
  {
    labelKey: "nav.groupSocial" as const,
    icon: Image,
    items: [
      {
        href: "/admin/social/create",
        labelKey: "nav.createPost" as const,
        perm: { resource: "settings", action: "view" } as const,
      },
    ],
  },
  {
    labelKey: "nav.groupNotifications" as const,
    icon: Bell,
    items: [
      {
        href: "/admin/notifications",
        labelKey: "nav.notificationCenter" as const,
        perm: { resource: "settings", action: "view" } as const,
      },
      {
        href: "/admin/notifications/rules",
        labelKey: "nav.watchRules" as const,
        perm: { resource: "settings", action: "view" } as const,
      },
      {
        href: "/admin/notifications/channels",
        labelKey: "nav.channels" as const,
        perm: { resource: "settings", action: "view" } as const,
      },
      {
        href: "/admin/notifications/events",
        labelKey: "nav.domainEvents" as const,
        perm: { resource: "settings", action: "view" } as const,
      },
      {
        href: "/admin/settings/notifications",
        labelKey: "nav.pushTest" as const,
        perm: { resource: "settings", action: "update" } as const,
      },
    ],
  },
  {
    labelKey: "nav.groupSystem" as const,
    icon: Settings,
    items: [
      {
        href: "/admin/sync",
        labelKey: "nav.sync" as const,
        perm: { resource: "sync", action: "view" } as const,
      },
      {
        href: "/admin/settings",
        labelKey: "nav.settings" as const,
        perm: { resource: "settings", action: "view" } as const,
      },
      {
        href: "/admin/users",
        labelKey: "nav.users" as const,
        perm: { resource: "settings", action: "update" } as const,
      },
    ],
  },
] satisfies ReadonlyArray<{
  labelKey: string;
  icon: React.ComponentType;
  items: ReadonlyArray<
    { href: string; labelKey: string } & ({ perm: Perm } | { gate: Gate })
  >;
}>;

function isItemVisible(
  user: GateUser,
  item: { perm?: Perm; gate?: Gate },
): boolean {
  if (item.gate) return item.gate(user);
  if (item.perm) {
    return can(
      user,
      item.perm.resource,
      item.perm.action as Action<typeof item.perm.resource>,
    );
  }
  return false;
}

export type AppSidebarUser = {
  role: string | null;
  refereeId: number | null;
};

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: AppSidebarUser | null }) {
  const pathname = usePathname();
  const t = useTranslations();
  const { setOpenMobile } = useSidebar();
  const visibleGroups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => isItemVisible(user, i)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="justify-center">
              <Link href="/admin" aria-label="Dragons">
                <Wordmark width={140} alt="" />
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
