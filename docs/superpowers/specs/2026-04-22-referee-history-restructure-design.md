# Referee History UX Restructure

Date: 2026-04-22
Status: Draft
Audience: refereeAdmin, admin
Supersedes: `/admin/referee/history` layout defined in `2026-04-22-referee-history-design.md` (keeps the endpoints; replaces the UI).

## Problem

The current referee history page presents seven equally-weighted KPIs, a mixed own-club/guest leaderboard, and a paginated game table — all on one scroll. For the primary user — the scheduling coordinator — the page buries the decision-making signal. The coordinator's question is "who should I pick for the next assignment, and did anyone fall behind?", but the page answers "here are some totals".

Specific gaps:

- No composite obligation-coverage metric. Coordinator has to compute `filled / obligated` mentally.
- Own-club and guest refs mixed in one leaderboard with only a badge separating them; workload balance decisions concern own-club refs.
- Unfilled obligated slots are invisible in the game table (just "—").
- League filter is a free-text input; no league list.
- No date presets; typing dates every visit is tedious.
- Search fires per-keystroke; no debounce.
- No per-ref drill-down; names aren't clickable.
- Range label is tucked in a muted bottom-left position; it's the most important context on the page.

## Audience

Primary: **scheduling coordinator** (refereeAdmin). Uses the page to inform the next assignment decision.

Top three jobs, in priority order:

1. **Workload balance** — who has done too many or too few games?
2. **Per-ref drill-down** — see everything a specific ref has reffed this range.
3. **Cancellation / forfeit audit** — find and review problematic games (low frequency, but important when present).

## Goals

- Put workload comparison of own-club refs front and center.
- Make obligation coverage a single, scannable signal.
- Give the coordinator a one-click path from a ref's name to that ref's game list.
- Surface cancelled/forfeited games only when they exist; make them unmissable when they do.
- Keep filter state URL-addressable so views are shareable.

## Non-Goals

- Trend / historical aggregation charts (deferred; no aggregation endpoint yet).
- Per-week or per-month breakdowns beyond drawer grouping.
- Rotation-staleness alerts ("idle > N days").
- Changing RBAC scope (stays `assignment:view`).
- Adding data not already captured by `referee_games` / `referees`.

## Layout

Tabbed. **Workload** (default) | **Games**. Audit does not get its own tab; see "Issues Callout".

```
┌───────────────────────────────────────────────────────────┐
│ REFEREE HISTORY             [ Season 25/26 pill ] [CSV ↓] │   header
├───────────────────────────────────────────────────────────┤
│ Range: [Season*] [Last 30d] [This month] [Custom…]        │
│        │ League ▾ │ 🔍 Search                             │   filter bar
│ Active: [League: Regio Nord ✕]                            │
├───────────────────────────────────────────────────────────┤
│ ⚠ 3 cancelled · 2 forfeited in this range   →             │   issues callout (only if >0)
├───────────────────────────────────────────────────────────┤
│ [Workload]  Games (53)                                    │   tabs
├───────────────────────────────────────────────────────────┤
│ Tab content                                               │
└───────────────────────────────────────────────────────────┘
```

### Filter bar

- Range presets: `Season` (uses settings range) · `Last 30d` · `This month` · `Custom` (reveals a date-range picker).
- League `Select` populated from `availableLeagues` returned by the summary endpoint.
- Search input, debounced 300 ms, applies to Games tab only.
- Active filters render as removable chips below the preset row. Chip click removes the filter.

### Issues callout

- Shown only when `cancelled + forfeited > 0` in the current range.
- Copy: `⚠ {cancelled} cancelled · {forfeited} forfeited in this range →`.
- Click navigates to Games tab with `status=cancelled,forfeited` preset. (Multi-value status; see URL state.)
- When counts are zero, no callout renders. No silent empty state.

### Workload tab (default)

Status filter never applies to this tab. Workload KPIs and leaderboard always cover all games in the range regardless of the URL `status` value. Cancelled and forfeited games still count for `games` and leaderboard purposes; they are visually separated by the issues callout, not by excluding them from totals.

1. **KPI row** — three cards:
   - **Obligation coverage** (composite): `{percent}%` big, `{filled} / {obligated} filled` small, then a 5 px segmented bar (filled / unfilled). `unfilled` portion in heat color. When `obligatedSlots` is 0 (range has no home games): value renders as `—`, subtitle `No home obligations in range`, bar hidden.
   - **Games** — count in range.
   - **Distinct refs** — count.
   - Cancelled / forfeited counts are not here; they live in the issues callout and Games tab status chips.
