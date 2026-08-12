# Per-season team entries — design

**Date:** 2026-08-12
**Status:** approved
**Glossary:** uses `CONTEXT.md` terms — Squad, Team entry, Connected league, Tracked league, Vorabliga.

## Problem

After creating a new season and picking its tracked leagues, the admin teams page showed wrong data: the U16 team connected to the U14 league, the U10 team connected to nothing, and no way to correct either. Team names can also arrive from the wrong season.

Root causes, confirmed in code:

- `teams` holds one row per squad (`api_team_permanent_id` is unique and follows the squad across seasons). There is no season dimension and no stored league connection.
- The admin page derives the league from `standings` with no season predicate: `getOwnClubTeams` picks per team the standings row whose league name sorts first alphabetically, across every season ever synced (`apps/api/src/services/admin/team-admin.service.ts`). "U14…" beats "U16…" deterministically.
- `standings` rows are never removed; a squad accumulates one row per league per season for life.
- The sync fetches active + upcoming seasons in one run and dedupes teams last-write-wins (`collectUniqueTeams` in `data-fetcher.ts`), so a squad's `name` can be overwritten by the older season's data.
- The standings sync only writes rows from the federation table (`tabelle`), which is empty for young/preliminary leagues at season start — so a new squad has no standings row and therefore no derivable league.
- `PATCH /admin/teams/:id` accepts only `customName`, `estimatedGameDuration`, `badgeColor`. There is nothing to edit: the league connection does not exist as data.

## Decisions (settled with the club admin, 2026-08-12)

