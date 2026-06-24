# Seasons + new-season onboarding — design

Date: 2026-06-24
Status: approved (design), pending implementation plan

## Problem

A new federation season is published before the current one ends. Its leagues
appear in the basketball-bund.net API flagged `vorabliga` (preliminary). We want
to stand up the new season's game plan ahead of time and manage it with our
existing tools, then make it live when the current season ends.

Today there is **no first-class season concept**:

- Season exists only as two denormalized columns on `leagues` (`seasonId`,
  `seasonName`). No `seasons` table, no `seasonId` FK on matches / standings /
  teams / venues / referees.
- `isTracked` is a single global boolean — there is no per-season tracked set.
- The `vorabliga` flag is read from the SDK and immediately discarded; no column
  stores it.
- League discovery matches user-entered `liganr` values — but `liganr` is `null`
  for vorabligas, so the current "enter league numbers" flow literally cannot
  reach them.
- Every read (standings / matches / team stats) shows "all `isTracked` leagues"
  with no season filter, and there is no season selector anywhere in web/native.

## Empirical grounding (live probe of basketball-bund.net)

The public REST endpoints we already use return preseason data without auth:

- `POST /rest/wam/liga/list` → for verband 7 (Niedersachsen): 377 leagues, 119
  flagged `vorabliga: true`.
- `GET /rest/competition/spielplan/id/{ligaId}` for a vorabliga → HTTP 200 with a
  full fixture list (e.g. "Oberliga Herren Ost" = 90 matches, real teams,
  kickoff dates, match days). The match payload shape is identical to a normal
  league, so `data-fetcher` / `matches.sync` ingest it unchanged.
- `GET /rest/competition/table/id/{ligaId}` → returns `ligaData` (seasonId,
  seasonName, `vorabliga`, `tableExists`) even when the table itself is empty.

**Decisive structural facts** (these shape the whole design):

| | committed sample "Oberliga Herren Ost" | live vorabliga "Oberliga Herren Ost" |
|---|---|---|
| `ligaId` (apiLigaId) | 48666 | 54136 |
| `matchId` range | 2,669,718–2,669,807 | 2,859,926–2,860,015 (disjoint) |
| `liganr` | present | `null` |
| `teamPermanentId` | 160357 | same identity, new `seasonTeamId` |

The federation mints **fresh `ligaId` and `matchId` per season-instance** and the
ranges do not overlap. Teams stay singletons by `teamPermanentId` (that is the
permanent identity; `seasonTeamId` is the per-season context). Consequence: a new
season's leagues get new `apiLigaId` → new `leagues.id` rows; its matches get new
`apiMatchId`; and standings (keyed on `leagueId` + `teamApiId`) land on the new
league row, so they never overwrite the prior season. The migration is therefore
**additive**, not a destructive rewrite, and needs **no unique-constraint
changes**.

## Scope (decided)

- **First-class `seasons` table.** Each league belongs to a season. Exactly one
  season is `active` and drives the public site. Admin preps the next season in
  the background and flips it live when the current one ends. Old seasons stay
  admin-visible. **No public season selector.**
- **Sequential lifecycle.** At most one `active` season; an `upcoming` season is a
  staging area; activating it archives the previous one.
- **"Manage" = reuse existing tools.** Syncing the upcoming season's vorabligas
  pulls in their fixtures; the existing schedule view, rescheduling assistant,
  venue booking, and referee assignment operate on them, season-scoped. No new
  fixture-editing surface.
- **Remove the paste-by-league-number flow** entirely (it cannot reach
  vorabligas) and replace it with a browse + multi-select league picker.
- **Admin season-context switcher** so admins can view/manage the upcoming
  season's games in the existing tools while the public site stays on the active
  season.

## Architecture

