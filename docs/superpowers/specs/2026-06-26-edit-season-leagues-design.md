# Edit an upcoming season's tracked leagues (add / remove) with team preview

Date: 2026-06-26
Status: Approved (brainstorming) — pending implementation plan

## Problem

Leagues are chosen once, in the create-season wizard
(`apps/web/src/components/admin/seasons/season-wizard.tsx`). After a season exists there is no
way to add or remove a league. Operators need to correct the tracked set — e.g. when the federation
publishes a new preliminary (vorabliga) league for one of the club's teams, or when the wrong league
was picked. Identifying the *correct* league is hard from the league name alone, so the picker needs
to show the teams in each league.

## Scope (decisions taken during brainstorming)

- **Where:** a "Manage leagues" dialog opened from each **upcoming** season row in
  `seasons-list.tsx`. Only `upcoming` seasons are editable; `active` and `archived` are not.
- **Finding the right league:** expand a league row to reveal its team roster (lazy-loaded). The
  club's own team is highlighted. A global "search a team by name across the federation" is **out of
  scope and not feasible** — the only federation freetext endpoint (`/rest/club/freetext`,
  authenticated) is self-scoped and returns only our own club, so there is no general team/club
  directory search.
- **On save:** trigger a sync (best-effort), mirroring the wizard. Removed leagues are only
  untracked; their already-synced data is left in place (an upcoming season has little to none).
- **Club filter:** the picker keeps the existing "Only my club's leagues" toggle (default on),
  reused from the wizard. Browse stays `vorabligaOnly` — unchanged from today.

## Federation facts (verified live, 2026-06-26)

- `getTabelle(ligaId)` returns the league's standings entries, each with
  `team.{teamPermanentId, teamname, clubId}`. For a vorabliga the table already lists the assigned
  teams (8–12), including placeholder slots with `clubId: null` (`"Platzhalter N"`).
- `getSpielplan(ligaId)` returns matches with `homeTeam`/`guestTeam` (`SdkTeamRef`, same `clubId`).
  Used as a fallback when the table has no entries.
- These are the source for "teams per league". Confirmed against the club's four vorabligas
  (`54141/54144/54147/54149`); the own team (`clubId 4121`) appears in each.

## Architecture

### Backend — list a league's teams (new)

- **Service** `getLeagueTeams(ligaId: number)` in
  `apps/api/src/services/admin/league-discovery.service.ts`:
  - call `sdkClient.getTabelle(ligaId)`; collect teams from `entries[].team`.
  - if no entries, fall back to `sdkClient.getSpielplan(ligaId)` and collect from `homeTeam`/`guestTeam`.
  - de-duplicate by `teamPermanentId`.
  - return `LeagueTeamsResponse = { teams: LeagueTeam[] }` where
    `LeagueTeam = { teamPermanentId: number; name: string; clubId: number | null; isOwnClub: boolean }`,
    `isOwnClub = clubId !== null && clubId === (await getClubConfig())?.clubId`.
  - placeholder entries (`clubId: null`) are included as-is (they convey open slots); never own-club.
- **Types** in `@dragons/shared`: `LeagueTeam`, `LeagueTeamsResponse`.
- **Route** `GET /admin/leagues/:ligaId/teams` in `apps/api/src/routes/admin/league.routes.ts`,
  guarded by the existing `requirePermission("settings", "update")`. New `ligaIdParamSchema`
  (`{ ligaId: z.coerce.number().int().positive() }`) in `@dragons/contracts` (federation ligaId,
  distinct from the existing DB-id `leagueIdParamSchema`).

### Backend — reused unchanged

- `PUT /admin/seasons/:id/leagues` → `setSeasonLeagues(seasonId, ligaIds)` is the add/remove
  primitive: it tracks the listed leagues and scoped-untracks that season's previously-tracked
  leagues not in the list. No change needed.
- `GET /admin/seasons/:id/leagues` → `getTrackedLeagues(seasonId)` — current set.
- `GET /admin/seasons/:id/discover?vorabligaOnly&ownClubOnly` → `browseLeagues(...)` — candidates,
  each carrying `alreadyTracked` for that season.

### api-client

- Add `seasons.leagueTeams(ligaId: number): Promise<LeagueTeamsResponse>` →
  `GET /admin/leagues/:ligaId/teams`.
