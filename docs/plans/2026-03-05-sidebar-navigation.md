# Sidebar Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the crowded horizontal header nav with a persistent grouped sidebar using shadcn's sidebar component.

**Architecture:** Install shadcn `sidebar` component into `packages/ui`. Create an `AppSidebar` component in `apps/web/src/components/admin/` that groups 10 nav links into 3 categories (League, Operations, System). Update the admin layout to use `SidebarProvider` + `SidebarInset` instead of the current `Header`. On mobile, the sidebar becomes a Sheet drawer triggered from a slim top bar.

**Tech Stack:** shadcn/ui sidebar, Lucide icons, next-intl, Radix UI

---

### Task 1: Install shadcn sidebar component

**Files:**
- Create: `packages/ui/src/components/sidebar.tsx`

**Step 1: Install the sidebar component via shadcn CLI**

Run:
```bash
cd /Users/jn/git/dragons-all && npx shadcn@latest add sidebar --path packages/ui/src/components --cwd packages/ui
```

This installs the sidebar component and any sub-dependencies (e.g., `separator`, `tooltip`, `input` if not already present). The component uses the `--sidebar-*` CSS variables already defined in `packages/ui/src/styles/globals.css`.

**Step 2: Verify the component was created**

Run:
```bash
ls -la packages/ui/src/components/sidebar.tsx
```
Expected: File exists.

**Step 3: Verify it exports the expected primitives**

Run:
```bash
grep -c 'export' packages/ui/src/components/sidebar.tsx
```
Expected: Multiple exports (SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger, SidebarInset, etc.)

**Step 4: Run typecheck to confirm no issues**

Run:
```bash
pnpm --filter @dragons/ui typecheck
```
Expected: No errors.

**Step 5: Commit**

```bash
git add packages/ui/src/components/sidebar.tsx
git commit -m "feat(ui): add shadcn sidebar component"
```

Also add any other new files the CLI may have created (e.g., tooltip.tsx if it wasn't present). Check `git status` first.

---

### Task 2: Add i18n translation keys for nav groups

**Files:**
- Modify: `apps/web/src/messages/en.json` (nav section)
- Modify: `apps/web/src/messages/de.json` (nav section)

**Step 1: Add group labels to English translations**

In `apps/web/src/messages/en.json`, add these keys inside the `"nav"` object:

```json
"groupLeague": "League",
"groupOperations": "Operations",
"groupSystem": "System"
```

**Step 2: Add group labels to German translations**

In `apps/web/src/messages/de.json`, add these keys inside the `"nav"` object:

```json
"groupLeague": "Liga",
"groupOperations": "Betrieb",
"groupSystem": "System"
```

**Step 3: Commit**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(i18n): add sidebar navigation group labels"
```

---

### Task 3: Create AppSidebar component

**Files:**
- Create: `apps/web/src/components/admin/app-sidebar.tsx`

**Step 1: Create the sidebar component**

Create `apps/web/src/components/admin/app-sidebar.tsx`:

```tsx
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
import { cn } from "@dragons/ui/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
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
                      <Link href={item.href}>
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
```

**Step 2: Verify typecheck passes**

Run:
```bash
pnpm --filter @dragons/web typecheck
```
Expected: No errors. If there are type issues with the `as const` assertions on translation keys, adjust to use plain strings with the `t()` call.

**Step 3: Commit**

```bash
git add apps/web/src/components/admin/app-sidebar.tsx
git commit -m "feat(web): create AppSidebar component with grouped navigation"
```

---

### Task 4: Update admin layout to use sidebar

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/layout.tsx`

**Step 1: Replace the Header with SidebarProvider + AppSidebar + SidebarInset**

Replace the entire contents of `apps/web/src/app/[locale]/admin/layout.tsx` with:

```tsx
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
```

Note: The mobile header with `SidebarTrigger` is only visible on `md:hidden`. On desktop the sidebar is always visible. The `Separator` component should already exist in `packages/ui/src/components/separator.tsx` — verify with `ls`. If not, install it: `npx shadcn@latest add separator --path packages/ui/src/components --cwd packages/ui`.

**Step 2: Verify typecheck passes**

Run:
```bash
pnpm --filter @dragons/web typecheck
```
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/admin/layout.tsx
git commit -m "feat(web): switch admin layout from header to sidebar navigation"
```

---

### Task 5: Delete the old header component

**Files:**
- Delete: `apps/web/src/components/admin/header.tsx`

**Step 1: Verify no other files import the header**

Run:
```bash
grep -r "components/admin/header" apps/web/src/ --include="*.tsx" --include="*.ts"
```
Expected: No results (the only import was in `layout.tsx` which was replaced in Task 4).

**Step 2: Delete the file**

```bash
rm apps/web/src/components/admin/header.tsx
```

**Step 3: Run typecheck to confirm nothing breaks**

Run:
```bash
pnpm --filter @dragons/web typecheck
```
Expected: No errors.

**Step 4: Commit**

```bash
git add -A apps/web/src/components/admin/header.tsx
git commit -m "refactor(web): remove old header navigation component"
```

---

### Task 6: Visual verification and adjustments

**Step 1: Start the dev server**

Run:
```bash
pnpm --filter @dragons/web dev
```

**Step 2: Verify in browser**

Open `http://localhost:3000/admin` and check:
- [ ] Sidebar is visible on desktop with 3 groups (League, Operations, System)
- [ ] All 10 nav links are present and clickable
- [ ] Active link highlights correctly when navigating
- [ ] Brand text "Dragons Admin" appears at top of sidebar
- [ ] Footer shows theme toggle, locale switcher, and user button
- [ ] On mobile viewport (<768px): sidebar is hidden, hamburger menu appears in top bar
- [ ] Tapping hamburger opens sidebar as drawer overlay
- [ ] Clicking a link in mobile drawer navigates and closes the drawer
- [ ] Dark mode works correctly with sidebar colors
- [ ] Page content area uses full remaining width

**Step 3: Fix any visual issues**

Common adjustments that may be needed:
- Remove `max-w-7xl` constraint on content if the sidebar already constrains width
- Adjust sidebar width if too narrow/wide (default is usually 16rem / 256px)
- Tweak padding or spacing in the sidebar footer

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(web): adjust sidebar layout and styling"
```

---

### Task 7: Full build and lint check

**Step 1: Run full lint**

Run:
```bash
pnpm lint
```
Expected: No errors.

**Step 2: Run full build**

Run:
```bash
pnpm build
```
Expected: Build succeeds.

**Step 3: Commit any remaining fixes if needed**

```bash
git add -A
git commit -m "fix: resolve lint and build issues from sidebar migration"
```
