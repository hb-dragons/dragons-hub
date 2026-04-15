# Referee Games Sync — Design Spec

## Problem

The current referee notification system derives "which games need our referees" from a chain of flags: `league.ownClubRefs` + `team.isOwnClub` + `match.sr1Open`/`sr2Open`. This is fragile — the flags don't always align with reality, and the system can't see games in untracked leagues where the club is still assigned referee duties.

The Basketball-Bund federation provides `POST /rest/offenespiele/search`, an authenticated endpoint that returns all games involving the club with authoritative referee slot ownership and assignment state. This is the ground truth for "which games need our referees."

## Goal

Replace the derived referee detection with a dedicated sync from the federation's offenespiele endpoint. Store all club referee games — including those in untracked leagues — in a new `referee_games` table. Use this as the single source of truth for referee notifications, reminders, and the future referee coordinator view.

## Scope

**In scope:**
- New `referee_games` table storing all games from offenespiele/search
- Referee SDK client with separate credentials (`REFEREE_SDK_USERNAME`/`REFEREE_SDK_PASSWORD`)
- Sync service that polls the endpoint, detects state changes, emits domain events
- Scheduled + on-demand + post-main-sync triggering
- Removal of `isOwnClubRefsMatch()` detection chain from match sync
- Modification of reminder worker to support unmatched games
- Updated `RefereeSlotsPayload` to support nullable `leagueId`/`matchId`

**Out of scope (deferred):**
- "Take game" feature (POST back to federation to assign referee)
- Referee coordinator dashboard UI
- Removal of `leagues.ownClubRefs` field (keep unused for now)
- Phasing out per-game `getGame` calls in the existing referee sync

---

## Architecture

### Data Model

New table: `referee_games`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `api_match_id` | integer NOT NULL UNIQUE | `spielplanId` from the API — the join key |
| `match_id` | integer FK → matches.id | Nullable — null for games in untracked leagues |
| `match_no` | integer NOT NULL | `sp.spielnr` — federation match number |
| `kickoff_date` | date NOT NULL | Extracted from `spieldatum` epoch ms (Europe/Berlin) |
| `kickoff_time` | time NOT NULL | Extracted from `spieldatum` epoch ms (Europe/Berlin) |
| `home_team_name` | varchar(200) NOT NULL | `heimMannschaftLiga.mannschaftName` |
| `guest_team_name` | varchar(200) NOT NULL | `gastMannschaftLiga.mannschaftName` |
| `league_name` | varchar(200) | `liga.liganame` |
| `league_short` | varchar(50) | `liga.srKurzname` or `ligaKurzname` |
| `venue_name` | varchar(200) | `spielfeld.bezeichnung` |
| `venue_city` | varchar(100) | `spielfeld.ort` |
| `sr1_our_club` | boolean NOT NULL | `sr1MeinVerein` — true when our club provides SR1 |
| `sr2_our_club` | boolean NOT NULL | `sr2MeinVerein` — true when our club provides SR2 |
| `sr1_name` | varchar(150) | Referee full name (vorname + nachname) |
| `sr2_name` | varchar(150) | Same for SR2 |
| `sr1_referee_api_id` | integer | `schiedsrichterId` — needed for future "take" feature |
| `sr2_referee_api_id` | integer | Same for SR2 |
| `sr1_status` | varchar(20) NOT NULL DEFAULT 'open' | `"open"`, `"assigned"`, or `"offered"` |
| `sr2_status` | varchar(20) NOT NULL DEFAULT 'open' | Same for SR2 |
| `is_cancelled` | boolean NOT NULL DEFAULT false | `sp.abgesagt` |
| `is_forfeited` | boolean NOT NULL DEFAULT false | `sp.verzicht` |
| `home_club_id` | integer | `heimMannschaftLiga.mannschaft.verein.vereinId` |
| `guest_club_id` | integer | `gastMannschaftLiga.mannschaft.verein.vereinId` |
| `data_hash` | varchar(64) | Hash of referee-relevant fields for change detection |
| `last_synced_at` | timestamp with tz | |
| `created_at` | timestamp with tz NOT NULL DEFAULT now() | |
| `updated_at` | timestamp with tz NOT NULL DEFAULT now() | |