1. **Team entry as its own concept.** A club team in one specific season. Everything club-facing attaches to the entry; the squad row keeps only federation-owned facts.
2. **Exactly one connected league per entry**, or none. A federation move (vorabliga → committed league) replaces the link, never adds a second one.
3. **Entries are the source of truth for team↔league on every surface** — admin, public web, native. No surface derives the connection from standings anymore.
4. **Seeded at league-picking time.** Selecting a season's tracked leagues immediately reads each league's roster from the federation and creates entries for own-club squads.
5. **Manual edits are gap-fillers.** They stick while the federation is silent; positive federation evidence supersedes them, and the supersession is logged in the sync log.
6. **Carry-forward:** badge color, estimated game duration, and display order copy from the squad's previous entry into a new season. Custom name starts empty each season — age labels are exactly the field that goes stale.
7. **Backfill all seasons**, including archived ones, from local standings evidence. No federation calls in the migration.
8. **No manual entry creation.** Seeding covers table + schedule; the edit affordance covers wrong or missing links.
9. **Untracked-league edge:** an entry whose connected league stops being tracked keeps the link and shows a warning until sync moves it.
10. The season-onboarding liga-ID-reuse hazard in `setSeasonLeagues` (upsert on `api_liga_id` alone can pull an old season's league row into a new season) is a separate issue, not part of this change.

## Schema

New table `team_entries` (`packages/db/src/schema/team-entries.ts`):

| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `team_id` | integer NOT NULL → `teams.id` | the squad |
| `season_id` | integer NOT NULL → `seasons.id` | |
| `league_id` | integer NULL → `leagues.id` | connected league; NULL = not connected |
| `link_source` | varchar(10) NOT NULL, `'seeded'` \| `'manual'` | consulted for logging and UI honesty only; federation evidence supersedes both |
| `custom_name` | varchar(50) NULL | |
| `badge_color` | varchar(20) NULL | |
| `estimated_game_duration` | integer NULL | |
| `display_order` | integer NOT NULL default 0 | per season |
| `created_at` / `updated_at` | timestamptz | |

Constraints and indexes:

- `unique(team_id, season_id)` — one entry per squad per season; single-league cardinality is enforced by `league_id` being a plain column.
- Index on `(season_id, display_order)` for the season-scoped list.

`teams` drops `custom_name`, `badge_color`, `estimated_game_duration`, `display_order` after the backfill copies them. `season_team_id` and `team_competition_id` stay on `teams` for now (consumed by referee and broadcast code); moving them to entries is recorded as debt, out of scope here.

## Seeding (league-picking time)

- Extract the roster lookup from `getLeagueTeams` (federation table, falling back to the schedule) into a shared roster-fetcher module used by both the discovery preview and seeding.
- After `setSeasonLeagues` commits its tracking transaction, seed: for each selected league, fetch the roster; for each own-club squad found, upsert the `teams` row (a brand-new squad, e.g. a first-time U10, is created here from the same `SdkTeamRef` shape the sync uses) and upsert its entry for that season pointing at that league with `link_source: 'seeded'`. Carry forward badge color, duration, and display order from the squad's most recent previous entry.
- A roster fetch failure for one league must not fail the request or the transaction: seeding reports per-league counts in the response, and the sync repairs missed entries later.

## Sync reconciliation

- The sync already fetches every tracked league of the active and upcoming seasons. For each league it derives the own-club squads present in its data (table or schedule) and upserts entries exactly like seeding does.
- Positive evidence moves a link, including over `link_source: 'manual'`; the supersession is logged to the sync log. No evidence for a squad/season → its entry is not touched, so manual gap-fillers stick.
- If one squad appears in two tracked leagues of the same season in one run: the committed league beats a vorabliga; otherwise keep the existing link and log the conflict. Deterministic in all cases.
- **Name fix:** `collectUniqueTeams` becomes season-aware. Each league's fetched data carries its season, and when two leagues supply the same squad, the newest season's `SdkTeamRef` wins the squad-row upsert.

## API contract (`@dragons/contracts`)

- `GET /admin/teams?seasonId=` → entry rows: `{ entryId, teamId, name, customName, leagueId, leagueName, leagueTracked, linkSource, badgeColor, estimatedGameDuration, displayOrder }`. `seasonId` optional, defaults to the active season.
- `PATCH /admin/teams/:entryId` → body gains `leagueId: number | null`; the route rejects a league that does not belong to the entry's season. A league write sets `link_source: 'manual'`.
- `PUT /admin/teams/order` → `{ seasonId, entryIds: number[] }` with exact-set validation against that season's entries.
- Public `GET /teams` → active-season entries. A squad without an entry this season disappears from the public list — correct: the club is not fielding it.
- `GET /teams/:id/stats` keeps its URL and response shape; `leagueName` now comes from the entry, and standings stats are read via the entry's league. A team therefore shows its league before its first game reaches the standings.
- Response shapes consumed by native and the public site do not change; those apps need no code changes.

## Admin UI

- Teams page gains the existing `season-context-select`, defaulting to the active season.
- The league cell becomes a select over that season's tracked leagues plus "Not connected". Rows whose connected league is no longer tracked show a warning badge.
- Name, color, duration editing and drag-reorder keep their behavior, now scoped to the selected season's entries.

## Migration & backfill

One Drizzle migration (DDL generated, backfill hand-written in the same migration, following the `0046` pattern):

1. Create `team_entries`.
2. Backfill entries for all seasons from local standings evidence: own-club squads × season-scoped standings rows; where a squad has standings in more than one of a season's leagues, prefer the committed league over a vorabliga. Supplement with match participation (`matches.homeTeamApiId`/`guestTeamApiId` via the league's season) for squads a league table does not list yet — this covers early-season leagues whose schedule is published but whose table is empty.
3. Copy `custom_name`, `badge_color`, `estimated_game_duration`, `display_order` from `teams` onto the active season's entries; copy color, duration, and order (not custom name) onto upcoming-season entries.
4. Drop the four moved columns from `teams`.

No federation calls. The currently broken upcoming season heals when its league selection is re-saved (seeding runs) or on the next sync.

## Testing

- PGlite integration: seeding (empty-table fallback, brand-new squad creation), reconciliation (manual supersession logged, vorabliga → committed move, same-season two-league conflict), backfill correctness, entry-scoped reorder validation.
- Regression test pinning the original bug: a squad with U14 standings in an archived season and U16 in the active season must show the U16 league.
- Name priority: `collectUniqueTeams` with the same squad in an active-season and an upcoming-season league keeps the upcoming season's name.
- Contract tests for the changed request schemas (`@dragons/contracts` + `*.contract.test.ts`).
- Web component tests: league select, warning badge, season selector default.

## Documentation obligations (docs-drift enforced)

- `AGENTS.md`: add the `team_entries` data-model row in the same commit as the schema; update the `/admin/teams` endpoint rows; if entry reconciliation becomes its own `fullSync` stage, name it in the Execution Flow block in call order.
- ADR `0004-per-season-team-entries.md` records the entry/squad split.
- File the liga-ID-reuse issue on `hb-dragons/dragons-hub` per `docs/agents/issue-tracker.md`.

## Out of scope

- Cup/Pokal competitions and any multi-league membership.
- Moving `season_team_id` / `team_competition_id` onto entries.
- The `setSeasonLeagues` liga-ID-reuse hazard (separate issue).
- Manual entry creation.
