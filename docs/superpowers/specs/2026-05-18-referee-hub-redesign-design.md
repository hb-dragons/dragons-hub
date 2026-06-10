# Referee Hub Redesign — Design

**Date:** 2026-05-18
**Scope:** `/admin/referees` page (the Referee Hub)
**Status:** Approved for planning

## Goal

The Referee Hub is the senior admin's daily tool for two jobs:

1. Assign referees to open game slots quickly and fairly.
2. Manage the referee roster: which federation referees count as our club, and per-referee assignment rules.

The current implementation mixes useful and noisy information, has a dead "range" header control, hides non-own-club federation referees entirely, and renders the historical match role ("1.Schiedsrichter" / "2.Schiedsrichter") inside the assignment list — information that does not influence the assignment decision and adds an expensive DB join to every list response.

This redesign tightens both tabs around their real jobs, replaces client-side filtering with server-side query parameters, and splits a confusing combined autosave (visibility + rules) into separate save models.

## Non-goals

- Mobile / responsive layout below 1024px (admin tool, desktop-first).
- Bulk own-club toggling.
- Showing cancelled/forfeited games in the open-slots list.
- Optimistic slot assignment (federation latency makes this risky).
- Any change to the public referee-facing routes (`/me/games`, etc.).

## Information architecture

- Route stays `/admin/referees`.
- Page component stays SSR for first paint.
- Header is reduced to title + two tabs: `Open Slots`, `Referees`. The global `range` (season / 30d / month / custom) selector is removed — it was never wired into any filter.
- URL state continues to drive selection. New facet params are URL-synced so links and back/forward work.

```
/admin/referees?tab=open-slots&status=open&league=OL,BL&dateFrom=2026-05-18&dateTo=2026-06-01&gameType=home&game=4711
/admin/referees?tab=referees&scope=all&search=mei&sort=workloadDesc&id=42&subtab=rules
```

## Open Slots tab

### Layout

3-pane grid: `200px | 320px | 1fr`.

1. **Filter sidebar** — facets, URL-synced.
2. **List** — virtualized, server-paginated rows.
3. **Detail** — selected game header + two `SlotCard`s.

### Filter facets

| Facet | Control | Default |
|---|---|---|
| Status | Radio: `Open only` / `Open + Offered` / `Any` | `Open only` |
| League | Multi-checkbox (loaded from `/admin/settings/leagues` — already used by the sync settings page) | All |
| Date | Radio: `Next 14d` / `Next 30d` / `Season` / `Custom` (two date inputs) | `Next 14d` |
| Game type | Checkbox: `Home` / `Away` | Both |

`Reset` button clears to defaults. Cancelled and forfeited games are always excluded.

### List

- `GET /admin/referee/games?status=&league=&dateFrom=&dateTo=&gameType=&q=&limit=50&offset=0`
- SWR cache key is the full URL string.
- `react-window` (FixedSizeList, ~36px rows) once row count exceeds ~50.
- Row content (top to bottom): kickoff date · time · league short → home vs guest (bold) → SR1/SR2 status chips.
- Search input inside the list is client-side over the loaded page; once length ≥ 3 it becomes a debounced (300ms) server `?q=` parameter to keep typing-time stable.
- Empty state: "No games match current filters. Reset?" with button.

### Detail

- Header: kickoff line · `#matchNo` · `Home vs Guest` (h2).
- Two stacked `SlotCard`s. Each card knows assigned/open and renders the appropriate content.
- On `open` it mounts the `CandidatePicker`.
- Successful assign/unassign mutates only the current list-page key and the affected detail key (no global cascade refetch).
- Assign/unassign is **not** optimistic. A spinner appears on the affected `SlotCard` while busy; the federation source of truth is awaited.

### Candidate picker

