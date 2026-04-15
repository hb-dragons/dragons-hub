# Referee Games Table Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the referee games table to pre-compute `isHomeGame`/`isGuestGame` during sync, simplify client-side filtering to use only API-authoritative fields, and separate row styling into two independent visual layers (home game background + referee duty left border).

**Architecture:** Add `is_home_game`/`is_guest_game` boolean columns to the `referee_games` DB table, computed during sync. Remove `ownClubRefs` from the API response and shared type. Remove unused `srFilter` API parameter. Simplify frontend filtering and fix row styling to use two independent visual layers.

**Tech Stack:** Drizzle ORM (schema + migration), Hono (API route), React + TanStack Table (frontend), Vitest (tests)

---

### Task 1: Add `isHomeGame`/`isGuestGame` columns to DB schema

**Files:**
- Modify: `packages/db/src/schema/referee-games.ts:40-42`

- [ ] **Step 1: Add the two boolean columns to the schema**

In `packages/db/src/schema/referee-games.ts`, add two new columns after `guestClubId` (line 40) and before `leagueApiId`:

```typescript
    homeClubId: integer("home_club_id"),
    guestClubId: integer("guest_club_id"),
    isHomeGame: boolean("is_home_game").notNull().default(false),
    isGuestGame: boolean("is_guest_game").notNull().default(false),
    leagueApiId: integer("league_api_id"),
```

- [ ] **Step 2: Generate the Drizzle migration**

Run:
```bash
pnpm --filter @dragons/db db:generate
```

Expected: A new migration file in `packages/db/drizzle/` adding `is_home_game` and `is_guest_game` columns.

- [ ] **Step 3: Push the schema to dev DB**

Run:
```bash
pnpm --filter @dragons/db db:push
```

Expected: Schema updated successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/referee-games.ts packages/db/drizzle/
git commit -m "feat(db): add isHomeGame/isGuestGame columns to referee_games"
```

---

### Task 2: Compute `isHomeGame`/`isGuestGame` during sync

**Files:**
- Modify: `apps/api/src/services/sync/referee-games.sync.ts:170-228` (syncRefereeGames function)
- Test: `apps/api/src/services/sync/referee-games.sync.test.ts`

- [ ] **Step 1: Write failing tests for isHomeGame/isGuestGame computation**

Add these tests to `apps/api/src/services/sync/referee-games.sync.test.ts` inside the `syncRefereeGames` describe block:

```typescript
  it("sets isHomeGame when homeClubId matches club config", async () => {
    const result = makeApiResult();
    // homeClubId = 300 (from makeApiResult)
    mockFetchOffeneSpiele.mockResolvedValue({ total: 1, results: [result] });

    // No existing row
    const mockFrom = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    });
    mockSelect.mockReturnValue({ from: mockFrom });

    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1, apiMatchId: 1001 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncRefereeGames();

    // Verify insert was called with isHomeGame/isGuestGame
    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues).toHaveProperty("isHomeGame");
    expect(insertedValues).toHaveProperty("isGuestGame");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm --filter @dragons/api test -- --run apps/api/src/services/sync/referee-games.sync.test.ts
```

Expected: FAIL — `isHomeGame` property not present in insert values.

- [ ] **Step 3: Add getClubConfig import and compute flags in syncRefereeGames**

In `apps/api/src/services/sync/referee-games.sync.ts`:

Add import at the top (after existing imports):
```typescript
import { getClubConfig } from "../admin/settings.service";
```

In `syncRefereeGames`, after the `ownClubRefsMap` setup (line 195) and before the `for` loop (line 201), add:
```typescript
  // Fetch club config once for isHomeGame/isGuestGame computation
  const clubConfig = await getClubConfig();
  const clubId = clubConfig?.clubId ?? null;
```

Then inside the `for` loop, after `const mapped = mapApiResultToRow(result);` (line 203), add:
```typescript
      const isHomeGame = clubId !== null && mapped.homeClubId === clubId;
      const isGuestGame = clubId !== null && mapped.guestClubId === clubId;
```

In the INSERT block (line 220), add `isHomeGame` and `isGuestGame` to the values:
```typescript
        const [inserted] = await db.insert(refereeGames).values({
          ...mapped,
          matchId,
          ownClubRefs,
          isHomeGame,
          isGuestGame,
          dataHash: hash,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        }).returning({ id: refereeGames.id, apiMatchId: refereeGames.apiMatchId });
