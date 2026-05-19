# Referee Hub — Plan 2: Referees Tab & Follow-ups — Design

**Date:** 2026-05-19
**Scope:** Second (and final) PR group of the Referee Hub redesign. Covers the Referees tab rewrite, dead-code/i18n cleanup surfaced by knip, polish carried over from the Open Slots PR, and infrastructure hardening discovered during Plan 1 review.
**Status:** Approved for planning
**Parent spec:** [`2026-05-18-referee-hub-redesign-design.md`](./2026-05-18-referee-hub-redesign-design.md)
**Builds on:** branch `feat/referee-hub-redesign` (35 commits ahead of `main`)

## Goal

Finish the Referee Hub redesign so the Referees tab does the senior admin's two real jobs — manage the roster (own/all visibility, per-referee rules) and inspect referee workload — without the noise the original page carried. Resolve the integration and polish items the Plan 1 final review surfaced.

## Non-goals (unchanged from parent spec)

- Mobile / responsive layout below 1024px.
- Bulk own-club toggling.
- Showing cancelled/forfeited games in the open-slots list.
- Optimistic slot assignment.
- Any change to public referee-facing routes.

## What changed since the parent spec

The parent spec described the Referees tab from a clean slate. Plan 1 shipped the API + Open Slots tab and partially started the Referees tab (a single `ProfileSubtab` that handles both visibility and rules with autosave). The final opus review surfaced four critical bugs that were patched in flight (`97184ab`, `4cc4a61`, `86d3e38`, `d1cc126`), plus a follow-up backlog that this plan absorbs.

Concrete deltas from the parent spec:

- Rules currently live inside `ProfileSubtab` with an auto-saving combined model. Plan 2 splits them into a dedicated `RulesSubtab` with an explicit save bar, per the original spec.
- `referee-list.tsx` and `referee-detail.tsx` still scan a hard-coded `scope: "own", limit: 50` SWR page. Plan 2 wires them to the URL-driven `scope`/`search`/`sort` parameters and adds the Own/All chip and counts endpoint to the UI.
- Slot assignment errors currently `toast.error`; Plan 2 moves these to inline error chips inside the candidate picker / slot card.
- Eligible-open-games loops sequentially (N+1 federation calls); Plan 2 parallelizes with a concurrency cap.
- Open Slots virtualized list is hard-coded `height={600}`; Plan 2 swaps to container-driven sizing.
- `/referee/games` route uses ad-hoc `c.req.query()` casts; Plan 2 adds a Zod schema.
- `EligibleOpenGamesResponse` lives in `apps/api`; Plan 2 moves it to `@dragons/shared` next to `RefereeGameListItem`.
- Five type exports (`RefereeScope`, `RefereeSort`, `HubStatus`, `HubGameType`, `HubScope`) and the `referees.columns.roles` i18n keys are dead; Plan 2 removes them.

## Referees tab — final shape

The parent spec's Referees tab section (lines 86–134) is normative. This section refines the implementation details now that the API and shared types exist.

### Layout

Master/detail grid: `360px | 1fr`. Unchanged from current `referees-tab.tsx`.

### List (`referee-list.tsx` rewrite)

- Data source: `useSWR(SWR_KEYS.refereesPaginated({ scope, search, sort, limit: 50, offset: 0 }), apiFetcher)`. Scope, search, sort come from URL state via `useRefereeHubUrl`.
- Search input is a debounced (300ms) controlled input that calls `update({ /* search */ })` — store search in `HubState` alongside `scope` and a new `sort`. Currently `search` and `sort` are local component state; promote them to URL state so back/forward and deep-links work and so `RefereeDetail` can read them.
- Drop the client-side `filter`/`sort` `useMemo`s. The server-paginated key already sorts; client only renders.
- KPI strip drops from three cards (total / refs / avg derived from visible page) to two cards: `Own-club refs (N)` and `Avg matches/ref (N)`. Both pull from `/admin/referees/counts` (extended below).
- Scope chip group above the KPIs: `Own (N) | All (M)`. Clicking flips `state.scope`. Counts come from the same `/counts` call. SWR-cached 30s (`dedupingInterval`).
- Row content unchanged from current implementation (Last, First / Lic / own-club checkbox / match count). Already correct.
- `react-window` `FixedSizeList` once `items.length > 50`. Reuse the pattern from `open-games-list.tsx` but with container-driven height (see Infra hardening).
- Inline own-club checkbox toggle: keep optimistic update + rollback on error. Already correct.