- `GET /admin/referee/games/:gameId/candidates?slot=1&q=&page=0&limit=15`
- Server returns candidates pre-ranked:
  - Eligible (qualified for the slot + mode-match + no blocktermin + no time-window conflict) first.
  - Within eligible: ascending `meta.total` (lowest workload first). Tiebreak: license number, then last name.
  - Blocked candidates appended at the bottom, dimmed, with reason chip. They remain visible for transparency.
- Row: name · workload badge · `Assign` button (or `Blocked: <reason>` text). 409/validation errors on assign keep the picker open with the candidate row highlighted and an inline error chip (no toast).

## Referees tab

### Layout

Master/detail grid: `360px | 1fr`.

### List

- `GET /admin/referees?scope=own|all&search=&sort=&limit=50&offset=0`
- URL state adds `scope` (default `own`).
- Filter chip `Own (N) | All (M)`. Counts come from `GET /admin/referees/counts`, cached 30s.
- Sort: Name (default), Workload ↓, Workload ↑.
- Row content: `Last, First` (bold) → `Lic #` (small, muted). **No `roles.join(",")` line.** Inline own-club checkbox toggles `PATCH /admin/referees/:id/visibility` optimistically.
- Match-count column on the right (tabular nums).
- KPI strip above search reduced to two cards: `Own-club refs (N)` · `Avg matches/ref (N)` — server-aggregated, not derived from the visible page.
- `react-window` virtualization once row count exceeds ~50.

### Detail header

- `Last, First` · `Lic # · API #` · `Own Club` badge if applicable. No roles line.

### Subtab: Profile

- Identity (read-only): name, license, API id, own-club badge.
- Visibility switches: `Own Club`, `All Home Games`, `Away Games`. Autosave per toggle, optimistic UI, rollback + toast on error.
- If `Own Club` is off, the Rules subtab is disabled with tooltip "Mark as own club first."

### Subtab: Rules

- `GET /admin/referees/:id/rules`
- Per row: team select (own-club teams only) · `Allow` / `Deny` toggle · if Allow: `SR1` / `SR2` checkboxes.
- `Add Rule` button. Trash icon per row.
- **Explicit save**. Sticky save bar at bottom: `Save changes` / `Discard`. Disabled when clean.
- Unsaved-changes guard: switching referees or tabs with dirty state pops a confirm. Same on browser navigation (`beforeunload`).
- `PATCH /admin/referees/:id/rules` is its own endpoint.

### Subtab: Upcoming

Two sections:

- **Assigned to `<name>`** — `GET /admin/referee/games?assignedRefereeApiId=<apiId>` (new query param, replaces client-side filter over the full list).
- **Eligible open games** — `GET /admin/referees/:id/eligible-open-games`. Server determines eligibility using the same logic as the candidate picker, inverted (game-centric → ref-centric).

Each row links into the Open Slots tab with `?tab=open-slots&game=<id>`.

### Subtab: History

- Existing `GET /admin/referee/history/games?refereeApiId=&limit=&offset=` reused.
- CSV export unchanged.
- Role detection bug fix: derive SR1/SR2 from `sr*RefereeApiId === referee.apiId` (not the current fragile substring match against last name).
- Load-more pagination.

## API & data layer

### Endpoint changes

| Endpoint | Change |
|---|---|
| `GET /admin/referees` | Add `scope` (`own` / `all`; omitted = `all`), `search`, `sort` (`name` / `workloadAsc` / `workloadDesc`), `limit`, `offset`. Drop the `selectDistinct(matchReferees → refereeRoles)` join. Response items drop `roles: string[]`. |
| `GET /admin/referees/counts` | **New.** Returns `{ own, all }`. Single aggregate query. |
| `PATCH /admin/referees/:id` | **Removed.** Replaced by visibility and rules endpoints. |
| `PATCH /admin/referees/:id/visibility` | Stays as-is (already exists). |
| `PATCH /admin/referees/:id/rules` | **New.** Body `{ rules: Rule[] }`. Own-club guard. Transactional delete-and-insert. |
| `GET /admin/referees/:id/rules` | Unchanged. |
| `GET /admin/referees/:id/eligible-open-games` | **New.** Returns open games this ref is eligible for. |
| `GET /admin/referee/games` | Add server-side filters: `status`, `league[]`, `dateFrom`, `dateTo`, `gameType`, `assignedRefereeApiId`, `q`, `limit`, `offset`. Paginated response `{ items, total, limit, offset, hasMore }`. Always excludes cancelled/forfeited. |
| `GET /admin/referee/games/:gameId/candidates` | Server-side ranking (eligible-first, lowest workload). Same eligibility fields surfaced. |

