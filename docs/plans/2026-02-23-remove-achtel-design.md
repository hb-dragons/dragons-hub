# Design: Remove Achtel Period Handling

**Date**: 2026-02-23
**Status**: Approved

## Problem

The achtel (8-period) detection in `extractPeriodScores()` misidentifies quarters+overtime games as achtel format. The `v4DiffersFromEnd` heuristic fires when V4 != Endstand, even for legitimate overtime games where the "consistent overtime" check fails due to SDK data formatting.

A game with Q1, Q2, Q3, Q4, OT gets detected as achtel, OT values are interpreted as achtel periods 5-8, and real overtime data is lost.

## Decision

**Approach A: Detect achtel only via V5-V8 presence.**

- V5-V8 fields present in SDK response -> achtel -> null period data (end result only)
- Everything else -> quarters -> extract Q1-Q4 + OT
- Remove the `v4DiffersFromEnd` heuristic entirely

Trade-off: partial achtel games (no V5-V8 from SDK) get Q1-Q4 containing achtel periods 1-4 mislabeled as quarters. Accepted as a known limitation for now.

## Changes

### `apps/api/src/services/sync/matches.sync.ts`

**`extractPeriodScores()`**:
- Remove `v4DiffersFromEnd`, `hasConsistentOvertime` checks
- Keep `hasV5to8` check: when true, return null period scores (skip extraction)
- Keep quarters path unchanged (Q1-Q4 with halftime/endstand fallbacks)
- `periodFormat` returns `"quarters"` or `null`, never `"achtel"`
- `hasOvertime` check remains for the Q4 endstand-fallback guard

**`extractOvertimeDeltas()`**:
- Remove achtel branch (Q1-Q8 sum for regulation end)
- Always compute regulation end from Q1-Q4
- Remove "achtel with incomplete data -> skip OT" guard

**Interfaces**: Remove Q5-Q8 from `PeriodScores`, `RemoteSnapshot`. Remove `"achtel"` from `periodFormat` type.

**Hash/tracking**: Remove Q5-Q8 from `snapshotToHashData`, `TRACKED_FIELDS`, `SNAPSHOT_DB_FIELDS`.

### `packages/db/src/schema/matches.ts`

No migration. Q5-Q8 columns stay in the table. Sync stops populating them (null).

### `apps/web/src/components/admin/matches/utils.ts`

- Remove achtel detection (Q5-Q8 check, negative OT workaround)
- Always display Q1-Q4 + OT when available
- Remove "A1-A8" labels

### `apps/api/src/services/admin/match-admin.service.ts`

No changes needed. Q5-Q8 remain in queries (just null).

### `apps/api/src/services/sync/matches.sync.test.ts`

- Remove achtel extraction tests
- Add test: V5-V8 present -> null period data
- Keep/verify: quarters + OT tests
- Add test: V4 != Endstand with OT -> treated as quarters (not achtel)
