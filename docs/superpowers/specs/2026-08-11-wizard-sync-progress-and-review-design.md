# Wizard sync progress and review summary

Closes the last two gaps between the new-season onboarding wizard and
`2026-06-24-seasons-and-new-season-onboarding-design.md` §8, steps 4 and 5.

Today step 4 renders a static spinner and step 5 prints a single "done" string.
The spec asked for streamed sync progress and a review showing leagues tracked,
games pulled, and the count of TBD/placeholder team slots.

## Background: placeholder slots leave no trace in our tables

The federation publishes fixtures whose teams are not yet decided as a team ref
with `teamPermanentId: 0` and the name `TBD`. Two stages drop them:

- `data-fetcher.ts` keys collected teams on a truthy `teamPermanentId`, so a
  placeholder is never written to `teams`. It already logs each one as a
  `"Match has null/zero homeTeam (TBD slot)"` warning, which is where the name
  used here comes from.
- `matches.sync.ts` skips whole any match naming a team id it cannot find in
  `teams`, because `matches.homeTeamApiId` / `guestTeamApiId` are non-deferrable
  foreign keys and writing one would abort the per-match transaction (issue
  #133).

So neither `teams` nor `matches` records that a slot exists. The count cannot be
derived from our own database and has to come from the federation payload.

This also means **`gameCount` under-reports the federation's schedule** by
exactly the fixtures that were skipped. The placeholder count is the explanation
for that shortfall, which is the reason it belongs in the review rather than
being dropped.

Note for future readers: `LeagueTeam.clubId` is typed `number | null`, but
`SdkTeamRef.clubId` is a plain `number`, so `clubId === null` does not identify a
placeholder. The marker is `teamPermanentId === 0`.

## 1. API — `GET /admin/seasons/:id/summary`

New service `getSeasonSummary(seasonId)` in
`apps/api/src/services/admin/season.service.ts`, returning:

```ts
interface SeasonSummary {
  leagueCount: number;
  gameCount: number;
  /** null when the federation could not be read — see failure handling. */
  placeholderSlots: number | null;
}
```

- `leagueCount` / `gameCount` come from one DB query scoped to the single
  season, using the same `seasons → leagues → matches` joins as `listSeasons`.
  `listSeasons` is not reused: the wizard needs one season, and re-fetching every
  season to read one row is the cost this endpoint exists to avoid.
- `placeholderSlots` iterates the season's tracked leagues
  (`seasonRefId = :id AND isTracked`), calls `sdkClient.getSpielplan(ligaId)` for
  each, and counts home and guest **positions** with `teamPermanentId === 0`.

Counting positions rather than distinct teams is deliberate: an admin acts on
"how many fixture slots are still unassigned", and that number is what lines up
with the shortfall in `gameCount`.

### Failure handling

If any league's `getSpielplan` call fails, `placeholderSlots` is `null` and the
UI reports it as unavailable. A partial count would be indistinguishable from a
genuinely low one, and reading "2 slots pending" when the real answer is unknown
is worse than reading nothing.

`leagueCount` and `gameCount` are pure database reads and still return during a
federation outage.

### Wiring

- Route in `apps/api/src/routes/admin/season.routes.ts` behind the existing
  `settingsUpdate` permission, validated with the existing
  `seasonIdParamSchema`. No new contract: the endpoint takes no body and no
  query.
- `api.seasons.summary(id)` in `@dragons/api-client`.
- `SeasonSummary` exported from `packages/shared/src/seasons.ts`.
- Row added to the `AGENTS.md` endpoint table in the same commit —
  `docs-drift.test.ts` compares the table against the Hono route tree in both
  directions.

## 2. Web — wizard steps 4 and 5

`apps/web/src/components/admin/seasons/season-wizard.tsx`.

New state: `syncRunId`, `summary`, and `tracked` (captured from the
`setSeasonLeagues` response, which the wizard currently discards).

### Commit flow

`confirm()` becomes: create season → `setLeagues` (keep the result) →
`setStep("syncing")` → `api.sync.trigger()`, **storing the returned
`syncRunId`** rather than discarding it. The `mutate` and `setStep("done")` calls
move out of `confirm()` into the completion handler.

If `trigger()` fails, the existing toast fires and the wizard advances straight
to `done`: the season and its leagues are saved, so the review shows leagues
tracked with games and placeholders unavailable.

### Step 4 — streamed progress

Renders `<SyncLiveLogs syncRunId onComplete={...} />` unchanged, with
`DialogContent` widened for this step. The component is shared with the sync
dashboard and is not modified.

`onComplete` does **not** advance the wizard. The SSE `complete` event can fire
before the job has started processing — the reason the dashboard confirms
separately through `SyncCompletionWatcher`. Instead the handler starts polling
`api.sync.logs()` for the tracked run id and waits for a status that is neither
`running` nor `pending`, the same terminal condition the watcher uses. There is
no per-run detail endpoint, and the list is the existing pattern.

On terminal: fetch `api.seasons.summary(id)`, `mutate(SWR_KEYS.seasons)`,
`setStep("done")`.

The wizard polls locally rather than reusing `useSyncLogs`, which depends on
`SyncRunProvider` — the wizard lives on `/admin/seasons`, outside that provider.

### Step 5 — review

Leagues tracked, games pulled, and placeholder slots. When placeholder slots are
non-zero the UI adds a line explaining that the federation has not yet assigned
those fixtures' teams, which is why the game count is lower than the published
schedule. When `null`, the figure reads as unavailable.

### Close guard

The guard at `onEscapeKeyDown` / `onInteractOutside` currently blocks while
`submitting` is true. A full sync runs for minutes, so extending that across
step 4 would trap the admin in a modal with no exit.

The guard narrows to the commit window only — create → `setLeagues` →
`trigger` — during which an interruption would orphan a just-created season.
Closing during the sync is harmless: the season and leagues are committed and the
sync continues server-side. The existing `openRef` pattern already stops async
handlers writing state into a closed dialog.

New i18n keys under `settings.seasons.wizard.*`, en and de.

## 3. Testing

**API** — PGlite integration tests for `getSeasonSummary`: counts for a seeded
season, scoping to tracked leagues only, placeholder counting from a stubbed
Spielplan, and `null` when an SDK call throws. Plus a route test for auth and
the 404 path.

**Web** — wizard tests for: `syncRunId` captured from `trigger()`; the wizard
staying on step 4 when the SSE completes while the run is still `running`;
advancing once the run reaches a terminal status; the `trigger()` failure path;
and the dialog being closable during syncing but not during commit.

Per `CLAUDE.md`, no Testing Library `waitFor` paired with `vi.useFakeTimers()` —
the clock advances inside `act`.

## 4. Out of scope

Items 1c and 1d from the handoff — the duplicated league-selection state between
the wizard and the manage-leagues dialog, the `setLeaguesState` rename, the
`seasonId` / `seasonName` / `seasonRefId` data clump, and season renaming. None
of them block these two steps.
