# AGENTS.md - Architecture Reference

Detailed technical reference for AI agents working in this codebase. For guidelines and conventions, see `CLAUDE.md`.

## Package Dependency Graph

```
@dragons/web  ──> @dragons/ui, @dragons/shared
@dragons/api  ──> @dragons/sdk, @dragons/db, @dragons/shared
@dragons/db   ──> (standalone - drizzle-orm + pg)
@dragons/sdk  ──> (standalone - basketball-bund-sdk)
@dragons/shared ──> (standalone - zod for validation schemas)
@dragons/ui   ──> (standalone - radix-ui + tailwind)
```

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

MatchReferee unique constraint: (matchId, refereeId, roleId)

Board (1) ──── (N) BoardColumn
     (1) ──── (N) Task (via boardId)

BoardColumn (1) ──── (N) Task (via columnId)

Task (1) ──── (N) TaskChecklistItem
     (1) ──── (N) TaskComment

User (1) ──── (0..1) Referee (via refereeId FK)

RefereeAssignmentIntent (N) ──── (1) Match
RefereeAssignmentIntent (N) ──── (1) Referee
  unique: (matchId, refereeId, slotNumber)

SyncRun (1) ──── (N) SyncRunEntry
```

### Database Tables

All tables use `serial` primary keys. External API IDs stored in `apiId`, `apiLigaId`, `apiMatchId`, `apiTeamPermanentId` columns with unique constraints.

| Table | File | Key Columns |
|-------|------|-------------|
| `appSettings` | `packages/db/src/schema/app-settings.ts` | key (unique), value — stores club_id, club_name |
| `leagues` | `packages/db/src/schema/leagues.ts` | apiLigaId (unique), ligaNr, name, seasonId, isTracked, discoveredAt, dataHash |
| `teams` | `packages/db/src/schema/teams.ts` | apiTeamPermanentId (unique), name, clubId, isOwnClub, dataHash |
| `venues` | `packages/db/src/schema/venues.ts` | apiId (unique), name, street, postalCode, city, lat/lng, dataHash |
| `matches` | `packages/db/src/schema/matches.ts` | apiMatchId (unique), leagueId FK, venueId FK, scores, sr1Open, sr2Open, sr3Open, JSONB fields, versioning |
| `standings` | `packages/db/src/schema/standings.ts` | leagueId FK + teamApiId (unique), position, won, lost, points |
| `referees` | `packages/db/src/schema/referees.ts` | apiId (unique), firstName, lastName, licenseNumber, dataHash |
| `refereeRoles` | `packages/db/src/schema/referees.ts` | apiId (unique), name, shortName |
| `matchReferees` | `packages/db/src/schema/referees.ts` | matchId FK (cascade), refereeId FK, roleId FK |
| `refereeAssignmentIntents` | `packages/db/src/schema/referees.ts` | matchId FK (cascade), refereeId FK, slotNumber, clickedAt, confirmedBySyncAt |
| `matchRemoteVersions` | `packages/db/src/schema/versions.ts` | matchId FK (cascade), versionNumber, snapshot JSONB, dataHash |
| `matchLocalVersions` | `packages/db/src/schema/versions.ts` | matchId FK (cascade), versionNumber, changedBy, snapshot JSONB |
| `matchChanges` | `packages/db/src/schema/versions.ts` | matchId FK (cascade), track (remote/local), fieldName, oldValue, newValue |
| `matchOverrides` | `packages/db/src/schema/match-overrides.ts` | matchId FK (cascade), fieldName, reason, changedBy — unique(matchId, fieldName) |
| `venueBookings` | `packages/db/src/schema/venue-bookings.ts` | venueId FK, date, calculatedStartTime/EndTime, overrideStartTime/EndTime, status, needsReconfirmation, confirmedBy |
| `venueBookingMatches` | `packages/db/src/schema/venue-booking-matches.ts` | venueBookingId FK (cascade), matchId FK — unique(venueBookingId, matchId) |
| `boards` | `packages/db/src/schema/boards.ts` | name, description, createdBy |
| `boardColumns` | `packages/db/src/schema/boards.ts` | boardId FK (cascade), name, position, color, isDoneColumn |
| `tasks` | `packages/db/src/schema/tasks.ts` | boardId FK (cascade), columnId FK, title, description, assigneeId, priority, dueDate, position |
| `taskChecklistItems` | `packages/db/src/schema/tasks.ts` | taskId FK (cascade), label, isChecked, checkedBy, position |
| `taskComments` | `packages/db/src/schema/tasks.ts` | taskId FK (cascade), authorId, body |
| `notifications` | `packages/db/src/schema/notifications.ts` | recipientId, channel, title, body, status, sentAt, errorMessage |
| `userNotificationPreferences` | `packages/db/src/schema/notifications.ts` | userId (unique), whatsappEnabled, whatsappNumber, notifyOnTaskAssigned, notifyOnBookingNeedsAction, notifyOnTaskComment |
| `syncRuns` | `packages/db/src/schema/sync-runs.ts` | syncType, status, triggeredBy, records*, durationMs, summary JSONB |
| `syncRunEntries` | `packages/db/src/schema/sync-runs.ts` | syncRunId FK (cascade), entityType, action, metadata JSONB |
| `syncSchedule` | `packages/db/src/schema/sync-runs.ts` | enabled, cronExpression, timezone |
| `user` | `packages/db/src/schema/auth.ts` | id (text PK), email (unique), name, role, refereeId FK, banned, banReason, banExpires |
| `session` | `packages/db/src/schema/auth.ts` | id (text PK), userId FK (cascade), token (unique), expiresAt, ipAddress, userAgent, impersonatedBy |
| `account` | `packages/db/src/schema/auth.ts` | id (text PK), userId FK (cascade), providerId, accountId, password |
| `verification` | `packages/db/src/schema/auth.ts` | id (text PK), identifier, value, expiresAt |

| `playerPhotos` | `packages/db/src/schema/player-photos.ts` | filename, originalName, width, height — uploaded player photos for social posts |
| `socialBackgrounds` | `packages/db/src/schema/social-backgrounds.ts` | filename, originalName, width, height, isDefault — background images for social posts |

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

## Sync Pipeline

### Execution Flow

```
BullMQ Job (cron 04:00 Europe/Berlin or manual trigger)
  └─> syncWorker processes job
       └─> SyncOrchestrator.fullSync(triggeredBy, jobLogger)

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
  - syncStandingsFromData(leagueData)

