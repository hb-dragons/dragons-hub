# Referee Game Visibility — Per-Referee Filtered Games List

## Problem

Currently `getRefereeGames()` returns all open federation games to every logged-in referee. There is no per-referee filtering. A youth referee sees senior games, a senior referee sees youth games, and referees who shouldn't see away games see them anyway.

## Goal

When a referee logs in, they only see games they are eligible to officiate, based on admin-curated local rules. Federation qualification is validated at assignment time (existing flow, no change).

## Design Decisions

- **Local-rules-first**: The games list is filtered entirely from local data. No federation API calls at list-load time.
- **Federation validates at action time**: When a referee clicks "Take," the existing `assignReferee()` flow calls `getRefs` on the federation to verify qualification. This is unchanged.
- **Allowlist model for home games**: A referee sees no home games by default. The admin explicitly grants access per team or globally.
- **Binary toggle for away games**: A referee either sees all away games or none.
- **Team IDs stored on `refereeGames`**: Enables self-contained filtering queries without JOINing through `matches → teams`.

## Data Model Changes

### New columns on `referees`

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `allowAllHomeGames` | boolean | `false` | Referee sees all home games (minus deny rules) |
| `allowAwayGames` | boolean | `false` | Referee sees away games where club provides refs |

### New columns on `refereeGames`

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `homeTeamId` | integer (FK → teams.id) | `null` | Resolved home team for rule matching |
| `guestTeamId` | integer (FK → teams.id) | `null` | Resolved guest team for rule matching |

Populated during sync by matching federation team data against the `teams` table. Nullable for teams not yet in our system.

### Existing tables (no changes)

- **`refereeAssignmentRules`** — per (referee, team) with `deny`, `allowSr1`, `allowSr2`. Used as the allowlist for home game visibility and slot eligibility.
- **`refereeGames`** — already has `isHomeGame`, `sr1OurClub`, `sr2OurClub`, `sr1Status`, `sr2Status`, `leagueName`, `leagueShort`. All needed for filtering.

## Visibility Logic

New function: `getRefereeGamesForReferee(refereeId, params)`

### Step 1 — Base filter

Only games where our club must provide referees and at least one slot is open:

```
(sr1OurClub = true OR sr2OurClub = true)
AND (sr1Status = 'open' OR sr2Status = 'open')
AND NOT isCancelled
AND NOT isForfeited
```

### Step 2 — Home game visibility

```
isHomeGame = true AND (
  -- Global allow: all home games except denied teams
  (referee.allowAllHomeGames = true
    AND homeTeamId NOT IN (SELECT teamId FROM refereeAssignmentRules
                           WHERE refereeId = ? AND deny = true))
  OR
  -- Allowlist: only explicitly allowed teams
  (referee.allowAllHomeGames = false
    AND homeTeamId IN (SELECT teamId FROM refereeAssignmentRules
                       WHERE refereeId = ? AND deny = false))
)
```

If `homeTeamId` is null (team not in our system):
- `allowAllHomeGames = true` → show (can't check deny, accept the edge case)
- `allowAllHomeGames = false` → hide (can't verify allowlist)

### Step 3 — Away game visibility

```
isHomeGame = false AND referee.allowAwayGames = true
```

Away games have no further local rule filtering. Federation validates at assignment time.

### Step 4 — Slot eligibility

Only show a game if the open slot matches the referee's permissions:

```
-- If SR1 is open and our club, referee must have allowSr1 for that team
-- If SR2 is open and our club, referee must have allowSr2 for that team
-- If allowAllHomeGames is true, skip this check (no per-team rule exists)
-- For away games, skip this check (federation validates)
```

For referees with `allowAllHomeGames = true`, slot filtering is skipped — federation handles qualification at assignment time.

For referees on the allowlist, the `allowSr1`/`allowSr2` flags on their rule entries filter which games appear based on which slots are open.

### Step 5 — Existing filters

The current filters remain: `search`, `league`, `dateFrom`, `dateTo`, `status`. Applied on top of the visibility filter.

## API Changes

### Modified endpoint

`GET /referee/games` — currently calls `getRefereeGames(params)`.

Change to resolve the logged-in referee's ID from the auth context, then call `getRefereeGamesForReferee(refereeId, params)`.

No new query parameters needed. The filtering is automatic based on who is logged in.

### Admin endpoints

New or updated admin routes to manage the two new referee flags:

- `PATCH /admin/referees/:id` — update `allowAllHomeGames` and `allowAwayGames` (may already exist for other fields)

## Sync Changes

### `refereeGames` sync

During sync of referee games from the federation (`offenespiele/search` or `getGame`), resolve and store `homeTeamId`/`guestTeamId`:

1. Extract team identifying info from federation response (team name, API ID if available)
2. Look up in `teams` table by API ID or name match
3. Store resolved IDs on the `refereeGames` row (null if no match)

This runs during the existing sync cycle — no additional API calls.

## Assignment Flow (unchanged)

When a referee clicks "Take":

1. Check deny rules locally (existing)
2. Call `getRefs` on federation to verify qualification (existing)
3. Submit assignment to federation (existing)
4. Record intent (existing)

No changes to the assignment service.

## Admin UI Changes

Referee detail/edit form gets two new toggles:

- "Can referee all home games" → `allowAllHomeGames`
- "Can referee away games" → `allowAwayGames`

These sit alongside the existing per-team rule management.

## Edge Cases

| Case | Behavior |
|------|----------|
| Referee has no rules and both flags are false | Empty games list |
| `allowAllHomeGames` + deny rule for Team X | All home games except Team X's |
| `allowAllHomeGames` + `homeTeamId` is null | Game shown (can't check deny, accepted) |
| Allowlist + `homeTeamId` is null | Game hidden (can't verify allowlist) |
| Away game + `allowAwayGames` false | Hidden |
| Away game + `allowAwayGames` true + not qualified | Shown in list, rejected at assignment time by federation |
| Only SR1 slot open, referee only has allowSr2 | Hidden (for allowlist referees) |
| `allowAllHomeGames` + only SR1 open | Shown (no slot filtering for global allow) |

## Out of Scope

- Notification changes (existing watch rules continue to work independently)
- Referee self-registration
- Automatic rule generation from federation data
- Pre-computing federation qualification for the games list