### Detail (`referee-detail.tsx` rewrite)

- Currently looks the referee up by scanning the list page (`data?.items.find(...)`). This breaks for `scope=all` results not on the current page and for direct deep-links.
- Switch to `useSWR(SWR_KEYS.referee(id), apiFetcher)` → calls a new `GET /admin/referees/:id` endpoint that returns a single `RefereeListItem` row (no roles, no extra joins). This also fixes the "deep-link to a referee not on the current list page" case.
- Header content unchanged.

### Subtab: Profile

- `ProfileSubtab` shrinks to **visibility only**: three switches (`Own Club`, `All Home Games`, `Away Games`). Autosave per toggle via the existing `useAutoSave` hook, optimistic UI, rollback + toast on error.
- Remove the Rules section from this file. Remove `rulesData`, `rules`, `addRule`, `updateRule`, `removeRule`, the team `<Select>`, the `dirtyRulesRef` plumbing, and the parallel `PATCH /rules` call from `useAutoSave.save`.
- `useEffect` that hydrates from `referee.*` props on `referee.id` change stays.

### Subtab: Rules (new file `rules-subtab.tsx`)

- Mounted in `referee-detail.tsx` and reachable via `state.subtab === "rules"`. Wire a `TabsTrigger value="rules"` between `profile` and `upcoming` (currently missing — `?subtab=rules` is parseable but has no trigger).
- Disabled state: if `referee.isOwnClub === false`, render the trigger as disabled with a tooltip "Mark as own club first". Tab body shows an empty state with the same explanation and a button that flips the visibility.
- Data: `useSWR(SWR_KEYS.refereeRules(id), apiFetcher)` returns `{ rules: Rule[] }`. Local state is initialized from the fetch result, mirrored back via `useEffect`.
- Per row UI is unchanged from today's ProfileSubtab rules section (team `<Select>` filtered to own-club teams, Allow/Deny toggle, SR1/SR2 checkboxes when Allow, trash icon, `Add Rule` button).
- **Save model: explicit.** Sticky save bar at the bottom of the tab:
  - `Save changes` button — disabled when not dirty.
  - `Discard` button — disabled when not dirty; resets local state to `rulesData?.rules`.
  - Status text: `Unsaved changes` / `Saving…` / `Saved Ns ago` / `Save failed — <message>`. Same `useAutoSave` status shape, but no debounce.
  - On error: keep dirty state, show `<message>` inline next to the buttons. No toast.
- Dirty guard:
  - Switching referees (`refereeId` change in URL) while dirty pops a `confirm()` dialog. On cancel, the navigation is reverted (`router.replace` back to the previous state).
  - Switching subtabs (`subtab` change) while dirty pops the same confirm.
  - `beforeunload` handler when dirty for browser back/forward/close.
- On save success: invalidate `SWR_KEYS.refereeRules(id)` and `SWR_KEYS.refereesPaginated(...)` (the latter so `matchCount` does not stay stale if a later sync flows through).

### Subtab: Upcoming

Already shipped (`upcoming-subtab.tsx`, commit `8f8d3bf`). Two sections, server-driven via `assignedRefereeApiId` and `/eligible-open-games`. **No changes** in Plan 2 except verifying it still compiles after the shared-type move (see below). Test file exists.

### Subtab: History

- Fix role detection: replace the `sr1Name.includes(referee.lastName)` substring match (commit `history-subtab.tsx` line 41) with `g.sr1RefereeApiId === referee.apiId ? "SR1" : g.sr2RefereeApiId === referee.apiId ? "SR2" : "—"`. This requires that `HistoryGameItem` already exposes `sr1RefereeApiId` and `sr2RefereeApiId` — check the shared type and the history service; if missing, add them to the `SELECT` and to the type.
- Add a `Load more` button at the bottom that bumps `offset` by `limit` and merges new items into local state (the existing endpoint already returns `hasMore`).
- CSV export query string mirrors current filters. Unchanged behavior.

