# Admin Sidebar Navigation Design

## Problem

The admin header has 10 flat navigation links in a single horizontal row, making it crowded and hard to scan. As pages grow, this pattern won't scale.

## Decision

Replace the horizontal header nav with a persistent left sidebar using shadcn's `sidebar` component. Group pages into three logical categories.

## Layout

**Desktop**: Fixed sidebar (~240px), always visible. Content fills remaining width.

**Mobile**: Sidebar hidden. Hamburger button in a slim top bar opens it as a Sheet/drawer from the left.

## Navigation Groups

| Group | Pages | Lucide Icons |
|---|---|---|
| League | Matches, Standings, Teams, Referees | Calendar, Trophy, Users, Flag |
| Operations | Board, Bookings, Venues | KanbanSquare, CalendarCheck, MapPin |
| System | Sync, Settings, Users | RefreshCw, Settings, UserCog |

Group labels are muted uppercase text above each section.

## Sidebar Structure

```
Brand (Dragons Admin)
─────────────────────
LEAGUE
  Matches
  Standings
  Teams
  Referees

OPERATIONS
  Board
  Bookings
  Venues

SYSTEM
  Sync
  Settings
  Users
─────────────────────
Footer: ThemeToggle, LocaleSwitcher, UserButton
```

## Components

1. **Install shadcn `sidebar`** into `packages/ui` — provides `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarFooter`, `SidebarTrigger`, `SidebarInset`.

2. **New `app-sidebar.tsx`** in `apps/web/src/components/admin/` — sidebar with grouped nav links and footer controls.

3. **Modify `admin/layout.tsx`** — wrap content in `SidebarProvider`, replace `<Header>` with `<AppSidebar>` + `<SidebarInset>`.

4. **Remove `header.tsx`** — current header becomes unnecessary. Mobile trigger lives in a small inline bar inside `SidebarInset`.

## Active State

Same as current: `pathname.startsWith(link.href)` highlights the active link using sidebar-accent colors.

## i18n

New translation keys:
- `nav.group.league`
- `nav.group.operations`
- `nav.group.system`

Existing `nav.*` keys unchanged.

## CSS Variables

Already defined in `globals.css` (both light and dark themes):
- `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`, etc.

## No Breaking Changes

- All routes stay identical (`/admin/matches`, etc.)
- Mobile drawer behavior conceptually the same, just grouped
- Theme toggle, locale switcher, user button move to sidebar footer
