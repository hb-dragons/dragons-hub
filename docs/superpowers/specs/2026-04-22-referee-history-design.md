# Referee History View Design

Date: 2026-04-22
Status: Draft
Audience: refereeAdmin, admin

## Problem

The referee list at `/admin/referee/matches` filters to games with an open our-club slot, so past games disappear as soon as slots are filled. Referee admins have no way to look back and review coverage of past obligations or see who refereed what.

## Goals

- Admins and referee admins can browse past games the club refereed.
- Two lenses: **obligation** (past home games we owed refs for) and **activity** (any past game our refs worked).
- Visible coverage KPIs for the selected range, including a data-integrity signal for unfilled past slots.
- Per-referee leaderboard showing sr1/sr2 appearances, covering own-club and guest refs.

## Non-Goals

- Per-team breakdown (slots owed/filled per Dragons team). Deferred — admins asked to focus on KPIs + referee stats first.
- Editing assigned referees after the fact.
- Exposing history to referees themselves. Admin-only.
- Defining/editing the "current season" value in the settings UI. Tracked as a separate prerequisite spec.

## Data Source

No schema changes. Queries read from existing tables:

- `referee_games` — one row per game, with our-club slot flags, assigned referee names + api ids, slot status, cancellation/forfeit flags, `is_home_game`, `kickoff_date`.
- `referees` — own-club flag, first/last name keyed by federation `api_id`.
- `app_settings` — current season range (new keys consumed here, defined by the prerequisite settings spec).

## Endpoints

Both registered as their own Hono router mounted at `/admin`, following the pattern already used by `adminRefereeAssignmentRoutes` (internal paths begin with `/referee/history/...`). Both guarded by `assignment:view` (admin + refereeAdmin).

### `GET /admin/referee/history/summary`

KPIs + leaderboard in one call. Caches longer than the paginated game list.

Query params:

| Param | Type | Default | Notes |
|---|---|---|---|
| `mode` | `obligation` \| `activity` | `obligation` | Drives WHERE predicate |
| `dateFrom`, `dateTo` | ISO date | current-season range | Inclusive |
| `league` | string (`leagueShort`) | — | Optional |
| `status` | `all` \| `active` \| `cancelled` \| `forfeited` | `active` | Excludes cancelled/forfeited unless requested |

Response:

```ts
{
  range: { from: "2025-08-01", to: "2026-07-31", source: "user" | "settings" | "default" },
  kpis: {
    games: number,
    obligatedSlots?: number,   // obligation mode only
    filledSlots?: number,      // obligation mode only
    unfilledSlots?: number,    // obligation mode only; expected 0 for past — integrity signal
    cancelled: number,
    forfeited: number,
    distinctReferees: number,  // all refs (own + guest) who appeared
  },
  leaderboard: Array<{
    refereeApiId: number | null,
    refereeId: number | null,
    displayName: string,
    isOwnClub: boolean,
    sr1Count: number,
    sr2Count: number,
    total: number,
    lastRefereedDate: string | null,
  }>, // total desc, capped at 100
}
```

### `GET /admin/referee/history/games`

Paginated game list for the same filter range.

Query params: summary params + `search` (string), `limit` (default 50), `offset` (default 0).

Response:

```ts
{
  items: Array<{
    id: number,
    matchId: number | null,
    matchNo: number,
    kickoffDate: string,
    kickoffTime: string,
    homeTeamName: string,
    guestTeamName: string,
    leagueName: string | null,
    leagueShort: string | null,
    venueName: string | null,
    venueCity: string | null,
    sr1OurClub: boolean,
    sr2OurClub: boolean,
    sr1Name: string | null,
    sr2Name: string | null,
    sr1Status: string,
    sr2Status: string,
    isCancelled: boolean,
    isForfeited: boolean,
    isHomeGame: boolean,
  }>,
  total: number,
  limit: number,
  offset: number,
  hasMore: boolean,
}
```

Reuses `refereeGameColumns` from `referee-games.service.ts` minus `mySlot`/`claimableSlots`. Sort: `kickoffDate DESC, kickoffTime DESC` (most recent first).

## Mode Predicates

- **obligation**: `sr1_our_club = true OR sr2_our_club = true`.
- **activity**: `sr1_referee_api_id IN (SELECT api_id FROM referees WHERE is_own_club) OR sr2_referee_api_id IN (...)`. Scalar subquery, no join.

## Default Date Range

Resolution order in `resolveHistoryDateRange`:

1. `from`/`to` supplied by caller → `source: "user"`.
2. `app_settings.currentSeasonStart` + `app_settings.currentSeasonEnd` present → `source: "settings"`.
3. Fallback: computed season from today (Aug 1 → Jul 31 of the relevant year) → `source: "default"`.

Fallback keeps the page usable before the settings spec lands.

## Service Layer

New file: `apps/api/src/services/admin/referee-history.service.ts`.

Exports:

