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
import {
  can,
  SURFACES,
  SURFACE_GROUP_ORDER,
  visibleSurfaces,
  type SurfaceGroup,
} from "@dragons/shared";

// next-intl's typed `t()` needs literal message keys (not `string`) to resolve
// the parameterless overload, so the label keys are typed as literal unions.
type GroupLabelKey =
  | "nav.groupLeague"
  | "nav.groupOperations"
  | "nav.groupSocial"
  | "nav.groupNotifications"
  | "nav.groupSystem";

type SurfaceLabelKey =
  | "nav.matches"
  | "nav.standings"
  | "nav.teams"
  | "nav.board"
  | "nav.bookings"
  | "nav.venues"
  | "nav.broadcast"
  | "nav.createPost"
  | "nav.notificationCenter"
  | "nav.watchRules"
  | "nav.channels"
  | "nav.domainEvents"
  | "nav.pushTest"
  | "nav.sync"
  | "nav.settings"
  | "nav.users";

// id -> web presentation for the grouped surfaces. The `officiating` surface is
// native-only and intentionally has no entry here; the Referees link below
// stays a top-level item with its own gate (unchanged behavior).
const SURFACE_META: Record<string, { href: string; labelKey: SurfaceLabelKey }> = {
  matches: { href: "/admin/matches", labelKey: "nav.matches" },
  standings: { href: "/admin/standings", labelKey: "nav.standings" },
  teams: { href: "/admin/teams", labelKey: "nav.teams" },
  boards: { href: "/admin/boards", labelKey: "nav.board" },
  bookings: { href: "/admin/bookings", labelKey: "nav.bookings" },
  venues: { href: "/admin/venues", labelKey: "nav.venues" },
  broadcast: { href: "/admin/broadcast", labelKey: "nav.broadcast" },
  createPost: { href: "/admin/social/create", labelKey: "nav.createPost" },
  notifications: { href: "/admin/notifications", labelKey: "nav.notificationCenter" },
  watchRules: { href: "/admin/notifications/rules", labelKey: "nav.watchRules" },
  channels: { href: "/admin/notifications/channels", labelKey: "nav.channels" },
  domainEvents: { href: "/admin/notifications/events", labelKey: "nav.domainEvents" },
  pushTest: { href: "/admin/settings/notifications", labelKey: "nav.pushTest" },
  sync: { href: "/admin/sync", labelKey: "nav.sync" },
  settings: { href: "/admin/settings", labelKey: "nav.settings" },
  users: { href: "/admin/users", labelKey: "nav.users" },
};

const GROUP_META: Record<
  SurfaceGroup,
  { labelKey: GroupLabelKey; icon: React.ComponentType }
> = {
  league: { labelKey: "nav.groupLeague", icon: Trophy },
  operations: { labelKey: "nav.groupOperations", icon: KanbanSquare },
  social: { labelKey: "nav.groupSocial", icon: Image },
  notifications: { labelKey: "nav.groupNotifications", icon: Bell },
  system: { labelKey: "nav.groupSystem", icon: Settings },
};

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

  const visibleIds = new Set(visibleSurfaces(user).map((s) => s.id));
  const visibleGroups = SURFACE_GROUP_ORDER.map((groupId) => ({
    labelKey: GROUP_META[groupId].labelKey,
    icon: GROUP_META[groupId].icon,
    items: SURFACES.flatMap((s) => {
      if (s.group !== groupId) return [];
      const meta = SURFACE_META[s.id];
      if (!meta || !visibleIds.has(s.id)) return [];
      return [{ href: meta.href, labelKey: meta.labelKey }];
    }),
  })).filter((g) => g.items.length > 0);

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
            {can(user, "referee", "view") && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/admin/referees")}
                  tooltip={t("nav.referees")}
                >
                  <Link href="/admin/referees" onClick={() => setOpenMobile(false)}>
                    <Gavel />
                    <span>{t("nav.referees")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
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
