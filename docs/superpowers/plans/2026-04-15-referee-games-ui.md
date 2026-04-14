# Referee Games UI & Sync Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the match-based referee view with a `referee_games`-sourced view, add sync run logging to referee games sync, and integrate referee sync monitoring as a tab in the sync dashboard.

**Architecture:** Backend adds sync logging infrastructure to `syncRefereeGames()`, a new `GET /referee/games` endpoint, and `syncType` filtering to existing sync APIs. Frontend replaces `referee-match-list.tsx` with a new `referee-games-list.tsx` and adds a "Referee Games" tab to the sync dashboard.

**Tech Stack:** Hono, Drizzle ORM, BullMQ, SyncLogger, Next.js 16, SWR, Radix UI Tabs, DataTable, next-intl

---

### Task 1: Add `"refereeGame"` EntityType

**Files:**
- Modify: `packages/shared/src/constants.ts:22-31`
- Modify: `apps/api/src/services/sync/sync-logger.ts:11`

- [ ] **Step 1: Update shared constants**

In `packages/shared/src/constants.ts`, add `"refereeGame"` to the `ENTITY_TYPES` array:

```typescript
export const ENTITY_TYPES = [
  "league",
  "match",
  "standing",
  "team",
  "venue",
  "referee",
  "refereeRole",
  "refereeGame",
] as const;
```

- [ ] **Step 2: Update SyncLogger local type**

In `apps/api/src/services/sync/sync-logger.ts`, line 11, add `"refereeGame"` to the local `EntityType`:

```typescript
export type EntityType = "league" | "match" | "standing" | "team" | "venue" | "referee" | "refereeRole" | "refereeGame";
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no consumers break — `EntityType` union just got wider)

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants.ts apps/api/src/services/sync/sync-logger.ts
git commit -m "feat: add refereeGame to EntityType constants"
```

---

### Task 2: Wire Sync Run Lifecycle for Referee Games

**Files:**
- Modify: `apps/api/src/workers/queues.ts:52-66`
- Modify: `apps/api/src/workers/sync.worker.ts:33-37`
- Modify: `apps/api/src/services/sync/referee-games.sync.ts:168`
- Modify: `apps/api/src/routes/admin/settings.routes.ts:127-141`

- [ ] **Step 1: Update `triggerRefereeGamesSync` to create sync_run**

In `apps/api/src/workers/queues.ts`, replace the `triggerRefereeGamesSync` function:

```typescript
export async function triggerRefereeGamesSync(triggeredBy?: string): Promise<{
  syncRunId: number;
  status: string;
} | null> {
  const existing = await syncQueue.getJob("referee-games-sync");
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting") {
      logger.info("Referee games sync already queued, skipping");
      return null;
    }
  }

  const [syncRun] = await db
    .insert(syncRuns)
    .values({
      syncType: "referee-games",
      triggeredBy: triggeredBy ?? "manual",
      status: "pending",
      startedAt: new Date(),
    })
    .returning();

  await syncQueue.add(
    "referee-games-sync",
    { type: "referee-games", triggeredBy, syncRunId: syncRun!.id },
    { jobId: `referee-games-sync-${syncRun!.id}`, removeOnComplete: true, removeOnFail: 100 },
  );

  return { syncRunId: syncRun!.id, status: "queued" };
}
```

- [ ] **Step 2: Update sync worker referee-games case**

In `apps/api/src/workers/sync.worker.ts`, replace the `case "referee-games"` block:

```typescript
case "referee-games": {
  const { syncRefereeGames } = await import("../services/sync/referee-games.sync");
  const { createSyncLogger } = await import("../services/sync/sync-logger");

  // Update sync run to "running"
  if (job.data.syncRunId) {
    await db
      .update(syncRuns)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(syncRuns.id, job.data.syncRunId));
  }

  const syncLogger = job.data.syncRunId
    ? createSyncLogger(job.data.syncRunId)
    : undefined;

  try {
    const result = await syncRefereeGames(syncLogger);

    if (syncLogger) await syncLogger.close();

    // Update sync run with final counts
    if (job.data.syncRunId) {
      const completedAt = new Date();
      const startedAt = job.timestamp ? new Date(job.timestamp) : completedAt;
      await db
        .update(syncRuns)
        .set({
          status: "completed",
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          recordsProcessed: result.created + result.updated + result.unchanged,
          recordsCreated: result.created,
          recordsUpdated: result.updated,
          recordsSkipped: result.unchanged,
          recordsFailed: 0,
        })
        .where(eq(syncRuns.id, job.data.syncRunId));
    }

    return { completed: true, type: job.data.type, ...result };
  } catch (error) {
    if (syncLogger) await syncLogger.close();

    if (job.data.syncRunId) {
      await db
        .update(syncRuns)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        .where(eq(syncRuns.id, job.data.syncRunId));
    }

    throw error;
  }
}
```

- [ ] **Step 3: Add SyncLogger parameter to `syncRefereeGames`**

In `apps/api/src/services/sync/referee-games.sync.ts`, update the function signature and add logging. Add import at top:

```typescript
import type { SyncLogger } from "./sync-logger";
```

Update function signature:

```typescript
export async function syncRefereeGames(syncLogger?: SyncLogger): Promise<{
  created: number;
  updated: number;
  unchanged: number;
}> {
```

After each `created++`, `updated++`, `unchanged++`, and in the catch block, add logger calls:

After `created++`:
```typescript
await syncLogger?.log({
  entityType: "refereeGame",
  entityId: String(mapped.apiMatchId),
  entityName: `${mapped.homeTeamName} vs ${mapped.guestTeamName}`,
  action: "created",
  message: hasOpenOurClubSlot(mapped) ? "New game with open our-club slot" : "New game",
});
```

After `updated++`:
```typescript
await syncLogger?.log({
  entityType: "refereeGame",
  entityId: String(mapped.apiMatchId),
  entityName: `${mapped.homeTeamName} vs ${mapped.guestTeamName}`,
  action: "updated",
  message: nowCancelledOrForfeited ? "Game cancelled/forfeited" : "Game data changed",
});
```

After `unchanged++`:
```typescript
await syncLogger?.log({
  entityType: "refereeGame",
  entityId: String(mapped.apiMatchId),
  entityName: `${mapped.homeTeamName} vs ${mapped.guestTeamName}`,
  action: "skipped",
});
```

In the per-game catch block:
```typescript
await syncLogger?.log({
  entityType: "refereeGame",
  entityId: String(result.sp.spielplanId),
  entityName: `${result.sp.heimMannschaftLiga.mannschaftName} vs ${result.sp.gastMannschaftLiga.mannschaftName}`,
  action: "failed",
  message: err instanceof Error ? err.message : String(err),
});
```