```

In the UPDATE block (line 263), add `isHomeGame` and `isGuestGame` to the set:
```typescript
        await db
          .update(refereeGames)
          .set({
            ...mapped,
            matchId,
            ownClubRefs,
            isHomeGame,
            isGuestGame,
            dataHash: hash,
            lastSyncedAt: now,
            updatedAt: now,
          })
          .where(eq(refereeGames.id, existing.id));
```

- [ ] **Step 4: Add mock for getClubConfig in test file**

In `apps/api/src/services/sync/referee-games.sync.test.ts`, add after the existing mocks (around line 60):

```typescript
const mockGetClubConfig = vi.fn().mockResolvedValue({ clubId: 300, clubName: "SC Dragons" });
vi.mock("../admin/settings.service", () => ({
  getClubConfig: () => mockGetClubConfig(),
}));
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
pnpm --filter @dragons/api test -- --run apps/api/src/services/sync/referee-games.sync.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/sync/referee-games.sync.ts apps/api/src/services/sync/referee-games.sync.test.ts
git commit -m "feat(sync): compute isHomeGame/isGuestGame during referee games sync"
```

---

### Task 3: Simplify the API service — remove srFilter, runtime isHomeGame, ownClubRefs

**Files:**
- Modify: `apps/api/src/services/referee/referee-games.service.ts`
- Modify: `apps/api/src/routes/referee/games.routes.ts`
- Test: `apps/api/src/services/referee/referee-games.service.test.ts`

- [ ] **Step 1: Update the test to remove srFilter test and update mock schema**

In `apps/api/src/services/referee/referee-games.service.test.ts`:

Update the mock schema to include the new columns and remove `ownClubRefs` reference. Replace the `@dragons/db/schema` mock (lines 13-37):

```typescript
vi.mock("@dragons/db/schema", () => ({
  refereeGames: {
    id: "rg.id",
    apiMatchId: "rg.apiMatchId",
    matchId: "rg.matchId",
    matchNo: "rg.matchNo",
    kickoffDate: "rg.kickoffDate",
    kickoffTime: "rg.kickoffTime",
    homeTeamName: "rg.homeTeamName",
    guestTeamName: "rg.guestTeamName",
    leagueName: "rg.leagueName",
    leagueShort: "rg.leagueShort",
    venueName: "rg.venueName",
    venueCity: "rg.venueCity",
    sr1OurClub: "rg.sr1OurClub",
    sr2OurClub: "rg.sr2OurClub",
    sr1Name: "rg.sr1Name",
    sr2Name: "rg.sr2Name",
    sr1Status: "rg.sr1Status",
    sr2Status: "rg.sr2Status",
    isCancelled: "rg.isCancelled",
    isForfeited: "rg.isForfeited",
    isHomeGame: "rg.isHomeGame",
    isGuestGame: "rg.isGuestGame",
    lastSyncedAt: "rg.lastSyncedAt",
  },
}));
```

Remove the `ne` import from the drizzle-orm mock (line 42) since it's no longer used.

Delete the `srFilter` test case (lines 162-173: `"filters by srFilter 'our-club-open'"` test).

Remove `getSetting` mock if present — the service no longer needs it.

Update `makeGameRow` to include `isHomeGame` and `isGuestGame` and remove `ownClubRefs`:

```typescript
function makeGameRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    apiMatchId: 1001,
    matchId: 50,
    matchNo: 42,
    kickoffDate: "2026-04-25",
    kickoffTime: "14:00",
    homeTeamName: "Dragons 1",
    guestTeamName: "Titans 1",
    leagueName: "Kreisliga Nord",
    leagueShort: "KLN",
    venueName: "Sporthalle West",
    venueCity: "Berlin",
    sr1OurClub: true,
    sr2OurClub: false,
    sr1Name: null,
    sr2Name: null,
    sr1Status: "open",
    sr2Status: "offered",
    isCancelled: false,
    isForfeited: false,
    isHomeGame: true,
    isGuestGame: false,
    lastSyncedAt: new Date("2026-04-14T10:00:00Z"),
    ...overrides,
  };
}
```

- [ ] **Step 2: Rewrite the service**

Replace the entire content of `apps/api/src/services/referee/referee-games.service.ts`:

```typescript
import { db } from "../../config/database";
import { refereeGames } from "@dragons/db/schema";
import { and, eq, gte, lte, or, ilike, sql, asc } from "drizzle-orm";
import type { RefereeGameListItem } from "@dragons/shared";