Step 4: syncMatchesFromData(leagueData, venueIdLookup)
  - Needs venue FK lookup (apiId -> dbId)
  - Hash compare -> skip or upsert
  - Version snapshot + field-level changes in transaction

Step 5: syncRefereeAssignmentsFromData()
  - Needs match + referee + role FK lookups
  - Upsert matchReferees entries

Step 5.25: confirmIntentsFromSync()
  - Check pending refereeAssignmentIntents (confirmedBySyncAt IS NULL)
  - If referee now assigned in matchReferees, set confirmedBySyncAt

Step 6: Finalize
  - Close SyncLogger (flush remaining entries)
  - Update syncRuns record with results
```

### Hash-Based Change Detection

Each entity computes a SHA-256 hash from its data fields (see `services/sync/hash.ts`). The hash is stored in a `dataHash` column. During sync, the new hash is compared to the stored one - if identical, the entity is skipped.

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

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service metadata |
| GET | `/health` | Health check: `{ status: "ok" }` |
| GET | `/openapi.json` | OpenAPI 3.1 spec (auto-generated from route annotations) |
| GET | `/docs` | Interactive API docs (Scalar UI) |

### Authentication (Better Auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/sign-up/email` | Register with email + password |
| POST | `/api/auth/sign-in/email` | Sign in with email + password |
| POST | `/api/auth/sign-out` | Sign out (invalidate session) |
| GET | `/api/auth/get-session` | Get current session + user |