- [ ] **Step 4: Update settings route to pass userId and return syncRunId**

In `apps/api/src/routes/admin/settings.routes.ts`, update the referee-games-sync handler:

```typescript
settingsRoutes.post(
  "/settings/referee-games-sync",
  requireAdmin,
  describeRoute({
    description: "Trigger a manual referee games sync",
    tags: ["Settings"],
    responses: { 200: { description: "Sync triggered" } },
  }),
  async (c) => {
    const sessionUser = c.get("user");
    const { triggerRefereeGamesSync } = await import("../../workers/queues");
    const result = await triggerRefereeGamesSync(sessionUser.id);
    if (!result) {
      return c.json({ error: "Referee games sync already in progress" }, 409);
    }
    return c.json({ success: true, syncRunId: result.syncRunId, message: "Referee games sync triggered" });
  },
);
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/workers/queues.ts apps/api/src/workers/sync.worker.ts apps/api/src/services/sync/referee-games.sync.ts apps/api/src/routes/admin/settings.routes.ts
git commit -m "feat: wire sync run lifecycle and logging for referee games sync"
```

---

### Task 3: Add `syncType` Filtering to Sync API

**Files:**
- Modify: `apps/api/src/routes/admin/sync.schemas.ts:11`
- Modify: `apps/api/src/services/admin/sync-admin.service.ts:37-57,59-88`
- Modify: `apps/api/src/routes/admin/sync.routes.ts` (status and logs endpoints)

- [ ] **Step 1: Add syncType to query schemas**

In `apps/api/src/routes/admin/sync.schemas.ts`, add `syncType` to `syncLogsQuerySchema`:

```typescript
export const syncLogsQuerySchema = paginationSchema.extend({
  status: syncRunStatusEnum.optional(),
  syncType: z.string().optional(),
});

export type SyncLogsQuery = z.infer<typeof syncLogsQuerySchema>;
```

Create a new schema for sync status:

```typescript
export const syncStatusQuerySchema = z.object({
  syncType: z.string().optional(),
});

export type SyncStatusQuery = z.infer<typeof syncStatusQuerySchema>;
```

- [ ] **Step 2: Update `getSyncStatus` to accept syncType filter**

In `apps/api/src/services/admin/sync-admin.service.ts`, update `getSyncStatus`:

```typescript
export async function getSyncStatus(syncType?: string) {
  let lastSyncQuery = db
    .select()
    .from(syncRuns)
    .$dynamic();

  let runningSyncQuery = db
    .select()
    .from(syncRuns)
    .$dynamic();

  if (syncType) {
    lastSyncQuery = lastSyncQuery.where(eq(syncRuns.syncType, syncType));
    runningSyncQuery = runningSyncQuery.where(
      and(eq(syncRuns.status, "running"), eq(syncRuns.syncType, syncType))!,
    );
  } else {
    runningSyncQuery = runningSyncQuery.where(eq(syncRuns.status, "running"));
  }

  const [lastSync] = await lastSyncQuery
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  const [runningSync] = await runningSyncQuery.limit(1);

  const runs = [lastSync, runningSync].filter(Boolean) as (typeof syncRuns.$inferSelect)[];
  const nameMap = await resolveTriggeredByNames(runs);

  return {
    lastSync: lastSync ? addTriggeredByName(lastSync, nameMap) : null,
    isRunning: !!runningSync,
  };
}
```

Add `and` to the drizzle-orm import if not already present.

- [ ] **Step 3: Update `getSyncLogs` to accept syncType filter**

In `apps/api/src/services/admin/sync-admin.service.ts`, update `getSyncLogs`:

```typescript
export async function getSyncLogs(params: SyncLogsQuery) {
  const { limit, offset, status, syncType } = params;

  const conditions = [];
  if (status) conditions.push(eq(syncRuns.status, status));
  if (syncType) conditions.push(eq(syncRuns.syncType, syncType));

  let query = db.select().from(syncRuns).$dynamic();
  let countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(syncRuns)
    .$dynamic();

  if (conditions.length > 0) {
    const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions)!;
    query = query.where(whereClause);
    countQuery = countQuery.where(whereClause);
  }

  const [logs, countResult] = await Promise.all([
    query.orderBy(desc(syncRuns.startedAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  const total = countResult[0]?.count ?? 0;
  const nameMap = await resolveTriggeredByNames(logs);

  return {
    items: logs.map((r) => addTriggeredByName(r, nameMap)),
    total,
    limit,
    offset,
    hasMore: offset + logs.length < total,
  };
}
```

- [ ] **Step 4: Update sync routes to pass syncType**

In `apps/api/src/routes/admin/sync.routes.ts`, update the status endpoint to accept `syncType` query param:

```typescript
// In the GET /admin/sync/status handler:
const syncType = c.req.query("syncType") || undefined;
const statusData = await getSyncStatus(syncType);
```

In the GET `/admin/sync/logs` handler, the `syncType` will be parsed automatically via `syncLogsQuerySchema` and passed to `getSyncLogs`.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin/sync.schemas.ts apps/api/src/services/admin/sync-admin.service.ts apps/api/src/routes/admin/sync.routes.ts
git commit -m "feat: add syncType filtering to sync status and logs API"
```

---

### Task 4: Shared Types for Referee Games List

**Files:**
- Create: `packages/shared/src/referee-games.ts`
- Modify: `packages/shared/src/index.ts:82-87`

- [ ] **Step 1: Create shared type file**

Create `packages/shared/src/referee-games.ts`:

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
  lastSyncedAt: string | null;
}
```

- [ ] **Step 2: Update shared index exports**

In `packages/shared/src/index.ts`, replace the referee-matches export block (lines 82-87):

```typescript
export type {
  RefereeGameListItem,
} from "./referee-games";
```

Remove the old `referee-matches` exports:
```typescript
// DELETE these lines:
export type {
  RefereeSlotInfo,
  RefereeMatchListItem,
  TakeMatchResponse,
  VerifyMatchResponse,
} from "./referee-matches";
```

- [ ] **Step 3: Run typecheck to find broken imports**