2. **Our refs** leaderboard section:
   - Heading `OUR REFS · {n}`.
   - Columns: `#`, `Name`, `Workload` (bar), `SR1`, `SR2`, `Total`, `Last refereed`.
   - Workload bar width = `row.total / max(own-club total)`. Top ref is always full width.
   - Name in primary color, clickable → opens drawer.
   - Sorted by `total DESC, lastRefereedDate DESC`.
3. **Guest refs on our games** section:
   - Collapsible, collapsed by default.
   - Same columns, but workload bar omitted (meaningless across disjoint guest rosters).
   - Names clickable → drawer; drawer omits the workload-share panel for guests.

### Games tab

- **Status chip row** (replaces the current select). Chips: `All {n}`, `Played {n}`, `Cancelled {n}`, `Forfeited {n}`. Single-select unless arriving via issues callout (`cancelled,forfeited` set).
- **Table columns**: `Date` (with weekday + time sub-line), `Match` (team names + HOME/AWAY pill; venue on second line), `Lg` (using `leagueShort`), `SR1`, `SR2`, `Status`.
- **OPEN pill**: when the game is an obligated home slot (`srNOurClub = true`) and `srNStatus = "open"`, render a heat-colored `OPEN` pill in that SR cell instead of a dash.
- Own-club ref names rendered in primary color. Guest ref names in default foreground.
- Cancelled / forfeited rows: opacity 0.45, strikethrough on match names. No SR highlights.
- **Pagination**: existing prev / next plus a page-size select (`25` / `50` / `100`).
- League cell click sets `league=<short>` filter.

### Ref drawer

- Right-side `Sheet` (Radix), width 480 px, opens on ref-name click.
- URL-driven: open state = `?ref=<apiId>` present. Close removes the param.
- Content scoped by the current page filters (`dateFrom`, `dateTo`, `league`).

Sections (top to bottom):

1. **Header**: display name (heavy), own-club / guest badge, close button. Subline shows current range + league filter.
2. **Stats grid** (4 cards): `Total`, `SR1`, `SR2`, `Leagues` (distinct league count for this ref in range).
3. **First / Last** line: first and last ref date in range, with relative "`· {N}d ago`" marker on last date.
4. **Workload share** (own-club only): full-width bar (`row.total / max own-club total`), percentage number, `Rank {k} of {n}` subtitle.
5. **Games list**: games reffed by this ref in range, newest first, grouped by month. Row = date (with weekday/time sub-line), match, role pill (`SR1` primary, `SR2` muted), status pill. Respects the page's status filter.
6. **Footer**: "Open ref profile →" link (only when `refereeId` is present). For guest refs (only raw name, no DB row), this link is hidden.

Close triggers: `✕` button, `Esc`, click-outside.

### Export

- Header `Export CSV` button. On Workload tab exports the leaderboard; on Games tab exports the full game list matching current filters (not just current page).
- Server-rendered CSV via two new endpoints (see API).

## URL State

Everything shareable via the URL. Single source of truth.

| Param | Values | Default |
|---|---|---|
| `tab` | `workload` \| `games` | `workload` |
| `preset` | `season` \| `30d` \| `month` \| `custom` | `season` |
| `dateFrom`, `dateTo` | ISO date | derived from preset unless `preset=custom` |
| `league` | `leagueShort` | — |
| `status` | comma-separated subset of `played`, `cancelled`, `forfeited`; or `all`; or omitted | omitted (= all) |
| `search` | string | — |
| `ref` | `refereeApiId` | — (drawer closed) |
| `offset` | int | `0` |
| `limit` | `25` \| `50` \| `100` | `50` |

The status param takes a comma list to support the issues callout (`status=cancelled,forfeited`). A single value is still accepted and treated as a one-element list. `all` and omitted are equivalent — both parse to an empty internal state array.

Status applies to the Games tab and to the drawer's games list. The Workload tab ignores it.

Preset → date resolution happens client-side before building the API key:

- `season` → settings range, or fallback Aug 1 – Jul 31.
- `30d` → `today - 30 days` to `today`.
- `month` → first-of-month to end-of-month of current month.
- `custom` → uses `dateFrom` / `dateTo` verbatim; picker shown. If `preset=custom` arrives without dates, default to the current-month range and populate `dateFrom` / `dateTo` into the URL on the first filter interaction.

## API Changes

Reuses the two endpoints from the prior spec with additive changes.

### `GET /admin/referee/history/summary`

Additive fields:

```ts
// existing response +
availableLeagues: Array<{ short: string; name: string }>;
```

