# AGENTS.md - Architecture Reference

Detailed technical reference for AI agents working in this codebase. For guidelines and conventions, see `CLAUDE.md`.

## Package Dependency Graph

```
@dragons/web        ──> @dragons/ui, @dragons/shared, @dragons/api-client
@dragons/native     ──> @dragons/shared, @dragons/api-client
@dragons/api        ──> @dragons/sdk, @dragons/db, @dragons/shared, @dragons/contracts
@dragons/api-client ──> @dragons/contracts, @dragons/shared
@dragons/contracts  ──> @dragons/shared
@dragons/db         ──> @dragons/shared (+ drizzle-orm, pg, @opentelemetry/api)
@dragons/shared     ──> @dragons/sdk (+ zod, better-auth; peer: react)
@dragons/sdk        ──> (leaf — types only, no runtime deps)
@dragons/ui         ──> (leaf — radix-ui + tailwind; peer: react, react-dom)
```

`apps/pi` is not a workspace package: it is a Python payload for the Raspberry
Pi scoreboard tap and depends on nothing here. It talks to the API over HTTP
(`POST /api/scoreboard/ingest`).

Two dependency edges are easy to get wrong and matter:

- **`@dragons/shared` is not a leaf.** It depends on `@dragons/sdk` (types) and
  **value**-exports from `better-auth` (`ac`, `roles` in `rbac.ts` are built with
  better-auth's access-control builder). Anything importing `@dragons/shared`
  pulls better-auth into its bundle, including the Metro/native bundle.
- **`@dragons/db` is not a leaf.** It depends on `@dragons/shared` and re-exports
  `SyncRunSummary` from it, so a schema-only import still crosses that edge.

**Request contracts:** `@dragons/contracts` (`packages/contracts/src/<group>.ts`) is the sole declaration of each API endpoint's request schema. The API validates via `hono-openapi`'s `validator(..., validationHook)` (which also registers the schema into `/openapi.json`); `@dragons/api-client` infers `z.infer` request types from the same schemas; `*.contract.test.ts` files guard against client/server drift. Every route body goes through `validator()` + `c.req.valid(...)`, as does every query and path param outside the two exceptions named below. A few endpoints still read something by hand because it isn't a validator-shaped request at all: `GET /public/scoreboard/stream` parses the `Last-Event-ID` SSE reconnection header with `scoreboardLastEventIdSchema` (whose own `.catch(undefined)` degrades a malformed header to a fresh stream rather than rejecting the connection); `POST /mcp` reads its JSON-RPC body with `c.req.json()` and hands it untouched to the MCP SDK's own transport; `POST /api/scoreboard/ingest` reads a raw hex string from the Pi plus a device-id header; and the public unsubscribe `POST` reads its body as raw text only to tell an RFC 8058 one-click ping apart from the confirmation form's submit, never parsing it as JSON. None of these hand-roll a body-schema `schema.parse()` in place of `validator()`. Two route files do still read query/param values raw and are the exception to the sentence above, not a pattern to copy: `admin/sync.routes.ts` reads `syncType` and `jobId` directly and keeps one status rule (`state !== "failed"`) in the handler, deliberately left for a later pass; and `public/assets.routes.ts` hand-parses its `:id` because the router pattern `:id{[0-9]+\.webp}` already does the real validation.

## Data Model

### Entity Relationship Diagram

```
League (1) ──── (N) Match
           ├──── (N) Standing (unique: leagueId + teamApiId)
           └──── (N) Team (via season)

Venue (1) ──── (N) Match
     (1) ──── (N) VenueBooking

VenueBooking (N) ──── (N) Match (via VenueBookingMatch join table)

Match (1) ──── (N) MatchReferee
          ├──── (N) MatchRemoteVersion (version history)
          ├──── (N) MatchLocalVersion (local edits)
          ├──── (N) MatchChange (field-level audit)
          └──── (N) MatchOverride

Referee (1) ──── (N) MatchReferee
RefereeRole (1) ──── (N) MatchReferee

MatchReferee unique constraint: (matchId, slotNumber)
  — one referee per slot, not one row per (referee, role). Two referees cannot
    occupy the same slot on the same match.
  — Partial: `WHERE removed_at IS NULL` (issue #105). Tombstoned rows drop out
    of the index, so a slot can be filled, vacated and refilled without
    colliding with its own history.

Board (1) ──── (N) BoardColumn
     (1) ──── (N) Task (via boardId)

BoardColumn (1) ──── (N) Task (via columnId)

Task (1) ──── (N) TaskChecklistItem
     (1) ──── (N) TaskComment
     (N) ──── (N) User (via TaskAssignee, PK (taskId, userId))

User (1) ──── (0..1) Referee (via refereeId FK)
User (1) ──── (N) PushDevice (by userId, token unique)

RefereeAssignmentIntent (N) ──── (1) Match
RefereeAssignmentIntent (N) ──── (1) Referee
  unique: (matchId, refereeId, slotNumber)

SyncRun (1) ──── (N) SyncRunEntry
        (1) ──── (N) DomainEvent

Notification outbox and fan-out:

DomainEvent (1) ──── (N) NotificationLog
ChannelConfig (1) ──── (N) NotificationLog
WatchRule (0..1) ──── (N) NotificationLog (set null on rule delete)
DomainEvent + ChannelConfig ──── DigestBuffer (unique: (eventId, channelConfigId))

WatchRule and ChannelConfig have no FK to each other: a rule stores its targets
as `channels` JSONB of `{ channel, targetId }`, where targetId is a stringified
channel config id.

Match (0..1) ──── (N) BroadcastConfig (PK deviceId — one row per scoreboard device)
```

### Database Tables

45 tables, all exported from `packages/db/src/schema/index.ts`. The list below is
verified against those exports by `apps/api/src/test/docs-drift.test.ts` in both
directions — adding a `pgTable` without a row here fails the build.

Most tables use `serial` primary keys. The exceptions: the four better-auth
tables (`user`, `session`, `account`, `verification`) use text ids,
`domainEvents` uses a text ULID, `broadcastConfigs` is keyed by `deviceId`, and
`taskAssignees` has a composite PK. External API IDs are stored in `apiId`,
`apiLigaId`, `apiMatchId`, `apiTeamPermanentId` columns with unique constraints.

| Table | File | Key Columns |
|-------|------|-------------|
| `appSettings` | `packages/db/src/schema/app-settings.ts` | key (unique), value — stores club_id, club_name |
| `leagues` | `packages/db/src/schema/leagues.ts` | apiLigaId (unique), ligaNr, name, seasonId, isTracked, discoveredAt, dataHash |
| `teams` | `packages/db/src/schema/teams.ts` | apiTeamPermanentId (unique), name, clubId, isOwnClub, dataHash |
| `venues` | `packages/db/src/schema/venues.ts` | apiId (unique), name, street, postalCode, city, lat/lng, dataHash |
| `matches` | `packages/db/src/schema/matches.ts` | apiMatchId (unique), leagueId FK, venueId FK, scores, sr1Open, sr2Open, sr3Open, JSONB fields, versioning |
| `standings` | `packages/db/src/schema/standings.ts` | leagueId FK + teamApiId (unique), position, won, lost, points |
| `referees` | `packages/db/src/schema/referees.ts` | apiId (unique), firstName, lastName, licenseNumber, allowAllHomeGames, allowAwayGames, isOwnClub, dataHash |
| `refereeRoles` | `packages/db/src/schema/referees.ts` | apiId (unique), name, shortName |
| `matchReferees` | `packages/db/src/schema/referees.ts` | matchId FK (cascade), refereeId FK, roleId FK, slotNumber, removedAt (tombstone) — partial unique(matchId, slotNumber) WHERE removed_at IS NULL |
| `refereeAssignmentIntents` | `packages/db/src/schema/referees.ts` | matchId FK (cascade), refereeId FK, slotNumber, clickedAt, confirmedBySyncAt |
| `refereeAssignmentRules` | `packages/db/src/schema/referee-assignment-rules.ts` | refereeId FK (cascade), teamId FK (cascade), deny, allowSr1, allowSr2 — unique(refereeId, teamId) |
| `refereeGames` | `packages/db/src/schema/referee-games.ts` | apiMatchId (unique), matchId FK, homeTeamId FK, guestTeamId FK, homeClubId, guestClubId, isHomeGame, sr1/sr2OurClub, sr1/sr2Status, sr1/sr2Name, leagueName, kickoffDate/Time, dataHash, removedAt (tombstone) |
| `matchRemoteVersions` | `packages/db/src/schema/versions.ts` | matchId FK (cascade), versionNumber, snapshot JSONB, dataHash |
| `matchLocalVersions` | `packages/db/src/schema/versions.ts` | matchId FK (cascade), versionNumber, changedBy, snapshot JSONB |
| `matchChanges` | `packages/db/src/schema/versions.ts` | matchId FK (cascade), track (remote/local), fieldName, oldValue, newValue |
| `matchOverrides` | `packages/db/src/schema/match-overrides.ts` | matchId FK (cascade), fieldName, reason, changedBy — unique(matchId, fieldName) |
| `venueBookings` | `packages/db/src/schema/venue-bookings.ts` | venueId FK, date, calculatedStartTime/EndTime, overrideStartTime/EndTime, status, needsReconfirmation, confirmedBy |
| `venueBookingMatches` | `packages/db/src/schema/venue-booking-matches.ts` | venueBookingId FK (cascade), matchId FK — unique(venueBookingId, matchId) |
| `boards` | `packages/db/src/schema/boards.ts` | name, description, createdBy |
| `boardColumns` | `packages/db/src/schema/boards.ts` | boardId FK (cascade), name, position, color, isDoneColumn |
| `tasks` | `packages/db/src/schema/tasks.ts` | boardId FK (cascade), columnId FK, title, description, priority, dueDate, position, createdBy |
| `taskAssignees` | `packages/db/src/schema/tasks.ts` | taskId FK (cascade), userId FK (cascade), assignedAt, assignedBy FK — composite PK (taskId, userId) |
| `taskChecklistItems` | `packages/db/src/schema/tasks.ts` | taskId FK (cascade), label, isChecked, checkedBy, position |
| `taskComments` | `packages/db/src/schema/tasks.ts` | taskId FK (cascade), authorId, body |
| `notifications` | `packages/db/src/schema/notifications.ts` | recipientId, channel, title, body, status, sentAt, errorMessage |
| `userNotificationPreferences` | `packages/db/src/schema/notifications.ts` | userId (unique), whatsappEnabled, whatsappNumber, locale, mutedEventTypes (text[]). Per-event opt-outs live in mutedEventTypes; the user-toggleable catalog is in packages/shared/src/notification-events.ts. |
| `emailSubscriptions` | `packages/db/src/schema/email-subscriptions.ts` | userId (unique), unsubscribeToken (unique, 32 random bytes base64url), unsubscribedAt (null = still subscribed), unsubscribedVia (`one_click`/`confirmation_page`). The GDPR email opt-out (issue #134): one row switches **email** off for that member, minted on the first send. Nothing in the sync pipeline writes here, so a re-synced `user` row cannot resurrect delivery. |
| `syncRuns` | `packages/db/src/schema/sync-runs.ts` | syncType, status (`pending`/`running`/`completed`/`failed`/`partial`), triggeredBy, failedStep, ownerInstanceId, records*, durationMs, summary JSONB |
| `syncRunEntries` | `packages/db/src/schema/sync-runs.ts` | syncRunId FK (cascade), entityType, action, metadata JSONB |
| `syncSchedule` | `packages/db/src/schema/sync-runs.ts` | enabled, cronExpression, timezone |
| `liveScoreboards` | `packages/db/src/schema/scoreboard.ts` | deviceId; one row per Pi with the latest decoded scoreboard state |
| `scoreboardSnapshots` | `packages/db/src/schema/scoreboard.ts` | Append-only history of dedupe'd state changes |
| `broadcastConfigs` | `packages/db/src/schema/broadcast-configs.ts` | deviceId (text PK), matchId FK, isLive, home/guestAbbr, home/guestColorOverride, startedAt, endedAt |
| `domainEvents` | `packages/db/src/schema/domain-events.ts` | id (text ULID PK), type, source, urgency, occurredAt, syncRunId FK, entityType, entityId, deepLinkPath, enqueuedAt (lease), processedAt, payload JSONB — the outbox |
| `watchRules` | `packages/db/src/schema/watch-rules.ts` | name, enabled, eventTypes (text[]), filters JSONB, channels JSONB (`{ channel, targetId }[]`), urgencyOverride, templateOverride |
| `channelConfigs` | `packages/db/src/schema/channel-configs.ts` | name, type (ChannelType), enabled, config JSONB, digestMode (DigestMode), digestCron, digestTimezone |
| `notificationLog` | `packages/db/src/schema/notification-log.ts` | eventId FK, watchRuleId FK (set null), channelConfigId FK, recipientId, title, body, locale, status, sentAt, readAt, retryCount, providerTicketId, recipientToken — dedup via a COALESCE unique index (migration 0018), not expressible in Drizzle |
| `digestBuffer` | `packages/db/src/schema/digest-buffer.ts` | eventId FK, channelConfigId FK — unique(eventId, channelConfigId) |
| `pushDevices` | `packages/db/src/schema/push-devices.ts` | userId, token (unique), platform, locale, lastSeenAt |
| `playerPhotos` | `packages/db/src/schema/player-photos.ts` | filename, originalName, width, height — uploaded player photos for social posts |
| `socialBackgrounds` | `packages/db/src/schema/social-backgrounds.ts` | filename, originalName, width, height, isDefault — background images for social posts |
| `user` | `packages/db/src/schema/auth.ts` | id (text PK), email (unique), name, role, refereeId FK, banned, banReason, banExpires |
| `session` | `packages/db/src/schema/auth.ts` | id (text PK), userId FK (cascade), token (unique), expiresAt, ipAddress, userAgent, impersonatedBy |
| `account` | `packages/db/src/schema/auth.ts` | id (text PK), userId FK (cascade), providerId, accountId, password |
| `verification` | `packages/db/src/schema/auth.ts` | id (text PK), identifier, value, expiresAt |

Schema index: `packages/db/src/schema/index.ts` re-exports all tables.

### JSONB Fields on Matches

- `quarterScores`: array of quarter score objects
- `overtimeScores`: array of overtime score objects
- `boxscore`: player statistics
- `topPerformances`: highlight performances
- `playByPlay`: play-by-play data

### Match Versioning

Matches track both remote (SDK) and local (admin) changes independently:

- `currentRemoteVersion` / `currentLocalVersion` increment on each change
- `matchRemoteVersions` stores full snapshots per remote version
- `matchLocalVersions` stores full snapshots per local edit
- `matchChanges` tracks individual field-level diffs with `track` column (remote/local)
- `remoteDataHash` is compared during sync to detect changes

### Soft deletes (tombstones)

Two tables carry a `removedAt` tombstone instead of being hard-deleted:
`matchReferees` and `refereeGames` (issue #105). Both are written only by the
sync removal pass. The reason is evidential, not sentimental: a
`referee.unassigned` or `match.removed` notification has to stay explainable
after the fact, and referee history must not lose games the federation later
withdrew.

Consequences for anything reading those tables:

- A live-rows query must say `isNull(table.removedAt)`. Forgetting it resurrects
  withdrawn assignments in lists, counts and eligibility checks.
- The `matchReferees` slot uniqueness is a *partial* index
  (`WHERE removed_at IS NULL`, migration `0041`), so a tombstoned row does not
  block refilling the slot. Unlike the three indexes listed in
  `packages/db/drizzle/README.md`, this one **is** declared in the Drizzle
  schema, so drizzle-kit can see it.
- **A tombstone is not permanent: presence in the feed means live.** The two
  tables reach that end differently, and the difference is the unique
  constraint. `matchReferees` is partial-unique, so a re-listed assignment
  simply inserts a new live row and the tombstone stays as history.
  `refereeGames.apiMatchId` is *fully* unique, so there can only ever be one row
  per game and it has to **resurrect in place**: the upsert reads tombstoned
  rows deliberately (an insert would collide) and clears `removedAt` on the
  update path (issue #142).
- Resurrection has to bypass the `dataHash` equality skip. A game re-listed with
  identical data hashes the same, so the skip would leave it tombstoned forever
  with no later sync able to recover it.
- A resurrected `refereeGames` row is treated like a new one: it re-emits
  `referee.slots.needed` when an our-club slot is open and re-arms its reminder
  jobs. The withdrawal emitted `match.removed` and cancelled those jobs, so
  reviving the row without them leaves a game that is visible but unannounced
  and unreminded.

## Sync Pipeline

### Execution Flow

There is no orchestrator class. The pipeline is a module of free functions; the
entry point is `fullSync(triggeredBy, jobLogger?, syncRunId?)` exported from
`apps/api/src/services/sync/index.ts`, which calls the per-entity
`services/sync/*.sync.ts` modules in order.

Every stage named below is checked against that file by
`apps/api/src/test/docs-drift.test.ts`: the set of functions `fullSync` imports
from inside `services/` and calls must all appear here, **in call order**. Add a
stage to the pipeline and this block fails until it is documented.

```
BullMQ Job (cron 04:00 Europe/Berlin or manual trigger)
  └─> sync.worker processes job
       └─> fullSync(triggeredBy, jobLogger, syncRunId?)
             from apps/api/src/services/sync/index.ts

Step 0: Open the run
  - Reuse the eagerly-created syncRuns row (syncRunId) or insert one
  - Stamp status "running", startedAt, ownerInstanceId = INSTANCE_ID
  - createSyncLogger(syncRunId) for per-item logging

Step 1: syncLeagues()
  - DB: query leagues WHERE isTracked = true
  - SDK: getTabelleResponse(apiLigaId) for each -> extract ligaData
  - Update league metadata (real seasonId/seasonName), hash-based skip

Step 2: fetchAllSyncData()
  - DB: query leagues WHERE isTracked = true
  - SDK parallel fetch per league: getSpielplan(), getTabelle(), getGameDetailsBatch()
  - Extract + deduplicate: teams, venues, referees, refereeRoles
  - Returns: CollectedSyncData

Step 3: Parallel upserts (Promise.all)
  - syncTeamsFromData(teamsMap)
  - syncVenuesFromData(venuesMap)
  - syncRefereesFromData(refereesMap)
  - syncRefereeRolesFromData(rolesMap)
  then, awaited AFTER that Promise.all (not inside it):
  - syncStandingsFromData(leagueData)
    standings.teamApiId has a non-deferrable FK on teams.apiTeamPermanentId, so
    running it concurrently with the teams upsert dropped the whole batch on a
    league's first sync (issue #47). Keep it sequential.

Step 4: buildVenueIdLookup() -> syncMatchesFromData(leagueData, venueIdLookup, syncRunId)
  - buildVenueIdLookup gives the venue FK lookup (apiId -> dbId) first
  - Hash compare -> skip or upsert
  - Version snapshot + field-level changes in transaction

Step 5: extractRefereeAssignments() + buildMatchIdLookup()
        -> syncRefereeAssignmentsFromData()
  - The two lookups are built first; the sync needs match + referee + role FKs
  - Upsert matchReferees entries

Step 5.1: removeStaleRefereeAssignments()   (issue #105)
  - Tombstones matchReferees rows the federation has stopped reporting by
    setting removed_at, rather than deleting them, so the assignment history
    and the evidence behind a referee.unassigned notification survive
  - Guarded by services/sync/removal-guard.ts. Absence from a feed only counts
    as removal when the fetch that produced it is verifiably complete, so three
    independent gates must pass: per-entity evidence (isUsableGameDetail), run
    coverage (evaluateFetchCoverage, MIN_FETCH_COVERAGE) and blast radius
    (evaluateRemovalBlastRadius, MASS_REMOVAL_FLOOR / MASS_REMOVAL_RATIO).
    A degraded run is skipped with a reason, never read as "everything was
    removed"
  - Reuses the same matchIdLookup and refereeAssignments as step 5

Step 5.25: confirmIntentsFromSync()
  - Check pending refereeAssignmentIntents (confirmedBySyncAt IS NULL)
  - If referee now assigned in matchReferees, set confirmedBySyncAt

Step 5.5: reconcileAfterSync()
  - services/venue-booking/venue-booking.service.ts
  - Recomputes venue bookings from the freshly synced matches
  - Wrapped in its own try/catch: a failure is collected into the error list,
    it does not fail the run

Step 6: Finalize
  - Close SyncLogger (flush remaining entries; dropped entries become errors)
  - Update syncRuns record with counts, summary JSONB and status
  - publishDomainEvent(sync.completed) — best-effort, a throw here is logged
    and swallowed so a delivered sync is not reported as failed
```

If a fatal error hits after at least one step has already committed, the run is
marked `status: "partial"` (not `"failed"`) and `syncRuns.failedStep` records
which step threw, so a half-landed run is distinguishable from a run that did
nothing. `syncRuns.ownerInstanceId` stamps the worker instance that owns the run
(see stale-run reclaim under Deployment topology & tenancy).

### Hash-Based Change Detection

Each entity computes a SHA-256 hash from its data fields (see `services/sync/hash.ts`). The hash is stored in a `dataHash` column. During sync, the new hash is compared to the stored one - if identical, the entity is skipped.

The hash payload must cover **every column that sync writes from remote data**. A
column left out of the payload can change upstream without moving the hash, so
the row is skipped, the new value is never persisted and no domain event fires —
silently. `matches` lost venue changes this way until issue #127; the reasoning
for every field in and out of the payload is documented on `snapshotToHashData`
in `services/sync/matches.sync.ts`.

Hashing a column is only half the job — the update path has to write it too, or
the run bypasses the skip, stores a `matchRemoteVersions` snapshot describing the
new value and then leaves the row on the old one, where every later run hashes
equal and skips. `matches.homeTeamApiId` / `guestTeamApiId` sat in that state
until issue #133.

**Remote team swaps** (decision, 2026-07-27, issue #133). When the federation
re-points an existing match at a different team, sync overwrites the stored ids
so the row and its version snapshot agree, and writes one `matchChanges` audit
row per changed id. It emits **no** `match.*` event — `classifyMatchChanges` maps
nothing onto these field names, so a swap notifies nobody. The ids stay out of
`SNAPSHOT_DB_FIELDS`, so `matchOverrides` cannot lock them: they are the match's
identity, not user-editable data. Both columns are non-deferrable FKs on
`teams.apiTeamPermanentId`, so `syncMatchesFromData` batch-loads the known team
ids up front and defers any match naming an unknown one — nothing is written, not
even the hash, and the next run applies it once the teams stage has committed the
team.

Changing a payload's shape invalidates every stored hash of that entity. No
migration is needed — the next sync recomputes and rewrites them. That one run
takes the update path for every row instead of the O(1) skip; for `matches` the
write is still gated on `computeEffectiveChanges`, so a rehash on its own creates
no version rows, no audit rows and no notifications.

### SyncLogger

Real-time logging via `services/sync/sync-logger.ts`:

- Batches entries in memory (flush at 50 items or on close)
- Publishes to Redis pub/sub channel `sync:{syncRunId}:logs`
- Stores in `syncRunEntries` table
- Emits local events for in-process listeners

### SDK Client

Wrapper around basketball-bund-sdk at `services/sync/sdk-client.ts`:

- Token-based auth (username/password from env)
- Rate limiting: 15 burst, 10/sec refill
- Batch game details: 10 concurrent requests max
- Methods: `getAllLigen()`, `getSpielplan()`, `getTabelle()`, `getTabelleResponse()`, `getGameDetails()`, `getGameDetailsBatch()`, `searchClubs()`, `getClubMatches()`
- Referee-account methods go through a second `AuthenticatedClient` built from `REFEREE_SDK_USERNAME` / `REFEREE_SDK_PASSWORD`, so they share the rate limiter, `withRetry` and the 401/403 re-login path: `searchRefereesForGame()`, `submitRefereeAssignment()`, `submitRefereeUnassignment()`, `fetchOffeneSpiele()`
- `fetchOffeneSpiele()` pages `/rest/offenespiele/search` 200 rows at a time and stops on the first empty page, on reaching the reported `total`, or at a hard 50-page ceiling — a `total` the feed never satisfies must not loop against basketball-bund.net. It returns `{ total: 0, results: [] }` when the referee credentials are unset, because the referee auth client otherwise falls back to the main SDK account

## Domain Events

Event types are defined in `packages/shared/src/domain-events.ts`. Events are published to the outbox, drained by the `outbox-poll` repeatable job into the `domain-events` queue, picked up by the event.worker, and dispatched to notification channels.

### Match Events

- `match.created` — New match discovered via sync
- `match.schedule.changed` — Match kickoff date/time altered
- `match.venue.changed` — Match venue reassigned
- `match.cancelled` — Match cancelled
- `match.forfeited` — Match forfeited
- `match.score.changed` — Match score updated
- `match.confirmed` — Match finalized
- `match.removed` — A future game disappeared from a verifiably complete federation feed. Emitted by `services/sync/referee-games.sync.ts` when it tombstones a `refereeGames` row (issue #105), gated by `removal-guard.ts` so a degraded fetch never reads as a removal
- `match.result_entered` — Result initially recorded
- `match.result_changed` — Result score corrected

### Referee Events

- `referee.assigned` — Referee assigned to match slot
- `referee.unassigned` — Referee removed from match slot
- `referee.reassigned` — Referee replaced on match slot
- `referee.slots.needed` — Match has open slots requiring assignment
- `referee.slots.reminder` — Reminders for open referee slots

### Booking Events

- `booking.created` — Venue booking created
- `booking.status.changed` — Booking status or times updated
- `booking.needs_reconfirmation` — Booking flagged for reconfirmation

### Override Events

- `override.applied` — Local field override applied
- `override.conflict` — Override conflicts with remote data
- `override.reverted` — Override removed

### Task Events

- `task.assigned` — User added to task assignees (emitted by createTask initial set, updateTask assignee diff, or addAssignee)
- `task.unassigned` — User removed from task assignees
- `task.comment.added` — Comment posted on task (recipients = current assignees minus author)
- `task.due.reminder` — Emitted 24h before and on the morning of task due date by task reminder worker; skipped for tasks whose column is flagged `isDoneColumn`

### Sync Events

- `sync.completed` — Published at the end of `fullSync()` with the run's counts. Uses `entityType: "match"`, `entityId: 0` because the event envelope has no sync entity type; the deep link points at `/admin/sync/logs/<syncRunId>`.

### Entity types

`EVENT_ENTITY_TYPES` in the same file is the closed set of entities an event can
be raised against: `match`, `booking`, `referee`, `task`. The manual-trigger
request contract derives its enum from that array — do not restate the literals.

## API Endpoints

Every table below is checked against the Hono route tree by
`apps/api/src/test/docs-drift.test.ts`, in both directions. Query strings are
documented in the description column, not in the path.

### Error responses (`AppError`)

Every typed service error extends `AppError` (`apps/api/src/app-error.ts`),
which carries `message`, `code` and `status`. `middleware/error.ts` maps all of
them through one `instanceof AppError` branch into `{error, code}` at the
error's own status, and reports any 5xx to Cloud Error Reporting. **A route must
not catch its own service errors** — it stays a single success path.

Rules when adding one:

- The class goes in a leaf `*.errors.ts` module next to its service, never in
  the service file. `middleware/error.ts` imports only `app-error.ts`, but the
  services themselves pull in BullMQ's Redis client, the federation SDK and the
  database client, and a leaf module keeps those out of every module that
  touches the error handler.
- A class with several codes keeps its own `Record<ItsCodeUnion,
  ContentfulStatusCode>` table beside it. Keying by the union makes a code with
  no status a compile error instead of a silent 500.
- Do not hoist those tables into one shared code→status map. `NOT_OWN_CLUB` is
  403 from `AssignmentError` (the caller may not act) and 400 from
  `RefereeSettingsError` (the body names the wrong referee); one table would
  have to pick.
- In a route test that mocks the service wholesale, import the **real** error
  class from its `*.errors.ts` module. A stand-in `extends Error` double is not
  an `AppError`, so it falls through to a 500 and the status assertions stop
  testing anything. The leaf module has no heavy imports, so using it is free.

Current subclasses: `SyncAlreadyQueuedError` (409), `RefereeSdkNotConfiguredError`
(503), `TeamReorderError` (400), `AssignmentError` (8 codes),
`RefereeSettingsError` (3 codes), `BroadcastError` (2 codes), `UserAdminError`
(2 codes, both 404), `PushDeviceError` (`TOKEN_OWNED_BY_ANOTHER_USER`, 409),
`TestPushError` (`NO_DEVICES` 400, `PUSH_CHANNEL_MISSING` 500).

### Service & docs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service metadata |
| GET | `/health` | Liveness: API, database, Redis |
| GET | `/health/deep` | Deep probe: DB, Redis, queue counts, outbox lag, sync freshness. **Admin only** (`requireAnyRole("admin")`) — queue depths and sync staleness are operational detail, so only the shallow `/health` above stays public for uptime probes |
| GET | `/openapi.json` | OpenAPI 3.1 spec (auto-generated from route annotations). **Not public in production** — `requireAuth + requireAnyRole("admin")`; open only when `NODE_ENV !== "production"` |
| GET | `/docs` | Interactive API docs (Scalar UI). Same production gate as `/openapi.json` |

### Authentication (Better Auth)

better-auth mounts its own handler behind a single
`app.on(["POST", "GET"], "/api/auth/*")`, so these paths do not appear in the
Hono route table and are documented by hand.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/sign-up/email` | Register with email + password |
| POST | `/api/auth/sign-in/email` | Sign in with email + password (rate-limited by `signInLockout`) |
| POST | `/api/auth/sign-out` | Sign out (invalidate session) |
| GET | `/api/auth/get-session` | Get current session + user |

`/admin/*` routes require an authenticated session plus the specific permission for that route — see the Access Control section below. `/referee/*` self-service routes require the caller's user to be linked to a referee profile. Auth config: `apps/api/src/config/auth.ts`. RBAC middleware: `apps/api/src/middleware/rbac.ts`.

### Admin - Sync Control

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/sync/trigger` | Queue manual sync job (non-blocking) |
| GET | `/admin/sync/status` | Last sync + running status |
| GET | `/admin/sync/status/:jobId` | Specific job status + progress |

### Admin - Job Queue

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/sync/jobs` | List jobs by status. Query: `statuses=active,waiting,delayed,completed,failed` |
| POST | `/admin/sync/jobs/:jobId/retry` | Retry failed job |
| DELETE | `/admin/sync/jobs/:jobId` | Remove job from the queue |
| GET | `/admin/sync/jobs/:jobId/logs` | BullMQ job logs |

### Admin - Sync History

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/sync/logs` | Paginated sync run history. Query: `limit`, `offset`, `status` |
| GET | `/admin/sync/logs/:id/entries` | Per-item log entries with summary. Query: `limit`, `offset`, `entityType`, `action` |
| GET | `/admin/sync/logs/:id/match-changes/:apiMatchId` | Field-level changes recorded for one match in that run |
| GET | `/admin/sync/logs/:id/stream` | SSE real-time log stream |

### Admin - Schedule

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/sync/schedule` | Current cron schedule |
| PUT | `/admin/sync/schedule` | Update schedule (cronExpression, timezone, enabled) |

### Admin - Settings

League tracking lives under `/admin/settings/leagues`. There is no
`/admin/leagues` route group.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/settings/club` | Get current club config (clubId, clubName) or null |
| PUT | `/admin/settings/club` | Set club config `{ clubId, clubName }` |
| GET | `/admin/settings/booking` | Get booking configuration |
| PUT | `/admin/settings/booking` | Set booking configuration |
| GET | `/admin/settings/referee-reminders` | Get referee reminder day offsets |
| PUT | `/admin/settings/referee-reminders` | Set referee reminder day offsets |
| GET | `/admin/settings/leagues` | Tracked leagues, grouped by season, with tracking status |
| PUT | `/admin/settings/leagues` | Set tracked leagues by league number |
| PATCH | `/admin/settings/leagues/:id/own-club-refs` | Set whether a league uses own-club referees |
| POST | `/admin/settings/referee-games-sync` | Trigger a manual referee games sync |

### Admin - Matches

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/matches` | List own club matches (with booking info) |
| GET | `/admin/matches/:id` | Match detail with remote/local diffs (includes booking info) |
| GET | `/admin/matches/:id/history` | Match change history (remote + local track) |
| PATCH | `/admin/matches/:id` | Update match local fields |
| DELETE | `/admin/matches/:id/overrides/:fieldName` | Release a local override |

Match list and detail responses include associated venue booking data when available.

### Admin - Assistant

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/assistant/reschedule/chat` | Rescheduling copilot chat (AI SDK UI message stream). 503 when ASSISTANT_ENABLED=false. Permission: match:update. Body capped at 512 KiB (413) and rate-limited (429). |

### Club Q&A Assistant

| Method | Path | Description |
|--------|------|-------------|
| POST | `/qa/chat` | Members-only club Q&A assistant (AI SDK UI message stream); auth-gated (`requireAuth`), rate-limited, gated by `CHATBOT_ENABLED`. Returns 503 when `CHATBOT_ENABLED=false`. |

### MCP server

| Method | Path | Description |
|--------|------|-------------|
| POST | `/mcp` | Streamable-HTTP MCP endpoint. Bearer-token auth (`Authorization: Bearer $MCP_TOKEN`), not the admin session gate. Exposes the read-only reschedule tools (`get_match`, `list_club_matches`, `list_venue_bookings`, `list_club_venues`, `get_round_window`, `get_referee_context`, `verify_slot`). Stateless. Gated by `ASSISTANT_ENABLED` (503 when off, same flag as the in-app copilot it shares tools with). Body capped at 256 KiB (413) and rate-limited (429). The bearer check is constant-time; 401 on missing/invalid token. |

The same provider-neutral tool registry that backs the in-app chat is served here for external hosts (Claude Desktop, Cursor). The tools are read-only: they never write to the federation. Attach a host with:

```json
{
  "mcpServers": {
    "dragons-reschedule": {
      "url": "https://<api-host>/mcp",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

### Admin - Bookings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/bookings` | List all bookings |
| GET | `/admin/bookings/:id` | Booking detail |
| POST | `/admin/bookings` | Create a booking manually |
| PATCH | `/admin/bookings/:id` | Update booking |
| PATCH | `/admin/bookings/:id/status` | Quick status change |
| DELETE | `/admin/bookings/:id` | Delete a booking |
| GET | `/admin/bookings/reconcile/preview` | Preview the booking changes a reconcile would make |
| POST | `/admin/bookings/reconcile` | Apply booking reconciliation from matches |

### Admin - Boards

Columns are nested under their board (`/admin/boards/:id/columns/...`), not
addressed globally.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/boards` | List all boards |
| POST | `/admin/boards` | Create a board with default columns |
| GET | `/admin/boards/:id` | Get board with columns |
| PATCH | `/admin/boards/:id` | Update board |
| DELETE | `/admin/boards/:id` | Delete board |
| POST | `/admin/boards/:id/columns` | Add column to board |
| PATCH | `/admin/boards/:id/columns/reorder` | Reorder the board's columns |
| PATCH | `/admin/boards/:id/columns/:colId` | Update column |
| DELETE | `/admin/boards/:id/columns/:colId` | Delete column |

### Admin - Tasks

Task creation and listing are board-scoped. Checklist items and comments are
nested under their task.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/boards/:boardId/tasks` | List tasks for a board (filterable by column, assignee) |
| POST | `/admin/boards/:boardId/tasks` | Create a task on a board |
| GET | `/admin/tasks/:id` | Task detail with checklist + comments |
| PATCH | `/admin/tasks/:id` | Update task fields |
| PATCH | `/admin/tasks/:id/move` | Move task to another column/position |
| DELETE | `/admin/tasks/:id` | Delete task |
| PUT | `/admin/tasks/:id/assignees/:userId` | Assign a user to a task (idempotent) |
| DELETE | `/admin/tasks/:id/assignees/:userId` | Remove a user from a task |
| POST | `/admin/tasks/:id/checklist` | Add checklist item |
| PATCH | `/admin/tasks/:id/checklist/:itemId` | Toggle/update checklist item |
| DELETE | `/admin/tasks/:id/checklist/:itemId` | Delete checklist item |
| POST | `/admin/tasks/:id/comments` | Add comment |
| PATCH | `/admin/tasks/:id/comments/:commentId` | Edit comment |
| DELETE | `/admin/tasks/:id/comments/:commentId` | Delete comment |

### Admin - Teams

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/teams` | List own club teams |
| PATCH | `/admin/teams/:id` | Update team (e.g. isOwnClub) |
| PUT | `/admin/teams/order` | Reorder own club teams (display order) |

### Admin - Venues

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/venues` | List venues |
| GET | `/admin/venues/search` | Search venues by name. Query: `q` |

### Admin - Users

| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/admin/users/:id/referee-link` | Link or unlink a referee record from a user account |

User listing, role assignment and banning are served by better-auth's admin
plugin under `/api/auth/*`, not by this route group.

### Admin - Referees

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/referees` | List referees with pagination, search and sort. Query: `ownClub` (boolean, default true). Includes allowAllHomeGames, allowAwayGames, isOwnClub flags |
| GET | `/admin/referees/counts` | Own-club and total referee counts |
| GET | `/admin/referees/:id` | Single referee by id |
| PATCH | `/admin/referees/:id/visibility` | Update referee visibility flags. Body: `{ allowAllHomeGames, allowAwayGames, isOwnClub }` |
| GET | `/admin/referees/:id/eligible-open-games` | Open games the referee is eligible to take (used by the admin assign UI) |
| GET | `/admin/referees/:id/rules` | Get assignment rules for a referee. Requires `isOwnClub=true` (400 NOT_OWN_CLUB otherwise) |
| PATCH | `/admin/referees/:id/rules` | Replace assignment rules. Requires `isOwnClub=true`. Body: `{ rules: [{ teamId, deny, allowSr1, allowSr2 }] }` |

### Admin - Standings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/standings` | Standings grouped by tracked league |

### Admin - Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/notifications` | List notifications for the caller from the notification log. Query: `{ limit?, offset? }` — the recipient comes from the session, never the request, so there is no `userId` param and no cross-user read (issue #123). |
| PATCH | `/admin/notifications/:id/read` | Mark one notification as read |
| PATCH | `/admin/notifications/read-all` | Mark all of the caller's notifications as read |
| POST | `/admin/notifications/:id/retry` | Retry a failed notification delivery |
| GET | `/admin/notifications/preferences` | Get the calling user's own notification preferences. Returns `{ mutedEventTypes: string[], locale: "de" \| "en" }`. Any authenticated user may call this. |
| PATCH | `/admin/notifications/preferences` | Update the calling user's own notification preferences. Body: `{ mutedEventTypes?: string[], locale?: "de" \| "en" }`. Rejects event types not in the shared `USER_TOGGLEABLE_EVENTS` catalog. |
| POST | `/admin/notifications/test-push` | Send a test push to the caller's own registered devices. Body: `{ message? }`. Returns device count + per-ticket status. |
| GET | `/admin/notifications/test-push/recent` | Last 10 test push results for the caller (for the admin test UI) |

### Admin - Domain Events

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/events` | List domain events with filtering and pagination |
| GET | `/admin/events/failed` | List failed notification deliveries with their event context |
| POST | `/admin/events/trigger` | Manually publish a domain event into the notification pipeline. `entityType` is constrained to `EVENT_ENTITY_TYPES` |

### Admin - Watch Rules

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/watch-rules` | List watch rules with pagination |
| GET | `/admin/watch-rules/:id` | Get a single watch rule |
| POST | `/admin/watch-rules` | Create a watch rule |
| PATCH | `/admin/watch-rules/:id` | Update a watch rule |
| DELETE | `/admin/watch-rules/:id` | Delete a watch rule |

### Admin - Channel Configs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/channel-configs` | List channel configurations with pagination |
| GET | `/admin/channel-configs/providers` | Which channel types have a configured provider |
| GET | `/admin/channel-configs/:id` | Get a single channel config |
| POST | `/admin/channel-configs` | Create channel config (provider must be configured) |
| PATCH | `/admin/channel-configs/:id` | Update channel config (validates config against type) |
| DELETE | `/admin/channel-configs/:id` | Delete channel config |

### Admin - Bull Board

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/queues/*` | Bull Board web UI for queue monitoring. Requires the `superadmin` role (`requireAnyRole("superadmin")`), not plain `admin`. |

### Scoreboard

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/scoreboard/ingest` | Stramatel raw-hex ingest from the Raspberry Pi (Bearer `SCOREBOARD_INGEST_KEY` + matching device id header) |
| GET | `/public/scoreboard/latest` | Latest decoded snapshot for a device (no auth) |
| GET | `/public/scoreboard/stream` | SSE stream of decoded snapshots (no auth) |
| GET | `/admin/scoreboard/snapshots` | Paginated snapshot history (admin). 404 unless `deviceId` is the configured `SCOREBOARD_DEVICE_ID` |
| GET | `/admin/scoreboard/health` | Ingest health (admin). 404 unless `deviceId` is the configured `SCOREBOARD_DEVICE_ID` |

### Broadcast overlay

| Method | Path | Description |
|--------|------|-------------|
| GET | `/public/broadcast/state` | Current broadcast state for a device (no auth). Rate-limited (429); 404 unless `deviceId` is the configured `SCOREBOARD_DEVICE_ID` |
| GET | `/public/broadcast/stream` | SSE stream of broadcast state changes (no auth). 404 unless `deviceId` is the configured `SCOREBOARD_DEVICE_ID` |
| GET | `/admin/broadcast/config` | Get the broadcast config for a device |
| PUT | `/admin/broadcast/config` | Upsert the broadcast config for a device (bound match, abbreviations, colour overrides) |
| GET | `/admin/broadcast/matches` | Own-club matches available for broadcast binding |
| POST | `/admin/broadcast/start` | Set `isLive = true` |
| POST | `/admin/broadcast/stop` | Set `isLive = false` |

Every `/admin/broadcast/*` route that takes a `deviceId` — and both
`/admin/scoreboard/*` routes — answer 404 `UNKNOWN_DEVICE` unless it equals the
configured `SCOREBOARD_DEVICE_ID`. The API is wired to one panel; an
admin-supplied id must not create broadcast config rows or publish Redis events
for a device that does not exist.

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/public/matches` | List own club matches, supports `opponentApiId` filter (no auth) |
| GET | `/public/matches/:id` | Single match with quarter scores (no auth) |
| GET | `/public/matches/:id/context` | H2H record and form for both teams (no auth) |
| GET | `/public/schedule.ics` | ICS calendar subscription feed for own-club matches. Default window: 30 days back to 180 days forward (no auth) |
| GET | `/public/standings` | League standings (no auth) |
| GET | `/public/teams` | List teams (no auth) |
| GET | `/public/teams/:id/stats` | Season stats and recent form for a team (no auth) |
| GET | `/public/home/dashboard` | Aggregated home screen data: next game, recent results, upcoming games, club stats (no auth) |
| GET | `/public/assets/clubs/:id` | Club logo as webp, proxied by club id. The route constrains `:id` to `[0-9]+\.webp` |
| GET | `/public/notifications/unsubscribe` | Email unsubscribe confirmation page for a per-recipient token (no auth). **Safe** — renders a form and changes nothing, so a link scanner cannot opt a member out. Query: `token`, optional `locale`. 404 + a readable page for an unknown token. |
| POST | `/public/notifications/unsubscribe` | Record the email opt-out for the token (no auth — the token is the authorisation). Serves both the confirmation form and the RFC 8058 one-click POST, told apart by the body. Idempotent; 404 for an unknown token rather than a reassuring 200. |

### Device (push registration)

Mounted at `/api/devices` — note the `/api` prefix.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/devices/register` | Register push notification device token. Body: `{ token, platform: "ios"\|"android", locale? }`. Upserts by token and bumps `lastSeenAt`. |
| DELETE | `/api/devices/:token` | Unregister device token (caller must own the token). |

### Referee self-service (role: referee | admin | refereeAdmin)

`admin`/`refereeAdmin` get cross-referee visibility; a plain referee is scoped to
their own games via `c.get("refereeId")`. The native app depends on `/referee/games`,
`/referee/games/:id` and `/referee/matches/:matchId`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/referee/games` | referee/admin | List games the caller may see. Query: `search`, `league`, `status`, `dateFrom`, `dateTo`, `limit`, `offset` |
| GET | `/referee/games/:id` | referee/admin | Single game by `refereeGames.id` |
| GET | `/referee/games/by-api-match/:apiMatchId` | referee/admin | Single game by Basketball-Bund `apiMatchId` (deep-link landing from take-intent URLs) |
| GET | `/referee/matches/:matchId` | referee/admin | Single game by local `matches.id` |
| POST | `/referee/games/:spielplanId/assign` | referee (self) | Assign self to a game slot in the federation. Requires `isOwnClub=true` and `refereeApiId` matching the caller. Body: `{ slotNumber: 1\|2, refereeApiId }` |
| POST | `/referee/games/:id/claim` | referee (self) | Record a local claim (take-intent) on a game. Optional body: `{ slotNumber?: 1\|2 }` |
| DELETE | `/referee/games/:id/claim` | referee (self) | Release the caller's claim on a game |

### Admin Referee Assignment (role: admin)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/referee/games/:spielplanId/candidates` | admin | Search qualified candidates. Query: `search`, `pageFrom`, `pageSize` |
| POST | `/admin/referee/games/:spielplanId/assign` | admin | Assign referee to slot. Body: `{ slotNumber: 1\|2, refereeApiId }` |
| DELETE | `/admin/referee/games/:spielplanId/assignment/:slotNumber` | admin | Remove referee from slot |

### Admin Referee History (role: admin, refereeAdmin)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/referee/history/summary` | KPIs + leaderboard + availableLeagues for a date range. Query: `dateFrom`, `dateTo`, `league`, `status` (comma-list of `played\|cancelled\|forfeited`, or `all`) |
| GET | `/admin/referee/history/games` | Paginated past games. Query: summary params + `search`, `refereeApiId` (filter SR1 or SR2 matches), `limit` (default 50, max 500), `offset` |
| GET | `/admin/referee/history/games.csv` | CSV export of games matching filters. Forces `limit=1000`; sets `X-Result-Truncated: true` when results exceed cap. Prepends UTF-8 BOM for Excel |
| GET | `/admin/referee/history/leaderboard.csv` | CSV export of referee leaderboard (no 100-row cap). Filters: `dateFrom`, `dateTo`, `league`, `status` |

### Admin - Social Post Generator

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/social/matches` | Weekend matches filtered by type. Query: `type` (preview/results), `week`, `year` |
| GET | `/admin/social/player-photos` | List player photos |
| GET | `/admin/social/player-photos/:id/image` | Proxy player photo image from GCS |
| POST | `/admin/social/player-photos` | Upload player photo (multipart) |
| DELETE | `/admin/social/player-photos/:id` | Delete player photo |
| GET | `/admin/social/backgrounds` | List backgrounds |
| GET | `/admin/social/backgrounds/:id/image` | Proxy background image from GCS |
| POST | `/admin/social/backgrounds` | Upload background (multipart) |
| DELETE | `/admin/social/backgrounds/:id` | Delete background |
| PATCH | `/admin/social/backgrounds/:id/default` | Set default background |
| POST | `/admin/social/generate` | Generate social post PNG (Satori + Sharp compositing) |

Route files: `apps/api/src/routes/health.routes.ts`, `apps/api/src/routes/mcp.routes.ts`, `apps/api/src/routes/qa.routes.ts`, `apps/api/src/routes/device.routes.ts`, `apps/api/src/routes/admin/*.routes.ts`, `apps/api/src/routes/api/*.routes.ts`, `apps/api/src/routes/public/*.routes.ts`, `apps/api/src/routes/referee/*.routes.ts`. Mount table: `apps/api/src/routes/index.ts`; app-level routes: `apps/api/src/app.ts`.
Request schemas: `packages/contracts/src/<group>.ts` (never redeclared in the route).
Service layer: `apps/api/src/services/admin/*.service.ts`, `apps/api/src/services/referee/`, `apps/api/src/services/venue-booking/`, `apps/api/src/services/notifications/`, `apps/api/src/services/social/`

## Access Control (RBAC)

Two concepts, two APIs:

- **Role permissions** — for acting on other users' or global data. Checked via `can(user, resource, action)` from `@dragons/shared`.
- **Referee self-service** — for acting on the caller's own referee data. Checked via `isReferee(user)` from `@dragons/shared` (an identity check, not a role).

### Source of truth

All resources, actions, and role → permission mappings live in `packages/shared/src/rbac.ts`. Never hardcode role name strings anywhere else.

### Backend

`apps/api/src/middleware/rbac.ts` exports:

- `requireAuth` — 401 on no session; populates `c.get("user")` and `c.get("session")`.
- `requirePermission(resource, action)` — per-route gate; 403 on insufficient permission. Attach as the second argument to `get/post/...` (not via `.use("*")` — see below).
- `assertPermission(c, resource, action)` — inline check inside a handler for row-level logic.
- `requireRefereeSelf` — gates self-service routes; populates `c.get("refereeId")`.
- `requireRefereeSelfOrAdminRole(roles)` — dual gate for routes serving both referees and admins; populates `refereeId` when the caller is a linked referee (undefined for the wide-view admin roles passed in, e.g. `["admin", "refereeAdmin"]`, signaling admin mode). The wide-view role allowlist is now explicit at each route rather than inferred from a permission.

**Hono sub-router gotcha:** `.use("*", mw)` on a sub-router mounted at a shared prefix (e.g. `/admin`) registers the middleware at the parent's `<prefix>/*` path, so it fires on every sibling sub-router's routes too. Always attach permission middleware per-route instead (the app-level `app.use("/admin/*", requireAuth)` and `app.use("/admin/queues/*", requireAnyRole("superadmin"))` in `app.ts` are safe because they live on the parent app, not on a sub-router).

### Frontend (web & native)

- `can(user, resource, action)` — pure synchronous check for UI rendering.
- `isReferee(user)` — pure synchronous check for self-service UI.
- `<Can resource action>` — JSX wrapper (web only).
- `parseRoles(user.role)` — normalize better-auth's comma-separated role string to `RoleName[]`.

### Role catalog (v1)

| Role | Grants |
|---|---|
| `superadmin` | Superset of `admin`. Additionally gates the Bull Board queue UI (`/admin/queues/*`) via `requireAnyRole("superadmin")`. **Operational note:** existing `admin` users do NOT inherit this — each must be explicitly granted `superadmin` to keep Bull Board access. `superadmin` is also listed in better-auth's `adminRoles`. |
| `admin` | Full access to every resource and action (except Bull Board, which now requires `superadmin`). |
| `refereeAdmin` | Full referee + assignment CRUD; view matches and teams; board view/create/update. |
| `venueManager` | Full venue + booking CRUD; view matches; board view/create/update. |
| `teamManager` | `team:view,manage`; view matches, standings, referees; board view/create/update. |
| `coach` | Read-only: view teams, matches, standings and boards. |
| *(no role, refereeId set)* | Referee self-service (own assignments via `isReferee`). |

Six named roles — `ROLE_NAMES` in `packages/shared/src/rbac.ts` is the closed set
and `parseRoles()` discards anything outside it. A user may have multiple roles.
Roles are stored in the `user.role` column as a comma-separated string
(better-auth native format).

### Adding a role or resource

1. Add to `statement` in `packages/shared/src/rbac.ts`.
2. Add/extend role(s) with the new permission(s) in the same file.
3. If a new role, also add to `ROLE_NAMES`.
4. Apply `requirePermission("newResource", "newAction")` on the relevant API routes.
5. Gate UI with `<Can>` or `can()`.
6. Update this section.

## Frontend Architecture

### Page Structure

Every route is nested under a `[locale]` dynamic segment (next-intl). Only the
root `layout.tsx` sits outside it. 32 pages as of writing.

```
app/
├── layout.tsx                        Root layout (fonts, metadata)
└── [locale]/
    ├── layout.tsx                    Locale layout (next-intl provider, Toaster)
    ├── providers.tsx                 Client component wrapping AuthUIProvider
    ├── not-found.tsx
    ├── auth/[path]/page.tsx          better-auth-ui AuthView (sign-in, sign-up, forgot-password, …)
    ├── live/                         Public live scoreboard view (own layout, no chrome)
    ├── overlay/                      Broadcast overlay for OBS (own layout, transparent)
    ├── (public)/                     Route group — public site, shared public layout
    │   ├── page.tsx                  Home
    │   ├── schedule/page.tsx
    │   ├── standings/page.tsx
    │   ├── teams/page.tsx
    │   ├── team/[id]/page.tsx
    │   ├── game/[id]/page.tsx
    │   └── h2h/[teamApiId]/page.tsx
    └── admin/
        ├── layout.tsx                Admin shell (sidebar + breadcrumb + UserButton)
        ├── page.tsx                  Admin landing
        ├── sync/page.tsx             Sync dashboard (server component seeds the client tree)
        ├── matches/page.tsx, matches/[id]/page.tsx (+ not-found.tsx)
        ├── bookings/page.tsx
        ├── boards/page.tsx, boards/[boardId]/page.tsx (board/ redirects to boards/)
        ├── referees/page.tsx
        ├── teams/page.tsx
        ├── venues/page.tsx
        ├── standings/page.tsx
        ├── users/page.tsx
        ├── scoreboard/page.tsx
        ├── broadcast/page.tsx
        ├── notifications/page.tsx (+ channels/, events/, rules/)
        ├── settings/page.tsx (+ notifications/)
        └── social/create/page.tsx    Social post wizard
```

`/admin/referees` renders `RefereeHubPage` from
`components/admin/referee-hub/`; there is no separate referee page tree.

### Auth

- `apps/web/src/lib/auth-client.ts` — Better Auth React client with admin plugin
- `apps/web/src/app/providers.tsx` — `AuthUIProvider` wrapper (passes authClient, navigation, onSessionChange)
- `apps/web/src/middleware.ts` — Next.js middleware redirects unauthenticated users from `/admin/*` to `/auth/sign-in`
- Auth UI: `@daveyplate/better-auth-ui` provides `AuthView`, `UserButton`, `SignedIn`, `SignedOut` components
- Session cookie: `dragons.session_token` (or `__Secure-dragons.session_token` in production)
- Production cookie domain is `.app.hbdragons.de` so any subdomain of that
  host can read the session. Make sure every `*.app.hbdragons.de` record is
  controlled by a service we operate; a delegated subdomain would receive
  the session cookie on every authenticated request.

### Client Components

`apps/web/src/components/` is organised by surface, one directory per feature —
not a single sync directory:

- `admin/` — the admin app. One subdirectory per feature area: `board`,
  `bookings`, `dashboard`, `matches`, `notifications`, `referee-hub`,
  `settings`, `social`, `standings`, `sync`, `users`, `venues`, plus `shared`
  for cross-feature pieces and `app-sidebar.tsx` / `admin-breadcrumb.tsx` for
  the shell.
- `public/` — the public site (home, schedule, standings, team and game pages,
  the club assistant widget).
- `rbac/` — the `<Can>` gate.
- `brand/`, `ui/`, `locale-switcher.tsx`, `theme-toggle.tsx` — chrome.

Each feature directory owns its own types file where it needs one (e.g.
`admin/sync/types.ts`). Prefer adding to the matching directory over creating a
new top-level one.

### Web data layer

Every web data call goes through the shared typed client built from `@dragons/api-client`'s `createApi`. There is one entry point per render context:

- **Client components and hooks** import `api` from `@/lib/api` and call it by namespace, e.g. `api.bookings.list()`. The namespaces come from `createApi`, which wraps the exported `browserClient`.
- **Server components** call `const api = await getServerApi()` from `@/lib/api.server`. Each call builds a per-request client that forwards the incoming cookies, so server-side reads stay authenticated.
- **SWR client-side reads** use `apiFetcher` from `@/lib/swr`, which wraps the same shared `browserClient.get`. Point a `useSWR` key at an endpoint and `apiFetcher` resolves it through the typed client.

Types come from one place each: request body/query types from `@dragons/contracts`, response types from `@dragons/shared`, and the single `APIError` from `@dragons/api-client`.

To add an endpoint: add an `xEndpoints` factory plus a `.contract.test.ts` in `@dragons/api-client`, register the factory in `create-api.ts`, then consume it as `api.<group>`. The contract test parses the client's request body/query against the `@dragons/contracts` schema so client/server drift fails the build.

### Dates and times (web)

`apps/web/src/lib/tz.ts` is the only place the web app converts between Berlin
calendar days / wall-clock times and `Date` instants (issue #114). The API
stores and returns Berlin-local `YYYY-MM-DD` and `HH:MM:SS` strings, and
`i18n/request.ts` pins every `useFormatter()` output to `Europe/Berlin`, so a
`Date` built without an explicit zone is read in the *runtime's* zone — UTC in
the SSR container, the admin's own zone in the browser — and the same value
renders differently in the two places.

Two rules, both of which `tz.ts` exists to enforce:

- Never `toISOString().slice(0, 10)` a `Date` to get a day. Use
  `toBerlinDateString()` for an instant, `calendarDayString()` for a day the
  user picked in a date widget. Also available: `todayInBerlin()`,
  `plusDaysInBerlin()`.
- Never `new Date(day + "T00:00:00")` or `new Date("1970-01-01T" + time)`. Use
  `berlinDayAnchor()` / `berlinTimeAnchor()`. `lib/format-kickoff.ts` calls
  `berlinDayAnchor` rather than anchoring itself.

Anything testing this must force a non-Berlin `TZ` — a developer machine set to
`Europe/Berlin` makes every one of these bugs invisible.

Raw `fetch` is lint-banned in web components (`no-restricted-globals` in `apps/web/eslint.config.mjs`, scoped to `src/**` outside `src/lib/**` and tests). The only exceptions are non-JSON requests — blob downloads and multipart uploads — which carry an inline `eslint-disable-next-line no-restricted-globals` with a reason (the social post generator's preview download and photo upload).

### Hardcoded-string scanner (web)

`pnpm check:i18n` runs `@lingual/i18n-check` (DE/EN catalog parity) and then
`apps/web/scripts/check-i18n-literals.mjs`, which parses every `src/**/*.ts(x)`
and reports letter-containing string literals that reach the user without
passing through a message catalog. It finds three things:

- JSX children — `<div>Loading…</div>`, `<div>{"Loading…"}</div>`
- the accessible-name attributes in `TARGET_ATTRIBUTES` (`aria-label`, `title`,
  `placeholder`, `alt`); every other attribute is ignored
- arguments in the call positions listed in `USER_FACING_CALL_RULES`
  (`apps/web/scripts/i18n-literal-scan.core.mjs`) — currently `toast.*(…)`
  first arguments and `description` options, and Zod's message arguments on
  `.min` / `.max` / `.length` / `.email` / `.url` / `.regex`, including the
  `{ message: … }` and `{ error: … }` forms

Call positions are an allowlist, never inferred (issue #135):
`logger.error("sync failed")` and `toast.error("Sync failed")` parse
identically, so inference reports log lines and query keys as translation debt
and the check stops being believed. `USER_FACING_CALL_RULES` is the only place
a callee name appears — the traversal reads it as data — so covering a new
helper is one entry there plus a test.

Findings are gated by a **file-level ratchet**:
`apps/web/scripts/i18n-literal-baseline.json` grandfathers in pre-existing
offenders, a file not on it fails the build, and a baselined file with zero
remaining violations *also* fails, with an instruction to drop it from the list.
The baseline only ever shrinks. Widening the scanner is the one time it may be
re-measured, and that re-measurement belongs in the same commit as the widening.

## UI Component Library

Two import paths, both valid:

- `@dragons/ui` — the curated barrel, `packages/ui/src/index.ts`. Everything
  re-exported there is composed or wrapped (Button, Combobox, Calendar,
  DatePicker, TimePicker, Popover, Dialog, Sheet, Tooltip, `cn`).
- `@dragons/ui/components/<name>` — direct subpath import of any file in
  `packages/ui/src/components/` (alert-dialog, badge, breadcrumb, card,
  checkbox, collapsible, command, dropdown-menu, field, input, label, select,
  separator, sidebar, skeleton, switch, table, tabs, textarea, …). This is how
  most shadcn primitives are consumed; the barrel deliberately does not
  re-export them.

`ls packages/ui/src/components/` is the authoritative list. Read
`packages/ui/DESIGN-SYSTEM.md` before building UI.

Utility: `cn()` from `packages/ui/src/lib/utils.ts` (clsx + tailwind-merge)

## SDK Types

All types in `packages/sdk/src/types/`:

| File | Types | Domain |
|------|-------|--------|
| `club.ts` | `SdkClubSearchResult`, `SdkDiscoveredCompetition`, `SdkClubMatch`, `SdkClubMatchesResponse` | Club search + league discovery |
| `liga.ts` | `SdkLiga`, `SdkLigaListResponse`, `SdkLigaData` | Leagues/competitions |
| `common.ts` | `SdkMatchDayInfo`, `SdkTeamRef`, `SdkSpielfeld`, `SdkVerein`, `SdkMannschaft`, `SdkMannschaftLiga` | Shared structures |
| `match.ts` | `SdkSpielplanMatch`, `SdkSpielplanResponse` | Match schedule |
| `standings.ts` | `SdkTabelleEntry`, `SdkTabelle`, `SdkTabelleResponse` | League standings |
| `game-details.ts` | `SdkSchirirolle`, `SdkPersonVO`, `SdkSchiedsrichter`, `SdkSpielleitung`, `SdkRefereeSlot`, `SdkGameDetails`, `SdkGetGameResponse`, `SdkOpenGamesSearchParams`, `SdkOffeneSpieleLiga`, `SdkOffeneSpieleSp`, `SdkOffeneSpielResult`, `SdkOffeneSpieleResponse`, `SdkUserContext`, `SdkUserContextResponse` | Game details + open games |
| `referee-assignment.ts` | `SdkRefCandidateMeta`, `SdkRefCandidate`, `SdkGetRefsPayload`, `SdkGetRefsResponse`, `SdkAufheben`, `SdkSubmitSlotPayload`, `SdkSubmitPayload`, `SdkSubmitResponse` | Referee candidate search + slot submit |

Helpers: `parseResult()`, `isSdkLiga()`, `isSdkSpielplanMatch()`, `isSdkTabelleEntry()`

Sample API responses: `packages/sdk/src/samples/` — `getLigaList.json`, `getSpielplan.json`, `getTabelle.json`, `getGameDetails.json`, each with a `.shape.json` sibling summarising its structure.

## Infrastructure

### BullMQ Queue

- Seven queues, all declared in `apps/api/src/workers/queues.ts`: `sync`,
  `domain-events`, `digest`, `referee-reminders`, `push-receipt`,
  `task-reminders`, `outbox-poll`.
- `sync` default: 3 attempts, exponential backoff (5s base); keeps last 100
  completed and 500 failed jobs; worker concurrency 1.
- `queues.ts` holds queue *configuration* only, plus `clearRepeatables(queue,
  jobName?)` — the "drop the old cron entries before re-registering" step every
  scheduler needs. Deciding *what* to enqueue lives in
  `apps/api/src/services/sync-jobs.service.ts`: the manual/referee triggers with
  their Redis NX locks and `sync_runs` bookkeeping, `getJobStatus`, and the
  repeatable schedules read from `sync_schedule`
  (`initializeScheduledJobs`, `updateSyncSchedule`, `updateRefereeSyncSchedule`,
  `initTaskReminders`). `queues.ts` re-exports the two schedule mutators so
  `services/admin/sync-admin.service.ts` keeps its existing import path.
- A manual full sync that collides with an in-flight one throws
  `SyncAlreadyQueuedError` (`apps/api/src/services/sync-jobs.errors.ts`), which
  `middleware/error.ts` maps to a 409 `{error, code: "SYNC_ALREADY_QUEUED"}`.
  The error class sits in its own leaf module so the error middleware does not
  import the service — and therefore does not construct the BullMQ queues.
  `POST /admin/sync/trigger` has no error branch of its own. See
  "Error responses (`AppError`)" for the general convention.

### Notification Channels

Channel adapters live in `apps/api/src/services/notifications/channels/` and are dispatched by the notification pipeline per user preference + channel config.

`CHANNEL_TYPES` in `packages/shared/src/channel-configs.ts` is the single source
of truth for the four channel types, and `DISPATCHABLE_CHANNEL_TYPES` in
`notification-pipeline.ts` is an exhaustive `Record<ChannelType, true>`, so a
type listed without an adapter is a compile error. All four have adapters:

- **in_app** — Writes to `notification_log` for in-app inbox rendering. Adapter: `channels/in-app.ts`.
- **whatsapp_group** — Posts to a WhatsApp group via configured provider. Adapter: `channels/whatsapp-group.ts`.
- **push** — Native push notifications via Expo Push Service. Delivers `PUSH_ELIGIBLE_EVENTS` (referee assignments, slot requests/reminders, urgent match changes) to devices registered via `POST /api/devices/register`. Adapter: `channels/push.ts`. HTTP wrapper: `expo-push.client.ts`. Device tokens live in `push_devices`; delivery receipts reconciled via the `push-receipt` worker.
- **email** — SMTP delivery via nodemailer. Adapter: `channels/email.ts`;
  relay settings: `channels/smtp-settings.ts` (all five `SMTP_*` vars or the
  channel is not offered). The config carries only a locale: recipients resolve
  through `resolveRecipientUserIds` like push, then `resolveEmailRecipients`
  maps each user to `user.email`. **An unverified address is skipped**, with the
  reason logged, rather than mailed. Every message carries both a `text` and an
  `html` part, built by `templates/email.ts` from the same `{title, body}` the
  other channels render. A relay-level send failure releases the
  `notification_log` claim so the outbox retries.

  **Unsubscribe (issue #134).** Opting out is **per channel**: one opt-out
  switches email off for that member entirely, leaving push and whatsapp_group
  alone (per-event muting stays in `user_notification_preferences`). State and
  token live in `email_subscriptions`, one row per member, minted on the first
  send by `email-subscription.service.ts`. `resolveEmailRecipients` withholds an
  opted-out member before a message is built and before a `notification_log`
  claim is taken, and reports them as `skipped` with reason `unsubscribed`.
  Every outgoing message carries `List-Unsubscribe` (a per-recipient URL on
  `BETTER_AUTH_URL`, the API's own origin) plus `List-Unsubscribe-Post:
  List-Unsubscribe=One-Click`, and the same link in both MIME parts for a human
  to click. `GET /public/notifications/unsubscribe` is safe and only renders a
  confirmation form — link scanners fetch every URL in a message, so a GET that
  acted would opt members out silently — and `POST` performs it, with no session
  required. An unknown token answers 404 with a page saying nothing was changed,
  never a reassuring 200.

  **Bounces are still not handled** — deliberately out of scope for #134. A
  bounce arriving after the relay accepted the message is not observed anywhere:
  plain SMTP gives no callback, so it needs either a return-path inbox with a
  poller or a transport with a webhook, and that decision is deferred to a
  separate issue.

### Workers

Located in `apps/api/src/workers/`. Queues configured in `workers/queues.ts`;
their schedules are registered by `services/sync-jobs.service.ts`.

- **sync.worker** — Processes `sync` queue jobs (full/partial sync). Default concurrency 1.
- **event.worker** — Fan-out for domain events into per-recipient notification dispatch.
- **digest.worker** — Aggregates buffered events into daily digest notifications.
- **referee-reminder.worker** — Scheduled reminders for open referee slots.
- **task-reminder.worker** — Repeatable sweep every 15 minutes, driven by `apps/api/src/workers/task-reminder.worker.ts`. Loads tasks whose due date is within the next 24 hours (lead) or today past 08:00 UTC (day-of), whose column is not flagged `isDoneColumn`, and whose corresponding `lead_reminder_sent_at` / `due_reminder_sent_at` has not yet fired. Emits `task.due.reminder` events via the outbox.
- **push-receipt.worker** — Cron, runs every 15 minutes (queue `push-receipt`). Polls Expo Push receipts for `sent_ticket` rows in `notification_log`, marks them `delivered` or `failed`, and purges `push_devices` rows whose tokens returned `DeviceNotRegistered`.
- **outbox-poll.worker** — BullMQ repeatable job (queue `outbox-poll`, `jobId: "outbox-poll-cron"`, every 30s, concurrency 1) that claims unsent `domain_events` rows and enqueues them. This replaced the old `setInterval` poller; running it as a deduplicated repeatable job means only one poll fires even if the worker is ever scaled past one instance. `/health/deep` reports the `outbox-poll` queue counts alongside the existing outbox lag metric. **Delivery order is not guaranteed, per entity or globally** (decided in issue #79): the claim's `ORDER BY created_at` is a fairness rule against starvation, not a sequence — `created_at` is transaction-start time, so commit order can differ from it — and the event worker runs concurrency 5. Notifications are independent and each carries its own rendered snapshot, so nothing needs the ordering today; the reasoning and the conditions for adding a per-entity FIFO key are recorded at `claimBatch` in `services/events/outbox-poller.ts`.

### Redis

- Used for: BullMQ queue + SSE pub/sub
- Singleton: `apps/api/src/config/redis.ts`
- Connection: `REDIS_URL` env var

### PostgreSQL

- Drizzle ORM with connection pooling (max 10, idle 30s, connect timeout 2s)
- Singleton: `apps/api/src/config/database.ts`
- Connection: `DATABASE_URL` env var

### Data access conventions

- Inline Drizzle queries in the service that owns the operation. There is no
  `repositories/` layer, intentionally.
- When the same SELECT (or join + row mapper) is duplicated across 3 or more
  services, extract it into a `*-query.service.ts` companion file alongside
  the owning service. Existing example: `services/admin/match-query.service.ts`.
- `*-query.service.ts` files only hold reads + row mappers. Mutations stay in
  the domain service file (e.g. `match-admin.service.ts`).

### Transaction boundaries

Default rule for a write that both changes state **and** emits a domain event:
wrap them in one `db.transaction(...)` and pass the `tx` to
`publishDomainEvent(params, tx)` so the event row commits atomically with the
state change. The gold-standard example is `services/admin/match-admin.service.ts`.

- A multi-row write (bulk insert/update, or several updates that must all land or
  none) goes inside a transaction. For many independent updates, issue them as
  `Promise.all` of per-row updates inside the transaction (see
  `board.service.ts#reorderColumns`, `teams.sync.ts` own-club corrective pass) —
  not sequential `await`s.
- Never call `publishDomainEvent` **without** `tx` from inside a transaction body:
  the event would commit independently, so a later rollback leaves a phantom
  notification (the outbox is built to avoid exactly this — pass the `tx`).
- High-volume sync upserts that don't emit events may stay outside a transaction
  (hash-skip makes re-runs cheap); document the choice at the call site.

### Deployment topology & tenancy

Two operational constraints the code relies on but doesn't state inline:

- **Hybrid Cloud Run topology.** The API service (`RUN_MODE=api`) scales
  horizontally (`min_instances=1, max_instances=10`); the worker service
  (`RUN_MODE=worker`) is pinned single-instance (`max_instances=1`) in
  `infra/environments/production/main.tf`. Worker-only state — outbox poller
  singleton, scheduler init, stale-sync reclaim, notification coalesce, SDK
  session cookie cache — is correct *because* the worker is pinned to 1. Any
  per-instance rate-limit / dedupe state on the **API** path must live in Redis,
  since up to 10 instances run. Do not raise the worker's `max_instances`
  without first moving that state to Redis.

  Two pieces of worker-only state have since been made multi-instance safe and
  no longer depend on the single-instance pin:
  - **Stale-run reclaim is heartbeat-gated.** Each worker process gets an
    `INSTANCE_ID` (ulid) and writes a Redis heartbeat (`worker:hb:<INSTANCE_ID>`,
    `EX 60s`, refreshed ~every 20s) via `workers/instance-heartbeat.ts`. Sync
    runs are stamped with `syncRuns.ownerInstanceId`. On startup a `running` row
    is reclaimed (marked failed) only when its owner's heartbeat is absent, so a
    second worker can no longer kill an in-flight run owned by a live instance.
    Shutdown reclaim is scoped to the shutting-down instance's own runs.
  - **Notification coalesce is Redis-backed and claimed per dispatch target.**
    The 60s window uses
    `redis.set("coalesce:<eventType>:<entityType>:<entityId>:<dedupKey>", "1", "EX", 60, "NX")`
    instead of an in-process Map, so it coalesces correctly across instances.
    `<dedupKey>` is the same per-(rule|default, channel config, channel,
    recipient) key used for in-run dedup, and the claim is released in a
    `finally` whenever that target was not delivered — including when the
    dispatch throws. A retry inside the window therefore re-delivers exactly the
    targets that failed, without re-sending the ones that already landed.
- **Single-tenant ("own club").** The app is deployed once per club. The owning
  club is identified by `teams.isOwnClub` / `referees.isOwnClub` and
  `getClubConfig()`, threaded through routes, services, and sync. There is no
  multi-tenant isolation; supporting a second club means a second deployment
  (fork-per-tenant), not a tenant column. Treat "own club" as a deploy-wide
  singleton, not a request-scoped value.

### Docker (dev)

`docker/docker-compose.dev.yml`: postgres:17 (port 5432), redis:7-alpine (port 6379)

## CI/CD

| Workflow | File | Triggers | Jobs |
|----------|------|----------|------|
| CI | `.github/workflows/ci.yml` | PR, push main/master, dispatch | `lint` (eslint + `check:i18n` + `check:design-tokens` + tsc + knip), `test` (test + `check:coverage-scripts` + `check:skipped-tests` + coverage), `build`, `pi` (pytest over `apps/pi`), `ai-slop`, `lockfile-check`, `dependency-review`, `dependency-audit`, `secret-scan` |
| Deploy | `.github/workflows/deploy.yml` | `workflow_run` after a green CI on main, dispatch | `check-ci`, `determine-changes` (path filters live in `.github/scripts/change-patterns.sh`), `run-migrations`, `build-web`, `build-api`, `summary` |
| CD | `.github/workflows/cd.yml` | push main, `v*.*.*` tags, dispatch | `deliver` (build + pack artifacts), `release` (GitHub release) |
| DB migrations | `.github/workflows/db-migrations.yml` | dispatch only | `migrate`. Actions: `migrate` or `check`. There is deliberately no `push` action — `drizzle-kit push` drops hand-written SQL indexes |
| OpenTofu | `.github/workflows/opentofu.yml` | push/PR touching `infra/**`, dispatch | `validate`, `plan`, `apply` |
| CodeQL | `.github/workflows/codeql.yml` | PR, push main/master, weekly | `analyze` (JavaScript/TypeScript) |
| Scorecard | `.github/workflows/scorecard.yml` | push main, weekly | `analysis` (OSSF Scorecard) |
| Semgrep | `.github/workflows/semgrep.yml` | push main, PR, weekly | `semgrep` (OSS scan) |
| Dependabot | `.github/dependabot.yml` | weekly | npm + GitHub Actions updates |

The web image is built with `NEXT_PUBLIC_*` build args (`deploy.yml` → `apps/web/Dockerfile`), because Next.js inlines them at build time. Changing one of those values requires a rebuild, not a restart.