## API & data layer

### New / changed endpoints

| Endpoint | Status | Notes |
|---|---|---|
| `GET /admin/referees/:id` | **New.** | Single-row fetch by primary key. Reuses `getReferees` shape minus pagination. 404 on miss. |
| `GET /admin/referees` | Unchanged | Already supports `scope`, `search`, `sort`. |
| `GET /admin/referees/counts` | Unchanged | Already returns `{ own, all }`. |
| `GET /admin/referees/:id/rules` | Unchanged | Used by Rules subtab. |
| `PATCH /admin/referees/:id/rules` | Unchanged | Used by Rules subtab. |
| `GET /admin/referees/:id/eligible-open-games` | Changed | Internal parallelization only (see Infra). Response shape unchanged. |
| `GET /referee/games` | Changed | Add Zod schema for query params (see Infra). Response shape unchanged. |

### Shared types

- Move `EligibleOpenGamesResponse` from `apps/api/src/services/referee/eligible-open-games.service.ts` to `packages/shared/src/referees.ts`. Service imports it from `@dragons/shared`. SDK type for the new `GET /admin/referees/:id` is `RefereeListItem` (no new type needed).
- Add `sr1RefereeApiId: number | null` and `sr2RefereeApiId: number | null` to `HistoryGameItem` if not already present. Check first.
- Delete unused exports flagged by knip:
  - `RefereeScope`, `RefereeSort` from `apps/api/src/services/admin/referee-admin.service.ts` (still imported internally — keep as internal, drop `export`).
  - `HubStatus`, `HubGameType`, `HubScope` from `apps/web/src/components/admin/referee-hub/use-referee-hub-url.ts` (used only inside that file — drop `export`).
- Add new types where the URL state grows:
  - `HubState` gains `search: string` and `sort: "name" | "workloadAsc" | "workloadDesc"`. Default `""` and `"name"`.

## SWR keys

- New: `SWR_KEYS.referee(id: number)` → `/admin/referees/${id}`.
- Existing `SWR_KEYS.refereesPaginated` is reused. The list/detail/profile/rules subtabs all key off the same call so mutations on one cascade to the others correctly.

## Save model — summary

| Surface | Save | Optimistic | On error |
|---|---|---|---|
| Own-club checkbox (list) | Autosave per click | Yes | Rollback + toast |
| Visibility switches (Profile subtab) | Autosave per toggle (debounced) | Yes | Rollback + toast |
| Rules subtab | **Explicit save bar (Plan 2 change)** | No | Keep dirty + inline error in save bar |
| Slot assign / unassign | On submit | No | **Inline error chip in slot card (Plan 2 change)** |

## Open Slots — carryover polish

These were caught in the Plan 1 final review and are scoped to Plan 2.

### Slot assignment errors (`slot-card.tsx`)

- Replace all four `toast.error` / `toast.success` calls (lines 36, 39–40, 52, 55–56) with inline UI:
  - On error: the slot card renders a small error chip below the assigned/open content (`text-xs text-destructive`) with the message and a `Dismiss` button. State is local to the card.
  - On success: the chip disappears (no toast). The SWR mutation already drives the optimistic UI; nothing else needed.
- Remove the `toast.assigned` / `toast.unassigned` / `toast.assignFailed` / `toast.unassignFailed` i18n keys from `messages/en.json` and `messages/de.json`.

### Open Slots client-side slot status filter

