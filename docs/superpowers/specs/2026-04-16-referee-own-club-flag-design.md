# Referee Own Club Flag

**Date:** 2026-04-16
**Status:** Approved

## Problem

The referees table displays all referees found in match data — both our club's referees and opponents'. There is no way to distinguish which referees belong to our club. The federation API does not provide club affiliation on referee records (`vereinVO` is always `null`), so this cannot be auto-detected.

All referee management features (visibility rules, assignment rules, self-assign, notifications) are only relevant for own-club referees, but currently there is no gate preventing configuration of non-own-club referees.

## Solution

Add an admin-managed `isOwnClub` boolean flag to the `referees` table. This gates both the admin table view and downstream referee management features.

## Schema Change

Add to `packages/db/src/schema/referees.ts`:

```ts
isOwnClub: boolean("is_own_club").notNull().default(false),
```

Generate a Drizzle migration. All existing referees start as `false`.

No sync changes required — `syncRefereesFromData` upserts only `firstName`, `lastName`, `licenseNumber`, and `dataHash`. The `isOwnClub` field remains admin-managed.

## API Changes

### PATCH `/admin/referees/:id/visibility`

Add `isOwnClub` to the existing body schema:

```ts
z.object({
  allowAllHomeGames: z.boolean(),
  allowAwayGames: z.boolean(),
  isOwnClub: z.boolean(),
})
```

The service (`updateRefereeVisibility`) adds `isOwnClub` to the `set` clause and return value.

### GET `/admin/referees`

Add optional `ownClub` query param, defaulting to `true`:

```ts
refereeListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().min(1).optional(),
  ownClub: z.coerce.boolean().default(true),
})
```

When `ownClub=true`, the service adds `eq(referees.isOwnClub, true)` to the WHERE clause. Both the data query and count query use this filter. Since the default is `true`, the frontend gets own-club referees on initial load without passing the param explicitly.

### Shared Types

In `packages/shared/src/referees.ts`:

- `RefereeListItem`: add `isOwnClub: boolean`
- `UpdateRefereeVisibilityBody`: add `isOwnClub: boolean`

## UI Changes

### Referee Table Toolbar

Add `FacetChips` pill-style toggle above the table with options "Own Club" (default selected) and "All". Controls client-side state that sets the `ownClub` query param on the API call.

Uses the existing `FacetChips` pattern from `apps/web/src/components/admin/referees/referee-games-list.tsx`.

### Referee Rules Dialog

The existing `RefereeRulesDialog` (`apps/web/src/components/admin/referees/referee-rules-dialog.tsx`) handles per-team assignment rules. Add a global settings section above the team rules with three `Switch` toggles:

- **Own Club** — `isOwnClub`
- **All Home Games** — `allowAllHomeGames`
- **Away Games** — `allowAwayGames`

These are saved via `PATCH /admin/referees/:id/visibility` (separate from the `PUT /admin/referees/:id/rules` call). The dialog currently has no UI for `allowAllHomeGames` or `allowAwayGames` — this spec adds all three toggles together.

### Table Column

Add an `isOwnClub` column to the referee table, hidden by default (via column visibility). Shows a checkmark or badge when `true`.

## Downstream Guards

### Visibility Service

`getVisibleRefereeGames()` in `referee-game-visibility.service.ts` already loads the referee record. Add: if `!referee.isOwnClub`, return empty results immediately.

### Rules Routes

`GET/PUT /admin/referees/:id/rules` in `referee-rules.routes.ts` — validate the referee has `isOwnClub=true` before allowing rule configuration. Return 400 with `code: "NOT_OWN_CLUB"` if not.

### Self-Assign

`POST /referee/games/:spielplanId/assign` — the linked referee (via `user.refereeId`) must have `isOwnClub=true`. Return 403 with `code: "NOT_OWN_CLUB"` if not.

### Reminders/Notifications

No changes. Reminders fire based on `refereeGames` slot data (`sr1OurClub`/`sr2OurClub`), not individual referee `isOwnClub`. The guard applies where referees interact with the system, not at the notification layer.

## Files Changed

| File | Change |
|------|--------|
| `packages/db/src/schema/referees.ts` | Add `isOwnClub` column |
| `packages/shared/src/referees.ts` | Add `isOwnClub` to types |
| `apps/api/src/routes/admin/referee.schemas.ts` | Add `ownClub` query param |
| `apps/api/src/routes/admin/referee.routes.ts` | Pass `ownClub` to service, add to visibility body |
| `apps/api/src/services/admin/referee-admin.service.ts` | Filter by `isOwnClub`, include in visibility update |
| `apps/api/src/services/referee/referee-game-visibility.service.ts` | Guard on `isOwnClub` |
| `apps/api/src/routes/admin/referee-rules.routes.ts` | Guard on `isOwnClub` |
| `apps/api/src/routes/referee/assignment.routes.ts` | Guard on `isOwnClub` |
| `apps/web/src/components/admin/referees/referee-list-table.tsx` | Add FacetChips filter, isOwnClub column |
| `apps/web/src/components/admin/referees/referee-rules-dialog.tsx` | Add visibility toggles section |
| Tests for all changed files | |