All `/admin/*` routes require an authenticated session with `role: "admin"`. Returns 401 if unauthenticated, 403 if not admin.

Auth config: `apps/api/src/config/auth.ts` (Better Auth with Drizzle adapter + admin plugin)
Auth middleware: `apps/api/src/middleware/auth.ts` (`requireAdmin`)

### Admin - Sync Control

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/sync/trigger` | Queue manual sync job |
| GET | `/admin/sync/status` | Last sync + running status |
| GET | `/admin/sync/status/:jobId` | Specific job status + progress |

### Admin - Job Queue

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/sync/jobs?statuses=` | List jobs by status (active,waiting,delayed,completed,failed) |
| POST | `/admin/sync/jobs/:jobId/retry` | Retry failed job |
| DELETE | `/admin/sync/jobs/:jobId` | Remove job |
| GET | `/admin/sync/jobs/:jobId/logs` | BullMQ job logs |

### Admin - Sync History

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/sync/logs?limit=&offset=&status=` | Paginated sync run history |
| GET | `/admin/sync/logs/:id/entries?limit=&offset=&entityType=&action=` | Per-item log entries with summary |
| GET | `/admin/sync/logs/:id/stream` | SSE real-time log stream |

### Admin - Schedule

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/sync/schedule` | Current cron schedule |
| PUT | `/admin/sync/schedule` | Update schedule (cronExpression, timezone, enabled) |

### Admin - Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/settings/club` | Get current club config (clubId, clubName) or null |
| PUT | `/admin/settings/club` | Set club config `{ clubId, clubName }` |

### Admin - League Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/leagues/discover` | Discover leagues for configured club |
| GET | `/admin/leagues` | All leagues grouped by season with tracking status |
| PUT | `/admin/leagues/:id/tracking` | Toggle `{ isTracked: boolean }` |

### Admin - Matches

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/matches` | List own club matches (with booking info) |
| GET | `/admin/matches/:id` | Match detail (includes booking info) |
| PATCH | `/admin/matches/:id` | Update match local fields |
| DELETE | `/admin/matches/:id/overrides/:field` | Release a local override |

Match list and detail responses include associated venue booking data when available.

### Admin - Bookings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/bookings` | List all bookings |
| GET | `/admin/bookings/:id` | Booking detail |
| PATCH | `/admin/bookings/:id` | Update booking |
| PATCH | `/admin/bookings/:id/status` | Quick status change |
| POST | `/admin/bookings` | Create a booking manually |
| DELETE | `/admin/bookings/:id` | Delete a booking |

### Admin - Boards

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/boards` | List all boards |
| POST | `/admin/boards` | Create a board |
| GET | `/admin/boards/:id` | Get board with columns and tasks |
| PATCH | `/admin/boards/:id` | Update board |
| DELETE | `/admin/boards/:id` | Delete board |
| POST | `/admin/boards/:id/columns` | Add column to board |
| PATCH | `/admin/boards/columns/:id` | Update column |
| PATCH | `/admin/boards/columns/:id/position` | Reorder column |
| DELETE | `/admin/boards/columns/:id` | Delete column |

### Admin - Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/tasks` | List tasks (filterable by board, column, assignee) |
| POST | `/admin/tasks` | Create a task |
| GET | `/admin/tasks/:id` | Task detail with checklist + comments |
| PATCH | `/admin/tasks/:id` | Update task fields |
| PATCH | `/admin/tasks/:id/move` | Move task to another column/position |
| DELETE | `/admin/tasks/:id` | Delete task |
| POST | `/admin/tasks/:id/checklist` | Add checklist item |
| PATCH | `/admin/tasks/checklist/:id` | Toggle/update checklist item |
| DELETE | `/admin/tasks/checklist/:id` | Delete checklist item |
| POST | `/admin/tasks/:id/comments` | Add comment |
| PATCH | `/admin/tasks/comments/:id` | Update comment |
| DELETE | `/admin/tasks/comments/:id` | Delete comment |