Indexes: `match_id`, `kickoff_date`, `api_match_id` (already unique).

The `kickoff_date` + `kickoff_time` split matches the existing `matches` table pattern and avoids repeated timestamp-to-string conversion when building `RefereeSlotsPayload` or scheduling reminder jobs. The `spieldatum` epoch millisecond value from the API is converted to Europe/Berlin local date and time during sync.

**SR status derivation from API response:**
- `sr1 !== null` → `"assigned"`
- `sr1 === null && sr1OffenAngeboten === true` → `"offered"`
- `sr1 === null && sr1OffenAngeboten === false` → `"open"`

### API Endpoint

`POST https://www.basketball-bund.net/rest/offenespiele/search`

Request payload:
```json
{
  "ats": null,
  "datum": "<current ISO timestamp>",
  "ligaKurz": null,
  "pageFrom": 0,
  "pageSize": 200,
  "sortBy": "sp.spieldatum",
  "sortOrder": "asc",
  "spielStatus": "ALLE",
  "srName": null,
  "vereinsDelegation": "ALLE",
  "vereinsSpiele": "VEREIN",
  "zeitraum": "all"
}
```

Authentication: session-cookie based, same login flow as existing SDK (`POST /login.do?reqCode=login` with form-encoded credentials, extract `SESSION` cookie).

Response: `{ total: number, results: OffeneSpielResult[] }` — typically 20-30 results for one club.

### Referee SDK Client

New file: `apps/api/src/services/sync/referee-sdk-client.ts`

Follows the same pattern as the existing `SdkClient`:
- POST to `/login.do` with `REFEREE_SDK_USERNAME`/`REFEREE_SDK_PASSWORD`
- Extract SESSION cookie, verify via `/rest/user/lc`
- 30-minute session TTL with automatic re-login
- Shares the same rate limiter (same remote server)
- Single method: `fetchOffeneSpiele()` → typed response

If `REFEREE_SDK_USERNAME` or `REFEREE_SDK_PASSWORD` is not set, the client is inert — `fetchOffeneSpiele()` returns `{ total: 0, results: [] }` with an info-level log.

### Sync Service

New file: `apps/api/src/services/sync/referee-games.sync.ts`

Single exported function: `syncRefereeGames()`

Flow:
1. Call `fetchOffeneSpiele()` with the fixed payload
2. For each result:
   a. Map API fields to `referee_games` columns
   b. Compute data hash from referee-relevant fields (sr1/sr2 state, kickoff, cancelled, forfeited, names)
   c. Look up existing `referee_games` row by `apiMatchId`
   d. Look up `matches` row by `apiMatchId` to set `matchId` FK (nullable if not found)
3. **New row (insert):**
   - If `sr*OurClub === true && sr*Status === "open"` → emit `REFEREE_SLOTS_NEEDED`
   - If `sr*OurClub === true && !isCancelled && !isForfeited` → schedule reminder jobs
4. **Existing row, hash changed (update):**
   - Slot went open → assigned (both now filled): cancel reminder jobs
   - Slot went assigned → open: emit `REFEREE_SLOTS_NEEDED`, reschedule reminders
   - Match cancelled/forfeited: cancel reminders
   - Kickoff changed: reschedule reminders (cancel old, schedule new)
5. **Existing row, hash unchanged:** skip
6. **Rows in DB not in API response:** leave as-is. These are past games that have dropped off the endpoint (already played or too old). They remain in the DB for historical reference but no new events or reminders are triggered for them.

### Scheduling