- `open-games-list.tsx` currently fetches with `status=active` and post-filters rows in JS to honor the `Open only` vs `Open + Offered` vs `Any` URL state. This means the `total` returned by the server can be larger than the rendered count → the "N games" header lies.
- Fix: push slot-level status to the server.
  - Service: extend `getRefereeGames` with a `slotStatus?: "open" | "offered" | "any"` parameter. `open` → `WHERE sr1_status = 'open' OR sr2_status = 'open'`. `offered` → `WHERE sr1_status = 'open' OR sr1_status = 'offered' OR sr2_status = 'open' OR sr2_status = 'offered'`. `any` → no extra clause (still excludes cancelled/forfeited via `status=active`).
  - Route: add to Zod schema (see below).
  - Client: send `slotStatus=open|offered|any` based on URL state. Drop client post-filter.

### `referee-detail.tsx` and `?subtab=rules` (already covered above)

## Infra hardening

### Zod schema for `/referee/games`

- File: `apps/api/src/routes/referee/games.routes.ts`.
- Replace the ad-hoc `c.req.query()` casts with a Zod schema validated via `zValidator` (already used by the admin referee routes). Schema:
  - `limit: z.coerce.number().int().min(1).max(500).default(100)`
  - `offset: z.coerce.number().int().min(0).default(0)`
  - `search: z.string().min(1).optional()`
  - `status: z.enum(["active", "cancelled", "forfeited", "all"]).default("active")`
  - `league: z.string().optional().transform(s => s ? s.split(",").map(x => x.trim()).filter(Boolean) : undefined)`
  - `dateFrom: z.string().optional()`, `dateTo: z.string().optional()` — both ISO-validated where they reach the service
  - `gameType: z.enum(["home", "away", "both"]).optional()`
  - `assignedRefereeApiId: z.coerce.number().int().positive().optional()`
  - `slotStatus: z.enum(["open", "offered", "any"]).optional()` — new (see Open Slots carryover)
- Invalid input returns 400 with the Zod error (consistent with other routes).

### Eligible-open-games parallelization

- File: `apps/api/src/services/referee/eligible-open-games.service.ts`.
- Replace the sequential `for` loop with a bounded parallel pipeline:
  ```ts
  import pLimit from "p-limit"; // already a transitive dep; if not, add to apps/api
  const limit = pLimit(5);
  const results = await Promise.all(
    gamesWithOpenSlot.map(g => limit(() => evaluateGame(g)))
  );
  return { items: results.filter(Boolean) as RefereeGameListItem[] };
  ```
- Concurrency cap of 5 protects the federation rate limit. `evaluateGame` factored out of the loop body unchanged.
- If `p-limit` is not yet in `apps/api`, add it via `pnpm --filter @dragons/api add p-limit`. Use tsdown's bundled runtime, no shim needed.

### react-window AutoSizer

- File: `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx:107`. Hard-coded `height={600}`.
- Wrap the `FixedSizeList` in a container with `flex-1 min-h-0` and read its height. Two options:
  1. **Recommended:** use `useResizeObserver` on a ref'd parent `<div>` — small, no new dep.
  2. Add `react-virtualized-auto-sizer` (already paired with `react-window` upstream).
- Apply the same pattern to the new Referees list virtualization once `items.length > 50`.

### SSR date TZ drift

- File: `apps/web/src/app/[locale]/admin/referee/page.tsx` (the SSR canonical URL builder).
- The canonical URL passes `dateFrom`/`dateTo` derived from `new Date()` on the server. Between server render (~23:59 UTC) and client hydration (~00:00 local) the dates can be off by one.
- Fix: compute `dateFrom = today` and `dateTo = today + 14d` using the user's locale TZ. Next.js exposes `headers().get("x-vercel-ip-timezone")` in production; locally, default to `Europe/Berlin` (this is a German basketball admin tool). Use `Intl.DateTimeFormat(..., { timeZone }).format(d)` to produce the `YYYY-MM-DD` string. The same TZ must be applied client-side when computing defaults so the SSR fallback key matches the SWR cache key.

## Dead-code & i18n cleanup

### Type exports

- Drop the `export` keyword (keep types internal) on:
  - `apps/api/src/services/admin/referee-admin.service.ts`: `RefereeScope`, `RefereeSort` (only the service uses them).
  - `apps/web/src/components/admin/referee-hub/use-referee-hub-url.ts`: `HubStatus`, `HubGameType`, `HubScope`.
