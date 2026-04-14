# Referee Games UI & Sync Logging — Design Spec

## Goal

Replace the current match-based referee view with a `referee_games`-sourced view (all leagues, including untracked), add sync run logging to the referee games sync, and integrate referee sync monitoring into the existing sync dashboard as a tab.

## Scope

- **In scope:** Referee games list UI, sync logging infrastructure, sync dashboard tab, API endpoint for referee games, cleanup of old match-based referee code
- **Out of scope:** Take game flow (being refactored separately), intent tracking, verify dialog

---

## 1. Backend: Sync Logging Infrastructure

### 1.1 EntityType Extension

Add `"refereeGame"` to the `ENTITY_TYPES` array in `packages/shared/src/constants.ts`. The existing `EntityType` union type derives from this array automatically.

Update the local `EntityType` in `apps/api/src/services/sync/sync-logger.ts` (line 11) to include `"refereeGame"`.

### 1.2 Sync Run Lifecycle for Referee Games

**`triggerRefereeGamesSync()` in `apps/api/src/workers/queues.ts`:**

Currently queues a job without creating a `sync_run` record. Change to:
1. Check for existing active/waiting job (existing behavior)
2. Insert a `sync_runs` row: `{ syncType: "referee-games", triggeredBy, status: "pending", startedAt: new Date() }`
3. Pass `syncRunId` in the job data

Accept an optional `triggeredBy` parameter (userId or `"cron"` or `"post-sync"`). Return `{ syncRunId, status: "queued" }` instead of `void`.

**`sync.worker.ts` `"referee-games"` case:**

Currently calls `syncRefereeGames()` directly without instrumentation. Change to:
1. Update sync_run to `"running"`
2. Create `SyncLogger(syncRunId)`
3. Call `syncRefereeGames(syncLogger)` passing the logger
4. On success: update sync_run with counts, `"completed"`, duration
5. Close logger
6. On failure: update sync_run to `"failed"` with error message, close logger

### 1.3 Per-Item Logging in `syncRefereeGames()`

**`apps/api/src/services/sync/referee-games.sync.ts`:**

Add optional `SyncLogger` parameter to `syncRefereeGames()`. For each game in the loop, call:

```typescript
await logger?.log({
  entityType: "refereeGame",
  entityId: String(mapped.apiMatchId),
  entityName: `${mapped.homeTeamName} vs ${mapped.guestTeamName}`,
  action, // "created" | "updated" | "skipped"
  message, // e.g. "New game with open SR1 slot" or "SR2 assignment changed"
});
```

On per-game catch, log as `"failed"`.

### 1.4 API Filtering by syncType

**`GET /admin/sync/status`** — add optional `syncType` query param. When `syncType=referee-games`, return status filtered to referee-games sync runs only.

**`GET /admin/sync/logs`** — add optional `syncType` query param. When present, filter `sync_runs.syncType` to that value.

**`POST /admin/settings/referee-games-sync`** — update to call `triggerRefereeGamesSync(userId)` and return `{ syncRunId }`.

Add `syncType` to `syncLogsQuerySchema` in `apps/api/src/routes/admin/sync.schemas.ts`.

Update `getSyncStatus()` and `getSyncLogs()` in `apps/api/src/services/admin/sync-admin.service.ts` to accept and apply the `syncType` filter.

---

## 2. Backend: Referee Games List API

### 2.1 New Endpoint

**`GET /referee/games`** in `apps/api/src/routes/referee/games.routes.ts`

Protected by `requireReferee` middleware (same as current match routes).

**Query params:**
- `limit` (default 100, max 500), `offset` (default 0)
- `search` — ilike on `homeTeamName`, `guestTeamName`, `leagueName`
- `status` — `"active"` (default: not cancelled, not forfeited), `"cancelled"`, `"forfeited"`, `"all"`
- `srFilter` — `"our-club-open"` (our-club slot not assigned), `"any-open"` (any slot not assigned), `"all"` (default)
- `league` — exact match on `leagueShort`
- `dateFrom`, `dateTo` — filter on `kickoffDate`

**Response:** `PaginatedResponse<RefereeGameListItem>` with items sorted by `kickoffDate ASC, kickoffTime ASC`.

### 2.2 Shared Type

