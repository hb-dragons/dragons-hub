# Public Schedule Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the public schedule's endless scrolling list with a weekend-focused view featuring team filtering, weekend navigation, and redesigned match cards.

**Architecture:** Three backend additions to `getOwnClubMatches` (sort direction, hasScore filter, teamApiId filter). Five new frontend components under `components/public/schedule/`. Server-rendered initial load with client-side interactivity for filters and navigation.

**Tech Stack:** Hono + Drizzle (API), Next.js 16 App Router (Web), Zod validation, shadcn/Radix UI components, next-intl for i18n.

---

## Task 1: Add `sort`, `hasScore`, `teamApiId` params to match list query schema

**Files:**
- Modify: `apps/api/src/routes/admin/match.schemas.ts`

**Step 1: Update the Zod schema**

Add three new optional fields to `matchListQuerySchema`:

```ts
export const matchListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
  leagueId: z.coerce.number().int().positive().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  sort: z.enum(["asc", "desc"]).default("asc"),
  hasScore: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  teamApiId: z.coerce.number().int().positive().optional(),
});
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/admin/match.schemas.ts
git commit -m "feat: add sort, hasScore, teamApiId params to match list query schema"
```

---

## Task 2: Implement `sort`, `hasScore`, `teamApiId` filtering in match query service

**Files:**
- Modify: `apps/api/src/services/admin/match-query.service.ts`

**Step 1: Update `MatchListParams` interface**

Add three new optional fields:

```ts
export interface MatchListParams {
  limit: number;
  offset: number;
  leagueId?: number;
  dateFrom?: string;
  dateTo?: string;
  sort?: "asc" | "desc";
  hasScore?: boolean;
  teamApiId?: number;
}
```

**Step 2: Update `getOwnClubMatches` function**

Import `desc` and `isNull`, `isNotNull` from `drizzle-orm` (add to existing import). Then update the function:

a) After destructuring params, extract the new fields:
```ts
const { limit, offset, leagueId, dateFrom, dateTo, sort = "asc", hasScore, teamApiId } = params;
```

b) Add `teamApiId` condition — if provided, additionally filter to matches where this specific team is home or guest:
```ts
if (teamApiId) {
  conditions.push(
    or(
      eq(matches.homeTeamApiId, teamApiId),
      eq(matches.guestTeamApiId, teamApiId),
    )!,
  );
}
```

c) Add `hasScore` condition:
```ts
if (hasScore === true) {
  conditions.push(isNotNull(matches.homeScore));
  conditions.push(isNotNull(matches.guestScore));
}
if (hasScore === false) {
  conditions.push(
    or(isNull(matches.homeScore), isNull(matches.guestScore))!,
  );
}
```

d) Update the `.orderBy()` to respect the `sort` param:
```ts
const orderDirection = sort === "desc" ? desc : asc;
// ...
.orderBy(orderDirection(matches.kickoffDate), orderDirection(matches.kickoffTime))
```

**Step 3: Commit**

```bash
git add apps/api/src/services/admin/match-query.service.ts
git commit -m "feat: implement sort, hasScore, teamApiId filtering in match query service"
```

---

## Task 3: Wire new params through the public match route

**Files:**
- Modify: `apps/api/src/routes/public/match.routes.ts`

**Step 1: Pass new query params to schema parse**

Update the route handler to pass the three new params:

```ts
const query = matchListQuerySchema.parse({
  limit: c.req.query("limit"),
  offset: c.req.query("offset"),
  leagueId: c.req.query("leagueId"),
  dateFrom: c.req.query("dateFrom"),
  dateTo: c.req.query("dateTo"),
  sort: c.req.query("sort"),
  hasScore: c.req.query("hasScore"),
  teamApiId: c.req.query("teamApiId"),
});
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/public/match.routes.ts
git commit -m "feat: wire sort, hasScore, teamApiId params to public match route"
```

---

## Task 4: Write tests for new API params

**Files:**
- Modify: `apps/api/src/routes/public/match.routes.test.ts`
- Modify: `apps/api/src/services/admin/match-admin.service.test.ts`

**Step 1: Add route-level tests**

Add to the existing describe block in `apps/api/src/routes/public/match.routes.test.ts`:

