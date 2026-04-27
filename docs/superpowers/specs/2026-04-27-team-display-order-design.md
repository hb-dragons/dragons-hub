# Team Display Order — Design

**Date:** 2026-04-27
**Status:** Approved (brainstorming) — pending implementation plan

## Problem

Teams currently render in inconsistent order across surfaces:

- `GET /admin/teams` orders by `teams.id` then sorts client-side by name
- `GET /public/teams` returns DB-natural order (no `ORDER BY`)
- Web public `(public)/teams/page.tsx` splits `ownTeams` / `otherTeams` with no explicit sort
- Native `(tabs)/teams.tsx` splits youth/senior, treats first senior as "featured"

There is no way to express "the U18 team should appear before the U16, and the first team should be featured."

## Goal

Let an admin define the display order of own-club teams once. Apply that order everywhere own-club teams are listed (admin, web public, native).

## Non-goals

- Ordering opponent / non-own-club teams (kept alphabetical)
- Per-user or per-locale ordering
- Multiple named orderings
- Drag-reorder for non-admin users

## Approach

Add a `display_order` integer column to `teams`. Provide a bulk reorder endpoint. Drag-list in the admin teams page writes to it. All read endpoints and clients consume the new order.

Alternatives considered:

- **JSON in `app_settings`** — avoids migration but pushes sort into JS on every read and complicates new-team handling from sync. Rejected.
- **Fractional indexing (LexoRank)** — cheap single-row updates per move but overkill for ~10–30 own teams. Rejected.

---

## 1. Schema

`packages/db/src/schema/teams.ts`:

```ts
displayOrder: integer("display_order").notNull().default(0),
```

Index for ordered own-club queries:

```ts
index("teams_own_order_idx").on(table.isOwnClub, table.displayOrder)
```

Migration generated via `pnpm --filter @dragons/db db:generate`.

Backfill in the migration so existing rows have stable positions on first deploy:

```sql
UPDATE teams
SET display_order = sub.rn
FROM (
  SELECT id, row_number() OVER (ORDER BY name) - 1 AS rn
  FROM teams
  WHERE is_own_club
) sub
WHERE teams.id = sub.id;
```

Backfill is idempotent — re-running it overwrites with the same alphabetical ranks.

## 2. Sync behavior

`apps/api/src/services/sync/teams.sync.ts`:

- `INSERT ... ON CONFLICT DO UPDATE` set list **excludes** `display_order`. Federation never owns it.
- For new rows inserted in a sync pass:
  - `isOwnClub = true` → `display_order = max(display_order) + 1` over existing own-club teams. Pre-fetch the max once before the upsert loop and increment locally per inserted own-club row to avoid N round-trips.
  - `isOwnClub = false` → `display_order = 0`.
- Corrective pass (current `teams.sync.ts:125-141`) that flips `isOwnClub`: when a team flips to `true`, assign `max+1` at flip time. When a team flips to `false`, reset `display_order` to `0` so non-own-club teams stay in pure alphabetical order downstream (otherwise a stale non-zero value would float that team out of the alphabetical group in `GET /public/teams`).

## 3. Backend — reorder endpoint

**Route:** `PUT /admin/teams/order` (mounted alongside existing `team-admin.routes.ts`).

**Auth:** existing admin middleware (same as `PATCH /admin/teams/:id`).

**Request body** (Zod):

```ts
z.object({ teamIds: z.array(z.number().int().positive()).min(1) })
```

**Service** `reorderOwnClubTeams(teamIds: number[])`:

1. Load own-club team IDs from DB.
2. Validate `teamIds` matches that set exactly (length and membership). On mismatch, throw `INVALID_TEAM_SET` → 400.
3. Reject duplicate IDs in input → 400 `DUPLICATE_TEAM_ID`.
4. In a single transaction, update each team's `display_order` to its index in `teamIds`. Implement as one `UPDATE ... SET display_order = CASE id WHEN ... END WHERE id IN (...)` to keep it atomic and a single round-trip.
5. Return the new ordered own-club list (avoids a follow-up `GET` from the client).

## 4. Backend — read endpoints

**`GET /admin/teams`** (`apps/api/src/routes/admin/team.routes.ts:14-26`):

- Replace current `orderBy(teams.id, leagues.name ...)` and the client-side `.sort((a,b) => a.name.localeCompare(b.name))` with `ORDER BY display_order ASC, name ASC` in SQL.

**`GET /public/teams`** (`apps/api/src/routes/public/team.routes.ts:10-22`):