### Admin - Teams

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/teams` | List teams |
| PATCH | `/admin/teams/:id` | Update team (e.g. isOwnClub) |

### Admin - Venues

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/venues` | List venues |
| GET | `/admin/venues/:id` | Venue detail |

### Admin - Referees

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/referees` | List referees |

### Admin - Standings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/standings` | Get standings for tracked leagues |

### Admin - Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/notifications` | List notifications |
| PATCH | `/admin/notifications/preferences` | Update notification preferences |
| PATCH | `/admin/notifications/:id/read` | Mark notification as read |
| GET | `/admin/notifications/preferences` | Get notification preferences |

### Admin - Bull Board

| GET | `/admin/queues/*` | Bull Board web UI for queue monitoring |

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/public/matches` | List own club matches (no auth) |
| GET | `/public/standings` | League standings (no auth) |
| GET | `/public/teams` | List teams (no auth) |

### Device

| Method | Path | Description |
|--------|------|-------------|
| POST | `/devices` | Register push notification device |
| DELETE | `/devices/:token` | Unregister device |

### Referee

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/referee/matches` | referee/admin | List matches with open referee slots |
| POST | `/referee/matches/:id/take` | referee/admin | Record take-intent, returns deep-link URL |

### Admin - Social Post Generator

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/social/matches?type=&week=&year=` | Weekend matches filtered by type (preview/results) |
| GET | `/admin/social/player-photos` | List player photos |
| GET | `/admin/social/player-photos/:id/image` | Proxy player photo image from GCS |
| POST | `/admin/social/player-photos` | Upload player photo (multipart) |
| DELETE | `/admin/social/player-photos/:id` | Delete player photo |
| GET | `/admin/social/backgrounds` | List backgrounds |
| GET | `/admin/social/backgrounds/:id/image` | Proxy background image from GCS |
| POST | `/admin/social/backgrounds` | Upload background (multipart) |
| DELETE | `/admin/social/backgrounds/:id` | Delete background |
| PATCH | `/admin/social/backgrounds/:id/default` | Set default background |

Route files: `apps/api/src/routes/health.routes.ts`, `apps/api/src/routes/admin/*.routes.ts`, `apps/api/src/routes/public/*.routes.ts`, `apps/api/src/routes/referee/*.routes.ts`, `apps/api/src/routes/device.routes.ts`
Validation schemas: `apps/api/src/routes/admin/*.schemas.ts`
Service layer: `apps/api/src/services/admin/*.service.ts`, `apps/api/src/services/venue-booking/`, `apps/api/src/services/notifications/`, `apps/api/src/services/social/`

## Frontend Architecture

### Page Structure

```
app/
├── page.tsx                          Home page
├── layout.tsx                        Root layout (fonts, metadata, Providers + Toaster)
├── providers.tsx                     Client component wrapping AuthUIProvider
├── auth/
│   └── [path]/page.tsx              better-auth-ui AuthView (sign-in, sign-up, forgot-password, etc.)
├── referee/
│   ├── layout.tsx                    Referee shell (simplified header)
│   └── matches/
│       └── page.tsx                  Referee match list with open slots
└── admin/
    ├── layout.tsx                    Admin shell (header nav + UserButton)
    ├── page.tsx                      Redirects to /admin/sync
    ├── settings/
    │   └── page.tsx                  Server component: club config + league discovery + league list
    └── sync/
        └── page.tsx                  Server component: fetches initial data, renders SyncDashboard
```

### Auth

- `apps/web/src/lib/auth-client.ts` — Better Auth React client with admin plugin
- `apps/web/src/app/providers.tsx` — `AuthUIProvider` wrapper (passes authClient, navigation, onSessionChange)
- `apps/web/src/middleware.ts` — Next.js middleware redirects unauthenticated users from `/admin/*` to `/auth/sign-in`
- Auth UI: `@daveyplate/better-auth-ui` provides `AuthView`, `UserButton`, `SignedIn`, `SignedOut` components
- Session cookie: `dragons.session_token` (or `__Secure-dragons.session_token` in production)

### Client Components

All in `apps/web/src/components/admin/sync/`:

| Component | File | Purpose |
|-----------|------|---------|
| `SyncDashboard` | `sync-dashboard.tsx` | Main client component, 5s polling, tab layout |
| `SyncStatusCards` | `sync-status-cards.tsx` | Status display cards |
| `SyncHistoryTable` | `sync-history-table.tsx` | Paginated sync run history |
| `SyncLiveLogs` | `sync-live-logs.tsx` | SSE log streaming |
| `SyncScheduleConfig` | `sync-schedule-config.tsx` | Cron schedule form |
| `SyncLogDetail` | `sync-log-detail.tsx` | Detailed log entry viewer |

Types: `apps/web/src/components/admin/sync/types.ts`

### API Client

`apps/web/src/lib/api.ts` - Fetch wrapper targeting `NEXT_PUBLIC_API_URL` with error handling.

## UI Component Library

`packages/ui/src/components/` exports:

Button, Combobox, Tabs/TabsList/TabsTrigger/TabsContent, Card/CardHeader/CardTitle/CardDescription/CardContent, Label, Switch, Badge, Table/TableHeader/TableHead/TableBody/TableRow/TableCell, Separator, Select/SelectTrigger/SelectValue/SelectContent/SelectItem, Input, Popover/PopoverTrigger/PopoverContent/PopoverAnchor

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
| `game-details.ts` | `SdkSchirirolle`, `SdkPersonVO`, `SdkSchiedsrichter`, `SdkSpielleitung`, `SdkRefereeSlot`, `SdkGameDetails`, `SdkGetGameResponse`, `SdkOpenGame`, `SdkOpenGamesResponse`, `SdkUserContext`, `SdkUserContextResponse` | Game details + referees |

Helpers: `parseResult()`, `isSdkLiga()`, `isSdkSpielplanMatch()`, `isSdkTabelleEntry()`

Sample API responses: `/Users/jn/git/dragons-mono/apps/api/sdk-type-samples/` (getLigaList.json, getSpielplan.json, getTabelle.json, getGameDetails.json)

## Infrastructure

### BullMQ Queue

- Queue name: `sync`
- Default: 3 attempts, exponential backoff (5s base)
- Keeps last 100 completed, 500 failed jobs
- Worker concurrency: 1
- Config: `apps/api/src/workers/queues.ts`

### Redis

- Used for: BullMQ queue + SSE pub/sub
- Singleton: `apps/api/src/config/redis.ts`
- Connection: `REDIS_URL` env var

### PostgreSQL

- Drizzle ORM with connection pooling (max 10, idle 30s, connect timeout 2s)
- Singleton: `apps/api/src/config/database.ts`
- Connection: `DATABASE_URL` env var

### Docker (dev)

`docker/docker-compose.dev.yml`: postgres:17 (port 5432), redis:7-alpine (port 6379)

## CI/CD

| Workflow | File | Triggers | Jobs |
|----------|------|----------|------|
| CI | `.github/workflows/ci.yml` | PR, push main | quality (lint+typecheck+test+coverage+build), ai-slop, dependency-review, dependency-audit, secret-scan |
| CD | `.github/workflows/cd.yml` | push main, version tags | deliver (build+pack artifacts), release (GitHub release) |
| CodeQL | `.github/workflows/codeql.yml` | PR, push main, weekly | JavaScript/TypeScript analysis |
| Dependabot | `.github/dependabot.yml` | weekly | npm + GitHub Actions updates |
