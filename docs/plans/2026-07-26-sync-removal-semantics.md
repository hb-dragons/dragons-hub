# Sync removal semantics

Decision record for issue #105 (parent #92). Before this, sync only ever inserted
or updated: nothing was removed when an entity disappeared from the federation
feed. A referee dropped from a slot upstream left its `match_referees` row
behind while `matches.srNOpen` flipped to `true`, so the same slot read as open
*and* assigned, and nobody was told the slot had reopened.

## Decision

### 1. Soft delete, not hard delete

Entities that vanish from the feed are **tombstoned**, never deleted. Two new
nullable columns carry the tombstone:

| Table | Column |
| --- | --- |
| `match_referees` | `removed_at timestamptz` |
| `referee_games` | `removed_at timestamptz` |

Reasons: the assignment history behind a `referee.unassigned` notification stays
auditable; a bad removal is recoverable with an `UPDATE`; and referee workload
history is not silently rewritten.

`match_referees` previously had a plain unique constraint on
`(match_id, slot_number)`. That is now a **partial** unique index with
`WHERE removed_at IS NULL`, so a slot can be filled, vacated and refilled
without the tombstone blocking the new row. Migration:
`packages/db/drizzle/0041_heavy_killraven.sql`.

Every read path filters `removed_at IS NULL`. Reads that were left alone are
listed under "Deferred" below.

### 2. Absence only counts when the fetch is verifiably complete

This is the dangerous half of the feature: a truncated, rate-limited or
partially failed response looks exactly like "everything was removed". Three
independent gates live in `apps/api/src/services/sync/removal-guard.ts`, and a
row has to clear all three.

**Gate 1 — per-entity evidence.** An entity is only a removal candidate if its
own payload came back and is structurally intact. For referee assignments that
means the match's game-details response carries `game1` plus all three `srN`
slots, each with a boolean `offenAngeboten` and a present `spielleitung` key
(`isUsableGameDetail`). `spielleitung: null` is the federation saying "nobody is
on this slot"; a missing `sr1` key is the transport saying "I did not finish".
A match whose details never arrived is never a candidate, however healthy the
rest of the run looks.

**Gate 2 — run completeness.** Matched to how each feed is fetched:

- *Referee assignments* come from `getGameDetailsBatch`, which swallows
  per-match failures, so the only signal is a short `gameDetails` map.
  `evaluateFetchCoverage` requires `observed / requested >= 0.9`
  (`MIN_FETCH_COVERAGE`). Below that the run is treated as partial and **no**
  removals happen at all. The 90% floor means a couple of flaky detail fetches
  do not freeze removal forever, while a truncated batch stops it dead.
- *Referee games* come from a paginated `offenespiele` search that declares a
  `total`. `evaluatePageCompleteness` requires `received === total` and
  `total > 0` — a missing page is indistinguishable from a withdrawal, so it
  blocks. An empty feed is never read as "everything was withdrawn".

**Gate 3 — blast radius.** `evaluateRemovalBlastRadius` is a circuit breaker for
a feed that returns 200 OK with a plausible-looking but wrong body. Removal sets
of `MASS_REMOVAL_FLOOR` (10) rows or fewer always pass; above that, a set larger
than `MASS_REMOVAL_RATIO` (50%) of the live rows aborts the whole pass and logs
an error into the sync run.

Referee games carry one extra safeguard: only games kicking off **today or
later** (Berlin calendar day, timezone-pinned via `berlinDateString`) are
candidates. Past games roll off the federation search by design, and tombstoning
them would erase referee history.

### 3. Events and jobs on removal

| Trigger | Emitted | Also |
| --- | --- | --- |
| `match_referees` row tombstoned | `referee.unassigned` | `match_changes` entry `referee_slot_N`: old value → `null` |
| …and the federation now flags that slot open, on one of our club's SR1/SR2 slots | `referee.slots.needed` | re-advertises the vacated slot |
| `referee_games` row tombstoned | `match.removed` | `cancelReminderJobs(apiMatchId)` |

`EVENT_TYPES.MATCH_REMOVED` already had a rendered template and was documented
as supported; this is the first code path that emits it.

The re-advertisement reuses the `refereeGames` row id as the event's `entityId`,
matching what `referee-games.sync.ts` already uses. The notification pipeline
coalesces on `type:entityType:entityId`, so the two paths collapse into one
notification instead of double-notifying for the same game.

### 4. A slot can no longer be open *and* assigned

`RefereeSlotInfo` in `packages/shared/src/matches.ts` is now a discriminated
union rather than three independent fields:

```ts
type RefereeSlotInfo =
  | (Base & { isOpen: true;  referee: null; role: null })
  | (Base & { isOpen: false; referee: RefereeSlotReferee | null; role: RefereeSlotRole | null });
```

A caller cannot construct the contradictory shape, so the bug cannot reappear at
another call site. The wire shape is unchanged.

Where both signals disagree at runtime, the live `match_referees` row wins and
the slot reports `isOpen: false`. The row is now actively maintained — sync
tombstones it as soon as a complete fetch stops reporting that referee — whereas
`matches.srNOpen` only mirrors the federation's `offenAngeboten` flag, which can
lag behind.

## Deferred (follow-up issue)

Not implemented here, tracked separately:

- Removal handling for **matches** withdrawn from the Spielplan and for
  **standings** rows whose team left a league.
- `removed_at IS NULL` filtering in `referee-history.service.ts`. It reports on
  past games, which the kickoff-date cutoff never tombstones, so it is currently
  unaffected in practice.
- A dedicated `removed` value in `ENTRY_ACTIONS`. Tombstone entries are logged
  as `updated` today (literally true — `removed_at` is set), with the removal
  spelled out in the message, because adding an action value needs matching web
  icon/colour/i18n work.