**`packages/shared/src/referee-games.ts`** (new file, replaces `referee-matches.ts`):

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
  isTrackedLeague: boolean; // derived: matchId !== null
  lastSyncedAt: string | null;
}
```

### 2.3 Service

**`apps/api/src/services/referee/referee-games.service.ts`:**

- `getRefereeGames(filters)` — Drizzle query builder on `refereeGames` table
- Applies filters via `and()` conditions
- Derives `isTrackedLeague` from `matchId !== null` via `sql` expression
- Returns paginated response with total count

### 2.4 Cleanup

**Delete:**
- `apps/api/src/routes/referee/match.routes.ts` — old match-based routes
- `apps/api/src/services/referee/referee-match.service.ts` — old service with `getMatchesWithOpenSlots`, `recordTakeIntent`, `cancelTakeIntent`, `verifyMatchAssignment`
- `packages/shared/src/referee-matches.ts` — old shared types (`RefereeMatchListItem`, `TakeMatchResponse`, `VerifyMatchResponse`, `RefereeSlotInfo`)

**Update:**
- `apps/api/src/routes/index.ts` (or wherever routes are mounted) — swap `refereeMatchRoutes` for `refereeGamesRoutes`
- `packages/shared/src/index.ts` — export `referee-games.ts` instead of `referee-matches.ts`
- Remove any other imports of the deleted modules

---

## 3. Frontend: Referee Games List

### 3.1 New Component

**`apps/web/src/components/referee/referee-games-list.tsx`** — replaces `referee-match-list.tsx`

Client component using `DataTable` pattern.

**Data fetching:** SWR with key `SWR_KEYS.refereeGames` → `GET /referee/games?limit=500&offset=0`.

### 3.2 Columns

| Column | Header | Content |
|--------|--------|---------|
| `kickoffDate` | Date | Formatted date. Line-through + muted text for cancelled/forfeited |
| `kickoffTime` | Time | `HH:MM` format |
| `homeTeamName` | Home | Team name |
| `guestTeamName` | Guest | Team name |
| `leagueName` | League | League name. If `!isTrackedLeague`: secondary badge "untracked" |
| `sr1` | SR1 | `SrSlotBadge` component (see below) |
| `sr2` | SR2 | `SrSlotBadge` component (see below) |
| `status` | — | Hidden column for filtering |

### 3.3 SrSlotBadge Component

Inline sub-component for SR1/SR2 cells. Renders based on slot state:

- **Assigned:** Green badge with referee name. If `ourClub`: `bg-primary/10 text-primary border-primary/20`
- **Offered (our club):** Heat/orange badge "offered" — `bg-heat/10 text-heat border-heat/20`. Indicates federation has opened this slot
- **Offered (not our club):** Secondary/sage badge "offered"
- **Open (our club):** Heat/orange badge "open" with stronger emphasis — this is the slot needing attention
- **Open (not our club):** Muted badge "open"

Our-club slots get the row highlight: `border-l-2 border-l-primary/50 bg-primary/5` (existing pattern from design system).

### 3.4 Toolbar & Filters

Uses `DataTableToolbar` pattern:

- **Search input** — filters across `homeTeamName`, `guestTeamName`, `leagueName`
- **Status facet** — chips: Active (default selected), Cancelled, Forfeited
- **SR Status facet** — chips: "Our club needs SR" (filters to `srFilter=our-club-open`), "Any open" (`srFilter=any-open`), "All" (default)
- **League facet** — derived from unique `leagueShort` values in the data
- **Date range** — from/to date pickers, default: `dateFrom=today`
- **Admin sync button** — RefreshCw icon, outline variant, size sm. Visible when `isAdmin`. Calls `POST /admin/settings/referee-games-sync`. Toast on success/failure.

All filtering is client-side on the fetched dataset (same pattern as current implementation — fetch all, filter in browser).

### 3.5 Page Update

**`apps/web/src/app/[locale]/admin/referee/matches/page.tsx`:**

- Import `RefereeGamesList` instead of `RefereeMatchList`
- Fetch from `SWR_KEYS.refereeGames` instead of `SWR_KEYS.refereeMatches`
- Use `RefereeGameListItem` type instead of `RefereeMatchListItem`

### 3.6 Cleanup

**Delete:**
- `apps/web/src/components/referee/referee-match-list.tsx`

**Update SWR keys** in `apps/web/src/lib/swr-keys.ts`:
- Remove `refereeMatches`
- Add `refereeGames: "/referee/games?limit=500&offset=0"`

---

## 4. Frontend: Sync Dashboard Tab

### 4.1 Page Restructure

**`apps/web/src/app/[locale]/admin/sync/page.tsx`:**

Currently has a flat layout with status cards, live logs, and tabs (history/schedule). Restructure to top-level tabs:

```
[Main Sync] [Referee Games]    ← top-level tabs (new)

Main Sync tab:
  Status Cards (4-grid)
  Live Logs
  [History] [Schedule]         ← existing sub-tabs
  History table / Schedule config

Referee Games tab:
  Status Cards (2-card row)
  Live Logs (when running)
  History table
  Trigger button
