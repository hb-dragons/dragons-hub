# AGENTS.md - Architecture Reference

Detailed technical reference for AI agents working in this codebase. For guidelines and conventions, see `CLAUDE.md`.

## Package Dependency Graph

```
@dragons/web  ──> @dragons/ui
@dragons/api  ──> @dragons/sdk, @dragons/db
@dragons/db   ──> (standalone - drizzle-orm + pg)
@dragons/sdk  ──> (standalone - basketball-bund-sdk)
@dragons/ui   ──> (standalone - radix-ui + tailwind)
```

## Data Model

### Entity Relationship Diagram

```
League (1) ──── (N) Match
           ├──── (N) Standing (unique: leagueId + teamApiId)
           └──── (N) Team (via season)

Venue (1) ──── (N) Match

Match (1) ──── (N) MatchReferee
          ├──── (N) MatchRemoteVersion (version history)
          ├──── (N) MatchLocalVersion (local edits)
          └──── (N) MatchChange (field-level audit)

Referee (1) ──── (N) MatchReferee
RefereeRole (1) ──── (N) MatchReferee

MatchReferee unique constraint: (matchId, refereeId, roleId)

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
| `matches` | `packages/db/src/schema/matches.ts` | apiMatchId (unique), leagueId FK, venueId FK, scores, JSONB fields, versioning |
| `standings` | `packages/db/src/schema/standings.ts` | leagueId FK + teamApiId (unique), position, won, lost, points |
| `referees` | `packages/db/src/schema/referees.ts` | apiId (unique), firstName, lastName, licenseNumber, dataHash |
| `refereeRoles` | `packages/db/src/schema/referees.ts` | apiId (unique), name, shortName |
| `matchReferees` | `packages/db/src/schema/referees.ts` | matchId FK (cascade), refereeId FK, roleId FK |
| `matchRemoteVersions` | `packages/db/src/schema/versions.ts` | matchId FK (cascade), versionNumber, snapshot JSONB, dataHash |
| `matchLocalVersions` | `packages/db/src/schema/versions.ts` | matchId FK (cascade), versionNumber, changedBy, snapshot JSONB |
| `matchChanges` | `packages/db/src/schema/versions.ts` | matchId FK (cascade), track (remote/local), fieldName, oldValue, newValue |
| `syncRuns` | `packages/db/src/schema/sync-runs.ts` | syncType, status, triggeredBy, records*, durationMs, summary JSONB |
| `syncRunEntries` | `packages/db/src/schema/sync-runs.ts` | syncRunId FK (cascade), entityType, action, metadata JSONB |
| `syncSchedule` | `packages/db/src/schema/sync-runs.ts` | enabled, cronExpression, timezone |
| `user` | `packages/db/src/schema/auth.ts` | id (text PK), email (unique), name, role, banned, banReason, banExpires |
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

### Admin - Bull Board

| GET | `/admin/queues/*` | Bull Board web UI for queue monitoring |

Route files: `apps/api/src/routes/health.routes.ts`, `apps/api/src/routes/admin/sync.routes.ts`, `apps/api/src/routes/admin/settings.routes.ts`, `apps/api/src/routes/admin/league.routes.ts`
Validation schemas: `apps/api/src/routes/admin/sync.schemas.ts`
Service layer: `apps/api/src/services/admin/sync-admin.service.ts`, `apps/api/src/services/admin/settings.service.ts`, `apps/api/src/services/admin/league-discovery.service.ts`

## Frontend Architecture

### Page Structure

```
app/
├── page.tsx                          Home page
├── layout.tsx                        Root layout (fonts, metadata, Providers + Toaster)
├── providers.tsx                     Client component wrapping AuthUIProvider
├── auth/
│   └── [path]/page.tsx              better-auth-ui AuthView (sign-in, sign-up, forgot-password, etc.)
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