interface GetRefereeGamesParams {
  limit: number;
  offset: number;
  search?: string;
  status?: "active" | "cancelled" | "forfeited" | "all";
  league?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getRefereeGames(params: GetRefereeGamesParams) {
  const { limit, offset, search, status, league, dateFrom, dateTo } = params;
  const conditions = [];

  // Status
  if (status === "cancelled") conditions.push(eq(refereeGames.isCancelled, true));
  else if (status === "forfeited") conditions.push(eq(refereeGames.isForfeited, true));
  else if (status !== "all") {
    conditions.push(eq(refereeGames.isCancelled, false));
    conditions.push(eq(refereeGames.isForfeited, false));
  }

  // League
  if (league) conditions.push(eq(refereeGames.leagueShort, league));

  // Date range
  if (dateFrom) conditions.push(gte(refereeGames.kickoffDate, dateFrom));
  if (dateTo) conditions.push(lte(refereeGames.kickoffDate, dateTo));

  // Search
  if (search) {
    const words = search.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const pattern = `%${word}%`;
      conditions.push(or(
        ilike(refereeGames.homeTeamName, pattern),
        ilike(refereeGames.guestTeamName, pattern),
        ilike(refereeGames.leagueName, pattern),
      )!);
    }
  }

  const whereClause = conditions.length > 0
    ? conditions.length === 1 ? conditions[0]! : and(...conditions)!
    : undefined;

  const isTrackedLeague = sql<boolean>`${refereeGames.matchId} IS NOT NULL`.as("is_tracked_league");

  const [items, countResult] = await Promise.all([
    db.select({
      id: refereeGames.id,
      apiMatchId: refereeGames.apiMatchId,
      matchId: refereeGames.matchId,
      matchNo: refereeGames.matchNo,
      kickoffDate: refereeGames.kickoffDate,
      kickoffTime: refereeGames.kickoffTime,
      homeTeamName: refereeGames.homeTeamName,
      guestTeamName: refereeGames.guestTeamName,
      leagueName: refereeGames.leagueName,
      leagueShort: refereeGames.leagueShort,
      venueName: refereeGames.venueName,
      venueCity: refereeGames.venueCity,
      sr1OurClub: refereeGames.sr1OurClub,
      sr2OurClub: refereeGames.sr2OurClub,
      sr1Name: refereeGames.sr1Name,
      sr2Name: refereeGames.sr2Name,
      sr1Status: refereeGames.sr1Status,
      sr2Status: refereeGames.sr2Status,
      isCancelled: refereeGames.isCancelled,
      isForfeited: refereeGames.isForfeited,
      lastSyncedAt: refereeGames.lastSyncedAt,
      isTrackedLeague,
      isHomeGame: refereeGames.isHomeGame,
      isGuestGame: refereeGames.isGuestGame,
    })
    .from(refereeGames)
    .where(whereClause)
    .orderBy(asc(refereeGames.kickoffDate), asc(refereeGames.kickoffTime))
    .limit(limit)
    .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
    .from(refereeGames)
    .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;
  return {
    items: items as RefereeGameListItem[],
    total, limit, offset,
    hasMore: offset + items.length < total,
  };
}
```

- [ ] **Step 3: Update the route to remove srFilter**

Replace `apps/api/src/routes/referee/games.routes.ts`:

```typescript
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { requireReferee } from "../../middleware/auth";
import { getRefereeGames } from "../../services/referee/referee-games.service";

const refereeGamesRoutes = new Hono<AppEnv>();
refereeGamesRoutes.use("/*", requireReferee);

refereeGamesRoutes.get("/games", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || 100), 500);
  const offset = Number(c.req.query("offset") || 0);
  const search = c.req.query("search") || undefined;
  const status = (c.req.query("status") || "active") as "active" | "cancelled" | "forfeited" | "all";
  const league = c.req.query("league") || undefined;
  const dateFrom = c.req.query("dateFrom") || undefined;
  const dateTo = c.req.query("dateTo") || undefined;