### Type changes (`packages/shared/src/referees.ts`)

- `RefereeListItem.roles: string[]` — **removed**.
- `UpdateRefereeSettingsBody`, `UpdateRefereeSettingsResponse` — **removed**.
- `UpdateRefereeRulesBody` — promoted to body type for the new endpoint.
- `RefereeCountsResponse` — **new** `{ own: number, all: number }`.
- `EligibleOpenGamesResponse` — **new**, items are `RefereeGameListItem[]`.

### Service changes

`apps/api/src/services/admin/referee-admin.service.ts`:

- `getReferees` — drop the second roles query (lines 90–110). Handle `scope === undefined` (no filter). Add `sort` switch in `orderBy`.
- `updateRefereeSettings` — **deleted**.
- `updateRefereeRules` — **new**, transactional, own-club guard.
- `updateRefereeVisibility` — unchanged.
- `getRefereeCounts` — **new**, one query: `SELECT count(*) FILTER (WHERE is_own_club) AS own, count(*) AS all FROM referees`.

`apps/api/src/services/referee/referee-games.service.ts`:

- Add filtering builder for the new query parameters.

`apps/api/src/services/referee/referee-assignment.service.ts`:

- `rankCandidates(candidates, slot)` — partition eligible/blocked, sort eligible by `meta.total` ASC with deterministic tiebreaks (license, name). Blocked appended.

`apps/api/src/services/referee/referee-slot-resolver.ts`:

- Refactor eligibility check so it can be invoked both candidate-centric and game-centric (powers `eligible-open-games`).

### DB

No schema migrations. Add one index:

```sql
CREATE INDEX IF NOT EXISTS referee_games_status_kickoff_idx
  ON referee_games (sr1_status, sr2_status, kickoff_date);
```

`referee_roles` and `match_referees` tables stay — still used by match detail.

### SWR keys (`apps/web/src/lib/swr-keys.ts`)

- `refereesPaginated(scope, search, sort, limit, offset)` — replaces `referees(ownClub)`.
- `refereeGamesFiltered(query)` — replaces `refereeGames`.
- `refereeCounts` — new.
- `refereeEligibleGames(id)` — new.
- Old keys deleted in the same PR as the API changes.

### SSR fallback fix

The current SSR fetches `/admin/referees` while the client fetches `/admin/referees?ownClub=true` — different cache keys, fallback wasted, double network on first paint. The page must compute the canonical first-page URL (defaults: scope `own`, open-only, next-14d, etc.) and use that string both as the `fetchAPIServer` argument and the SWR cache key.

## Performance

### Network

- SSR fetches the canonical first-page URL per tab. Removes the double-fetch bug.
- Server-side filters cut payload size on Open Slots dramatically when only "next 14d" is loaded.
- Drop `roles` JOIN — list query goes from 2 round-trips to 1.
- Composite index `(sr1_status, sr2_status, kickoff_date)` supports the common scan index-only.
- `refereeCounts` is one aggregate query, SWR-cached 30s.

### Rendering

- `react-window` (FixedSizeList) for Open Games list and Referees list above ~50 rows. 36px fixed row height.
- Row component memoized on `apiMatchId` / `id` so search re-renders don't re-mount unaffected rows.
- Candidate picker stays paginated, no virtualization needed (15/page).

### State