Three trigger mechanisms:
1. **BullMQ repeatable job** — own queue or reuse `syncQueue` with a distinct job name. Default: every 30 minutes. Configurable via `appSettings` key `referee_sync_interval_minutes`.
2. **Post-main-sync trigger** — when the main sync orchestrator completes, it triggers a referee games sync run.
3. **Manual trigger** — admin API endpoint, same pattern as existing manual sync.

### Notification Integration

**Replaces in `matches.sync.ts`:**
- Remove `isOwnClubRefsMatch()` helper and all its call sites
- Remove `REFEREE_SLOTS_NEEDED` event emission on match create/update
- Remove `scheduleReminderJobs()` / `cancelReminderJobs()` calls for own-club-refs

**Replaces in `referees.sync.ts`:**
- Remove "both slots filled → cancel reminders" block (lines 313–329) after assignment upsert. This block inlines the cancel logic using `buildReminderJobId` + `getReminderDays` + `refereeRemindersQueue.getJob()` — remove the block and the imports (`buildReminderJobId`, `getReminderDays` from `referee-reminders.service`, `refereeRemindersQueue` from `workers/queues`)

**Everything else stays unchanged:**
- Domain event types (`REFEREE_SLOTS_NEEDED`, `REFEREE_SLOTS_REMINDER`)
- Notification pipeline, watch rules, WhatsApp adapter
- Message templates (German WhatsApp formatting)
- Reminder service (`scheduleReminderJobs`, `cancelReminderJobs`, `buildReminderJobId`)
- Referee reminders queue and worker (modified — see below)

**`RefereeSlotsPayload` changes:**
- `matchId: number` → `matchId: number | null` (already exists, change to nullable for unmatched games)
- `matchNo: number` → `matchNo: number | null` (already exists, change to nullable — though `referee_games.match_no` always has a value, the payload type should allow null for consistency)
- `leagueId: number` → `leagueId: number | null` (null for untracked leagues)
- `venueId` already nullable, no change

The template renderer only uses string fields (`leagueName`, `homeTeam`, `guestTeam`, `kickoffDate`, `kickoffTime`, `venueName`), booleans (`sr1Open`, `sr2Open`), and `reminderLevel` / `deepLink` — all available from `referee_games`. It does not use `matchId`, `matchNo`, `leagueId`, or `venueId`.

**Deep links:**
- Matched games: `/referee/matches?take={matchId}`
- Unmatched games: `/referee/games?apiMatchId={apiMatchId}` (forward-compatible for future UI)

### Reminder Worker Changes

Currently `loadMatchWithSlots(matchId)` queries `matches` + joins. Needs to support loading from `referee_games` for unmatched games.

The reminder job payload changes:
```typescript
{
  apiMatchId: number;       // always present — used in deterministic job ID
  matchId: number | null;   // null for unmatched games
  refereeGameId: number;    // referee_games.id — used to load data at fire time
  reminderDays: number;     // 7, 3, or 1
}
```

Deterministic job ID changes from `reminder:{matchId}:{days}` to `reminder:{apiMatchId}:{days}` — since `apiMatchId` is always present (even for unmatched games) and globally unique.

**Transition:** On the first run of the new referee games sync, clear all existing reminder jobs in the `referee-reminders` queue (one-time cleanup via `refereeRemindersQueue.obliterate()`). Then schedule fresh jobs based on `referee_games` state. This is safe because the `feat/referee-notifications` branch hasn't been deployed yet, so no production jobs exist.

Worker flow:
1. Load `referee_games` row by `refereeGameId`
2. Check: cancelled/forfeited → skip. Both slots filled → skip.
3. Build `RefereeSlotsPayload` from `referee_games` fields
4. Emit `REFEREE_SLOTS_REMINDER` domain event

This is simpler than the current approach (no multi-table join needed — `referee_games` has all the data).

### Referee Display on Matched Games

For matches that have a linked `referee_games` row, the UI reads referee names from `referee_games` (via `matchId` join). For matches without a linked row, the existing `matchReferees` join still provides referee data. This avoids dual writers to `matchReferees`.