  const result = await getRefereeGames({ limit, offset, search, status, league, dateFrom, dateTo });
  return c.json(result);
});

export { refereeGamesRoutes };
```

- [ ] **Step 4: Run tests**

Run:
```bash
pnpm --filter @dragons/api test -- --run apps/api/src/services/referee/referee-games.service.test.ts
```

Expected: All tests PASS (the srFilter test is deleted, remaining tests still pass).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/referee/referee-games.service.ts apps/api/src/routes/referee/games.routes.ts apps/api/src/services/referee/referee-games.service.test.ts
git commit -m "refactor(api): simplify referee games query — remove srFilter, ownClubRefs, runtime isHomeGame"
```

---

### Task 4: Update shared type — remove `ownClubRefs`

**Files:**
- Modify: `packages/shared/src/referee-games.ts`

- [ ] **Step 1: Remove ownClubRefs from the interface**

In `packages/shared/src/referee-games.ts`, remove the `ownClubRefs: boolean;` line. The final type:

```typescript
export interface RefereeGameListItem {
  id: number;
  apiMatchId: number;
  matchId: number | null;
  matchNo: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeamName: string;
  guestTeamName: string;
  leagueName: string | null;
  leagueShort: string | null;
  venueName: string | null;
  venueCity: string | null;
  sr1OurClub: boolean;
  sr2OurClub: boolean;
  sr1Name: string | null;
  sr2Name: string | null;
  sr1Status: "open" | "offered" | "assigned";
  sr2Status: "open" | "offered" | "assigned";
  isCancelled: boolean;
  isForfeited: boolean;
  isTrackedLeague: boolean;
  isHomeGame: boolean;
  isGuestGame: boolean;
  lastSyncedAt: string | null;
}
```

- [ ] **Step 2: Verify no other files reference `ownClubRefs` from this type**

Run:
```bash
grep -r "ownClubRefs" apps/web/ --include="*.ts" --include="*.tsx"
```

Expected: Only hits in `referee-games-list.tsx` (which we'll fix in the next task). If any other files reference it, note them for the next task.

- [ ] **Step 3: Run typecheck to see what breaks**

Run:
```bash
pnpm typecheck 2>&1 | head -30
```

Expected: Errors in `referee-games-list.tsx` referencing `ownClubRefs` — these will be fixed in Task 5.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/referee-games.ts
git commit -m "refactor(shared): remove ownClubRefs from RefereeGameListItem type"
```

---

### Task 5: Refactor the frontend component — filtering + row styling

**Files:**
- Modify: `apps/web/src/components/referee/referee-games-list.tsx`

- [ ] **Step 1: Replace the entire component**

Replace `apps/web/src/components/referee/referee-games-list.tsx` with the refactored version. Key changes:
- Filter logic simplified: `available` uses only `srXOurClub` + offered status
- `assigned` filter: `srXOurClub` duty games with assignments
- Row styling: two independent layers (home bg + duty border)
- Remove all `ownClubRefs` references

```tsx
"use client";

import { useMemo, useState, useCallback } from "react";
import { useTranslations, useFormatter } from "next-intl";
import useSWR from "swr";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import type { RefereeGameListItem, PaginatedResponse } from "@dragons/shared";
import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { cn } from "@dragons/ui/lib/utils";
import {
  Ban,
  Calendar,
  CircleOff,
  Loader2,
  RefreshCw,
  SearchIcon,
  SquareActivity,
} from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";

// ------------------------------------------------------------------
// SrSlotBadge
// ------------------------------------------------------------------

interface SrSlotBadgeProps {
  status: "open" | "offered" | "assigned";
  ourClub: boolean;
  name: string | null;
  t: ReturnType<typeof useTranslations<"refereeGames">>;
}

function SrSlotBadge({ status, ourClub, name, t }: SrSlotBadgeProps) {
  if (status === "assigned" && ourClub) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "rounded-4xl whitespace-nowrap",
          "bg-primary/10 text-primary border-primary/20",
        )}
      >
        {name ?? t("srStatus.assigned")}
      </Badge>
    );
  }

  if (status === "assigned") {
    return (
      <span className="text-sm text-muted-foreground">{name ?? t("srStatus.assigned")}</span>
    );
  }

  if (status === "offered" && ourClub) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "rounded-4xl whitespace-nowrap",
          "border-heat/20 bg-heat/10 text-heat",
        )}
      >
        {name ?? t("srStatus.offered")}
      </Badge>
    );
  }

  if (status === "offered") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "rounded-4xl whitespace-nowrap",
          "border-secondary/20 bg-secondary/10 text-secondary-foreground",
        )}
      >
        {name ?? t("srStatus.offered")}
      </Badge>
    );
  }

  // open
  if (ourClub) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "rounded-4xl whitespace-nowrap font-medium",
          "border-heat/30 bg-heat/15 text-heat",
        )}
      >
        {t("srStatus.open")}
      </Badge>
    );
  }

  return (
    <span className="text-sm text-muted-foreground">{t("srStatus.open")}</span>
  );
}

