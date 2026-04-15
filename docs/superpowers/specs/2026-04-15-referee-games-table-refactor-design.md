# Referee Games Table Refactor — Design Spec

## Problem

The referee games table has several issues:
1. Home game highlighting is unreliable — computed at query time via `getSetting("club_id")` SQL expression, fails silently when setting is missing or IDs don't match
2. Row styling conflates home game status with referee duty status into a single visual treatment
3. Filter logic is complex, mixing `ownClubRefs`, `isHomeGame`, and `sr1OurClub`/`sr2OurClub` when the API's `srXMeinVerein` fields are the authoritative source
4. Dead code: `srFilter` API parameter exists but the frontend never uses it
5. `ownClubRefs` is exposed in the API response but adds no value since `sr1OurClub`/`sr2OurClub` already encode duty per-slot

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Home game vs referee duty | Two independent visual layers | Orthogonal concerns — a referee needs both at a glance |
| Available filter logic | Trust `sr1OurClub`/`sr2OurClub` only | API's `srXMeinVerein` is authoritative per project memory |
| `ownClubRefs` in response | Remove from API response + shared type | Dead weight — duty is expressed per-slot via `srXOurClub` |
| Assigned view scope | Our duty games with assignments | "Where are our referees deployed?" is the natural question |
| Row styling | Left border = duty status, orange bg = home game | Two visual channels for two concerns |
| `isHomeGame` computation | Pre-compute during sync, store in DB | Matches `homeIsOwnClub` pattern in matches table |
| Filtering location | Client-side, remove `srFilter` API param | Small dataset (<200 games), instant tab switching |

## Data Layer

### Shared Type

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

Removed: `ownClubRefs`.

### DB Schema Changes

Add two boolean columns to `referee_games` table:

```
is_home_game   BOOLEAN NOT NULL DEFAULT false
is_guest_game  BOOLEAN NOT NULL DEFAULT false
```

Keep `home_club_id`, `guest_club_id`, and `own_club_refs` in the DB — used by sync and notification systems. Only stop selecting `own_club_refs` in the API query.

### Migration

- Add columns with `NOT NULL DEFAULT false`
- No data backfill needed — next sync populates all rows

## Sync Changes

In `syncRefereeGames`:
- Fetch club config once at sync start (not per-game)
- After `mapApiResultToRow`, set:
  - `isHomeGame = row.homeClubId === clubId`
  - `isGuestGame = row.guestClubId === clubId`
- `mapApiResultToRow` stays unchanged

## API Service Changes

`getRefereeGames` in `referee-games.service.ts`:
- Remove `srFilter` parameter and its SQL conditions
- Remove `getSetting("club_id")` call
- Remove SQL expressions for `isHomeGame`/`isGuestGame`
- Select `isHomeGame`/`isGuestGame` directly from table columns
- Keep `isTrackedLeague` as SQL expression (`matchId IS NOT NULL`)
- Remove `ownClubRefs` from select

`GetRefereeGamesParams` interface loses the `srFilter` field.

## API Route Changes

`games.routes.ts`:
- Remove `srFilter` from query parameter validation schema

## Frontend Filtering

Three client-side filter tabs on the fetched dataset:

**Available** (default):
```
(sr1OurClub && sr1Status !== "assigned") ||
(sr2OurClub && sr2Status !== "assigned") ||
sr1Status === "offered" ||
sr2Status === "offered"
```

**Assigned**:
```
(sr1OurClub || sr2OurClub) &&
(sr1Status === "assigned" || sr2Status === "assigned")
```

**All**: no filter.

Status faceted filter (active/cancelled/forfeited) and global text search stay unchanged.

## Row Styling

Two independent layers in `getRowClassName`:

**Layer 1 — Home game background:**
- `isHomeGame` → `bg-primary/5` (light orange background)
- Applied regardless of referee duty

**Layer 2 — Left border for duty status:**
- Unfilled duty (any `srXOurClub && status !== "assigned"`) → `border-l-2 border-l-destructive/50`
- All duty filled (all `srXOurClub` slots assigned) → `border-l-2 border-l-primary/50`
- No duty → no left border

When both layers apply, left border overrides the home-game border-left but orange background remains.

**Layer 3 — Inactive:**
- `isCancelled || isForfeited` → `opacity-60`

**Team name cells:**
- `isHomeGame` → home team name: `font-medium text-primary`
- `isGuestGame` → guest team name: `font-medium text-primary`

## SR Slot Badges

No changes to `SrSlotBadge` visual treatment:

| Status | Our Club | Other Club |
|--------|----------|------------|
| open | Red badge "Offen" | Muted text |
| offered | Orange badge "Angeboten" | Secondary badge |
| assigned | Primary badge with name | Muted text with name |

## Files Changed

1. `packages/shared/src/referee-games.ts` — remove `ownClubRefs` from type
2. `packages/db/src/schema/referee-games.ts` — add `isHomeGame`, `isGuestGame` columns
3. `apps/api/src/services/sync/referee-games.sync.ts` — compute `isHomeGame`/`isGuestGame` during sync
4. `apps/api/src/services/referee/referee-games.service.ts` — simplify query, remove `srFilter`, remove runtime `isHomeGame` computation
5. `apps/api/src/routes/referee/games.routes.ts` — remove `srFilter` from query schema
6. `apps/web/src/components/referee/referee-games-list.tsx` — simplify filters, fix row styling, remove `ownClubRefs` usage
7. DB migration for new columns

## Future Considerations

This refactor prepares for referee-specific views by:
- Making the data model self-contained (no runtime lookups)
- Keeping filter logic simple and composable (easy to add "games referee X can take" filter)
- Separating visual concerns (home game vs duty) so referee views can reuse the same components with different filter predicates
