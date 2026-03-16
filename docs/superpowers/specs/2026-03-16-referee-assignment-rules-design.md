# Referee Assignment Rules

## Problem

Currently, all referees see all open home games in the match list regardless of their actual qualifications or role restrictions. The club needs to control which referees can referee which home games and in what capacity (SR1 vs SR2).

The Basketball-Bund API does not expose referee qualification data (`lizenzStufe` is always `null`), so qualification management must be handled locally.

## Solution

A per-referee rule system that controls visibility and eligibility for own-club home games. Rules are manually defined by admins and restrict which matches a referee can see and take.

### Behavior Model

- **No rules defined** for a referee → they see all home games (current behavior, permissive default)
- **Any rules defined** → referee only sees home games matching their rules; non-matching home games are hidden
- **Non-home-game matches** (federation-assigned open slots via `srOpen`) are never affected by rules

## Database Schema

### New table: `referee_assignment_rules`

| Column      | Type                     | Constraints                          |
|-------------|--------------------------|--------------------------------------|
| id          | serial                   | PK                                   |
| referee_id  | integer                  | FK → referees (ON DELETE CASCADE)    |
| team_id     | integer                  | FK → teams (ON DELETE CASCADE)       |
| allow_sr1   | boolean NOT NULL         | DEFAULT false                        |
| allow_sr2   | boolean NOT NULL         | DEFAULT false                        |
| created_at  | timestamptz NOT NULL     | DEFAULT now()                        |
| updated_at  | timestamptz NOT NULL     | DEFAULT now()                        |

**Constraints:**
- `UNIQUE(referee_id, team_id)` — one rule per referee-team combination (this composite unique index also serves as the lookup index for `referee_id` queries)
- At least one of `allow_sr1`/`allow_sr2` must be true (enforced at application level)
- CASCADE deletes on both FKs
- `team_id` references `teams.id` (the serial PK). The existing match query already joins `homeTeam` via `matches.homeTeamApiId → teams.apiTeamPermanentId`, so `homeTeam.id` is available for filtering against `referee_assignment_rules.team_id`

## Query Logic

### Match list filtering (`getMatchesWithOpenSlots`)

The current query in `referee-match.service.ts` returns matches that either have open SR slots or are own-club home games in `ownClubRefs` leagues. The new logic adds a per-referee filter:

1. Run existing base query (unchanged)
2. If `refereeId` is null (admin without linked referee record), skip rule filtering entirely
3. Check if the requesting referee has any rows in `referee_assignment_rules`
4. If no rules → return all matches (current behavior, permissive default)
5. If rules exist → apply SQL-level filtering:
   - Non-home-game matches (open via `srOpen`, not `ownClubRefs` home games) → always included
   - Own-club home games → included only if a rule exists where `referee_assignment_rules.team_id = homeTeam.id` (the `homeTeam` alias is already joined in the base query via `matches.homeTeamApiId → teams.apiTeamPermanentId`)

**Slot filtering is NOT applied at query time.** If a rule exists for the home team, the match is shown regardless of which specific slots are open. Slot restrictions (`allowSr1`/`allowSr2`) are only enforced at take-intent time. This keeps the match list simple — the referee sees the game and can assess the situation, but can only take slots their rules permit.

Filtering is done in SQL (not application code) because the match list is paginated and counts must be accurate.

### Take intent guard (`recordTakeIntent`)

Before creating an intent for an own-club home game:

1. Look up referee's rules
2. No rules → allow (permissive default)
3. Has rules → verify a matching rule exists for the home team with the requested slot allowed
4. No match → return `403 "Not eligible for this match"`

No guard is needed for:
- Federation-assigned open slots (`srOpen`) — outside club control
- Cancel intent / verify — if they took it, they can manage it

## API Endpoints

### `GET /admin/referees/:id/rules`

Returns all assignment rules for a referee.

**Auth:** requireAdmin

**Response:**
```json
{
  "rules": [
    {
      "id": 1,
      "teamId": 42,
      "teamName": "Dragons 1",
      "allowSr1": false,
      "allowSr2": true
    }
  ]
}
```