- SWR `dedupingInterval: 5000` on list endpoints. Same key shared by tab + detail = single fetch.
- After assign/unassign, mutate only the matching list-page key and the detail key.

## Save model and error handling

| Surface | Save | Optimistic | On error |
|---|---|---|---|
| Own-club checkbox (list) | Autosave per click | Yes | Rollback + toast |
| Visibility switches (Profile) | Autosave per toggle | Yes | Rollback + toast |
| Rules (Rules subtab) | Explicit save bar | No | Keep dirty state + inline error in save bar |
| Slot assign / unassign | On submit | No | Inline error chip in picker, no toast |

Unsaved-changes guard: switching referees, switching tabs, or navigating away with a dirty Rules subtab pops a confirm.

Network errors on list fetches keep stale data (SWR default) and show a small "stale, retrying" badge above the list — never blank screens.

404 on a referee detail (deleted/synced-out): empty state in the detail pane with "Referee no longer exists — clear selection".

Federation API errors in the candidate picker surface inline ("Federation API unavailable, retry") instead of the current silent empty list.

## Testing

### API (Vitest)

- `referee-admin.service.test.ts` — `getReferees` with `scope=undefined` returns all, `sort=workloadDesc` orders correctly, query shape has no roles join. `getRefereeCounts` returns `{ own, all }`. `updateRefereeRules`: success path, own-club guard 400, invalid teamId 400.
- `referee-games.service.test.ts` — each filter param, pagination shape, always-excludes-cancelled invariant.
- `referee-assignment.service.test.ts` — ranking tests: eligible-before-blocked, ascending workload within eligible, deterministic tiebreak.
- New `getEligibleOpenGames.test.ts` — eligibility mirrors candidate-resolver, inverted.

### Routes

- `admin/referee.routes.test.ts` — new query params validated, `/counts` route wired, `/rules` PATCH wired.
- `admin/referee-assignment.routes.test.ts` — ranked response order.
- `routes/referee/games.routes.test.ts` — filter params propagate.

### Web (Vitest + RTL)

- `referee-list.test.tsx` — Own/All chip toggles scope param, search debounces, no roles line rendered.
- `referee-detail.test.tsx` — subtab nav, Profile shows no rules, Rules disabled when not own-club.
- `subtabs/rules.test.tsx` — dirty tracking, save bar enable/disable, unsaved-changes confirm.
- `subtabs/profile.test.tsx` — per-field optimistic visibility update + rollback on error.
- `open-games-list.test.tsx` — virtualization renders only visible rows, status chip renders all states.
- `candidate-picker.test.tsx` — server-ranked order preserved client-side, blocked-reason chip for each block kind.
- `slots-filter-sidebar.test.tsx` — facet → URL sync, Reset clears, defaults applied on mount.
- `use-referee-hub-url.test.ts` — extend for new params.

Stay above existing coverage thresholds (90/95/95/95). New files start with tests.

## Migration plan — 3 PRs

Nothing is deployed. No backwards compatibility required.

1. **API redesign + types.** New endpoints, new query params on list, server-side filters, composite index, candidate ranking. Old combined `PATCH /admin/referees/:id`, old `roles` field, and old SWR-incompatible shapes all removed. Web won't build yet — fixed in PR 2.
2. **Open Slots tab + role-label removal.** 3-pane layout, filter sidebar, virtualization, server-ranked picker. Removes `roles` rendering. Updates SWR keys. Web compiles again.
3. **Referees tab redesign + Rules subtab.** Own/All chip, server-paginated list, split Profile/Rules subtabs, explicit save model, eligible-open-games wired into Upcoming.

PR 1 and 2 must merge together (or 2 must follow within hours) — PR 1 breaks the build. Acceptable since nothing is deployed.

## Open questions parked (out of scope)

- Bulk own-club toggle.
- Mobile / responsive layout.
- "Show cancelled" toggle on the open-games list.
- Optimistic slot assign.