// ------------------------------------------------------------------
// FacetChips — game filter tabs
// ------------------------------------------------------------------

type GameFilterValue = "available" | "assigned" | "all";

interface FacetChipsProps {
  value: GameFilterValue;
  onChange: (v: GameFilterValue) => void;
  options: { label: string; value: GameFilterValue }[];
}

function FacetChips({ value, onChange, options }: FacetChipsProps) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-4xl border px-3 py-1 text-xs transition-colors",
            value === opt.value
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Filtering helpers
// ------------------------------------------------------------------

function isAvailable(m: RefereeGameListItem): boolean {
  return (
    (m.sr1OurClub && m.sr1Status !== "assigned") ||
    (m.sr2OurClub && m.sr2Status !== "assigned") ||
    m.sr1Status === "offered" ||
    m.sr2Status === "offered"
  );
}

function isAssigned(m: RefereeGameListItem): boolean {
  return (
    (m.sr1OurClub || m.sr2OurClub) &&
    (m.sr1Status === "assigned" || m.sr2Status === "assigned")
  );
}

// ------------------------------------------------------------------
// Row styling helpers
// ------------------------------------------------------------------

function hasUnfilledDuty(m: RefereeGameListItem): boolean {
  return (
    (m.sr1OurClub && m.sr1Status !== "assigned") ||
    (m.sr2OurClub && m.sr2Status !== "assigned")
  );
}

function hasAllDutyFilled(m: RefereeGameListItem): boolean {
  const hasDuty = m.sr1OurClub || m.sr2OurClub;
  if (!hasDuty) return false;
  const sr1Ok = !m.sr1OurClub || m.sr1Status === "assigned";
  const sr2Ok = !m.sr2OurClub || m.sr2Status === "assigned";
  return sr1Ok && sr2Ok;
}

// ------------------------------------------------------------------
// Global filter
// ------------------------------------------------------------------

const globalFilterFn: FilterFn<RefereeGameListItem> = (row, _columnId, filterValue) => {
  const search = (filterValue as string).toLowerCase();
  if (!search) return true;
  const m = row.original;
  return (
    m.homeTeamName.toLowerCase().includes(search) ||
    m.guestTeamName.toLowerCase().includes(search) ||
    (m.leagueName ?? "").toLowerCase().includes(search) ||
    (m.venueName ?? "").toLowerCase().includes(search)
  );
};

// ------------------------------------------------------------------
// Column definitions
// ------------------------------------------------------------------