```ts
it("passes sort param to service", async () => {
  mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });

  await app.request("/matches?sort=desc");

  expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(
    expect.objectContaining({ sort: "desc" }),
  );
});

it("passes hasScore param to service", async () => {
  mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });

  await app.request("/matches?hasScore=true");

  expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(
    expect.objectContaining({ hasScore: true }),
  );
});

it("passes teamApiId param to service", async () => {
  mocks.getOwnClubMatches.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });

  await app.request("/matches?teamApiId=42");

  expect(mocks.getOwnClubMatches).toHaveBeenCalledWith(
    expect.objectContaining({ teamApiId: 42 }),
  );
});

it("returns 400 for invalid sort value", async () => {
  const res = await app.request("/matches?sort=invalid");

  expect(res.status).toBe(400);
  expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
});

it("returns 400 for invalid teamApiId", async () => {
  const res = await app.request("/matches?teamApiId=abc");

  expect(res.status).toBe(400);
  expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
});
```

**Step 2: Add service-level integration tests**

Add to `apps/api/src/services/admin/match-admin.service.test.ts` inside the `getOwnClubMatches` describe block. These tests use the existing PGlite setup that seeds real matches. Add tests for:

- `sort: "desc"` returns matches in reverse chronological order
- `hasScore: true` returns only matches where both homeScore and guestScore are not null
- `hasScore: false` returns only matches where at least one score is null
- `teamApiId` filters to matches involving that specific team

Use the existing test fixtures and patterns in the file. Refer to how `leagueId` and `dateFrom`/`dateTo` tests are structured.

**Step 3: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add apps/api/src/routes/public/match.routes.test.ts apps/api/src/services/admin/match-admin.service.test.ts
git commit -m "test: add tests for sort, hasScore, teamApiId query params"
```

---

## Task 5: Create MatchCard component

**Files:**
- Create: `apps/web/src/components/public/schedule/match-card.tsx`

**Step 1: Create the component**

This is a server-friendly presentational component. No `"use client"` needed.

```tsx
import type { MatchListItem } from "@dragons/shared";
import { Badge } from "@dragons/ui/components/badge";
import { Home } from "lucide-react";

interface MatchCardProps {
  match: MatchListItem;
  translations: {
    vs: string;
    matchCancelled: string;
    matchForfeited: string;
  };
}