```

The `PageHeader` and top-level tabs sit outside `SyncRunProvider`. Each tab has its own provider instance since they track independent sync runs.

### 4.2 Referee Sync Tab Components

**Status cards** — 2-card row (reuse `SyncStatusCards` pattern but simplified):
- **Current status:** Running (with animated pulse) or Idle
- **Last sync:** Status badge + timestamp + duration + counts (created/updated/unchanged)

**Live logs** — reuse existing `SyncLiveLogs` component. It accepts a `syncRunId` for SSE subscription — works with any sync type since SSE is keyed on `syncRunId`.

**History table** — same `SyncHistoryTable` component, with a new optional `syncType` prop that filters the data. When `syncType="referee-games"`, it fetches from the filtered logs endpoint. Each row expandable to show per-game entries (entityType: refereeGame).

**Trigger button** — "Sync Referee Games" button, calls `POST /admin/settings/referee-games-sync`. Disabled when running.

### 4.3 Hooks

**`apps/web/src/components/admin/sync/use-sync.ts`** — add hooks:

- `useRefereeSyncStatus()` — SWR polling `SWR_KEYS.syncStatus + "?syncType=referee-games"`, 3s when running, 15s idle
- `useRefereeSyncLogs()` — SWR polling `SWR_KEYS.syncLogs(20, 0) + "&syncType=referee-games"`
- `useTriggerRefereeSync()` — POST to existing endpoint, manages optimistic sync run state

### 4.4 SWR Keys

Add to `apps/web/src/lib/swr-keys.ts`:
- `refereeSyncStatus: "/admin/sync/status?syncType=referee-games"`
- `refereeSyncLogs: (limit: number, offset: number) => "/admin/sync/logs?limit=${limit}&offset=${offset}&syncType=referee-games"`

---

## 5. Translations

### 5.1 English (`apps/web/src/messages/en.json`)

Add under `refereeGames` key (replacing old `refereeMatches` keys):

```json
{
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
      "srFilterAll": "All games",
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
}
```

Add under `sync.tabs`:
```json
{
  "sync": {
    "tabs": {
      "mainSync": "Main Sync",
      "refereeGames": "Referee Games"
    }
  }
}
```

### 5.2 German (`apps/web/src/messages/de.json`)

Corresponding German translations:

```json
{
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
      "srFilterAll": "Alle Spiele",
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
}
```

---

## 6. File Summary

### New Files
| File | Purpose |
|------|---------|
| `apps/api/src/routes/referee/games.routes.ts` | Referee games API endpoint |
| `apps/api/src/services/referee/referee-games.service.ts` | Referee games query service |
| `packages/shared/src/referee-games.ts` | `RefereeGameListItem` shared type |
| `apps/web/src/components/referee/referee-games-list.tsx` | Referee games list UI |
| `apps/web/src/components/admin/sync/referee-sync-tab.tsx` | Referee sync dashboard tab |
| `apps/web/src/components/admin/sync/referee-sync-status-cards.tsx` | 2-card status row |

### Modified Files
| File | Change |
|------|--------|
| `packages/shared/src/constants.ts` | Add `"refereeGame"` to `ENTITY_TYPES` |
| `packages/shared/src/index.ts` | Export `referee-games.ts`, remove `referee-matches.ts` |
| `apps/api/src/services/sync/sync-logger.ts` | Add `"refereeGame"` to local `EntityType` |
| `apps/api/src/services/sync/referee-games.sync.ts` | Accept `SyncLogger`, add per-item logging |
| `apps/api/src/workers/queues.ts` | `triggerRefereeGamesSync` creates sync_run |
| `apps/api/src/workers/sync.worker.ts` | Wire sync_run lifecycle for referee-games |
| `apps/api/src/routes/admin/sync.schemas.ts` | Add `syncType` to query schemas |
| `apps/api/src/services/admin/sync-admin.service.ts` | Filter by `syncType` |
| `apps/api/src/routes/admin/sync.routes.ts` | Pass `syncType` to service |
| `apps/api/src/routes/admin/settings.routes.ts` | Return `syncRunId` from referee sync trigger |
| `apps/api/src/routes/index.ts` | Swap route mounting |
| `apps/web/src/app/[locale]/admin/referee/matches/page.tsx` | Use new component + type |
| `apps/web/src/app/[locale]/admin/sync/page.tsx` | Add top-level tabs |
| `apps/web/src/components/admin/sync/use-sync.ts` | Add referee sync hooks |
| `apps/web/src/lib/swr-keys.ts` | Add referee game/sync keys |
| `apps/web/src/messages/en.json` | Add `refereeGames` translations |
| `apps/web/src/messages/de.json` | Add `refereeGames` translations |

### Deleted Files
| File | Reason |
|------|--------|
| `apps/api/src/routes/referee/match.routes.ts` | Replaced by `games.routes.ts` |
| `apps/api/src/services/referee/referee-match.service.ts` | Replaced by `referee-games.service.ts` |
| `packages/shared/src/referee-matches.ts` | Replaced by `referee-games.ts` |
| `apps/web/src/components/referee/referee-match-list.tsx` | Replaced by `referee-games-list.tsx` |
