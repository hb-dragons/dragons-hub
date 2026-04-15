# Stitch Design Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Dragon's Lair Stitch design language into the admin UI — add shared layout components (PageHeader, StatCard, SummaryStrip), restyle tables to match the no-border tonal-layering design, add a Dashboard link to the sidebar, and build a new Admin Dashboard page as the landing page.

**Architecture:** Create reusable presentational components in `apps/web/src/components/admin/shared/`. The dashboard page fetches from existing API endpoints (matches, referees, standings, teams, sync status, bookings) via SWR and displays aggregated KPIs, urgent tasks, and today's schedule. No new API endpoints needed.

**Tech Stack:** Next.js 16, React 19, SWR, Tailwind CSS v4, shadcn/Radix UI, next-intl, Vitest

**Spec:** `docs/superpowers/specs/2026-04-13-stitch-design-integration-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/web/src/components/admin/shared/page-header.tsx` | Create | Display title component with Space Grotesk, optional subtitle + stat badges |
| `apps/web/src/components/admin/shared/stat-card.tsx` | Create | KPI metric card — label, value, optional trend/icon |
| `apps/web/src/components/admin/shared/summary-strip.tsx` | Create | Bottom-of-page row of aggregate stat cards |
| `packages/ui/src/components/table.tsx` | Modify | Remove explicit border classes, add tonal hover styling |
| `apps/web/src/components/admin/app-sidebar.tsx` | Modify | Add Dashboard as first nav item, apply display font to brand |
| `apps/web/src/app/[locale]/admin/page.tsx` | Create | New admin landing page (replaces redirect) — server component that fetches initial data |
| `apps/web/src/components/admin/dashboard/dashboard-view.tsx` | Create | Client component: KPI row, urgent tasks, today's schedule, quick-links |
| `apps/web/src/components/admin/dashboard/types.ts` | Create | DashboardData interface |
| `apps/web/src/app/[locale]/admin/matches/page.tsx` | Modify | Use PageHeader instead of raw h1 |
| `apps/web/src/app/[locale]/admin/standings/page.tsx` | Modify | Use PageHeader instead of raw h1 |
| `apps/web/src/app/[locale]/admin/referees/page.tsx` | Modify | Use PageHeader instead of raw h1 |
| `apps/web/src/messages/en.json` | Modify | Add dashboard i18n keys |
| `apps/web/src/messages/de.json` | Modify | Add dashboard i18n keys |
| `apps/web/src/lib/swr-keys.ts` | Modify | Add dashboard-specific SWR key |

---

### Task 1: PageHeader Component

**Files:**
- Create: `apps/web/src/components/admin/shared/page-header.tsx`

- [ ] **Step 1: Create the PageHeader component**

```tsx
import { cn } from "@dragons/ui/lib/utils";

interface StatBadge {
  label: string;
  value: string | number;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badges?: StatBadge[];
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  badges,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-muted-foreground text-sm">{subtitle}</p>
          )}
        </div>
        {badges && badges.length > 0 && (
          <div className="flex gap-4">
            {badges.map((badge) => (
              <div key={badge.label} className="text-right">
                <p className="font-display text-2xl font-bold">{badge.value}</p>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {badge.label}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify the component renders without errors**

Run: `cd /Users/jn/git/dragons-all && pnpm --filter @dragons/web typecheck`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/shared/page-header.tsx
git commit -m "feat(web): add PageHeader component with display typography"
```

---

### Task 2: StatCard Component

**Files:**
- Create: `apps/web/src/components/admin/shared/stat-card.tsx`

- [ ] **Step 1: Create the StatCard component**