```ts
export async function resolveHistoryDateRange(
  from?: string,
  to?: string,
): Promise<{ from: string; to: string; source: "user" | "settings" | "default" }>;

export async function getRefereeHistorySummary(
  params: HistoryFilterParams,
): Promise<SummaryResponse>;

export async function getRefereeHistoryGames(
  params: HistoryFilterParams & { search?: string; limit: number; offset: number },
): Promise<PaginatedResponse<HistoryGameItem>>;
```

Internal helpers:

- `buildBaseWhere(params)` — shared WHERE builder (mode predicate + date range + league + status) used by both endpoints so filters always match.
- `buildObligationPredicate()` / `buildActivityPredicate()`.
- `summarizeKpis(where)` — one SELECT with SUM/COUNT FILTER (...) clauses.
- `buildLeaderboard(where)` — UNION ALL of sr1 and sr2 sides, GROUP BY on `coalesce(api_id, name)`, LEFT JOIN `referees` by `api_id` for display name and `is_own_club`. LIMIT 100.

Guest refs without a matching `referees` row keep `refereeId = null` and `isOwnClub = false`; their `displayName` falls back to the stored `sr1_name`/`sr2_name` string.

Zod schemas live in `apps/api/src/routes/admin/referee-history.schemas.ts` — single source for `HistoryFilterParams` + games query type, imported by both route and service.

## Routes

New file: `apps/api/src/routes/admin/referee-history.routes.ts`. Exports `adminRefereeHistoryRoutes` (Hono router). Two handlers at internal paths `/referee/history/summary` and `/referee/history/games`, both gated by `requirePermission("assignment", "view")`. Registered in `apps/api/src/routes/index.ts` with `routes.route("/admin", adminRefereeHistoryRoutes)` so full paths become `/admin/referee/history/summary` and `/admin/referee/history/games`.

## Frontend

New page: `apps/web/src/app/[locale]/admin/referee/history/page.tsx`. Server component. Guards with `can(user, "assignment", "view")` → `notFound()` if absent. Preloads summary via `fetchAPIServer` for first paint; games list fetched client-side so pagination stays interactive.

New components under `apps/web/src/components/referee/history/`:

- `history-page.tsx` — client root, reads/writes URL params via `useSearchParams`.
- `history-filters.tsx` — mode toggle, date pickers, league select, status select.
- `coverage-kpi-cards.tsx` — grid of KPI cards; hides obligation-only KPIs in activity mode.
- `referee-leaderboard.tsx` — sortable table; badges own-club vs guest via `isOwnClub`.
- `history-game-list.tsx` — reuses presentational bits from `RefereeGameList`; no claim UI.

SWR hooks:

- `useRefereeHistorySummary(params)` → `SWR_KEYS.refereeHistorySummary(params)`.
- `useRefereeHistoryGames(params)` → `SWR_KEYS.refereeHistoryGames(params)`.

URL-driven filter state so the page is shareable: `?mode=activity&dateFrom=2025-08-01&dateTo=2026-07-31&league=...`.

Nav: new "Referee History" entry in the admin sidebar under the Referee section, gated client-side by `assignment:view`. Existing open-games page keeps its current link.

i18n: new `refereeHistory` namespace in `apps/web/src/messages/en.json` and `de.json`.

## RBAC

No new statement or role. Endpoints reuse `assignment:view`, held by `admin` and `refereeAdmin`. `teamManager` and referees without an admin role do not see the page.

## Testing

API (Vitest, repo thresholds 90/95):

- `referee-history.service.test.ts`
  - `resolveHistoryDateRange`: user args win; reads `app_settings` when args absent; date-math fallback when settings missing.
  - `getRefereeHistorySummary`: obligation vs activity predicates pick the correct games; KPI counts across mixed states (filled/unfilled/cancelled/forfeited); activity mode omits obligation KPIs; leaderboard aggregates sr1/sr2 correctly; own-club + guest refs both listed with `isOwnClub`; fallback grouping by name when `apiId` null; leaderboard capped at 100.
  - `getRefereeHistoryGames`: pagination (`total`, `hasMore`); sort desc; date/league/status/search filters; empty result set handling.
- `referee-history.routes.test.ts`
  - 403 without `assignment:view`; 200 for admin + refereeAdmin.
  - Zod rejects invalid `mode`/`status`/date values.
  - Happy-path response shapes match the schema.

Fixtures: extend `apps/api/src/test/fixtures/seed.json` with past `referee_games` rows covering the edge cases above (obligation home, activity away, cancelled, forfeited, unfilled past, guest-ref filled).

Web: no unit tests for page components (consistent with other referee admin pages). Manual verification:

1. Log in as refereeAdmin, visit `/admin/referee/history`, confirm default range matches app_settings or the Aug→Jul fallback.
2. Switch mode → KPI set changes; leaderboard updates.
3. Change date range / league → both endpoints refetch; URL params reflect state.
4. Pagination of the game list does not refetch the summary.
5. Log in as teamManager → page returns 404.

## Out-of-Scope Prerequisites

- Defining `app_settings.currentSeasonStart` / `currentSeasonEnd` and the settings UI to edit them. Tracked separately. History page works via fallback until that spec lands.