export function MatchCard({ match, translations }: MatchCardProps) {
  const hasScore = match.homeScore !== null && match.guestScore !== null;
  const isOwnHome = match.homeIsOwnClub;
  const isOwnGuest = match.guestIsOwnClub;
  const isCancelledOrForfeited = match.isCancelled || match.isForfeited;

  const teamName = (m: MatchListItem, side: "home" | "guest") => {
    if (side === "home") return m.homeTeamCustomName ?? m.homeTeamNameShort ?? m.homeTeamName;
    return m.guestTeamCustomName ?? m.guestTeamNameShort ?? m.guestTeamName;
  };

  return (
    <div
      className={`rounded-xl border bg-card p-4 ${isCancelledOrForfeited ? "opacity-60" : ""}`}
    >
      {/* Top row: league + kickoff time */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground truncate">
          {match.leagueName ?? ""}
        </p>
        <p className="text-xs font-medium text-muted-foreground tabular-nums">
          {match.kickoffTime?.slice(0, 5) ?? ""}
        </p>
      </div>

      {/* Center: teams + score */}
      <div className="flex items-center gap-3">
        <div className="flex-1 text-right">
          <p
            className={`text-sm font-semibold leading-tight ${isOwnHome ? "text-mint-shade" : ""}`}
          >
            {teamName(match, "home")}
          </p>
        </div>
        <div className="flex flex-col items-center min-w-[56px]">
          {hasScore ? (
            <span className="text-lg font-bold tabular-nums">
              {match.homeScore} : {match.guestScore}
            </span>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              {translations.vs}
            </span>
          )}
        </div>
        <div className="flex-1">
          <p
            className={`text-sm font-semibold leading-tight ${isOwnGuest ? "text-mint-shade" : ""}`}
          >
            {teamName(match, "guest")}
          </p>
        </div>
      </div>

      {/* Bottom: venue + badges */}
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
          {isOwnHome && <Home className="h-3 w-3 shrink-0" />}
          {match.venueNameOverride ?? match.venueName ?? ""}
          {match.venueCity ? `, ${match.venueCity}` : ""}
        </p>
        <div className="flex gap-1.5">
          {match.isCancelled && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {translations.matchCancelled}
            </Badge>
          )}
          {match.isForfeited && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {translations.matchForfeited}
            </Badge>
          )}
        </div>
      </div>

      {/* Public comment */}
      {match.publicComment && (
        <p className="text-xs text-muted-foreground mt-2 italic">
          {match.publicComment}
        </p>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/public/schedule/match-card.tsx
git commit -m "feat: create MatchCard component for public schedule"
```

---

## Task 6: Create MatchList component

**Files:**
- Create: `apps/web/src/components/public/schedule/match-list.tsx`

**Step 1: Create the component**

Groups matches by date and renders them with day headers. No `"use client"` needed.

```tsx
import type { MatchListItem } from "@dragons/shared";
import { MatchCard } from "./match-card";

interface MatchListProps {
  matches: MatchListItem[];
  formatDate: (date: string) => string;
  translations: {
    vs: string;
    matchCancelled: string;
    matchForfeited: string;
    noMatchesThisWeekend: string;
  };
}

function groupByDate(matches: MatchListItem[]): Map<string, MatchListItem[]> {
  const groups = new Map<string, MatchListItem[]>();
  for (const match of matches) {
    const key = match.kickoffDate ?? "unknown";
    const group = groups.get(key) ?? [];
    group.push(match);
    groups.set(key, group);
  }
  return groups;
}

export function MatchList({ matches, formatDate, translations }: MatchListProps) {
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">{translations.noMatchesThisWeekend}</p>
      </div>
    );
  }

  const grouped = groupByDate(matches);

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([date, dayMatches]) => (
        <section key={date}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {date !== "unknown" ? formatDate(date) : "\u2014"}
          </h2>
          <div className="space-y-2">
            {dayMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                translations={translations}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/public/schedule/match-list.tsx
git commit -m "feat: create MatchList component grouping matches by date"
```

---

## Task 7: Create WeekendPicker component

**Files:**
- Create: `apps/web/src/components/public/schedule/weekend-picker.tsx`

**Step 1: Create the component**

Client component with arrow navigation and swipe support.

```tsx
"use client";

import { Button } from "@dragons/ui/components/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useRef } from "react";

interface WeekendPickerProps {
  /** The Saturday date string (YYYY-MM-DD) for the current weekend */
  saturday: string;
  /** Formatted label, e.g. "Sa/So 14/15 Mär" */
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function WeekendPicker({
  label,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: WeekendPickerProps) {
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const diff = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
      const threshold = 50;
      if (diff > threshold && hasPrevious) {
        onPrevious();
      } else if (diff < -threshold && hasNext) {
        onNext();
      }
      touchStartX.current = null;
    },
    [hasPrevious, hasNext, onPrevious, onNext],
  );

  return (
    <div
      className="flex items-center justify-between rounded-lg bg-muted/50 px-2 py-2"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        disabled={!hasPrevious}
        aria-label="Previous weekend"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium">{label}</span>
      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Next weekend"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/public/schedule/weekend-picker.tsx
git commit -m "feat: create WeekendPicker component with swipe support"
```

---

## Task 8: Create TeamFilter component

**Files:**
- Create: `apps/web/src/components/public/schedule/team-filter.tsx`

**Step 1: Create the component**

Client component. Uses Select on desktop, Sheet (bottom sheet) on mobile. Reads/writes the `team` URL search param.

```tsx
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";

interface Team {
  apiTeamPermanentId: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
}

interface TeamFilterProps {
  teams: Team[];
  selectedTeamApiId: number | null;
  onSelect: (teamApiId: number | null) => void;
  allTeamsLabel: string;
}

function displayName(team: Team): string {
  return team.customName ?? team.nameShort ?? team.name;
}

export function TeamFilter({
  teams,
  selectedTeamApiId,
  onSelect,
  allTeamsLabel,
}: TeamFilterProps) {
  return (
    <Select
      value={selectedTeamApiId?.toString() ?? "all"}
      onValueChange={(value) => {
        onSelect(value === "all" ? null : Number(value));
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={allTeamsLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allTeamsLabel}</SelectItem>
        {teams.map((team) => (
          <SelectItem
            key={team.apiTeamPermanentId}
            value={team.apiTeamPermanentId.toString()}
          >
            {displayName(team)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

Note: Start with Select for both mobile and desktop. A Sheet-based mobile variant can be added later if the Select doesn't feel right on small screens — YAGNI for now.

**Step 2: Commit**

```bash
git add apps/web/src/components/public/schedule/team-filter.tsx
git commit -m "feat: create TeamFilter component for public schedule"
```

---

## Task 9: Create weekend utility functions

**Files:**
- Create: `apps/web/src/lib/weekend-utils.ts`

**Step 1: Create utility functions**

Pure functions for weekend date calculations. No React, no `"use client"`.

```ts
/**
 * Get the Saturday of the week containing the given date.
 * Weeks run Mon-Sun, so Saturday is day index 6.
 */
export function getSaturday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -1 : 6 - day; // Sunday → previous Saturday
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Get the Sunday after a given Saturday */
export function getSunday(saturday: Date): Date {
  const d = new Date(saturday);
  d.setDate(d.getDate() + 1);
  return d;
}

/** Format a date as YYYY-MM-DD for API queries */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Navigate to the previous Saturday */
export function previousSaturday(saturday: Date): Date {
  const d = new Date(saturday);
  d.setDate(d.getDate() - 7);
  return d;
}

/** Navigate to the next Saturday */
export function nextSaturday(saturday: Date): Date {
  const d = new Date(saturday);
  d.setDate(d.getDate() + 7);
  return d;
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/weekend-utils.ts
git commit -m "feat: add weekend date utility functions"
```

---

## Task 10: Create ScheduleView orchestrator component

**Files:**
- Create: `apps/web/src/components/public/schedule/schedule-view.tsx`

**Step 1: Create the component**

This is the main client component that orchestrates team filter, weekend picker, and match list. It manages state and client-side data fetching.

```tsx
"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MatchListItem } from "@dragons/shared";
import { TeamFilter } from "./team-filter";
import { WeekendPicker } from "./weekend-picker";
import { MatchList } from "./match-list";
import {
  getSaturday,
  getSunday,
  toDateString,
  previousSaturday,
  nextSaturday,
} from "@/lib/weekend-utils";

interface Team {
  apiTeamPermanentId: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
}

interface ScheduleViewProps {
  teams: Team[];
  initialMatches: MatchListItem[];
  initialSaturday: string;
  formatDate: (date: string) => string;
  formatWeekendLabel: (saturday: Date, sunday: Date) => string;
  translations: {
    allTeams: string;
    vs: string;
    matchCancelled: string;
    matchForfeited: string;
    noMatchesThisWeekend: string;
  };
  apiBaseUrl: string;
}

export function ScheduleView({
  teams,
  initialMatches,
  initialSaturday,
  formatDate,
  formatWeekendLabel,
  translations,
  apiBaseUrl,
}: ScheduleViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const teamParam = searchParams.get("team");
  const selectedTeamApiId = teamParam ? Number(teamParam) : null;

  const [saturday, setSaturday] = useState(() => new Date(initialSaturday + "T12:00:00"));
  const [matches, setMatches] = useState(initialMatches);
  const [loading, setLoading] = useState(false);

  const sunday = getSunday(saturday);

  const fetchMatches = useCallback(
    async (sat: Date, teamApiId: number | null) => {
      const sun = getSunday(sat);
      const params = new URLSearchParams({
        dateFrom: toDateString(sat),
        dateTo: toDateString(sun),
      });
      if (teamApiId) {
        params.set("teamApiId", teamApiId.toString());
      }
      setLoading(true);
      try {
        const res = await fetch(`${apiBaseUrl}/public/matches?${params}`);
        const data = await res.json();
        setMatches(data.items ?? []);
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl],
  );

  const handleTeamSelect = useCallback(
    (teamApiId: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (teamApiId) {
        params.set("team", teamApiId.toString());
      } else {
        params.delete("team");
      }
      startTransition(() => {
        router.replace(`?${params.toString()}`, { scroll: false });
      });
      fetchMatches(saturday, teamApiId);
    },
    [saturday, searchParams, router, fetchMatches],
  );

  const handlePrevious = useCallback(() => {
    const prev = previousSaturday(saturday);
    setSaturday(prev);
    fetchMatches(prev, selectedTeamApiId);
  }, [saturday, selectedTeamApiId, fetchMatches]);

  const handleNext = useCallback(() => {
    const next = nextSaturday(saturday);
    setSaturday(next);
    fetchMatches(next, selectedTeamApiId);
  }, [saturday, selectedTeamApiId, fetchMatches]);

  const weekendLabel = formatWeekendLabel(saturday, sunday);

  return (
    <div className="space-y-4">
      <TeamFilter
        teams={teams}
        selectedTeamApiId={selectedTeamApiId}
        onSelect={handleTeamSelect}
        allTeamsLabel={translations.allTeams}
      />

      <WeekendPicker
        saturday={toDateString(saturday)}
        label={weekendLabel}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={true}
        hasNext={true}
      />

      <div className={loading || isPending ? "opacity-50 transition-opacity" : ""}>
        <MatchList
          matches={matches}
          formatDate={formatDate}
          translations={translations}
        />
      </div>
    </div>
  );
}
```

Note: `hasPrevious` and `hasNext` are hardcoded to `true` for now. The API doesn't expose "are there more weekends with matches" info. A future enhancement could add this, or we could pre-fetch adjacent weekends and disable when empty. For now, navigating to an empty weekend simply shows the empty state, which is acceptable.

**Step 2: Commit**

```bash
git add apps/web/src/components/public/schedule/schedule-view.tsx
git commit -m "feat: create ScheduleView orchestrator component"
```

---

## Task 11: Rewrite the schedule page

**Files:**
- Modify: `apps/web/src/app/[locale]/(public)/schedule/page.tsx`

**Step 1: Rewrite the page**

Replace the entire file. The page becomes a thin server component that fetches initial data and delegates to ScheduleView.

```tsx
import { fetchAPI } from "@/lib/api";
import { getTranslations, getFormatter } from "next-intl/server";
import type { MatchListItem } from "@dragons/shared";
import { ScheduleView } from "@/components/public/schedule/schedule-view";
import { getSaturday, getSunday, toDateString } from "@/lib/weekend-utils";

interface Team {
  apiTeamPermanentId: number;
  name: string;
  nameShort: string | null;
  customName: string | null;
  isOwnClub: boolean;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getTranslations("public");
  const format = await getFormatter();

  const teamParam = typeof params.team === "string" ? params.team : undefined;

  // Calculate the initial weekend (current week's Saturday)
  const saturday = getSaturday(new Date());
  const sunday = getSunday(saturday);

  // Build initial query
  const queryParams = new URLSearchParams({
    dateFrom: toDateString(saturday),
    dateTo: toDateString(sunday),
  });
  if (teamParam) {
    queryParams.set("teamApiId", teamParam);
  }

  const [matchData, allTeams] = await Promise.all([
    fetchAPI<{ items: MatchListItem[] }>(
      `/public/matches?${queryParams}`,
    ).catch(() => ({ items: [] })),
    fetchAPI<Team[]>("/public/teams").catch(() => []),
  ]);

  const ownClubTeams = allTeams.filter((t) => t.isOwnClub);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("schedule")}</h1>

      <ScheduleView
        teams={ownClubTeams}
        initialMatches={matchData.items}
        initialSaturday={toDateString(saturday)}
        formatDate={(date) =>
          format.dateTime(new Date(date + "T12:00:00"), {
            weekday: "long",
            day: "numeric",
            month: "long",
          })
        }
        formatWeekendLabel={(sat, sun) => {
          const satDay = sat.getDate();
          const sunDay = sun.getDate();
          const month = format.dateTime(sat, { month: "short" });
          return `Sa/So ${satDay}/${sunDay} ${month}`;
        }}
        translations={{
          allTeams: t("allTeams"),
          vs: t("vs"),
          matchCancelled: t("matchCancelled"),
          matchForfeited: t("matchForfeited"),
          noMatchesThisWeekend: t("noMatchesThisWeekend"),
        }}
        apiBaseUrl={apiBaseUrl}
      />
    </div>
  );
}
```

**Step 2: Add missing translation keys**

Check the existing i18n translation files and add any missing keys: `allTeams`, `vs`, `noMatchesThisWeekend`. Look in `apps/web/messages/` for the translation files and add the keys to the `public` namespace.

**Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/(public)/schedule/page.tsx apps/web/messages/
git commit -m "feat: rewrite schedule page with weekend-focused view"
```

---

## Task 12: Rewrite the home page

**Files:**
- Modify: `apps/web/src/app/[locale]/(public)/page.tsx`

**Step 1: Rewrite the page**

Add a "last result" card alongside the existing "next game" card. Condense navigation into a grid.

The key data fetching change: two parallel fetches using the new API params.

```tsx
import { fetchAPI } from "@/lib/api";
import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/lib/navigation";
import { CalendarDays, Trophy, Users, Home } from "lucide-react";
import type { MatchListItem, LeagueStandings } from "@dragons/shared";

function teamName(match: MatchListItem, side: "home" | "guest") {
  if (side === "home") return match.homeTeamCustomName ?? match.homeTeamNameShort ?? match.homeTeamName;
  return match.guestTeamCustomName ?? match.guestTeamNameShort ?? match.guestTeamName;
}

function formatDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function HomePage() {
  const t = await getTranslations("public");
  const format = await getFormatter();
  const today = formatDate();

  const [nextMatchData, lastResultData, standings] = await Promise.all([
    fetchAPI<{ items: MatchListItem[] }>(
      `/public/matches?limit=1&dateFrom=${today}&hasScore=false`,
    ).catch(() => ({ items: [] })),
    fetchAPI<{ items: MatchListItem[] }>(
      `/public/matches?limit=1&dateTo=${today}&hasScore=true&sort=desc`,
    ).catch(() => ({ items: [] })),
    fetchAPI<LeagueStandings[]>("/public/standings").catch(() => []),
  ]);

  const nextMatch = nextMatchData.items[0];
  const lastResult = lastResultData.items[0];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="flex flex-col items-center gap-2 pt-8 pb-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Dragons
        </h1>
        <p className="text-muted-foreground text-sm">Basketball</p>
      </section>

      {/* Next Match */}
      {nextMatch && (
        <Link href="/schedule" className="block">
          <div className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {t("nextMatch")}
              {nextMatch.kickoffDate && (
                <span className="ml-2">
                  &middot;{" "}
                  {format.dateTime(new Date(nextMatch.kickoffDate + "T12:00:00"), {
                    weekday: "short",
                  })}
                  {nextMatch.kickoffTime && ` ${nextMatch.kickoffTime.slice(0, 5)}`}
                </span>
              )}
            </p>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 text-right">
                <p className={`font-semibold ${nextMatch.homeIsOwnClub ? "text-mint-shade" : ""}`}>
                  {teamName(nextMatch, "home")}
                </p>
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {t("vs")}
              </span>
              <div className="flex-1">
                <p className={`font-semibold ${nextMatch.guestIsOwnClub ? "text-mint-shade" : ""}`}>
                  {teamName(nextMatch, "guest")}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-0.5 text-center">
              {nextMatch.leagueName && (
                <p className="text-xs text-muted-foreground">{nextMatch.leagueName}</p>
              )}
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                {nextMatch.homeIsOwnClub && <Home className="h-3 w-3" />}
                {nextMatch.venueNameOverride ?? nextMatch.venueName ?? ""}
                {nextMatch.venueCity ? `, ${nextMatch.venueCity}` : ""}
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* Last Result */}
      {lastResult && (
        <Link href="/schedule" className="block">
          <div className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {t("lastResult")}
              {lastResult.kickoffDate && (
                <span className="ml-2">
                  &middot;{" "}
                  {format.dateTime(new Date(lastResult.kickoffDate + "T12:00:00"), {
                    weekday: "short",
                  })}
                </span>
              )}
            </p>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 text-right">
                <p className={`font-semibold ${lastResult.homeIsOwnClub ? "text-mint-shade" : ""}`}>
                  {teamName(lastResult, "home")}
                </p>
              </div>
              <span className="text-xl font-bold tabular-nums">
                {lastResult.homeScore} : {lastResult.guestScore}
              </span>
              <div className="flex-1">
                <p className={`font-semibold ${lastResult.guestIsOwnClub ? "text-mint-shade" : ""}`}>
                  {teamName(lastResult, "guest")}
                </p>
              </div>
            </div>
            {lastResult.leagueName && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                {lastResult.leagueName}
              </p>
            )}
          </div>
        </Link>
      )}

      {/* Navigation Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/schedule">
          <div className="flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("schedule")}</p>
          </div>
        </Link>
        <Link href="/standings">
          <div className="flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50">
            <Trophy className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("standings")}</p>
          </div>
        </Link>
        <Link href="/teams" className="col-span-2">
          <div className="flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50">
            <Users className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("teams")}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
```

**Step 2: Add missing translation key**

Add `lastResult` to the `public` namespace in translation files.

**Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/(public)/page.tsx apps/web/messages/
git commit -m "feat: redesign home page with next game and last result cards"
```

---

## Task 13: Add tests for weekend utility functions

**Files:**
- Create: `apps/web/src/lib/weekend-utils.test.ts`

**Step 1: Write tests**

```ts
import { describe, expect, it } from "vitest";
import {
  getSaturday,
  getSunday,
  toDateString,
  previousSaturday,
  nextSaturday,
} from "./weekend-utils";

describe("getSaturday", () => {
  it("returns Saturday for a Wednesday", () => {
    const wed = new Date("2026-03-11T10:00:00"); // Wednesday
    expect(toDateString(getSaturday(wed))).toBe("2026-03-14");
  });

  it("returns same day for a Saturday", () => {
    const sat = new Date("2026-03-14T10:00:00");
    expect(toDateString(getSaturday(sat))).toBe("2026-03-14");
  });

  it("returns previous Saturday for a Sunday", () => {
    const sun = new Date("2026-03-15T10:00:00");
    expect(toDateString(getSaturday(sun))).toBe("2026-03-14");
  });

  it("returns Saturday for a Monday", () => {
    const mon = new Date("2026-03-09T10:00:00"); // Monday
    expect(toDateString(getSaturday(mon))).toBe("2026-03-14");
  });

  it("returns Saturday for a Friday", () => {
    const fri = new Date("2026-03-13T10:00:00");
    expect(toDateString(getSaturday(fri))).toBe("2026-03-14");
  });
});

describe("getSunday", () => {
  it("returns the day after Saturday", () => {
    const sat = new Date("2026-03-14T12:00:00");
    expect(toDateString(getSunday(sat))).toBe("2026-03-15");
  });
});

describe("toDateString", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(toDateString(new Date("2026-01-05T12:00:00"))).toBe("2026-01-05");
  });

  it("zero-pads single digit months and days", () => {
    expect(toDateString(new Date("2026-03-01T12:00:00"))).toBe("2026-03-01");
  });
});

describe("previousSaturday", () => {
  it("returns 7 days earlier", () => {
    const sat = new Date("2026-03-14T12:00:00");
    expect(toDateString(previousSaturday(sat))).toBe("2026-03-07");
  });
});

describe("nextSaturday", () => {
  it("returns 7 days later", () => {
    const sat = new Date("2026-03-14T12:00:00");
    expect(toDateString(nextSaturday(sat))).toBe("2026-03-21");
  });
});
```

**Step 2: Run tests**

Run: `pnpm --filter @dragons/web test` (or the appropriate test command for the web package — check if vitest is configured there. If not, these can be moved to a shared package or tested manually.)

**Step 3: Commit**

```bash
git add apps/web/src/lib/weekend-utils.test.ts
git commit -m "test: add tests for weekend date utility functions"
```

---

## Task 14: Verify, lint, and clean up

**Step 1: Run full lint and typecheck**

Run: `pnpm lint && pnpm typecheck`

Fix any issues.

**Step 2: Run all tests**

Run: `pnpm test`

Verify all existing and new tests pass.

**Step 3: Run the dev server and manually verify**

Run: `pnpm dev`

Check:
- Home page shows "Next Game" and "Last Result" cards (or gracefully handles missing data)
- Schedule page shows weekend picker and team filter
- Navigating weekends fetches new data
- Team filter scopes matches
- Match cards display correctly for both played and upcoming games
- Mobile layout looks good (check with responsive dev tools)

**Step 4: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: lint fixes and cleanup for schedule redesign"
```