```tsx
import { cn } from "@dragons/ui/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendUp,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-card rounded-lg p-4 space-y-2",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          {label}
        </p>
        {Icon && (
          <Icon className="text-muted-foreground size-4" />
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <p className="font-display text-3xl font-bold">{value}</p>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium",
              trendUp ? "text-primary" : "text-heat",
            )}
          >
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/jn/git/dragons-all && pnpm --filter @dragons/web typecheck`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/shared/stat-card.tsx
git commit -m "feat(web): add StatCard component for KPI display"
```

---

### Task 3: SummaryStrip Component

**Files:**
- Create: `apps/web/src/components/admin/shared/summary-strip.tsx`

- [ ] **Step 1: Create the SummaryStrip component**

```tsx
import { cn } from "@dragons/ui/lib/utils";

interface SummaryItem {
  label: string;
  value: string | number;
  emphasis?: boolean;
}

interface SummaryStripProps {
  items: SummaryItem[];
  className?: string;
}

export function SummaryStrip({ items, className }: SummaryStripProps) {
  return (
    <div
      className={cn(
        "bg-surface-low grid gap-px rounded-lg overflow-hidden",
        className,
      )}
      style={{
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-card p-4 space-y-1"
        >
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {item.label}
          </p>
          <p
            className={cn(
              "font-display text-2xl font-bold",
              item.emphasis && "text-heat",
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/jn/git/dragons-all && pnpm --filter @dragons/web typecheck`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/shared/summary-strip.tsx
git commit -m "feat(web): add SummaryStrip component for page-bottom stats"
```

---

### Task 4: Table Tonal Styling

Update the shared table component to replace explicit borders with tonal layering per the Dragon's Lair design rules.

**Files:**
- Modify: `packages/ui/src/components/table.tsx`

- [ ] **Step 1: Update TableHeader — remove border-b, add tonal background**

In `packages/ui/src/components/table.tsx`, replace:

```tsx
className={cn("[&_tr]:border-b", className)}
```

with:

```tsx
className={cn("[&_tr]:bg-surface-low", className)}
```

- [ ] **Step 2: Update TableRow — remove border-b, use tonal hover**

Replace:

```tsx
className={cn("hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors", className)}
```

with:

```tsx
className={cn("hover:bg-surface-low data-[state=selected]:bg-surface-low transition-colors", className)}
```

- [ ] **Step 3: Update TableBody — remove last-child border rule**

Replace:

```tsx
className={cn("[&_tr:last-child]:border-0", className)}
```

with:

```tsx
className={cn("", className)}
```

- [ ] **Step 4: Update TableFooter — remove border-t, use tonal background**

Replace:

```tsx
className={cn("bg-muted/50 border-t font-medium [&>tr]:last:border-b-0", className)}
```

with:

```tsx
className={cn("bg-surface-low font-medium", className)}
```

- [ ] **Step 5: Verify typecheck passes**

Run: `cd /Users/jn/git/dragons-all && pnpm --filter @dragons/web typecheck`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/table.tsx
git commit -m "feat(ui): restyle table with tonal layering instead of borders"
```

---

### Task 5: Add Dashboard to Sidebar

**Files:**
- Modify: `apps/web/src/components/admin/app-sidebar.tsx`
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

- [ ] **Step 1: Add i18n keys for Dashboard**

In `apps/web/src/messages/en.json`, add inside the `"nav"` object after the `"brand"` key:

```json
"dashboard": "Dashboard",
```

And add a new top-level `"dashboard"` object:

```json
"dashboard": {
  "title": "Command Center",
  "subtitle": "Operational Dashboard",
  "kpi": {
    "referees": "Active Referees",
    "upcomingMatches": "Upcoming Games",
    "leaguePosition": "Best Position",
    "teamsTracked": "Teams Tracked"
  },
  "urgentTasks": {
    "title": "Urgent Tasks",
    "noTasks": "All clear — no pending actions",
    "unreffedMatches": "{count, plural, one {# match} other {# matches}} without referees assigned",
    "pendingBookings": "{count, plural, one {# booking} other {# bookings}} pending confirmation",
    "syncError": "Last sync failed — check sync status"
  },
  "todaySchedule": {
    "title": "Today's Schedule",
    "noMatches": "No matches scheduled for today",
    "viewAll": "View Full Schedule"
  },
  "quickLinks": {
    "teams": "Teams",
    "teamsDesc": "{count, plural, one {# team} other {# teams}} tracked",
    "bookings": "Bookings",
    "bookingsDesc": "{count, plural, one {# pending} other {# pending}}",
    "sync": "Sync Status",
    "syncHealthy": "Healthy",
    "syncFailed": "Needs Attention",
    "syncIdle": "Idle"
  }
},
```

- [ ] **Step 2: Add German i18n keys**

In `apps/web/src/messages/de.json`, add the matching `"nav.dashboard"` and `"dashboard"` object:

Add inside `"nav"`:
```json
"dashboard": "Dashboard",
```

And add a new top-level `"dashboard"` object:

```json
"dashboard": {
  "title": "Kommandozentrale",
  "subtitle": "Operatives Dashboard",
  "kpi": {
    "referees": "Aktive Schiedsrichter",
    "upcomingMatches": "Anstehende Spiele",
    "leaguePosition": "Beste Position",
    "teamsTracked": "Teams"
  },
  "urgentTasks": {
    "title": "Dringende Aufgaben",
    "noTasks": "Alles erledigt — keine offenen Aufgaben",
    "unreffedMatches": "{count, plural, one {# Spiel} other {# Spiele}} ohne Schiedsrichter",
    "pendingBookings": "{count, plural, one {# Buchung} other {# Buchungen}} zur Bestätigung",
    "syncError": "Letzte Synchronisation fehlgeschlagen"
  },
  "todaySchedule": {
    "title": "Heutiger Spielplan",
    "noMatches": "Keine Spiele für heute geplant",
    "viewAll": "Gesamten Spielplan anzeigen"
  },
  "quickLinks": {
    "teams": "Teams",
    "teamsDesc": "{count, plural, one {# Team} other {# Teams}} verfolgt",
    "bookings": "Buchungen",
    "bookingsDesc": "{count, plural, one {# ausstehend} other {# ausstehend}}",
    "sync": "Sync-Status",
    "syncHealthy": "Fehlerfrei",
    "syncFailed": "Aktion nötig",
    "syncIdle": "Inaktiv"
  }
},
```

- [ ] **Step 3: Add Dashboard nav item to sidebar**

In `apps/web/src/components/admin/app-sidebar.tsx`, add a `LayoutDashboard` import:

```tsx
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
```

Then add a Dashboard direct link before the collapsible groups. Inside the `<SidebarContent>` return, add this block **before** `{visibleGroups.map(...)}`:

```tsx
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
```

- [ ] **Step 4: Apply display font to sidebar brand**

In the sidebar header, change the brand text span from:

```tsx
<span className="font-medium">{t("nav.brand")}</span>
```

to:

```tsx
<span className="font-display font-bold uppercase tracking-tight">{t("nav.brand")}</span>
```

- [ ] **Step 5: Verify typecheck passes**

Run: `cd /Users/jn/git/dragons-all && pnpm --filter @dragons/web typecheck`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/app-sidebar.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): add Dashboard to sidebar, display font on brand"
```

---

### Task 6: Apply PageHeader to Existing Pages

Update matches, standings, and referees pages to use the new PageHeader component instead of raw `<h1>` tags.

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/matches/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/standings/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/referees/page.tsx`

- [ ] **Step 1: Update matches page**

In `apps/web/src/app/[locale]/admin/matches/page.tsx`, add the import:

```tsx
import { PageHeader } from "@/components/admin/shared/page-header";
```

Replace:

```tsx
<h1 className="text-3xl font-bold tracking-tight">{t("matches.title")}</h1>
```

with:

```tsx
<PageHeader title={t("matches.title")} />
```

- [ ] **Step 2: Update standings page**

In `apps/web/src/app/[locale]/admin/standings/page.tsx`, add the import:

```tsx
import { PageHeader } from "@/components/admin/shared/page-header";
```

Replace:

```tsx
<div>
  <h1 className="text-3xl font-bold tracking-tight">{t("standings.title")}</h1>
  <p className="text-muted-foreground">{t("standings.description")}</p>
</div>
```

with:

```tsx
<PageHeader title={t("standings.title")} subtitle={t("standings.description")} />
```

- [ ] **Step 3: Update referees page**

In `apps/web/src/app/[locale]/admin/referees/page.tsx`, add the import:

```tsx
import { PageHeader } from "@/components/admin/shared/page-header";
```

Replace:

```tsx
<h1 className="text-3xl font-bold tracking-tight">{t("referees.title")}</h1>
```

with:

```tsx
<PageHeader title={t("referees.title")} />
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd /Users/jn/git/dragons-all && pnpm --filter @dragons/web typecheck`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/admin/matches/page.tsx apps/web/src/app/[locale]/admin/standings/page.tsx apps/web/src/app/[locale]/admin/referees/page.tsx
git commit -m "feat(web): use PageHeader on matches, standings, referees pages"
```

---

### Task 7: Dashboard Types and SWR Keys

**Files:**
- Create: `apps/web/src/components/admin/dashboard/types.ts`
- Modify: `apps/web/src/lib/swr-keys.ts`

- [ ] **Step 1: Create dashboard types**

```tsx
import type { MatchListItem, PaginatedResponse, LeagueStandings, RefereeListItem } from "@dragons/shared";

export interface DashboardData {
  referees: PaginatedResponse<RefereeListItem> | null;
  upcomingMatches: PaginatedResponse<MatchListItem> | null;
  todayMatches: PaginatedResponse<MatchListItem> | null;
  standings: LeagueStandings[] | null;
  teams: { id: number; name: string }[] | null;
  syncStatus: SyncStatusData | null;
}

export interface SyncStatusData {
  isRunning: boolean;
  lastRun: {
    status: "completed" | "failed";
    startedAt: string;
    finishedAt: string | null;
    duration: number | null;
    error: string | null;
  } | null;
}
```

- [ ] **Step 2: Add dashboard SWR key**

In `apps/web/src/lib/swr-keys.ts`, add after the existing `syncStatus` key:

```tsx
dashboardTodayMatches: (date: string) =>
  `/admin/matches?dateFrom=${date}&dateTo=${date}&limit=20&offset=0`,
dashboardUpcomingMatches: `/admin/matches?limit=1&offset=0`,
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd /Users/jn/git/dragons-all && pnpm --filter @dragons/web typecheck`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/dashboard/types.ts apps/web/src/lib/swr-keys.ts
git commit -m "feat(web): add dashboard types and SWR keys"
```

---

### Task 8: Dashboard View Client Component

**Files:**
- Create: `apps/web/src/components/admin/dashboard/dashboard-view.tsx`

- [ ] **Step 1: Create the dashboard view component**

```tsx
"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/navigation";
import { SWR_KEYS } from "@/lib/swr-keys";
import { apiFetcher } from "@/lib/swr";
import { StatCard } from "@/components/admin/shared/stat-card";
import { PageHeader } from "@/components/admin/shared/page-header";
import {
  Users,
  CalendarDays,
  Medal,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";
import type {
  PaginatedResponse,
  MatchListItem,
  LeagueStandings,
  RefereeListItem,
} from "@dragons/shared";
import type { SyncStatusData } from "./types";

function formatTime(kickoffTime: string | null): string {
  if (!kickoffTime) return "--:--";
  return kickoffTime.slice(0, 5);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  }).toUpperCase();
}

export function DashboardView() {
  const t = useTranslations("dashboard");
  const today = new Date().toISOString().slice(0, 10);

  const { data: referees } = useSWR<PaginatedResponse<RefereeListItem>>(
    SWR_KEYS.referees,
    apiFetcher,
  );
  const { data: upcoming } = useSWR<PaginatedResponse<MatchListItem>>(
    SWR_KEYS.dashboardUpcomingMatches,
    apiFetcher,
  );
  const { data: todayMatches } = useSWR<PaginatedResponse<MatchListItem>>(
    SWR_KEYS.dashboardTodayMatches(today),
    apiFetcher,
  );
  const { data: standings } = useSWR<LeagueStandings[]>(
    SWR_KEYS.standings,
    apiFetcher,
  );
  const { data: teams } = useSWR<{ id: number; name: string }[]>(
    SWR_KEYS.teams,
    apiFetcher,
  );
  const { data: syncStatus } = useSWR<SyncStatusData>(
    SWR_KEYS.syncStatus,
    apiFetcher,
  );

  // Compute KPIs
  const refereeCount = referees?.total ?? 0;
  const upcomingCount = upcoming?.total ?? 0;
  const teamsCount = Array.isArray(teams) ? teams.length : 0;

  const bestPosition = standings
    ?.flatMap((league) => league.standings)
    .filter((s) => s.isOwnClub)
    .reduce<number | null>((best, s) => {
      if (best === null || s.position < best) return s.position;
      return best;
    }, null);

  // Compute urgent tasks
  const unreffedMatches =
    todayMatches?.items.filter(
      (m) => !m.anschreiber && !m.zeitnehmer && !m.isCancelled,
    ).length ?? 0;

  const syncFailed = syncStatus?.lastRun?.status === "failed";

  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("kpi.referees")}
          value={refereeCount}
          icon={Users}
        />
        <StatCard
          label={t("kpi.upcomingMatches")}
          value={upcomingCount}
          icon={CalendarDays}
        />
        <StatCard
          label={t("kpi.leaguePosition")}
          value={bestPosition ? `#${bestPosition}` : "—"}
          icon={Medal}
        />
        <StatCard
          label={t("kpi.teamsTracked")}
          value={teamsCount}
          icon={Shield}
        />
      </div>

      {/* Two-column: Urgent Tasks + Today's Schedule */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Urgent Tasks */}
        <div className="bg-card rounded-lg p-5 space-y-4">
          <h2 className="font-display text-lg font-bold uppercase tracking-tight">
            {t("urgentTasks.title")}
          </h2>
          <div className="space-y-3">
            {unreffedMatches === 0 && !syncFailed ? (
              <p className="text-muted-foreground text-sm">
                {t("urgentTasks.noTasks")}
              </p>
            ) : (
              <>
                {unreffedMatches > 0 && (
                  <Link
                    href="/admin/matches"
                    className="flex items-center gap-3 rounded-md bg-heat/10 p-3 text-sm transition-colors hover:bg-heat/20"
                  >
                    <AlertTriangle className="size-4 text-heat shrink-0" />
                    <span>
                      {t("urgentTasks.unreffedMatches", {
                        count: unreffedMatches,
                      })}
                    </span>
                    <ArrowRight className="ml-auto size-4 text-muted-foreground" />
                  </Link>
                )}
                {syncFailed && (
                  <Link
                    href="/admin/sync"
                    className="flex items-center gap-3 rounded-md bg-destructive/10 p-3 text-sm transition-colors hover:bg-destructive/20"
                  >
                    <AlertTriangle className="size-4 text-destructive shrink-0" />
                    <span>{t("urgentTasks.syncError")}</span>
                    <ArrowRight className="ml-auto size-4 text-muted-foreground" />
                  </Link>
                )}
              </>
            )}
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="bg-card rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-tight">
              {t("todaySchedule.title")}
            </h2>
            <Link
              href="/admin/matches"
              className="text-primary text-xs font-medium uppercase tracking-wide hover:underline"
            >
              {t("todaySchedule.viewAll")}
            </Link>
          </div>
          <div className="space-y-2">
            {!todayMatches?.items.length ? (
              <p className="text-muted-foreground text-sm">
                {t("todaySchedule.noMatches")}
              </p>
            ) : (
              todayMatches.items.slice(0, 5).map((match) => (
                <Link
                  key={match.id}
                  href={`/admin/matches/${match.id}`}
                  className="flex items-center gap-4 rounded-md p-3 text-sm transition-colors hover:bg-surface-low"
                >
                  <span className="font-display text-muted-foreground w-12 shrink-0 font-medium">
                    {formatTime(match.kickoffTime)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {match.homeTeamName}{" "}
                      <span className="text-muted-foreground">vs</span>{" "}
                      {match.guestTeamName}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {match.venueName ?? match.venueNameOverride ?? "—"} •{" "}
                      {match.leagueName ?? "—"}
                    </p>
                  </div>
                  {match.anschreiber ? (
                    <CheckCircle className="text-primary size-4 shrink-0" />
                  ) : (
                    <Clock className="text-heat size-4 shrink-0" />
                  )}
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/admin/teams"
          className="bg-card group flex items-center gap-4 rounded-lg p-4 transition-colors hover:bg-surface-low"
        >
          <Shield className="text-primary size-5" />
          <div>
            <p className="font-medium">{t("quickLinks.teams")}</p>
            <p className="text-muted-foreground text-xs">
              {t("quickLinks.teamsDesc", { count: teamsCount })}
            </p>
          </div>
        </Link>
        <Link
          href="/admin/bookings"
          className="bg-card group flex items-center gap-4 rounded-lg p-4 transition-colors hover:bg-surface-low"
        >
          <CalendarDays className="text-primary size-5" />
          <div>
            <p className="font-medium">{t("quickLinks.bookings")}</p>
          </div>
        </Link>
        <Link
          href="/admin/sync"
          className={cn(
            "bg-card group flex items-center gap-4 rounded-lg p-4 transition-colors hover:bg-surface-low",
          )}
        >
          <div
            className={cn(
              "size-2 rounded-full shrink-0",
              syncFailed ? "bg-destructive" : "bg-primary",
            )}
          />
          <div>
            <p className="font-medium">{t("quickLinks.sync")}</p>
            <p className="text-muted-foreground text-xs">
              {syncFailed
                ? t("quickLinks.syncFailed")
                : t("quickLinks.syncHealthy")}
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/jn/git/dragons-all && pnpm --filter @dragons/web typecheck`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/dashboard/dashboard-view.tsx
git commit -m "feat(web): add DashboardView client component"
```

---

### Task 9: Dashboard Page (Server Component)

**Files:**
- Create: `apps/web/src/app/[locale]/admin/page.tsx`

This replaces the current behavior where `/admin` redirects to `/admin/sync`. If a `page.tsx` exists at this route, it will be rendered directly instead of any redirect.

- [ ] **Step 1: Check if there's a redirect file to remove**

Look for a `page.tsx` or route handler at `apps/web/src/app/[locale]/admin/`. If no `page.tsx` exists, the redirect may be handled by middleware or next.config.ts. Either way, creating this file will take priority.

Run: `ls apps/web/src/app/\\[locale\\]/admin/page.tsx 2>/dev/null || echo "no page.tsx — will create"`
Expected: "no page.tsx — will create"

- [ ] **Step 2: Create the dashboard server page**

```tsx
import { fetchAPIServer } from "@/lib/api.server";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { DashboardView } from "@/components/admin/dashboard/dashboard-view";
import type {
  PaginatedResponse,
  MatchListItem,
  LeagueStandings,
  RefereeListItem,
} from "@dragons/shared";

export default async function AdminDashboardPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [referees, standings, todayMatches] = await Promise.allSettled([
    fetchAPIServer<PaginatedResponse<RefereeListItem>>(
      "/admin/referees?limit=1&offset=0",
    ),
    fetchAPIServer<LeagueStandings[]>("/admin/standings"),
    fetchAPIServer<PaginatedResponse<MatchListItem>>(
      `/admin/matches?dateFrom=${today}&dateTo=${today}&limit=20&offset=0`,
    ),
  ]);

  const fallback: Record<string, unknown> = {};

  if (referees.status === "fulfilled") {
    fallback[SWR_KEYS.referees] = referees.value;
  }
  if (standings.status === "fulfilled") {
    fallback[SWR_KEYS.standings] = standings.value;
  }
  if (todayMatches.status === "fulfilled") {
    fallback[SWR_KEYS.dashboardTodayMatches(today)] = todayMatches.value;
  }

  return (
    <SWRConfig value={{ fallback }}>
      <DashboardView />
    </SWRConfig>
  );
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd /Users/jn/git/dragons-all && pnpm --filter @dragons/web typecheck`
Expected: No type errors

- [ ] **Step 4: Verify the page loads in the browser**

Run: `cd /Users/jn/git/dragons-all && pnpm --filter @dragons/web dev`

Open `http://localhost:3000/en/admin` in a browser. Verify:
- The page renders without errors
- KPI cards show (values may be 0 if API is not running)
- Display typography uses Space Grotesk
- Sidebar shows "Dashboard" as the first item, active state highlighted
- Today's Schedule and Urgent Tasks sections render

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/admin/page.tsx
git commit -m "feat(web): add admin dashboard page as landing page"
```

---

### Task 10: Remove Old Admin Redirect (if exists)

**Files:**
- Investigate: middleware or next.config.ts for `/admin` → `/admin/sync` redirect

- [ ] **Step 1: Search for the redirect**

Run: `grep -rn "admin/sync" apps/web/next.config.ts apps/web/src/middleware.ts 2>/dev/null; grep -rn "redirect.*admin" apps/web/next.config.ts apps/web/src/middleware.ts 2>/dev/null`

If a redirect is found, remove the `/admin` → `/admin/sync` redirect entry. If no redirect is found (the old behavior was a missing `page.tsx` which caused a 404 or default redirect), no action needed — the new `page.tsx` from Task 9 handles it.

- [ ] **Step 2: Verify `/admin` loads the dashboard, not sync**

Open `http://localhost:3000/en/admin` — should show the dashboard, not the sync page.

- [ ] **Step 3: Commit (if changes were made)**

```bash
git add -A
git commit -m "fix(web): remove old admin-to-sync redirect"
```

---

### Task 11: Visual Verification and Polish

- [ ] **Step 1: Start the dev server and verify all pages**

Run: `cd /Users/jn/git/dragons-all && pnpm --filter @dragons/web dev`

Check these pages in the browser:
1. `/en/admin` — Dashboard with KPIs, tasks, schedule, quick-links
2. `/en/admin/matches` — PageHeader with display typography
3. `/en/admin/standings` — PageHeader with subtitle
4. `/en/admin/referees` — PageHeader with display typography

Verify in both light and dark mode (toggle via sidebar footer).

- [ ] **Step 2: Check that tables use tonal styling**

Navigate to `/en/admin/matches` and verify:
- Table rows have no visible 1px borders
- Rows highlight on hover with a tonal background shift
- Table header has a subtle tonal background

- [ ] **Step 3: Verify sidebar**

- Dashboard item appears first, above the collapsible groups
- Active state highlights correctly when on `/admin`
- Brand text "DRAGONS ADMIN" uses Space Grotesk (display font)
- All existing nav groups still work

- [ ] **Step 4: Verify responsive behavior**

Resize the browser to mobile width:
- Dashboard KPI cards stack to 2 columns
- Two-column layout (urgent tasks + schedule) stacks to single column
- Quick-link cards stack to single column
- Sidebar collapses to mobile sheet

- [ ] **Step 5: Final commit (if any polish was needed)**

```bash
git add -A
git commit -m "fix(web): polish dashboard and page header styling"
```