- If a knip rerun flags additional exports introduced by this plan, audit and either drop or use them.

### i18n keys

- Remove `referees.columns.roles` from `apps/web/src/messages/en.json`, `apps/web/src/messages/de.json`, and the generated `apps/web/src/messages/en.d.json.ts` (rebuilt from `en.json`).
- Remove the slot-card toast keys (see Open Slots carryover) from the same three files.

### Shared package move

- Move `EligibleOpenGamesResponse` from `apps/api/src/services/referee/eligible-open-games.service.ts` to `packages/shared/src/referees.ts`. Re-export through `packages/shared/src/index.ts`. Update the service and the route to import from `@dragons/shared`.

## Testing

### API (Vitest)

- `referee-admin.service.test.ts` — add cases for the new `getRefereeById` (or extend `getReferees` if implemented as `getReferees({ id })`). 404 for missing id. Covers own/all rows alike.
- `referee-games.service.test.ts` — add cases for `slotStatus` filter: `open` excludes offered, `offered` includes both, `any` includes both, `slotStatus` and `status=active` compose correctly.
- `eligible-open-games.service.test.ts` — add a test that exercises the parallel path (mock `searchCandidates` to resolve after a tick; assert all candidates are processed and order is preserved).
- `routes/referee/games.routes.test.ts` — invalid `gameType`, invalid `slotStatus`, invalid `limit > 500` all return 400 with `VALIDATION_ERROR`.

### Web (Vitest + RTL)

- `referee-list.test.tsx` — extend: scope chip toggles URL scope; counts render from `/counts`; debounced search updates URL after 300ms; sort select updates URL.
- `referee-detail.test.tsx` — new: fetches by id (not list scan); 404 renders the "no longer exists" empty state with clear-selection button.
- `rules-subtab.test.tsx` — new file:
  - Disabled when `!isOwnClub`: tab disabled, body shows the "mark as own club first" CTA.
  - Save bar disabled when clean, enabled after any rule edit.
  - `Discard` resets to fetched rules.
  - `Save changes` calls `PATCH /admin/referees/:id/rules` with the exact body, success clears dirty.
  - 400 response leaves dirty true, surfaces the message inline (no toast).
  - Switching referees while dirty calls `confirm` and on cancel reverts the URL change.
- `profile-subtab.test.tsx` — update existing skip block: drop the Rules assertions (now covered by `rules-subtab.test.tsx`). Re-enable once the Radix-Switch + happy-dom React 19 bug is unblocked, **or** leave skipped per the existing comment block.
- `history-subtab.test.tsx` — new: role detection by `srNRefereeApiId === referee.apiId`; Load-more pagination merges items and disables when `!hasMore`.
- `slot-card.test.tsx` — assert that an assign failure renders an inline error chip (no `toast.error` spy fires); dismiss button clears the chip; assign success removes the chip.
- `open-games-list.test.tsx` — assert that `?status=offered` propagates as `slotStatus=offered` to the SWR key; remove the now-obsolete client post-filter test.
- `use-referee-hub-url.test.ts` — extend for new `search` and `sort` URL params; defaults round-trip.

Coverage threshold (90/95/95/95) holds across the package. New files start with tests.

## Migration plan — one PR

Single PR follows the Plan 1 PR(s). Nothing is deployed yet, so no compatibility shims. Order of commits inside the PR mirrors the plan tasks; each commit compiles and tests pass.

## Out of scope (parked, unchanged)

- Bulk own-club toggle.
- Mobile / responsive layout.
- "Show cancelled" toggle on the open-games list.
- Optimistic slot assign.

## Self-review checklist

- [x] No placeholders, no TBDs — every section has concrete file paths and types.
- [x] No contradictions with parent spec; deltas explicitly enumerated in "What changed since the parent spec".
- [x] Scope is one PR — Referees tab + four follow-up buckets the user explicitly opted into.
- [x] Ambiguity check: scope chip placement (above KPIs), Rules disabled CTA (flip own-club from inside Rules), History role detection (apiId match), error UX (inline chip everywhere) all made explicit.