Populated from distinct `(leagueShort, leagueName)` pairs of the rows matching the mode/date/status predicate (before the league filter is applied, so the user can switch leagues without losing the list). Sorted by `short`.

Cancelled / forfeited counts already in `kpis` remain; used by the issues callout.

### `GET /admin/referee/history/games`

Additive query params:

| Param | Type | Notes |
|---|---|---|
| `refereeApiId` | int | If present, filters to games where `sr1RefereeApiId = id OR sr2RefereeApiId = id`. Used by drawer. |
| `status` | comma list | Extends existing single-value accepted set to a comma-separated subset of `played`, `cancelled`, `forfeited`. `active` stays supported as an alias for `played`. |

Pagination stays the same. For the drawer, the client requests up to `limit=200`; if a ref exceeds that, a "…" footer shows in the drawer (unlikely in practice).

### `GET /admin/referee/history/games.csv` (new)

Same filters as `games`, returns `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="referee-history-games-{from}-{to}.csv"`. No pagination. Columns match the current `HistoryGameItem`, flattened: booleans as `true`/`false`, nulls as empty string.

### `GET /admin/referee/history/leaderboard.csv` (new)

Same filters as `summary`. Columns: `rank`, `displayName`, `isOwnClub`, `refereeApiId`, `refereeId`, `sr1Count`, `sr2Count`, `total`, `lastRefereedDate`. Always returns the full leaderboard (no row cap for export; the LIMIT 100 is UI-only).

Both CSV endpoints gated by `assignment:view`. Tests assert `Content-Type` and header row + at least one data row.

## Data Derivations

All new signals computed on the client from existing responses:

- Coverage percentage: `kpis.filledSlots / kpis.obligatedSlots` (0 when denominator is 0; render as `—`).
- Leaderboard split: partition by `entry.isOwnClub`.
- Workload bar normalization: `row.total / max(total among isOwnClub rows)`.
- Issues callout visibility: `kpis.cancelled + kpis.forfeited > 0`.
- `rank` in drawer: index of ref in the own-club-sorted array.
- Leagues count in drawer stats: distinct `leagueShort` in the drawer's fetched games.

No new aggregations server-side.

## Component Structure

`apps/web/src/components/referee/history/`:

```
history-page.tsx               (existing; rewritten)
filter-bar.tsx                 (new; replaces history-filters.tsx)
filter-chips.tsx               (new)
issues-callout.tsx             (new)
tabs-bar.tsx                   (new)

workload-tab.tsx               (new)
coverage-kpi-cards.tsx         (existing; trimmed to 3 cards + coverage composite)
leaderboard-section.tsx        (new; replaces referee-leaderboard.tsx)
workload-bar.tsx               (new)

games-tab.tsx                  (new)
status-chip-row.tsx            (new)
history-game-list.tsx          (existing; gets OPEN pill, HOME/AWAY, dim+strike, weekday)

ref-drawer.tsx                 (new)
ref-drawer-stats.tsx           (new)
ref-drawer-games-list.tsx      (new)

filter-state.ts                (existing; extended)
```

Files to delete: `referee-leaderboard.tsx` (content moves into `leaderboard-section.tsx`). Existing `history-filters.tsx` replaced by `filter-bar.tsx`.

`filter-state.ts` gains:

```ts
export type HistoryTab = "workload" | "games";
export type HistoryPreset = "season" | "30d" | "month" | "custom";
export type HistoryStatusValue = "played" | "cancelled" | "forfeited";

export interface HistoryFilterStateWithSearch {
  tab: HistoryTab;
  preset: HistoryPreset;
  dateFrom?: string;
  dateTo?: string;
  league?: string;
  status: HistoryStatusValue[];   // empty = "all"
  search?: string;
  ref?: number;                   // drawer target
  offset: number;
  limit: 25 | 50 | 100;
}
```

`parseHistoryFilterState` handles back-compat for existing `?status=active` (maps to `["played"]`).

## SWR Keys

Extend `SWR_KEYS`:

- `refereeHistorySummary(query)` — unchanged.
- `refereeHistoryGames(query)` — unchanged; `refereeApiId` included in query string.
- New `refereeHistoryGamesCsv(query)` and `refereeHistoryLeaderboardCsv(query)` helpers for building export URLs.

The summary hook always sends `status=all` regardless of the URL `status` value, so the Workload tab's KPIs and leaderboard stay stable when the user changes Games-tab chips. The games hook sends the URL `status` as-is.

Drawer uses `useRefereeHistoryGames({ ...filters, refereeApiId, limit: 200, offset: 0 })`. Shares the SWR cache with the games tab key when params happen to match (not expected in practice but harmless).

## i18n