Query pattern for match detail:
```sql
SELECT m.*, rg.sr1_name, rg.sr2_name, rg.sr1_status, rg.sr2_status,
       rg.sr1_our_club, rg.sr2_our_club
FROM matches m
LEFT JOIN referee_games rg ON rg.match_id = m.id
WHERE m.id = ?
```

### Environment Variables

New optional variables in `apps/api/src/config/env.ts`:

```
REFEREE_SDK_USERNAME    # string, optional
REFEREE_SDK_PASSWORD    # string, optional
```

If either is missing, the referee games sync is disabled. No other env changes.

### Error Handling

- **Federation API unreachable / login fails:** Log error, skip entire sync cycle. No state written. Next scheduled run retries.
- **API returns results but processing fails for a single game:** Log the error for that game, continue processing the remaining games. Partial state is acceptable — each game is independent.
- **Match lookup fails (DB error):** Log, set `matchId` to null for that row. The game is still stored.
- **`total > results.length` (pagination needed):** Fetch additional pages until all results are retrieved. Loop with incrementing `pageFrom` until `results` collected equals `total`.

### Future: "Take Game" Feature

The `referee_games` table is designed for this. When a referee wants to self-assign to a game:

1. Frontend: referee selects a game where `sr*_our_club = true` and `sr*_status = "open"`
2. Backend: POST to the federation API using the referee SDK session to assign the referee
3. On success: update `referee_games` row immediately — set `sr*_name`, `sr*_referee_api_id`, `sr*_status = "assigned"`
4. Next sync cycle: confirms the assignment from the authoritative source (or reverts if the POST actually failed)

No schema changes needed — just a new service method and API route.

### Codebase Changes

| File | Change |
|------|--------|
| `packages/db/src/schema/referee-games.ts` | **New** — `referee_games` table definition |
| `packages/db/src/schema/index.ts` | Export new table |
| `packages/sdk/src/types/offene-spiele.ts` | **New** — TypeScript types for the API response |
| `apps/api/src/config/env.ts` | Add optional `REFEREE_SDK_USERNAME`, `REFEREE_SDK_PASSWORD` |
| `apps/api/src/services/sync/referee-sdk-client.ts` | **New** — SDK client with referee credentials |
| `apps/api/src/services/sync/referee-games.sync.ts` | **New** — sync service |
| `apps/api/src/services/sync/matches.sync.ts` | Remove `isOwnClubRefsMatch()`, referee event emission, reminder scheduling |
| `apps/api/src/services/sync/referees.sync.ts` | Remove "both filled → cancel reminders" check |
| `apps/api/src/services/referee/referee-reminders.service.ts` | Change `scheduleReminderJobs`/`cancelReminderJobs`/`buildReminderJobId` from `matchId` (DB id) to `apiMatchId`; update job payload to include `refereeGameId` |
| `apps/api/src/workers/referee-reminder.worker.ts` | Load from `referee_games` instead of multi-table join; update `ReminderJobData` interface |
| `apps/api/src/workers/index.ts` | Register referee games sync scheduled job |
| `apps/api/src/workers/queues.ts` | Add referee games sync job definition (or reuse syncQueue) |
| `packages/shared/src/domain-events.ts` | Make `leagueId` nullable, add `matchId` to `RefereeSlotsPayload` |
| `apps/api/src/routes/admin/settings.routes.ts` | Add referee sync manual trigger endpoint |

### Testing

- **Referee SDK client:** Unit tests with mocked fetch — login flow, session reuse, graceful skip when no credentials
- **Referee games sync:** Unit tests with mocked SDK client and DB — insert, update (hash change), skip (no change), notification triggers, reminder scheduling/cancellation
- **Reminder worker:** Updated tests for loading from `referee_games`
- **Integration:** Verify that removing match sync triggers doesn't break existing notification tests
- **Regression:** Existing match sync tests should pass unchanged (we're removing code, not changing behavior of remaining code)