Run: `pnpm typecheck`
Expected: FAIL — consumers of old types will break. Note the files. These will be fixed in subsequent tasks (the old component and route files being deleted).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/referee-games.ts packages/shared/src/index.ts
git commit -m "feat: add RefereeGameListItem shared type, remove old referee-matches types"
```

---

### Task 5: Referee Games Service & API Endpoint

**Files:**
- Create: `apps/api/src/services/referee/referee-games.service.ts`
- Create: `apps/api/src/routes/referee/games.routes.ts`
- Modify: `apps/api/src/routes/index.ts:25,52`

- [ ] **Step 1: Create referee games service**

Create `apps/api/src/services/referee/referee-games.service.ts`:

```typescript
import { db } from "../../config/database";
import { refereeGames } from "@dragons/db/schema";
import { and, eq, gte, lte, or, ilike, sql, desc, asc, ne } from "drizzle-orm";
import type { RefereeGameListItem } from "@dragons/shared";

interface GetRefereeGamesParams {
  limit: number;
  offset: number;
  search?: string;
  status?: "active" | "cancelled" | "forfeited" | "all";
  srFilter?: "our-club-open" | "any-open" | "all";
  league?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getRefereeGames(params: GetRefereeGamesParams) {
  const { limit, offset, search, status, srFilter, league, dateFrom, dateTo } = params;

  const conditions = [];

  // Status filter
  if (status === "cancelled") {
    conditions.push(eq(refereeGames.isCancelled, true));
  } else if (status === "forfeited") {
    conditions.push(eq(refereeGames.isForfeited, true));
  } else if (status !== "all") {
    // Default: active (not cancelled, not forfeited)
    conditions.push(eq(refereeGames.isCancelled, false));
    conditions.push(eq(refereeGames.isForfeited, false));
  }

  // SR filter
  if (srFilter === "our-club-open") {
    conditions.push(
      or(
        and(eq(refereeGames.sr1OurClub, true), ne(refereeGames.sr1Status, "assigned")),
        and(eq(refereeGames.sr2OurClub, true), ne(refereeGames.sr2Status, "assigned")),
      )!,
    );
  } else if (srFilter === "any-open") {
    conditions.push(
      or(
        ne(refereeGames.sr1Status, "assigned"),
        ne(refereeGames.sr2Status, "assigned"),
      )!,
    );
  }

  // League filter
  if (league) {
    conditions.push(eq(refereeGames.leagueShort, league));
  }

  // Date range
  if (dateFrom) {
    conditions.push(gte(refereeGames.kickoffDate, dateFrom));
  }
  if (dateTo) {
    conditions.push(lte(refereeGames.kickoffDate, dateTo));
  }

  // Search
  if (search) {
    const words = search.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const pattern = `%${word}%`;
      conditions.push(
        or(
          ilike(refereeGames.homeTeamName, pattern),
          ilike(refereeGames.guestTeamName, pattern),
          ilike(refereeGames.leagueName, pattern),
        )!,
      );
    }
  }

  const whereClause = conditions.length > 0
    ? conditions.length === 1 ? conditions[0]! : and(...conditions)!
    : undefined;

  const isTrackedLeague = sql<boolean>`${refereeGames.matchId} IS NOT NULL`.as("is_tracked_league");