- Add `ORDER BY is_own_club DESC, display_order ASC, name ASC`.
- Own-club teams cluster first in manual order. Non-own-club teams trail alphabetically (their `display_order = 0` makes the secondary `name ASC` the effective sort within that group).

## 5. Web admin UI

**Files:**

- `apps/web/src/app/[locale]/admin/teams/teams-table.tsx`
- `apps/web/package.json` — add `@dnd-kit/core` and `@dnd-kit/sortable`

**Behavior:**

- Wrap own-club rows in `<DndContext>` + `<SortableContext>` with `verticalListSortingStrategy`.
- Add a leading "drag handle" cell (grip icon) on own-club rows only. Non-own rows render unchanged with no handle.
- On `onDragEnd`:
  1. Compute new `teamIds` order locally
  2. Optimistic state update
  3. `PUT /admin/teams/order` with the new array
  4. SWR `mutate` to revalidate
  5. On failure, revert optimistic state and surface a toast
- Use dnd-kit's `KeyboardSensor` for arrow-key reorder (a11y).
- Existing inline edits (color picker, custom name, estimated duration, save button) keep working in the same row. The handle cell is separate from the input cells so drag does not conflict with text input focus.

## 6. Native + web public consumers

Neither needs new API surface. Both consume the new server-side order via existing fetches.

**Web public** (`apps/web/src/app/[locale]/(public)/teams/page.tsx`):

- `ownTeams = teams.filter(t => t.isOwnClub)` — already correctly ordered by the new `ORDER BY` clause
- `otherTeams = teams.filter(t => !t.isOwnClub)` — alphabetical via the secondary `name ASC`
- Remove any local `.sort` calls

**Native** (`apps/native/src/app/(tabs)/teams.tsx`):

- Single pass over `publicApi.getTeams()` result, preserving server order
- `seniorTeams = teams.filter(t => !isYouthTeam(t))` — preserves manual order within seniors
- `youthTeams = teams.filter(t => isYouthTeam(t))` — preserves manual order within youth
- `featured = seniorTeams[0]` — first own-club senior team in the manual order
- Rest of grid layout unchanged

## 7. Error handling

| Case | Behavior |
|---|---|
| Reorder body has missing or extra IDs vs DB own-club set | 400 `INVALID_TEAM_SET`, no writes |
| Duplicate ID in body | 400 `DUPLICATE_TEAM_ID`, no writes |
| Empty array | 400 (Zod `.min(1)`) |
| Concurrent reorder | Last writer wins (transaction-isolated; single admin in practice) |
| Web optimistic update fails server-side | Revert local state, toast error |
| Backfill SQL re-runs on already-populated prod data | Idempotent — same alphabetical ranks reapplied |

## 8. Testing

Coverage target: project standard (90% branches, 95% functions/lines/statements).

- **Schema migration**: column exists with default `0`; index present
- **Sync** (`teams.sync.test.ts`): new own-club team gets `max+1`; existing rows keep order on federation update; `isOwnClub` flip to `true` assigns `max+1`
- **Reorder service** (`team-admin.service.test.ts`): happy path persists dense positions `0..n-1`; mismatched ID set rejected; duplicate ID rejected; empty array rejected
- **Reorder route** (`team.routes.test.ts`): admin-only auth; Zod validation surfaces; returns updated ordered list
- **Read endpoints**: `/admin/teams` returns `display_order ASC, name ASC`; `/public/teams` returns own-club first in manual order, others alphabetical

## File touch list

- `packages/db/src/schema/teams.ts` — add column + index
- `packages/db/drizzle/<generated>.sql` — migration with backfill
- `apps/api/src/services/sync/teams.sync.ts` — exclude `display_order` from upsert; assign on insert / `isOwnClub` flip
- `apps/api/src/services/team-admin.service.ts` — `reorderOwnClubTeams`; remove client-side `.sort` from `getOwnClubTeams`
- `apps/api/src/routes/admin/team.routes.ts` — new `PUT /admin/teams/order`; updated `ORDER BY`
- `apps/api/src/routes/public/team.routes.ts` — updated `ORDER BY`
- `apps/api/src/services/team-admin.service.test.ts` — new tests
- `apps/api/src/routes/admin/team.routes.test.ts` — new tests
- `apps/web/package.json` — `@dnd-kit/core`, `@dnd-kit/sortable`
- `apps/web/src/app/[locale]/admin/teams/teams-table.tsx` — DnD wrapper, handle column, optimistic reorder
- `apps/web/src/app/[locale]/(public)/teams/page.tsx` — drop local sort
- `apps/native/src/app/(tabs)/teams.tsx` — single-pass split preserving server order