- `setLeagues`, `getLeagues`, `discover` already exist.

### Web — shared `LeaguePicker` + `ManageLeaguesDialog`

- **Extract `LeaguePicker`** from the wizard's `step === "select"` block into
  `apps/web/src/components/admin/seasons/league-picker.tsx`. Props (sketch): `leagues`,
  `selected: Set<number>`, `onToggle(ligaId, checked)`, `filter`, `onFilterChange`,
  `ownClubOnly`, `onOwnClubOnlyChange`, `loading`. It owns: search box, club Switch, selected-count
  badge, checkbox list, and the **per-row team expander** (lazy `leagueTeams(ligaId)` via SWR keyed
  by ligaId, own team highlighted, spinner while loading). The wizard renders it and gains team
  previews for free.
- **`ManageLeaguesDialog`** (new) in `apps/web/src/components/admin/seasons/manage-leagues-dialog.tsx`:
  - props `{ seasonId: number; open: boolean; onOpenChange(v): void }`.
  - on open: `getLeagues(seasonId)` → seed the checked set (by federation ligaId);
    `discover(seasonId, { vorabligaOnly: true, ownClubOnly })` → candidates.
  - **Merge**: union the discover candidates with the currently-tracked leagues so a tracked league
    that the active filter would hide still appears (checked) and remains removable.
  - renders `LeaguePicker`; Save → `setLeagues(seasonId, { ligaIds: [...selected] })` →
    `sync.trigger()` (best-effort, toast on failure like the wizard) → revalidate `SWR_KEYS.seasons`
    and the season's leagues → close.
- **`seasons-list.tsx`**: add a "Manage leagues" button on rows where `status === "upcoming"`,
  opening the dialog for that season id.

## Data flow

1. Operator clicks "Manage leagues" on an upcoming season.
2. Dialog loads current tracked set + discover candidates, merges, pre-checks tracked.
3. Operator toggles leagues; expands any league to confirm by its roster.
4. Save → `setSeasonLeagues` reconciles (adds checked, untracks unchecked) → sync triggered.

## Error handling

- Teams fetch failure: row shows an inline error/retry; does not break the dialog.
- Discover/getLeagues failure on open: toast + keep dialog usable (or close, matching wizard's
  discover-failure pattern).
- Save failure: toast; dialog stays open so the operator can retry. Sync-trigger failure is a
  non-fatal toast (leagues are already saved), same as the wizard.

## Testing

- **Service** (`league-discovery.service.test.ts`): `getLeagueTeams` — table path, spielplan
  fallback when table empty, dedupe by `teamPermanentId`, `isOwnClub` marking, placeholder handling.
- **Route + contract**: `GET /admin/leagues/:ligaId/teams` happy path + invalid param 400;
  `ligaIdParamSchema` coercion test.
- **api-client contract**: `leagueTeams` hits the right path; response typing.
- **Web**: `ManageLeaguesDialog` — seeds checked set from `getLeagues`, add/remove produces
  `setLeagues` with the merged ligaId list, expanding a row renders teams (own team highlighted),
  Save triggers `sync.trigger`, save-failure keeps the dialog open. `LeaguePicker` extraction keeps
  existing `season-wizard.test.tsx` green (adjust selectors if needed).
- Coverage gates per package must stay green (`apps/api` is the high bar).

## Out of scope / YAGNI

- Editing `active`/`archived` season leagues.
- Deleting a removed league's already-synced data.
- Global team/club search (federation does not support it).
- Bulk "import all my club's leagues" — separate idea, declined.

## Files touched (summary)

- `packages/contracts/src/league.ts` (+ `index.ts`): `ligaIdParamSchema`.
- `packages/shared/src/...`: `LeagueTeam`, `LeagueTeamsResponse`.
- `apps/api/src/services/admin/league-discovery.service.ts`: `getLeagueTeams`.
- `apps/api/src/routes/admin/league.routes.ts`: `GET /admin/leagues/:ligaId/teams`.
- `packages/api-client/src/endpoints/seasons.ts`: `leagueTeams`.
- `apps/web/src/components/admin/seasons/league-picker.tsx` (new, extracted),
  `manage-leagues-dialog.tsx` (new), `season-wizard.tsx` (use picker),
  `seasons-list.tsx` (button), messages `en.json`/`de.json`.
- `AGENTS.md`: add the new endpoint.