  const [items, countResult] = await Promise.all([
    db
      .select({
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
      })
      .from(refereeGames)
      .where(whereClause)
      .orderBy(asc(refereeGames.kickoffDate), asc(refereeGames.kickoffTime))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(refereeGames)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items: items as RefereeGameListItem[],
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}
```

- [ ] **Step 2: Create referee games routes**

Create `apps/api/src/routes/referee/games.routes.ts`:

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
  const srFilter = (c.req.query("srFilter") || "all") as "our-club-open" | "any-open" | "all";
  const league = c.req.query("league") || undefined;
  const dateFrom = c.req.query("dateFrom") || undefined;
  const dateTo = c.req.query("dateTo") || undefined;

  const result = await getRefereeGames({
    limit,
    offset,
    search,
    status,
    srFilter,
    league,
    dateFrom,
    dateTo,
  });

  return c.json(result);
});

export { refereeGamesRoutes };
```

- [ ] **Step 3: Update route index**

In `apps/api/src/routes/index.ts`, replace the referee match routes import and mounting:

Replace line 25:
```typescript
import { refereeGamesRoutes } from "./referee/games.routes";
```

Replace line 52:
```typescript
routes.route("/referee", refereeGamesRoutes);
```

- [ ] **Step 4: Delete old referee match route and service**

Delete these files:
- `apps/api/src/routes/referee/match.routes.ts`
- `apps/api/src/services/referee/referee-match.service.ts`

Also delete the old shared types file:
- `packages/shared/src/referee-matches.ts`

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (old consumers deleted, new route wired)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/referee/referee-games.service.ts apps/api/src/routes/referee/games.routes.ts apps/api/src/routes/index.ts
git rm apps/api/src/routes/referee/match.routes.ts apps/api/src/services/referee/referee-match.service.ts packages/shared/src/referee-matches.ts
git commit -m "feat: add referee games API endpoint, delete old match-based referee routes"
```

---

### Task 6: Frontend — Referee Games List Component

**Files:**
- Create: `apps/web/src/components/referee/referee-games-list.tsx`
- Modify: `apps/web/src/lib/swr-keys.ts:37`
- Modify: `apps/web/src/app/[locale]/admin/referee/matches/page.tsx`

- [ ] **Step 1: Update SWR keys**

In `apps/web/src/lib/swr-keys.ts`, replace `refereeMatches` (line 37):

```typescript
refereeGames: "/referee/games?limit=500&offset=0",
```

- [ ] **Step 2: Create referee games list component**

Create `apps/web/src/components/referee/referee-games-list.tsx`:

```typescript
"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dragons/ui/components/table";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";
import { fetchAPI } from "@/lib/api";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { authClient } from "@/lib/auth-client";
import type { RefereeGameListItem, PaginatedResponse } from "@dragons/shared";

// --- SrSlotBadge ---

function SrSlotBadge({
  status,
  name,
  ourClub,
}: {
  status: "open" | "offered" | "assigned";
  name: string | null;
  ourClub: boolean;
}) {
  if (status === "assigned") {
    return (
      <Badge
        variant="default"
        className={cn(
          ourClub && "bg-primary/10 text-primary border-primary/20",
        )}
      >
        {name ?? "—"}
      </Badge>
    );
  }

  if (status === "offered") {
    return (
      <Badge
        variant="outline"
        className={cn(
          ourClub
            ? "border-heat/20 bg-heat/10 text-heat"
            : "border-secondary/20 bg-secondary/10 text-secondary-foreground",
        )}
      >
        {ourClub ? "offered" : "offered"}
      </Badge>
    );
  }

  // open
  return (
    <Badge
      variant="outline"
      className={cn(
        ourClub
          ? "border-heat/30 bg-heat/15 text-heat font-medium"
          : "text-muted-foreground",
      )}
    >
      {ourClub ? "open" : "open"}
    </Badge>
  );
}

// --- Facet Filter Chips ---

function FacetChips({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <Button
          key={opt.value}
          variant={selected === opt.value ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => onSelect(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

// --- Main Component ---

export function RefereeGamesList() {
  const t = useTranslations("refereeGames");
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  const { data } = useSWR<PaginatedResponse<RefereeGameListItem>>(
    SWR_KEYS.refereeGames,
    apiFetcher,
  );
  const items = data?.items ?? [];

  // Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [srFilter, setSrFilter] = useState("all");
  const [leagueFilter, setLeagueFilter] = useState("all");
  const [syncingRefereeGames, setSyncingRefereeGames] = useState(false);

  // Derive unique leagues from data
  const leagueOptions = useMemo(() => {
    const leagues = new Set<string>();
    for (const item of items) {
      if (item.leagueShort) leagues.add(item.leagueShort);
    }
    return [
      { value: "all", label: t("filters.srFilterAll") },
      ...[...leagues].sort().map((l) => ({ value: l, label: l })),
    ];
  }, [items, t]);

  // Client-side filtering
  const filteredItems = useMemo(() => {
    let result = items;

    // Status filter
    if (statusFilter === "active") {
      result = result.filter((r) => !r.isCancelled && !r.isForfeited);
    } else if (statusFilter === "cancelled") {
      result = result.filter((r) => r.isCancelled);
    } else if (statusFilter === "forfeited") {
      result = result.filter((r) => r.isForfeited);
    }

    // SR filter
    if (srFilter === "our-club-open") {
      result = result.filter(
        (r) =>
          (r.sr1OurClub && r.sr1Status !== "assigned") ||
          (r.sr2OurClub && r.sr2Status !== "assigned"),
      );
    } else if (srFilter === "any-open") {
      result = result.filter(
        (r) => r.sr1Status !== "assigned" || r.sr2Status !== "assigned",
      );
    }

    // League filter
    if (leagueFilter !== "all") {
      result = result.filter((r) => r.leagueShort === leagueFilter);
    }

    // Search
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.homeTeamName.toLowerCase().includes(lower) ||
          r.guestTeamName.toLowerCase().includes(lower) ||
          (r.leagueName?.toLowerCase().includes(lower) ?? false),
      );
    }

    return result;
  }, [items, statusFilter, srFilter, leagueFilter, search]);

  // Column definitions
  const columns: ColumnDef<RefereeGameListItem>[] = useMemo(
    () => [
      {
        accessorKey: "kickoffDate",
        header: t("columns.date"),
        cell: ({ row }) => (
          <span
            className={cn(
              (row.original.isCancelled || row.original.isForfeited) &&
                "text-muted-foreground line-through",
            )}
          >
            {row.original.kickoffDate}
          </span>
        ),
      },
      {
        accessorKey: "kickoffTime",
        header: t("columns.time"),
        cell: ({ row }) => row.original.kickoffTime,
      },
      {
        accessorKey: "homeTeamName",
        header: t("columns.home"),
      },
      {
        accessorKey: "guestTeamName",
        header: t("columns.guest"),
      },
      {
        accessorKey: "leagueName",
        header: t("columns.league"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span>{row.original.leagueName ?? "—"}</span>
            {!row.original.isTrackedLeague && (
              <Badge variant="secondary" className="text-xs">
                {t("badges.untracked")}
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "sr1",
        header: t("columns.sr1"),
        cell: ({ row }) => (
          <SrSlotBadge
            status={row.original.sr1Status}
            name={row.original.sr1Name}
            ourClub={row.original.sr1OurClub}
          />
        ),
      },
      {
        id: "sr2",
        header: t("columns.sr2"),
        cell: ({ row }) => (
          <SrSlotBadge
            status={row.original.sr2Status}
            name={row.original.sr2Name}
            ourClub={row.original.sr2OurClub}
          />
        ),
      },
    ],
    [t],
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const table = useReactTable({
    data: filteredItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    state: { sorting, columnFilters, columnVisibility },
  });

  async function handleSyncRefereeGames() {
    try {
      setSyncingRefereeGames(true);
      await fetchAPI("/admin/settings/referee-games-sync", { method: "POST" });
      toast.success(t("syncTriggered"));
    } catch {
      toast.error(t("syncFailed"));
    } finally {
      setSyncingRefereeGames(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder={t("filters.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />

        <FacetChips
          options={[
            { value: "active", label: t("status.active") },
            { value: "cancelled", label: t("status.cancelled") },
            { value: "forfeited", label: t("status.forfeited") },
            { value: "all", label: t("filters.srFilterAll") },
          ]}
          selected={statusFilter}
          onSelect={setStatusFilter}
        />

        <FacetChips
          options={[
            { value: "all", label: t("filters.srFilterAll") },
            { value: "our-club-open", label: t("filters.srFilterOurClub") },
            { value: "any-open", label: t("filters.srFilterAnyOpen") },
          ]}
          selected={srFilter}
          onSelect={setSrFilter}
        />

        {leagueOptions.length > 2 && (
          <FacetChips
            options={leagueOptions}
            selected={leagueFilter}
            onSelect={setLeagueFilter}
          />
        )}

        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncRefereeGames}
            disabled={syncingRefereeGames}
            className="ml-auto"
          >
            {syncingRefereeGames ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t("syncButton")}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const hasOurClubOpen =
                  (row.original.sr1OurClub && row.original.sr1Status !== "assigned") ||
                  (row.original.sr2OurClub && row.original.sr2Status !== "assigned");
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      hasOurClubOpen && "border-l-2 border-l-primary/50 bg-primary/5",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update referee matches page**

In `apps/web/src/app/[locale]/admin/referee/matches/page.tsx`, replace the entire file:

```typescript
import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { RefereeGamesList } from "@/components/referee/referee-games-list";
import type { RefereeGameListItem, PaginatedResponse } from "@dragons/shared";

export default async function RefereeMatchesPage() {
  const t = await getTranslations("refereeGames");
  let data: PaginatedResponse<RefereeGameListItem> | null = null;
  let error: string | null = null;

  try {
    data = await fetchAPIServer<PaginatedResponse<RefereeGameListItem>>(
      SWR_KEYS.refereeGames,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SWRConfig value={{ fallback: { [SWR_KEYS.refereeGames]: data } }}>
          <RefereeGamesList />
        </SWRConfig>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Delete old referee match list component**

Delete: `apps/web/src/components/referee/referee-match-list.tsx`

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/referee/referee-games-list.tsx apps/web/src/lib/swr-keys.ts apps/web/src/app/[locale]/admin/referee/matches/page.tsx
git rm apps/web/src/components/referee/referee-match-list.tsx
git commit -m "feat: add referee games list component, replace old match-based view"
```

---

### Task 7: Translations

**Files:**
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

- [ ] **Step 1: Add English translations**

In `apps/web/src/messages/en.json`, add the `refereeGames` key (remove old `refereeMatches` if it exists):

```json
"refereeGames": {
  "title": "Referee Games",
  "columns": {
    "date": "Date",
    "time": "Time",
    "home": "Home",
    "guest": "Guest",
    "league": "League",
    "sr1": "SR1",
    "sr2": "SR2"
  },
  "status": {
    "active": "Active",
    "cancelled": "Cancelled",
    "forfeited": "Forfeited"
  },
  "srStatus": {
    "open": "Open",
    "offered": "Offered",
    "assigned": "Assigned"
  },
  "filters": {
    "search": "Search teams, leagues...",
    "status": "Status",
    "srFilter": "SR Status",
    "srFilterOurClub": "Our club needs SR",
    "srFilterAnyOpen": "Any open slot",
    "srFilterAll": "All",
    "league": "League",
    "dateFrom": "From",
    "dateTo": "To"
  },
  "badges": {
    "untracked": "Untracked"
  },
  "syncButton": "Sync referee games",
  "syncTriggered": "Referee sync started",
  "syncFailed": "Referee sync failed"
}
```

Also add to the `sync.tabs` section:

```json
"sync": {
  "tabs": {
    "history": "History",
    "schedule": "Schedule",
    "mainSync": "Main Sync",
    "refereeGames": "Referee Games"
  }
}
```

- [ ] **Step 2: Add German translations**

In `apps/web/src/messages/de.json`, add the `refereeGames` key (remove old `refereeMatches` if it exists):

```json
"refereeGames": {
  "title": "SR-Spiele",
  "columns": {
    "date": "Datum",
    "time": "Zeit",
    "home": "Heim",
    "guest": "Gast",
    "league": "Liga",
    "sr1": "SR1",
    "sr2": "SR2"
  },
  "status": {
    "active": "Aktiv",
    "cancelled": "Abgesagt",
    "forfeited": "Verzicht"
  },
  "srStatus": {
    "open": "Offen",
    "offered": "Angeboten",
    "assigned": "Besetzt"
  },
  "filters": {
    "search": "Teams, Ligen suchen...",
    "status": "Status",
    "srFilter": "SR-Status",
    "srFilterOurClub": "Unser Verein stellt SR",
    "srFilterAnyOpen": "Offene Plätze",
    "srFilterAll": "Alle",
    "league": "Liga",
    "dateFrom": "Von",
    "dateTo": "Bis"
  },
  "badges": {
    "untracked": "Nicht verfolgt"
  },
  "syncButton": "SR-Spiele synchronisieren",
  "syncTriggered": "SR-Synchronisation gestartet",
  "syncFailed": "SR-Synchronisation fehlgeschlagen"
}
```

Also add to the `sync.tabs` section (German):

```json
"sync": {
  "tabs": {
    "history": "Verlauf",
    "schedule": "Zeitplan",
    "mainSync": "Haupt-Sync",
    "refereeGames": "SR-Spiele"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat: add referee games translations (en/de)"
```

---

### Task 8: Frontend — Sync Dashboard Hooks & SWR Keys

**Files:**
- Modify: `apps/web/src/lib/swr-keys.ts`
- Modify: `apps/web/src/components/admin/sync/use-sync.ts`

- [ ] **Step 1: Add referee sync SWR keys**

In `apps/web/src/lib/swr-keys.ts`, add:

```typescript
refereeSyncStatus: "/admin/sync/status?syncType=referee-games",
refereeSyncLogs: (limit: number, offset: number) =>
  `/admin/sync/logs?limit=${limit}&offset=${offset}&syncType=referee-games`,
```

- [ ] **Step 2: Add referee sync hooks**

In `apps/web/src/components/admin/sync/use-sync.ts`, add a second context and hooks for referee sync. Add these after the existing hooks:

```typescript
// --- Referee sync context & hooks ---

export const RefereeSyncRunContext = createContext<SyncRunContextValue | null>(null);

export function useRefereeSyncRunContext() {
  const ctx = useContext(RefereeSyncRunContext);
  if (!ctx) throw new Error("useRefereeSyncRunContext requires RefereeSyncRunProvider");
  return ctx;
}

export function useRefereeSyncStatus() {
  const { runningSyncRunId } = useRefereeSyncRunContext();
  const isLocalRunning = runningSyncRunId !== null;

  const { data, error, mutate } = useSWR<SyncStatusResponse>(
    SWR_KEYS.refereeSyncStatus,
    apiFetcher,
    {
      refreshInterval: isLocalRunning ? 3000 : 15000,
      revalidateOnFocus: true,
    },
  );

  const serverRunning = data?.isRunning ?? false;
  const isRunning = serverRunning || isLocalRunning;

  return { status: data ?? null, error, isRunning, mutate };
}

export function useRefereeSyncLogs() {
  const { runningSyncRunId } = useRefereeSyncRunContext();
  const isRunning = runningSyncRunId !== null;

  const { data, error, mutate, isLoading } = useSWR<PaginatedResponse<SyncRun>>(
    SWR_KEYS.refereeSyncLogs(20, 0),
    apiFetcher,
    {
      refreshInterval: isRunning ? 3000 : 15000,
      revalidateOnFocus: true,
    },
  );

  return {
    logs: data?.items ?? [],
    hasMore: data?.hasMore ?? false,
    error,
    isLoading,
    mutate,
  };
}

export function useTriggerRefereeSync() {
  const t = useTranslations();
  const { setRunningSyncRunId, setTriggering } = useRefereeSyncRunContext();
  const { mutate: mutateStatus } = useRefereeSyncStatus();
  const { mutate: mutateLogs } = useRefereeSyncLogs();

  const trigger = useCallback(async () => {
    try {
      setTriggering(true);
      const result = await fetchAPI<{ syncRunId: number }>(
        "/admin/settings/referee-games-sync",
        { method: "POST" },
      );

      setRunningSyncRunId(result.syncRunId);

      const now = new Date().toISOString();
      const optimisticRun: SyncRun = {
        id: result.syncRunId,
        syncType: "referee-games",
        status: "running",
        triggeredBy: "manual",
        triggeredByName: null,
        recordsProcessed: null,
        recordsCreated: null,
        recordsUpdated: null,
        recordsFailed: null,
        recordsSkipped: null,
        startedAt: now,
        completedAt: null,
        durationMs: null,
        errorMessage: null,
        errorStack: null,
        summary: null,
        createdAt: now,
      };

      await mutateStatus(
        { isRunning: true, lastSync: optimisticRun },
        { revalidate: false },
      );
      await mutateLogs(
        (current) => {
          const items = current?.items ?? [];
          return {
            ...current!,
            items: [
              optimisticRun,
              ...items.filter((r) => r.id !== result.syncRunId),
            ],
            hasMore: current?.hasMore ?? false,
          };
        },
        { revalidate: false },
      );
    } catch {
      toast.error(t("sync.toast.triggerFailed"));
    } finally {
      setTriggering(false);
    }
  }, [t, setRunningSyncRunId, setTriggering, mutateStatus, mutateLogs]);

  return { trigger };
}

export function RefereeSyncCompletionWatcher() {
  const { runningSyncRunId, setRunningSyncRunId } = useRefereeSyncRunContext();
  const { logs } = useRefereeSyncLogs();

  useEffect(() => {
    if (runningSyncRunId === null) return;
    const trackedRun = logs.find((r) => r.id === runningSyncRunId);
    if (
      trackedRun &&
      trackedRun.status !== "running" &&
      trackedRun.status !== "pending"
    ) {
      setRunningSyncRunId(null);
    }
  }, [runningSyncRunId, logs, setRunningSyncRunId]);

  return null;
}
```

Import `SWR_KEYS` at the top (add to existing imports if not present):
```typescript
import { SWR_KEYS } from "@/lib/swr-keys";
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/swr-keys.ts apps/web/src/components/admin/sync/use-sync.ts
git commit -m "feat: add referee sync SWR hooks and keys"
```

---

### Task 9: Frontend — Referee Sync Tab Components

**Files:**
- Create: `apps/web/src/components/admin/sync/referee-sync-tab.tsx`
- Create: `apps/web/src/components/admin/sync/referee-sync-status-cards.tsx`

- [ ] **Step 1: Create referee sync status cards**

Create `apps/web/src/components/admin/sync/referee-sync-status-cards.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useTranslations, useFormatter } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Activity, Clock } from "lucide-react";
import { cn } from "@dragons/ui/lib/utils";
import { useRefereeSyncStatus } from "./use-sync";
import { formatDuration } from "./utils";

export function RefereeSyncStatusCards() {
  const t = useTranslations();
  const format = useFormatter();
  const { status } = useRefereeSyncStatus();
  const isRunning = status?.isRunning ?? false;
  const lastSync = status?.lastSync;

  // Tick relative times every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Current Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("sync.status.current")}</CardTitle>
          <Activity
            className={cn(
              "h-4 w-4 text-muted-foreground",
              isRunning && "animate-pulse text-blue-500",
            )}
          />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {isRunning ? (
              <span className="text-blue-500">{t("sync.status.running")}</span>
            ) : (
              t("sync.status.idle")
            )}
          </div>
        </CardContent>
      </Card>

      {/* Last Sync */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("sync.status.lastSync")}</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {lastSync && lastSync.status !== "running" ? (
            <>
              <div
                className={cn(
                  "text-2xl font-bold",
                  lastSync.status === "completed"
                    ? "text-green-600"
                    : lastSync.status === "failed"
                      ? "text-red-600"
                      : "",
                )}
              >
                {lastSync.status === "completed"
                  ? t("sync.status.success")
                  : lastSync.status === "failed"
                    ? t("sync.status.failed")
                    : lastSync.status}
              </div>
              <p className="text-xs text-muted-foreground">
                {format.dateTime(new Date(lastSync.startedAt), "full")} &middot;{" "}
                {formatDuration(lastSync.durationMs)}
              </p>
              {lastSync.recordsCreated !== null && (
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  <span className="text-green-600">{lastSync.recordsCreated}</span>
                  {" created · "}
                  <span className="text-blue-600">{lastSync.recordsUpdated}</span>
                  {" updated · "}
                  <span>{lastSync.recordsSkipped}</span>
                  {" unchanged"}
                </p>
              )}
            </>
          ) : (
            <div className="text-2xl font-bold text-muted-foreground">
              {t("sync.status.never")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create referee sync tab**

Create `apps/web/src/components/admin/sync/referee-sync-tab.tsx`:

```typescript
"use client";

import { useState, useCallback, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSWRConfig } from "swr";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Button } from "@dragons/ui/components/button";
import { Loader2, Play } from "lucide-react";
import { SWRConfig } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import {
  RefereeSyncRunContext,
  useRefereeSyncStatus,
  useRefereeSyncRunContext,
  useTriggerRefereeSync,
  RefereeSyncCompletionWatcher,
} from "./use-sync";
import { RefereeSyncStatusCards } from "./referee-sync-status-cards";
import { SyncLiveLogs } from "./sync-live-logs";
import { RefereeSyncHistoryTable } from "./sync-history-table";
import type {
  SyncStatusResponse,
  PaginatedResponse,
  SyncRun,
} from "./types";

// --- Provider ---

function deriveRunningSyncRunId(
  status: SyncStatusResponse | null,
): number | null {
  if (status?.isRunning && status.lastSync?.status === "running") {
    return status.lastSync.id;
  }
  return null;
}

function RefereeSyncRunProvider({
  initialStatus,
  initialLogs,
  children,
}: {
  initialStatus: SyncStatusResponse | null;
  initialLogs: PaginatedResponse<SyncRun> | null;
  children: ReactNode;
}) {
  const [runningSyncRunId, setRunningSyncRunId] = useState<number | null>(
    deriveRunningSyncRunId(initialStatus),
  );
  const [triggering, setTriggering] = useState(false);

  return (
    <SWRConfig
      value={{
        fallback: {
          [SWR_KEYS.refereeSyncStatus]: initialStatus,
          [SWR_KEYS.refereeSyncLogs(20, 0)]: initialLogs,
        },
      }}
    >
      <RefereeSyncRunContext
        value={{ runningSyncRunId, setRunningSyncRunId, triggering, setTriggering }}
      >
        {children}
      </RefereeSyncRunContext>
    </SWRConfig>
  );
}

// --- Trigger Button ---

function RefereeSyncTriggerButton() {
  const t = useTranslations();
  const { isRunning } = useRefereeSyncStatus();
  const { triggering } = useRefereeSyncRunContext();
  const { trigger } = useTriggerRefereeSync();

  return (
    <Button onClick={trigger} disabled={isRunning || triggering} size="sm">
      {triggering ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Play className="mr-2 h-4 w-4" />
      )}
      {t("sync.trigger")}
    </Button>
  );
}

// --- Live Logs (using referee context) ---

function RefereeSyncLiveLogsContainer() {
  const { runningSyncRunId, triggering } = useRefereeSyncRunContext();
  const { mutate } = useSWRConfig();

  const onSyncComplete = useCallback(() => {
    void mutate(SWR_KEYS.refereeSyncStatus);
    void mutate(SWR_KEYS.refereeSyncLogs(20, 0));
  }, [mutate]);

  if (!runningSyncRunId && !triggering) return null;

  if (!runningSyncRunId) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <CardTitle>Live Logs</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center rounded-md bg-muted/30 text-sm text-muted-foreground">
            Starting...
          </div>
        </CardContent>
      </Card>
    );
  }

  // SyncLiveLogs works with any syncRunId — it's keyed on the run ID for SSE
  return <SyncLiveLogs syncRunId={runningSyncRunId} onComplete={onSyncComplete} />;
}

// --- Exported Tab Content ---

export function RefereeSyncTab({
  initialStatus,
  initialLogs,
}: {
  initialStatus: SyncStatusResponse | null;
  initialLogs: PaginatedResponse<SyncRun> | null;
}) {
  return (
    <RefereeSyncRunProvider initialStatus={initialStatus} initialLogs={initialLogs}>
      <RefereeSyncCompletionWatcher />
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <RefereeSyncTriggerButton />
        </div>
        <RefereeSyncStatusCards />
        <RefereeSyncLiveLogsContainer />
        <RefereeSyncHistoryTable />
      </div>
    </RefereeSyncRunProvider>
  );
}

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/sync/referee-sync-tab.tsx apps/web/src/components/admin/sync/referee-sync-status-cards.tsx
git commit -m "feat: add referee sync tab and status cards components"
```

---

### Task 10: Make SyncHistoryTable Support syncType Prop

**Files:**
- Modify: `apps/web/src/components/admin/sync/sync-history-table.tsx`
- Modify: `apps/web/src/components/admin/sync/use-sync.ts`

The `SyncHistoryTable` currently uses `useSyncLogs()` which fetches unfiltered logs. To reuse it in the referee tab, it needs to accept an optional `syncType` prop that changes which SWR key it uses.

- [ ] **Step 1: Add syncType parameter to `useSyncLogs`**

In `apps/web/src/components/admin/sync/use-sync.ts`, update `useSyncLogs` to accept an optional parameter:

```typescript
export function useSyncLogs(syncType?: string) {
  const { runningSyncRunId } = syncType
    ? useRefereeSyncRunContext()
    : useSyncRunContext();
  const isRunning = runningSyncRunId !== null;

  const swrKey = syncType
    ? SWR_KEYS.refereeSyncLogs(20, 0)
    : SWR_KEYS.syncLogs(20, 0);

  const { data, error, mutate, isLoading } = useSWR<PaginatedResponse<SyncRun>>(
    swrKey,
    apiFetcher,
    {
      refreshInterval: isRunning ? 3000 : 15000,
      revalidateOnFocus: true,
    },
  );

  return {
    logs: data?.items ?? [],
    hasMore: data?.hasMore ?? false,
    error,
    isLoading,
    mutate,
  };
}
```

**Important:** This approach has a conditional hook call issue. Instead, make `SyncHistoryTable` accept a `logsHook` prop or duplicate the table. The cleaner approach is to make `SyncHistoryTable` accept props:

- [ ] **Step 2: Update SyncHistoryTable to accept data props**

In `apps/web/src/components/admin/sync/sync-history-table.tsx`, change the component to accept optional external data:

```typescript
interface SyncHistoryTableProps {
  syncType?: string;
}

export function SyncHistoryTable({ syncType }: SyncHistoryTableProps = {}) {
```

And update the `useSyncLogs` call and `onLoadMore` to use `syncType`:

```typescript
const { logs: firstPageLogs, hasMore: firstPageHasMore } = useSyncLogs();
```

Becomes:
```typescript
const { logs: firstPageLogs, hasMore: firstPageHasMore } = syncType
  ? useRefereeSyncLogs()
  : useSyncLogs();
```

And in `onLoadMore`, update the fetch URL:

```typescript
const syncTypeParam = syncType ? `&syncType=${syncType}` : "";
const data = await fetchAPI<PaginatedResponse<SyncRun>>(
  `/admin/sync/logs?limit=20&offset=${currentTotal}${syncTypeParam}`,
);
```

**However**, conditional hooks violate React rules. The correct approach: create two wrapper components.

- [ ] **Step 2 (revised): Create a SyncHistoryTableInner that takes data as props**

Refactor `SyncHistoryTable` to separate the data-fetching wrapper from the rendering:

```typescript
// Inner component that receives data
function SyncHistoryTableInner({
  firstPageLogs,
  firstPageHasMore,
  loadMoreUrl,
}: {
  firstPageLogs: SyncRun[];
  firstPageHasMore: boolean;
  loadMoreUrl: (offset: number) => string;
}) {
  // ... all the existing rendering logic, using props instead of hooks
}

// Default export for main sync (existing behavior)
export function SyncHistoryTable() {
  const { logs, hasMore } = useSyncLogs();
  return (
    <SyncHistoryTableInner
      firstPageLogs={logs}
      firstPageHasMore={hasMore}
      loadMoreUrl={(offset) => `/admin/sync/logs?limit=20&offset=${offset}`}
    />
  );
}

// Export for referee sync tab
export function RefereeSyncHistoryTable() {
  const { logs, hasMore } = useRefereeSyncLogs();
  return (
    <SyncHistoryTableInner
      firstPageLogs={logs}
      firstPageHasMore={hasMore}
      loadMoreUrl={(offset) =>
        `/admin/sync/logs?limit=20&offset=${offset}&syncType=referee-games`
      }
    />
  );
}
```

- [ ] **Step 3: Update referee sync tab to use `RefereeSyncHistoryTable`**

In `apps/web/src/components/admin/sync/referee-sync-tab.tsx`, import and use `RefereeSyncHistoryTable`:

```typescript
import { RefereeSyncHistoryTable } from "./sync-history-table";

// In the RefereeSyncTab component, replace:
<SyncHistoryTable />
// with:
<RefereeSyncHistoryTable />
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/sync/sync-history-table.tsx apps/web/src/components/admin/sync/referee-sync-tab.tsx
git commit -m "refactor: extract SyncHistoryTableInner for reuse in referee sync tab"
```

---

### Task 11: Frontend — Sync Dashboard Page with Top-Level Tabs

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/sync/page.tsx`

- [ ] **Step 1: Update sync page with top-level tabs**

Replace `apps/web/src/app/[locale]/admin/sync/page.tsx`:

```typescript
import { getTranslations } from "next-intl/server";
import { fetchAPIServer } from "@/lib/api.server";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dragons/ui/components/tabs";
import { SyncRunProvider } from "@/components/admin/sync/sync-run-provider";
import { SyncCompletionWatcher } from "@/components/admin/sync/use-sync";
import { SyncTriggerButton } from "@/components/admin/sync/sync-trigger-button";
import { PageHeader } from "@/components/admin/shared/page-header";
import { SyncErrorBanner } from "@/components/admin/sync/sync-error-banner";
import { SyncStatusCards } from "@/components/admin/sync/sync-status-cards";
import { SyncLiveLogsContainer } from "@/components/admin/sync/sync-live-logs-container";
import { SyncHistoryTable } from "@/components/admin/sync/sync-history-table";
import { SyncScheduleConfig } from "@/components/admin/sync/sync-schedule-config";
import { RefereeSyncTab } from "@/components/admin/sync/referee-sync-tab";
import type {
  SyncStatusResponse,
  PaginatedResponse,
  SyncRun,
  SyncScheduleData,
} from "@/components/admin/sync/types";

export default async function SyncPage() {
  const t = await getTranslations();
  let status: SyncStatusResponse | null = null;
  let logs: PaginatedResponse<SyncRun> | null = null;
  let schedule: SyncScheduleData | null = null;
  let refereeStatus: SyncStatusResponse | null = null;
  let refereeLogs: PaginatedResponse<SyncRun> | null = null;
  let error: string | null = null;

  try {
    [status, logs, schedule, refereeStatus, refereeLogs] = await Promise.all([
      fetchAPIServer<SyncStatusResponse>("/admin/sync/status"),
      fetchAPIServer<PaginatedResponse<SyncRun>>("/admin/sync/logs?limit=20&offset=0"),
      fetchAPIServer<SyncScheduleData>("/admin/sync/schedule"),
      fetchAPIServer<SyncStatusResponse>("/admin/sync/status?syncType=referee-games"),
      fetchAPIServer<PaginatedResponse<SyncRun>>(
        "/admin/sync/logs?limit=20&offset=0&syncType=referee-games",
      ),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to API";
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("sync.title")} subtitle={t("sync.description")} />
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("sync.title")} subtitle={t("sync.description")} />

      <Tabs defaultValue="main">
        <TabsList>
          <TabsTrigger value="main">{t("sync.tabs.mainSync")}</TabsTrigger>
          <TabsTrigger value="referee">{t("sync.tabs.refereeGames")}</TabsTrigger>
        </TabsList>

        <TabsContent value="main" className="mt-4">
          <SyncRunProvider
            initialStatus={status}
            initialLogs={logs}
            initialSchedule={schedule}
          >
            <SyncCompletionWatcher />
            <div className="space-y-6">
              <div className="flex items-center justify-end">
                <SyncTriggerButton />
              </div>
              <SyncErrorBanner />
              <SyncStatusCards />
              <SyncLiveLogsContainer />
              <Tabs defaultValue="history">
                <TabsList>
                  <TabsTrigger value="history">{t("sync.tabs.history")}</TabsTrigger>
                  <TabsTrigger value="schedule">{t("sync.tabs.schedule")}</TabsTrigger>
                </TabsList>
                <TabsContent value="history" className="mt-4">
                  <SyncHistoryTable />
                </TabsContent>
                <TabsContent value="schedule" className="mt-4">
                  <SyncScheduleConfig />
                </TabsContent>
              </Tabs>
            </div>
          </SyncRunProvider>
        </TabsContent>

        <TabsContent value="referee" className="mt-4">
          <RefereeSyncTab
            initialStatus={refereeStatus}
            initialLogs={refereeLogs}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 4: Start dev server and verify**

Run: `pnpm dev`

Verify:
1. `/admin/sync/` shows two top-level tabs: "Main Sync" and "Referee Games"
2. Main Sync tab shows the existing dashboard (unchanged behavior)
3. Referee Games tab shows 2 status cards, trigger button, history table
4. `/admin/referee/matches/` shows the new referee games list with filters
5. SR slot badges display correctly with color coding
6. "Untracked" badge appears for games without matchId
7. Admin sync button works in referee games list

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/admin/sync/page.tsx
git commit -m "feat: add referee games tab to sync dashboard with top-level tabs"
```

---

### Task 12: Tests

**Files:**
- Modify: `apps/api/src/services/sync/referee-games.sync.test.ts`
- Create: `apps/api/src/services/referee/referee-games.service.test.ts`

- [ ] **Step 1: Update existing referee games sync tests for logger parameter**

In `apps/api/src/services/sync/referee-games.sync.test.ts`, update calls to `syncRefereeGames()` to verify it works with and without a logger. Add a test that passes a mock logger:

```typescript
it("should log entries when SyncLogger is provided", async () => {
  // Mock SyncLogger
  const mockLogger = {
    log: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  // Set up single game in API response
  // ... (use existing test fixtures)

  const result = await syncRefereeGames(mockLogger as unknown as SyncLogger);

  expect(mockLogger.log).toHaveBeenCalledWith(
    expect.objectContaining({
      entityType: "refereeGame",
      action: expect.stringMatching(/created|updated|skipped/),
    }),
  );
});
```

- [ ] **Step 2: Write referee games service tests**

Create `apps/api/src/services/referee/referee-games.service.test.ts`:

Test cases:
- Returns paginated results from referee_games table
- Filters by status (active excludes cancelled/forfeited)
- Filters by srFilter our-club-open
- Filters by srFilter any-open
- Filters by league
- Filters by date range
- Search matches team names and league
- Derives isTrackedLeague from matchId
- Returns empty results when no data

- [ ] **Step 3: Run tests and coverage**

Run: `pnpm --filter @dragons/api test`
Run: `pnpm --filter @dragons/api coverage`
Expected: PASS with coverage above thresholds

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/sync/referee-games.sync.test.ts apps/api/src/services/referee/referee-games.service.test.ts
git commit -m "test: add tests for referee games sync logging and games service"
```