function getColumns(
  t: ReturnType<typeof useTranslations<"refereeGames">>,
  format: ReturnType<typeof useFormatter>,
): ColumnDef<RefereeGameListItem, unknown>[] {
  return [
    {
      accessorKey: "kickoffDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.date")} />
      ),
      cell: ({ row }) => {
        const inactive = row.original.isCancelled || row.original.isForfeited;
        return (
          <span className={cn("whitespace-nowrap text-sm", inactive && "line-through")}>
            {format.dateTime(new Date(row.original.kickoffDate + "T00:00:00"), "matchDate")}
          </span>
        );
      },
      meta: { label: t("columns.date") },
    },
    {
      accessorKey: "kickoffTime",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.time")} />
      ),
      cell: ({ row }) => {
        const inactive = row.original.isCancelled || row.original.isForfeited;
        return (
          <span className={cn("whitespace-nowrap tabular-nums text-sm", inactive && "line-through")}>
            {row.original.kickoffTime?.slice(0, 5) ?? ""}
          </span>
        );
      },
      meta: { label: t("columns.time") },
    },
    {
      accessorKey: "homeTeamName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.home")} />
      ),
      cell: ({ row }) => {
        const m = row.original;
        const inactive = m.isCancelled || m.isForfeited;
        return (
          <span className={cn("text-sm", inactive && "line-through", m.isHomeGame && "font-medium text-primary")}>
            {m.homeTeamName}
          </span>
        );
      },
      meta: { label: t("columns.home") },
    },
    {
      accessorKey: "guestTeamName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.guest")} />
      ),
      cell: ({ row }) => {
        const m = row.original;
        const inactive = m.isCancelled || m.isForfeited;
        return (
          <span className={cn("text-sm", inactive && "line-through", m.isGuestGame && "font-medium text-primary")}>
            {m.guestTeamName}
          </span>
        );
      },
      meta: { label: t("columns.guest") },
    },
    {
      accessorKey: "leagueName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.league")} />
      ),
      cell: ({ row }) => {
        const m = row.original;
        const inactive = m.isCancelled || m.isForfeited;
        if (inactive) {
          return (
            <Badge variant="outline" className="rounded-4xl text-destructive border-destructive/30">
              {m.isCancelled ? t("status.cancelled") : t("status.forfeited")}
            </Badge>
          );
        }
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">{m.leagueName ?? "—"}</span>
            {!m.isTrackedLeague && (
              <Badge variant="outline" className="rounded-4xl text-xs text-muted-foreground border-border">
                {t("badges.untracked")}
              </Badge>
            )}
          </div>
        );
      },
      meta: { label: t("columns.league") },
    },
    {
      id: "sr1",
      accessorFn: () => null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.sr1")} />
      ),
      cell: ({ row }) => {
        const m = row.original;
        if (m.isCancelled || m.isForfeited) return <span className="text-muted-foreground">—</span>;
        return (
          <SrSlotBadge
            status={m.sr1Status}
            ourClub={m.sr1OurClub}
            name={m.sr1Name}
            t={t}
          />
        );
      },
      enableSorting: false,
      meta: { label: t("columns.sr1") },
    },
    {
      id: "sr2",
      accessorFn: () => null,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.sr2")} />
      ),
      cell: ({ row }) => {
        const m = row.original;
        if (m.isCancelled || m.isForfeited) return <span className="text-muted-foreground">—</span>;
        return (
          <SrSlotBadge
            status={m.sr2Status}
            ourClub={m.sr2OurClub}
            name={m.sr2Name}
            t={t}
          />
        );
      },
      enableSorting: false,
      meta: { label: t("columns.sr2") },
    },
    {
      id: "status",
      accessorFn: (row) => {
        if (row.isForfeited) return "forfeited";
        if (row.isCancelled) return "cancelled";
        return "active";
      },
      header: () => null,
      cell: () => null,
      filterFn: (row, id, value) => {
        const filterValues = value as string[] | undefined;
        if (!filterValues || filterValues.length === 0) return true;
        return filterValues.includes(row.getValue(id) as string);
      },
      enableSorting: false,
      enableHiding: false,
      meta: { label: t("status.active") },
    },
  ];
}

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------