Season scoping flows through **`leagues.seasonId` only**. Matches → `leagueId` →
league and standings → `leagueId` → league already exist, and each season has its
own `leagues.id` rows, so no `seasonId` column is added to matches / standings /
teams. (Considered and rejected: denormalizing `seasonId` onto matches/standings
— it buys nothing because the `leagueId` join already yields the season and IDs
don't collide; it would add columns, backfill, and a second source of truth.)

### 1. Data model

New table `packages/db/src/schema/seasons.ts`:

| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `name` | varchar(100) NOT NULL | admin label, e.g. "2026/2027" |
| `sdkSeasonId` | integer NULL | informational, from `getTabelle` `ligaData.seasonId` |
| `status` | varchar(20) NOT NULL `.$type<SeasonStatus>()` | `'upcoming' \| 'active' \| 'archived'` |
| `startDate` | date NULL | optional |
| `endDate` | date NULL | optional |
| `createdAt` / `updatedAt` | timestamptz | matches existing convention |

`SeasonStatus` is a shared union type in `@dragons/shared` (mirrors the
`SyncStatus` pattern). At most one active season is enforced by a **partial
unique index**: `CREATE UNIQUE INDEX seasons_one_active ON seasons (status) WHERE
status = 'active'`. Drizzle's generated migration must be verified to include the
`WHERE` clause (hand-edit the migration SQL if `db:generate` drops it).

`leagues` schema additions (additive):

- `seasonId` integer, FK → `seasons.id`. Nullable in the migration, backfilled,
  then set `NOT NULL`.
- `vorabliga` boolean NOT NULL default false.

Unchanged: `leagues.apiLigaId` stays UNIQUE (fresh per season; also guards against
double-discovery), `matches.apiMatchId` UNIQUE, `standings (leagueId, teamApiId)`
unique. Export `seasons` from `packages/db/src/schema/index.ts`.

### 2. Migration + backfill

Single Drizzle migration (`db:generate` then `db:migrate`):

1. Create `seasons` table + partial unique index.
2. Add `leagues.seasonId` (nullable) and `leagues.vorabliga` (default false).
3. Data step: group existing leagues by `seasonName`. Create one `seasons` row per
   distinct group; mark the group with the highest `seasonId` `active` and any
   others `archived` (in practice there is one group today). Set each league's
   `seasonId` to its group. Backfill `sdkSeasonId` from the leagues' existing
   `seasonId` value.
4. Set `leagues.seasonId NOT NULL`.

Result: every current league lands in one `active` season, so all existing reads
return exactly what they do today. The migration is reversible.

### 3. Season service — `apps/api/src/services/admin/season.service.ts`

- `createSeason({ name, sdkSeasonId?, startDate?, endDate? })` → inserts
  `status: 'upcoming'`.
- `activateSeason(id)` → transaction: current `active` → `archived`, target →
  `active`, invalidate the active-season cache. The partial unique index is the
  backstop against a race producing two active rows.
- `archiveSeason(id)`, `listSeasons()`, `getActiveSeason()`.
- `getActiveSeasonId()` — cached accessor (60s TTL, invalidated on
  activate/archive). One indexed row; safe across instances because activation is
  rare and the TTL bounds staleness.

### 4. Discovery rewrite — `apps/api/src/services/admin/league-discovery.service.ts`

- `browseLeagues({ vorabligaOnly? })` → `sdkClient.getAllLigen()` (verband 7),
  returns pickable rows: `ligaId, liganame, skName, akName, geschlecht,
  vorabliga, liganr` (`liganr` may be `null`). `vorabligaOnly` filters
  `vorabliga === true`.
- `setSeasonLeagues(seasonId, ligaIds[])` → upserts each selected liga into
  `leagues` with `seasonId`, `vorabliga`, `isTracked: true`, keyed on
  `apiLigaId`. Untracking is **scoped to this season** (`seasonId = X AND
  apiLigaId NOT IN set`) — it never touches other seasons. This replaces today's
  global `notInArray` untrack.
- `getTrackedLeagues(seasonId?)` → season-scoped (defaults to active).
- `setLeagueOwnClubRefs(leagueId, ownClubRefs)` unchanged.
- `resolveAndSaveLeagues(liganrs)` (paste-by-number) is **removed**.

### 5. Contracts + routes + api-client

New `packages/contracts/src/season.ts` (zod, domain-noun-prefixed, re-exported
from `index.ts`):

- `createSeasonSchema` — `{ name, startDate?, endDate?, sdkSeasonId? }`
- `seasonIdParamSchema` — `{ id: coerce positive int }`
- `browseLeaguesQuerySchema` — `{ vorabligaOnly?: boolean }`
- `seasonLeaguesSchema` — `{ ligaIds: number[] }`

New admin routes in `apps/api/src/routes/admin/season.routes.ts`, all behind
`requirePermission("settings", "update")`, validated with `hono-openapi`
`validator(...)` + the shared `validationHook`:

| method + path | purpose |
|---|---|
| `GET /admin/seasons` | list seasons |
| `POST /admin/seasons` | create (upcoming) |
| `POST /admin/seasons/:id/activate` | flip live; archive prior |
| `GET /admin/seasons/:id/discover?vorabligaOnly=true` | browse SDK leagues to pick |
| `GET /admin/seasons/:id/leagues` | season's tracked leagues |
| `PUT /admin/seasons/:id/leagues` | set tracked leagues for season (by ligaId) |

Existing `apps/api/src/routes/admin/league.routes.ts`: remove the PUT-by-number
route; keep the PATCH own-club-refs route (now season-agnostic, keyed by league
id). `@dragons/api-client` gains a `seasons` endpoint group and updates its
`settings.leagues` methods. Add `*.contract.test.ts` for every new endpoint so
client/server drift fails the build (per CLAUDE.md).

### 6. Sync gating

Change the two `WHERE isTracked = true` queries to also require the league's
season to be active or upcoming:

- `apps/api/src/services/sync/data-fetcher.ts` (`fetchAllSyncData`)
- `apps/api/src/services/sync/leagues.sync.ts` (`syncLeagues`)

Both join `seasons` and filter `isTracked = true AND seasons.status IN ('active',
'upcoming')`. The live season and the prepping season sync; archived seasons stop.
No `SyncOrchestrator` (`index.ts`) changes are needed — it is driven entirely by
which leagues those two queries return. The wizard's "Sync now" button reuses the
existing `triggerManualSync()`.

### 7. Read gating — two policies

Add a shared helper `seasonScope(seasonId)` that returns a Drizzle predicate on
`leagues.seasonId`.

- **Public reads → active season only.** Apply the active-season filter to:
  `admin/standings-admin.service.getStandings`, `public/team-stats.service`,
  `public/calendar.service`, `public/home-dashboard.service`, and the public
  games list path through `admin/match-query.service.getOwnClubMatches`
  (filters own-club teams + date but not season today — own-club teams play in
  both seasons, so without this it mixes them). Single-entity reads by id
  (`public/match-context.service`, `getMatchDetail`, `getPublicMatchDetail`) are
  unaffected.
- **Admin reads → season-parameterized, default active.** `MatchListParams` and
  the admin standings view gain an optional `seasonId` that defaults to
  `getActiveSeasonId()`. This is what lets admins view and manage the upcoming
  season's game plan in the existing schedule / match tools.

### 8. Admin UI — `apps/web/src/app/[locale]/admin/seasons/`

- **Seasons list**: rows with status badges and league/game counts; "Create
  season" CTA; an Activate button per upcoming season behind a confirm dialog
  ("This archives <current> and makes <new> the live season").
- **Onboarding wizard**:
  1. Name + optional start/end dates → creates the `upcoming` season.
  2. Discover — table of leagues with checkboxes and a "vorabliga only" filter,
     columns level / age group / gender / name.
  3. Select → `PUT /admin/seasons/:id/leagues`.
  4. Sync now → `triggerManualSync`, with progress streamed via the existing sync
     SSE log.
  5. Review — leagues tracked, games pulled, count of TBD/placeholder team slots.
- **Season-context selector** in the admin shell so schedule / standings / match
  views switch season (defaults to active). The existing
  `components/admin/settings/tracked-leagues.tsx` becomes the active season's
  league list (season-scoped via `getTrackedLeagues(seasonId)`).
- New i18n keys under `settings.seasons.*` (en + de).

### 9. Public web / native

No UI change. Public read services are season-gated server-side, so standings and
games show only the active season. `seasonName` continues to flow from the league.
Native `StandingsTable` and friends are unaffected (the server does the
filtering). This is the deliberate "no public season selector" scope.

## Error handling / edge cases

- Activating a season with **zero leagues** is blocked behind a confirm (it would
  blank the public site).
- **vorabliga `seasonName` is null** in the WAM list (true for all leagues there);
  the season name is admin-provided, and `sdkSeasonId` backfills from `ligaData`
  on first sync.
- **vorabliga → finalized promotion** (the flag flips to false, possibly with a
  new `ligaId`): `leagues.sync` updates the `vorabliga` flag in place; if the
  federation mints a new `ligaId`, the admin re-runs Discover for that season to
  pick it up. Documented v1 limitation — no automatic reconciliation of
  renumbered leagues.
- Activation runs in a transaction; the partial unique index prevents two active
  seasons even under a concurrent race.
- `getActiveSeasonId()` cache is invalidated on activate/archive; the 60s TTL
  bounds staleness on other instances.

## Testing

- Migration up/down; partial-unique enforcement (a second `active` insert fails).
- `season.service`: create / activate-swap / archive / `getActiveSeason` + cache
  invalidation.
- `league-discovery`: `browseLeagues` vorabliga filter; `setSeasonLeagues` writes
  `seasonId` + `vorabliga` and scoped-untrack leaves other seasons intact.
- Sync gating: only active + upcoming leagues are fetched; archived skipped.
- Read gating: a two-season fixture asserts public reads return active-only, admin
  reads honor `seasonId` (default active), and activation flips both.
- New `*.contract.test.ts` for every season endpoint.
- Hold `apps/api` coverage at 90% branches / 95% functions/lines/statements;
  ratchet the other packages, never lower a threshold.

## Rollout sequence (each step independently shippable)

1. Schema + migration + backfill (no behavior change).
2. `season.service` + contracts + routes + api-client.
3. Sync gating (active + upcoming).
4. Read gating (public active-only; admin season param).
5. Discovery rewrite + remove paste-by-number.
6. Admin UI: seasons page + wizard + context selector.
7. Public / native verification pass.

## Out of scope (v1)

- Public-facing season selector / browsing historical seasons publicly.
- Manual fixture editing independent of the federation feed.
- Automatic reconciliation when a vorabliga promotes to a renumbered league.
- Season dimension on venues / referees / sync-runs / watch-rules / domain-events
  (they inherit season transitively via league or match; not needed for this
  flow).
