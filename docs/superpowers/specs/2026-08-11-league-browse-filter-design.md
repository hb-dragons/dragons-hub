# League browse filter — design

**Date:** 2026-08-11

## Problem

Leagues the club plays in are missing from the season league picker. The
operator reports that only the Regionalliga leagues are visible, and that the
missing leagues **are no longer flagged `vorabliga`** in the federation system.

Nine league numbers were supplied from the official system:

```
4102  4039  4015  41010  42080  44012  45010  46011  2007
```

`2007` (Regionalliga) is visible today; the `4xxxx` family is not.

## Cause

Both league-picker call sites hardcode the vorabliga filter:

- `apps/web/src/components/admin/seasons/manage-leagues-dialog.tsx:51` —
  `api.seasons.discover(seasonId, { vorabligaOnly: true, ownClubOnly: clubOnly })`
- `apps/web/src/components/admin/seasons/season-wizard.tsx:159` —
  `api.seasons.browse({ vorabligaOnly: true, ownClubOnly: clubOnly })`

`browseLeagues` then keeps a league only if it is flagged `vorabliga` **or** its
`skName` contains "regionalliga"
(`apps/api/src/services/admin/league-discovery.service.ts:22-24, 45-47`).

So once the federation clears a league's `vorabliga` flag, that league disappears
from both pickers. Regionalliga leagues survive only because of the
`isOnboardableTopTier` escape hatch — which is exactly the observed symptom.

`LeaguePicker` exposes an "own club only" switch but no vorabliga switch, so
there is no way to turn the filter off from the UI. The API already supports it:
`browseLeaguesQuerySchema` accepts `vorabligaOnly`, and both routes pass it
through untouched. Only the two web call sites are at fault.

This is a filter defect, not a missing feature. A manual "add league by number"
feature was considered and is **not** in scope — see Phase 2.

## Phase 1 — make the vorabliga filter a control

### Contract and API: no change

`browseLeaguesQuerySchema.vorabligaOnly` is already optional
(`packages/contracts/src/season.ts:22`) and `browseLeagues` treats a falsy value
as "no filter". Omitting the parameter already yields the unfiltered list.

No new route, no new contract schema, no `AGENTS.md` endpoint-table row, and no
`docs-drift.test.ts` churn.

### `LeaguePicker`

Add two props alongside the existing own-club pair:

- `vorabligaOnly: boolean`
- `onVorabligaOnlyChange: (v: boolean) => void`

Render as a second `Switch` beside the existing one. The component stays
presentational — it owns no filter state today and must not start owning any.

### Call sites diverge on their default

- **`season-wizard.tsx`** — initial state stays `true`. New-season onboarding
  runs while leagues are still preliminary, so that default is correct. The
  switch only makes it overridable.
- **`manage-leagues-dialog.tsx`** — initial state becomes `false`, and the
  `vorabligaOnly: true` literal at line 51 is replaced by the state value.
  Mid-season the leagues being added are committed ones by definition. This is
  the change that surfaces the eight missing leagues.

Toggling re-runs the existing `load()` path, exactly as the own-club switch does
today.

### The second filter

`ownClubOnly` also defaults to `true` in both components
(`manage-leagues-dialog.tsx:35`, `season-wizard.tsx:80`) and intersects the
browse result against `getClubMatches` by `ligaId`. When verifying, turn **both**
switches off before concluding a league is absent from the federation's list.

### Tests

- `LeaguePicker` renders both switches and fires the callback on toggle.
- `ManageLeaguesDialog` does not send `vorabligaOnly: true` on open, and
  re-requests when the switch is toggled.
- `SeasonWizard` still requests with `vorabligaOnly: true` on open.

Existing manage-dialog tests that assert the current call shape will need
updating. That is the intended behaviour change, not a regression.

### i18n

One new key for the switch label, added to **both** `en.json` and `de.json`
(`pnpm check:i18n` enforces the pair).

## Phase 2 — gate, not a task

After Phase 1 ships, open the manage dialog with **both** switches off and check
the nine numbers above.

- **All nine appear** → done. Phase 2 is dropped, and the manual-add-by-Liganr
  feature is dropped with it.
- **The `4xxxx` family is still missing** → the cause is
  `verbandIds: number[] = [7]` at `apps/api/src/services/sync/sdk-client.ts:348`,
  which every caller leaves at its default. Any league administered by another
  regional association is invisible regardless of other filters. Widen it — to a
  fixed list or a setting — as a follow-up.

This is decided from observed output, not guessed now.

## Out of scope

**Manual league add by Liganr.** The original request was to type a league number
and track it. Two facts make it the wrong first move:

- `leagues.ligaNr` is `notNull` but **not unique**
  (`packages/db/src/schema/leagues.ts:14`), and no SDK method takes a Liganr.
  `getSpielplan`/`getTabelle` take a `competitionId`, which is the federation's
  `ligaId` (`apiLigaId`). Resolving Liganr → ligaId requires matching against
  `getAllLigen()` — the very list a manual path would exist to bypass.
- `setSeasonLeagues` resolves every selected league's metadata from
  `getAllLigen()` and silently drops unknown ids
  (`league-discovery.service.ts:77-79`), and replaces the season's tracked set as
  a whole. A manually added league would need to survive later wizard and dialog
  saves or be untracked on the next edit.

If Phase 2's gate says the federation genuinely will not return these leagues,
revisit — but a manual path is a large feature standing in for a one-line filter
fix, and should not be built on a guess.

## Known duplication (noted, not addressed)

League-selection state is duplicated between `season-wizard.tsx` and
`manage-leagues-dialog.tsx`, and there is a `seasonId`/`seasonName`/`seasonRefId`
data clump. Phase 1 touches this area but deliberately leaves the duplication
alone: the change is two initial-state values and a prop pair, and folding in a
refactor would make a small, verifiable fix hard to review.