export function RefereeGamesList() {
  const t = useTranslations("refereeGames");
  const format = useFormatter();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  const [syncing, setSyncing] = useState(false);
  const [gameFilter, setGameFilter] = useState<GameFilterValue>("available");
  const [search, setSearch] = useState("");

  const { data } = useSWR<PaginatedResponse<RefereeGameListItem>>(
    SWR_KEYS.refereeGames,
    apiFetcher,
  );

  const allItems = useMemo(() => data?.items ?? [], [data?.items]);

  // Apply game filter
  const items = useMemo(() => {
    if (gameFilter === "all") return allItems;
    if (gameFilter === "available") return allItems.filter(isAvailable);
    return allItems.filter(isAssigned);
  }, [allItems, gameFilter]);

  function getRowClassName(row: Row<RefereeGameListItem>) {
    const m = row.original;
    const inactive = m.isCancelled || m.isForfeited;

    // Layer 1: Home game background
    const homeBg = m.isHomeGame && "bg-primary/5";

    // Layer 2: Left border for duty status
    let dutyBorder: string | false = false;
    if (hasUnfilledDuty(m)) {
      dutyBorder = "border-l-2 border-l-destructive/50";
    } else if (hasAllDutyFilled(m)) {
      dutyBorder = "border-l-2 border-l-primary/50";
    }

    return cn(homeBg, dutyBorder, inactive && "opacity-60");
  }

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetchAPI("/admin/settings/referee-games-sync", { method: "POST" });
      toast.success(t("syncTriggered"));
    } catch {
      toast.error(t("syncFailed"));
    } finally {
      setSyncing(false);
    }
  }, [t]);

  const columns = useMemo(() => getColumns(t, format), [t, format]);

  const statusFilterOptions = [
    { label: t("status.active"), value: "active", icon: SquareActivity },
    { label: t("status.cancelled"), value: "cancelled", icon: Ban },
    { label: t("status.forfeited"), value: "forfeited", icon: CircleOff },
  ];

  return (
    <DataTable
      columns={columns}
      data={items}
      rowClassName={getRowClassName}
      globalFilterFn={globalFilterFn}
      initialColumnVisibility={{ status: false }}
      initialColumnFilters={[{ id: "status", value: ["active"] }]}
      emptyState={
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Calendar className="mb-2 h-8 w-8" />
          <p>{t("filters.all")}</p>
        </div>
      }
    >
      {(table) => (
        <DataTableToolbar table={table}>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("filters.search")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                table.setGlobalFilter(e.target.value);
              }}
              className="h-8 w-[150px] pl-8 lg:w-[250px]"
            />
          </div>
          <DataTableFacetedFilter
            column={table.getColumn("status")!}
            title={t("filters.status")}
            options={statusFilterOptions}
          />
          <FacetChips
            value={gameFilter}
            onChange={setGameFilter}
            options={[
              { label: t("filters.available"), value: "available" },
              { label: t("filters.assigned"), value: "assigned" },
              { label: t("filters.all"), value: "all" },
            ]}
          />
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {t("syncButton")}
            </Button>
          )}
        </DataTableToolbar>
      )}
    </DataTable>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
pnpm typecheck
```

Expected: No errors. The `ownClubRefs` references are gone, `isHomeGame`/`isGuestGame` are now read from the pre-computed DB columns.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/referee/referee-games-list.tsx
git commit -m "refactor(web): simplify referee games filtering and fix row styling

Two independent visual layers: home game background (bg-primary/5)
and duty left border (destructive=open, primary=filled). Remove
ownClubRefs from filter logic — trust sr1OurClub/sr2OurClub."
```

---

### Task 6: Run full CI checks

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck across all packages**

Run:
```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 2: Run lint**

Run:
```bash
pnpm lint
```

Expected: No errors.

- [ ] **Step 3: Run all tests**

Run:
```bash
pnpm --filter @dragons/api test -- --run
```

Expected: All tests pass.

- [ ] **Step 4: Run AI slop check**

Run:
```bash
pnpm check:ai-slop
```

Expected: No violations.

- [ ] **Step 5: Fix any issues found and commit**

If any CI checks fail, fix the issues and commit the fixes.

---

### Task 7: Visual verification in browser

**Files:** None (verification only)

- [ ] **Step 1: Start dev servers**

Run:
```bash
pnpm dev
```

- [ ] **Step 2: Open the referee games page in the browser**

Navigate to `http://localhost:3000` and go to the referee games page. Verify:

1. **Home game rows** have a light orange background (`bg-primary/5`)
2. **Games with unfilled duty** have a red left border
3. **Games with all duty filled** have a blue/primary left border  
4. **Games with no duty** have no left border
5. **Home game + unfilled duty** = orange bg + red left border (both layers visible)
6. **Home game + all filled** = orange bg + blue left border
7. **Away game + no duty** = plain row
8. **Cancelled/forfeited** games have reduced opacity
9. **"Available" filter** shows only games with unfilled our-club slots or offered slots
10. **"Assigned" filter** shows only our-club duty games with at least one assignment
11. **"All" filter** shows everything
12. **Home team name** is bold + primary color for home games
13. **Guest team name** is bold + primary color for away games (where we're the guest)

- [ ] **Step 3: Fix any visual issues found**

If anything doesn't look right, fix it and commit.