`apps/web/src/messages/en.json` + `de.json`, `refereeHistory` namespace additions:

- `tab.workload`, `tab.games`, `tab.gamesCount`
- `presets.season`, `presets.last30d`, `presets.thisMonth`, `presets.custom`
- `filters.leagueAll`, `filters.export`, `filters.exportLeaderboard`, `filters.exportGames`
- `issuesCallout.label` (ICU plural: cancelled + forfeited)
- `kpi.coverage`, `kpi.coverageRatio`
- `leaderboard.ourRefs`, `leaderboard.guestRefs`, `leaderboard.workload`
- `games.columns.lg`, `games.badges.home`, `games.badges.away`, `games.badges.open`
- `drawer.stats.total`, `drawer.stats.sr1`, `drawer.stats.sr2`, `drawer.stats.leagues`, `drawer.first`, `drawer.last`, `drawer.daysAgo`, `drawer.workloadShare`, `drawer.rankOfTotal`, `drawer.openProfile`, `drawer.closeSr`

Remove keys no longer used: `leaderboard.sr1/sr2/ownClub/guest` when the old leaderboard component goes.

## Testing

### API (Vitest)

New cases in existing `referee-history.service.test.ts`:

- `availableLeagues` contains distinct pairs from matching rows, independent of the `league` filter value.
- `availableLeagues` is stable-sorted by `short`.
- `getRefereeHistoryGames` filters by `refereeApiId` across both SR1 and SR2 positions.
- `getRefereeHistoryGames` accepts comma list for `status` (`cancelled,forfeited` returns only those).

New file `referee-history-csv.test.ts`:

- `games.csv`: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition` attachment, header row, row count matches unpaginated query.
- `leaderboard.csv`: full leaderboard, no 100-row cap.
- Both return 403 without `assignment:view`.

Fixtures in `apps/api/src/test/fixtures/seed.json` extended with:

- An obligated home game with `sr1Status="open"` and `sr1OurClub=true` (drives OPEN pill).
- A guest-reffed away game in an uncommon league (exercises `availableLeagues`).
- A forfeited + a cancelled row in the current-season range (exercises issues callout).

### Web (Vitest + Testing Library)

Component tests under `apps/web/src/components/referee/history/*.test.tsx`:

- `filter-bar.test.tsx`: preset click resolves `dateFrom`/`dateTo`; chip dismiss removes param; search debounces (fake timers).
- `workload-bar.test.tsx`: bar width = `total / max`; guest rows render without bar.
- `leaderboard-section.test.tsx`: own-club + guest partitioned correctly; guest section collapses by default.
- `issues-callout.test.tsx`: hidden when both counts are 0; click sets `tab=games&status=cancelled,forfeited`.
- `ref-drawer.test.tsx`: opens from `?ref=<id>`; close removes param; own-club shows workload share, guest doesn't.
- `history-game-list.test.tsx`: OPEN pill shows only for obligated unfilled slots; cancelled rows dim + strikethrough; HOME/AWAY pill derived from `isHomeGame`.

Manual verification checklist (refereeAdmin login):

1. Default landing shows Workload tab with coverage %, our-refs leaderboard, collapsed guest section.
2. Click own-club ref → drawer opens with matching URL; stats match leaderboard row totals.
3. Switch to Games tab → table respects active filters; OPEN pill visible on any open obligated slot.
4. Add a cancelled row to fixtures → issues callout appears on both tabs; clicking navigates to Games with the correct status set.
5. Export CSV on each tab → file downloads with expected columns and full row set.
6. Reload with a full URL (preset, league, status, ref) → page restores state without flicker.
7. teamManager login → 404.

## Rollout

Single PR. No feature flag; the existing page is replaced atomically. Endpoints stay at the same routes with additive changes, so the page replacement is forward-compatible.

Order of commits within the PR:

1. Backend: add `availableLeagues` to summary, `refereeApiId` + comma-list `status` to games, two CSV endpoints. Tests.
2. Shared types: extend `HistorySummaryResponse` with `availableLeagues`; comma-list status type.
3. Frontend: new components, filter-state expansion, i18n. Old components removed in the same commit (no orphaned exports).
4. Manual verification pass; update `AGENTS.md` endpoint list to include the CSV routes.

## Open Questions

None at spec time. Resolved in brainstorm:

- Primary user: scheduling coordinator (confirmed).
- Drawer pattern: side drawer (confirmed).
- Leaderboard split: own-club primary + guest secondary (confirmed).
- Tabs vs single-page: tabbed (confirmed).
- Audit: collapsed into issues callout + Games status chips (confirmed).