### `PUT /admin/referees/:id/rules`

Replaces all rules for a referee (bulk upsert via transaction).

**Auth:** requireAdmin

**Body:**
```json
{
  "rules": [
    { "teamId": 42, "allowSr1": false, "allowSr2": true },
    { "teamId": 43, "allowSr1": true, "allowSr2": true }
  ]
}
```

**Validation:**
- Each `teamId` must exist and be an own-club team (`isOwnClub = true`)
- At least one of `allowSr1`/`allowSr2` must be true per rule
- No duplicate `teamId` entries in the request

**Implementation:** Within a transaction, delete all existing rules for the referee, then insert the new set. An empty `rules` array is valid — it removes all rules, returning the referee to the permissive default (sees all home games).

Note: During the brief transaction window, a concurrent match list query could see zero rules and show all matches. This is acceptable — the window is milliseconds and the effect is momentarily permissive, not restrictive.

### No changes to existing endpoints

The filtering in the match list and the take-intent guard happen transparently within the existing service functions.

## Admin UI

### Entry point

Add a "Rules" action button to each row in the referee list table (`/admin/referees`).

### Rules dialog

- **Header:** "Assignment Rules for [First Last]"
- **Info text:** "No rules = referee sees all home games. Adding rules restricts visibility to only the specified teams and slots."
- **Rule rows**, each containing:
  - Team dropdown (filtered to own-club teams only)
  - SR1 checkbox
  - SR2 checkbox
  - Remove button
- **Add Rule** button to append a new row
- **Save** button → `PUT /admin/referees/:id/rules`

The number of own-club teams is small (under 20), so no pagination or search is needed in the dropdown.

### Referee match view

No changes. Referees see fewer matches if rules are configured for them. They don't need to know rules exist or see any indication of filtering.

## Files Affected

### New files
- `packages/db/src/schema/referee-assignment-rules.ts` — Drizzle schema
- `apps/api/src/routes/admin/referee-rules.routes.ts` — Admin API endpoints
- `apps/api/src/routes/admin/referee-rules.routes.test.ts` — Endpoint tests
- `apps/api/src/services/referee/referee-rules.service.ts` — Rule CRUD + lookup
- `apps/api/src/services/referee/referee-rules.service.test.ts` — Service tests
- `apps/web/src/components/admin/referees/referee-rules-dialog.tsx` — Admin UI dialog

### Modified files
- `packages/db/src/schema/index.ts` — Export new table
- `apps/api/src/services/referee/referee-match.service.ts` — Add rule-based filtering to `getMatchesWithOpenSlots()` and guard to `recordTakeIntent()`
- `apps/api/src/services/referee/referee-match.service.test.ts` — Add tests for filtering behavior
- `apps/api/src/routes/admin/index.ts` — Mount new rules routes
- `apps/web/src/components/admin/referees/referee-list-table.tsx` — Add Rules action button
- `packages/shared/src/referees.ts` — Add shared types: `RefereeRule { id, teamId, teamName, allowSr1, allowSr2 }`, `RefereeRulesResponse { rules: RefereeRule[] }`, `UpdateRefereeRulesBody { rules: Array<{ teamId, allowSr1, allowSr2 }> }`

## Edge Cases

- **Referee has rules but all their allowed teams have no upcoming home games** → empty match list for home games (correct behavior)
- **Admin deletes a team that has rules** → CASCADE delete removes the rules automatically
- **Admin removes all rules for a referee** → referee returns to permissive default (sees everything)
- **Rule has `allowSr1=true` but SR1 is already taken** → match is still shown (SR1 is not open, but the rule permits it; the slot availability is a separate concern handled by the existing open-slot logic)
- **Referee is also admin** → admins bypass rule filtering (if `refereeId` is null, rule check is skipped entirely)
- **SR3 slot** → excluded from this feature. SR3 is never self-assignable (only SR1 and SR2 are offered via the take-intent flow), so rules only cover SR1/SR2
