# Remove Achtel Period Handling — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove achtel (8-period) format handling from the sync service, keeping only quarters (Q1-Q4) + overtime (OT1/OT2). Games with V5-V8 data skip period extraction entirely (end result only).

**Architecture:** Strip the achtel branch from `extractPeriodScores()`, simplify `extractOvertimeDeltas()` to always use Q1-Q4, remove Q5-Q8 from interfaces/snapshot/tracking, and simplify the frontend display logic. DB columns stay in place (no migration).

**Tech Stack:** TypeScript, Vitest, Hono, Next.js, Drizzle ORM

---

### Task 1: Update `extractPeriodScores()` — remove achtel branch

**Files:**
- Modify: `apps/api/src/services/sync/matches.sync.ts:26-263`

**Step 1: Update `PeriodScores` interface — remove Q5-Q8 and `"achtel"` from type**

Replace lines 26-44:

```typescript
interface PeriodScores {
  periodFormat: "quarters" | null;
  homeQ1: number | null;
  guestQ1: number | null;
  homeQ2: number | null;
  guestQ2: number | null;
  homeQ3: number | null;
  guestQ3: number | null;
  homeQ4: number | null;
  guestQ4: number | null;
}
```

**Step 2: Rewrite `extractPeriodScores()` — remove achtel detection and branch**

Replace the entire function (lines 105-264) with:

```typescript
export function extractPeriodScores(
  game: SdkGetGameResponse["game1"] | undefined,
): PeriodScores {
  const nullScores: PeriodScores = {
    periodFormat: null,
    homeQ1: null,
    guestQ1: null,
    homeQ2: null,
    guestQ2: null,
    homeQ3: null,
    guestQ3: null,
    homeQ4: null,
    guestQ4: null,
  };

  if (!game) return nullScores;

  const validScore = (score: number | undefined) =>
    score !== undefined && score >= 0 ? score : null;

  // When V5-V8 fields are present the game uses achtel (8-period) format.
  // We don't extract per-period data for achtel — just return nulls so the
  // caller falls back to end-result only.
  const hasV5to8 =
    game.heimV5stand !== undefined ||
    game.heimV6stand !== undefined ||
    game.heimV7stand !== undefined ||
    game.heimV8stand !== undefined;

  if (hasV5to8) return nullScores;

  const hasOvertime = game.heimOt1stand >= 0 || game.gastOt1stand >= 0;

  // Standard 4-quarter format: cumulative → delta
  const cumH1 = validScore(game.heimV1stand);
  const cumG1 = validScore(game.gastV1stand);
  const cumH2 =
    validScore(game.heimV2stand) ?? validScore(game.heimHalbzeitstand);
  const cumG2 =
    validScore(game.gastV2stand) ?? validScore(game.gastHalbzeitstand);
  const cumH3 = validScore(game.heimV3stand);
  const cumG3 = validScore(game.gastV3stand);
  const cumH4 =
    validScore(game.heimV4stand) ??
    (hasOvertime ? null : validScore(game.heimEndstand));
  const cumG4 =
    validScore(game.gastV4stand) ??
    (hasOvertime ? null : validScore(game.gastEndstand));

  // Only set periodFormat if any Q data exists
  const hasAnyData =
    cumH1 != null ||
    cumG1 != null ||
    cumH2 != null ||
    cumG2 != null ||
    cumH3 != null ||
    cumG3 != null ||
    cumH4 != null ||
    cumG4 != null;

  return {
    periodFormat: hasAnyData ? "quarters" : null,
    homeQ1: cumH1,
    guestQ1: cumG1,
    homeQ2: delta(cumH2, cumH1),
    guestQ2: delta(cumG2, cumG1),
    homeQ3: delta(cumH3, cumH2),
    guestQ3: delta(cumG3, cumG2),
    homeQ4: delta(cumH4, cumH3),
    guestQ4: delta(cumG4, cumG3),
  };
}
```

**Step 3: Run tests to see what breaks**

Run: `pnpm --filter @dragons/api test -- --run`

Expected: Several tests fail (achtel tests, tests referencing Q5-Q8 fields).

**Step 4: Commit work in progress**

```bash
git add apps/api/src/services/sync/matches.sync.ts
git commit -m "Remove achtel branch from extractPeriodScores"
```

---

### Task 2: Update `extractOvertimeDeltas()` — remove achtel path

**Files:**
- Modify: `apps/api/src/services/sync/matches.sync.ts:266-342`

**Step 1: Simplify `extractOvertimeDeltas()` — always use Q1-Q4**

Replace the entire function with:

```typescript
export function extractOvertimeDeltas(
  game: SdkGetGameResponse["game1"] | undefined,
  periodScores: PeriodScores,
): OvertimeDeltas {
  const nullOt: OvertimeDeltas = {
    homeOt1: null,
    guestOt1: null,
    homeOt2: null,
    guestOt2: null,
  };

  if (!game) return nullOt;

  const cumOt1Home = game.heimOt1stand >= 0 ? game.heimOt1stand : null;
  const cumOt1Guest = game.gastOt1stand >= 0 ? game.gastOt1stand : null;
  const cumOt2Home = game.heimOt2stand >= 0 ? game.heimOt2stand : null;
  const cumOt2Guest = game.gastOt2stand >= 0 ? game.gastOt2stand : null;

  if (cumOt1Home == null && cumOt1Guest == null) return nullOt;

  // Compute regulation end by summing Q1-Q4 deltas
  const homePeriods = [
    periodScores.homeQ1,
    periodScores.homeQ2,
    periodScores.homeQ3,
    periodScores.homeQ4,
  ];
  const guestPeriods = [
    periodScores.guestQ1,
    periodScores.guestQ2,
    periodScores.guestQ3,
    periodScores.guestQ4,
  ];

  const sumOrNull = (values: (number | null)[]): number | null => {
    if (values.some((v) => v == null)) return null;
    return values.reduce<number>((s, v) => s + v!, 0);
  };

  const regEndHome = sumOrNull(homePeriods);
  const regEndGuest = sumOrNull(guestPeriods);

  return {
    homeOt1: delta(cumOt1Home, regEndHome),
    guestOt1: delta(cumOt1Guest, regEndGuest),
    homeOt2: delta(cumOt2Home, cumOt1Home),
    guestOt2: delta(cumOt2Guest, cumOt1Guest),
  };
}
```

**Step 2: Commit**

```bash
git add apps/api/src/services/sync/matches.sync.ts
git commit -m "Simplify extractOvertimeDeltas to always use Q1-Q4"
```

---

### Task 3: Update `RemoteSnapshot`, hash, tracking, and sync function — remove Q5-Q8

**Files:**
- Modify: `apps/api/src/services/sync/matches.sync.ts:53-90` (RemoteSnapshot)
- Modify: `apps/api/src/services/sync/matches.sync.ts:379-417` (snapshotToHashData)
- Modify: `apps/api/src/services/sync/matches.sync.ts:420-455` (TRACKED_FIELDS)
- Modify: `apps/api/src/services/sync/matches.sync.ts:490-523` (SNAPSHOT_DB_FIELDS)
- Modify: `apps/api/src/services/sync/matches.sync.ts:687-708` (periodFields preservation list)

**Step 1: Update `RemoteSnapshot` — remove Q5-Q8 and `"achtel"` from type**

Replace lines 53-90 with:

```typescript
interface RemoteSnapshot {
  matchNo: number;
  matchDay: number;
  kickoffDate: string;
  kickoffTime: string;
  leagueId: number | null;
  homeTeamApiId: number;
  guestTeamApiId: number;
  venueApiId: number | null;
  isConfirmed: boolean;
  isForfeited: boolean;
  isCancelled: boolean;
  homeScore: number | null;
  guestScore: number | null;
  homeHalftimeScore: number | null;
  guestHalftimeScore: number | null;
  periodFormat: "quarters" | null;
  homeQ1: number | null;
  guestQ1: number | null;
  homeQ2: number | null;
  guestQ2: number | null;
  homeQ3: number | null;
  guestQ3: number | null;
  homeQ4: number | null;
  guestQ4: number | null;
  homeOt1: number | null;
  guestOt1: number | null;
  homeOt2: number | null;
  guestOt2: number | null;
}
```

**Step 2: Update `snapshotToHashData` — remove Q5-Q8 entries**

Remove these lines from the return object:
```
    homeQ5: snapshot.homeQ5,
    guestQ5: snapshot.guestQ5,
    homeQ6: snapshot.homeQ6,
    guestQ6: snapshot.guestQ6,
    homeQ7: snapshot.homeQ7,
    guestQ7: snapshot.guestQ7,
    homeQ8: snapshot.homeQ8,
    guestQ8: snapshot.guestQ8,
```

**Step 3: Update `TRACKED_FIELDS` — remove Q5-Q8 entries**

Remove these entries:
```
  "homeQ5",
  "guestQ5",
  "homeQ6",
  "guestQ6",
  "homeQ7",
  "guestQ7",
  "homeQ8",
  "guestQ8",
```

**Step 4: Update `SNAPSHOT_DB_FIELDS` — remove Q5-Q8 entries**

Remove the same Q5-Q8 entries from `SNAPSHOT_DB_FIELDS`.

**Step 5: Update period preservation list in `syncMatchesFromData`**

Remove Q5-Q8 from the `periodFields` array (~line 687). The new list:

```typescript
              const periodFields = [
                "homeQ1",
                "guestQ1",
                "homeQ2",
                "guestQ2",
                "homeQ3",
                "guestQ3",
                "homeQ4",
                "guestQ4",
                "homeOt1",
                "guestOt1",
                "homeOt2",
                "guestOt2",
              ] as const;
```

**Step 6: Update match insert values — remove Q5-Q8**

In the create-new-match block (~line 758), remove:
```
              homeQ5: remoteSnapshot.homeQ5,
              guestQ5: remoteSnapshot.guestQ5,
              homeQ6: remoteSnapshot.homeQ6,
              guestQ6: remoteSnapshot.guestQ6,
              homeQ7: remoteSnapshot.homeQ7,
              guestQ7: remoteSnapshot.guestQ7,
              homeQ8: remoteSnapshot.homeQ8,
              guestQ8: remoteSnapshot.guestQ8,
```

**Step 7: Remove unused `writeFileSync` import if present**

Line 14: `import { writeFileSync } from "fs";` — remove if unused.

**Step 8: Commit**

```bash
git add apps/api/src/services/sync/matches.sync.ts
git commit -m "Remove Q5-Q8 from snapshot, tracking, and sync logic"
```

---

### Task 4: Update tests — remove achtel tests, add new coverage

**Files:**
- Modify: `apps/api/src/services/sync/matches.sync.test.ts`

**Step 1: Update `makeLockedRow` — remove Q5-Q8 fields**

Remove these lines from `makeLockedRow` (around line 172-175):
```
    homeQ5: null, guestQ5: null,
    homeQ6: null, guestQ6: null,
    homeQ7: null, guestQ7: null,
    homeQ8: null, guestQ8: null,
```

**Step 2: Remove the achtel sync integration test** (lines 566-618)

Delete the test: `"handles achtel period scores with delta conversion"`

**Step 3: Update `"creates new match with period score columns"` test**

Remove the assertion `expect(inserted.homeQ5).toBeNull();` (line 312) — Q5 no longer exists on the snapshot.

**Step 4: Remove achtel-specific `extractPeriodScores` tests**

Delete these tests from the `describe("extractPeriodScores")` block:
- `"handles achtel format with invalid V4 falling back to Halbzeitstand"` (line 1135)
- `"handles achtel format with invalid V8 falling back to Endstand"` (line 1166)
- `"does not derive achtel V8 from Endstand when overtime was played"` (line 1195)
- `"does not use Halbzeitstand as fallback for V2 in achtel format"` (line 1226)
- `"detects achtel when V4stand differs from Endstand (no V5-V8)"` (line 1279)
- `"does not false-detect achtel when V4 differs due to overtime"` (line 1336)
- `"extracts achtel deltas"` (line 1358)

**Step 5: Remove achtel-specific `extractOvertimeDeltas` test**

Delete the test: `"computes achtel OT deltas from regulation end (8 periods)"` (line 1396)

**Step 6: Add new test — V5-V8 present returns null period scores**

Add to the `describe("extractPeriodScores")` block:

```typescript
  it("returns null period scores when V5-V8 are present (achtel game)", () => {
    const game = makeGameDetails({
      heimV1stand: 10,
      gastV1stand: 8,
      heimV2stand: 20,
      gastV2stand: 18,
      heimV3stand: 30,
      gastV3stand: 28,
      heimV4stand: 40,
      gastV4stand: 38,
      heimV5stand: 50,
      gastV5stand: 48,
      heimV6stand: 60,
      gastV6stand: 58,
      heimV7stand: 70,
      gastV7stand: 68,
      heimV8stand: 80,
      gastV8stand: 78,
    }).game1;

    const scores = extractPeriodScores(game);
    expect(scores.periodFormat).toBeNull();
    expect(scores.homeQ1).toBeNull();
    expect(scores.guestQ1).toBeNull();
    expect(scores.homeQ4).toBeNull();
    expect(scores.guestQ4).toBeNull();
  });
```

**Step 7: Add new test — V4 differs from Endstand with OT treated as quarters**

```typescript
  it("treats V4 != Endstand as quarters when overtime is present", () => {
    // Previously this would false-detect as achtel. Now it's always quarters.
    const game = makeGameDetails({
      heimV1stand: 20,
      gastV1stand: 18,
      heimHalbzeitstand: 40,
      gastHalbzeitstand: 35,
      heimV3stand: 60,
      gastV3stand: 55,
      heimV4stand: 80,
      gastV4stand: 80,
      heimEndstand: 90,
      gastEndstand: 85,
      heimOt1stand: 90,
      gastOt1stand: 85,
    }).game1;

    const scores = extractPeriodScores(game);
    expect(scores.periodFormat).toBe("quarters");
    expect(scores.homeQ1).toBe(20);
    expect(scores.homeQ4).toBe(20); // 80 - 60
    expect(scores.guestQ4).toBe(25); // 80 - 55
  });
```

**Step 8: Add new test — OT deltas skipped when period data is null (achtel game)**

Add to `describe("extractOvertimeDeltas")`:

```typescript
  it("returns null OT when period scores are null (achtel game skipped)", () => {
    const game = makeGameDetails({
      heimV5stand: 50,
      gastV5stand: 48,
      heimOt1stand: 90,
      gastOt1stand: 86,
    }).game1;

    const periodScores = extractPeriodScores(game);
    expect(periodScores.periodFormat).toBeNull();

    const deltas = extractOvertimeDeltas(game, periodScores);
    expect(deltas.homeOt1).toBeNull();
    expect(deltas.guestOt1).toBeNull();
  });
```

**Step 9: Run tests**

Run: `pnpm --filter @dragons/api test -- --run`

Expected: All tests pass.

**Step 10: Run coverage**

Run: `pnpm --filter @dragons/api coverage`

Expected: 100% coverage thresholds met.

**Step 11: Commit**

```bash
git add apps/api/src/services/sync/matches.sync.test.ts
git commit -m "Update tests: remove achtel, add V5-V8 skip and OT coverage"
```

---

### Task 5: Update frontend `formatPeriodScores()` — remove achtel display

**Files:**
- Modify: `apps/web/src/components/admin/matches/utils.ts:27-77`

**Step 1: Simplify `formatPeriodScores` — remove achtel detection and A1-A8 labels**

Replace the function (lines 27-77) with:

```typescript
/** Format period scores as an array of [home, guest] pairs for display */
export function formatPeriodScores(match: MatchDetail): { label: string; home: number | null; guest: number | null }[] {
  if (!match.periodFormat) return [];

  const periods: { label: string; home: number | null; guest: number | null }[] = [];

  const periodKeys = ["Q1", "Q2", "Q3", "Q4"] as const;
  for (const key of periodKeys) {
    const homeKey = `home${key}` as keyof MatchDetail;
    const guestKey = `guest${key}` as keyof MatchDetail;
    periods.push({
      label: key,
      home: match[homeKey] as number | null,
      guest: match[guestKey] as number | null,
    });
  }

  if (match.homeOt1 != null || match.guestOt1 != null) {
    periods.push({ label: "OT1", home: match.homeOt1, guest: match.guestOt1 });
  }
  if (match.homeOt2 != null || match.guestOt2 != null) {
    periods.push({ label: "OT2", home: match.homeOt2, guest: match.guestOt2 });
  }

  return periods;
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/admin/matches/utils.ts
git commit -m "Simplify formatPeriodScores: remove achtel display logic"
```

---

### Task 6: Typecheck and lint

**Step 1: Run typecheck**

Run: `pnpm typecheck`

Expected: No type errors. The DB schema still has Q5-Q8 columns which is fine — they just won't be populated by the sync.

**Step 2: Run lint**

Run: `pnpm lint`

Expected: Clean (the unused `writeFileSync` import removal in Task 3 Step 7 if applicable).

**Step 3: Run full test suite**

Run: `pnpm test`

Expected: All tests pass across all packages.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "Fix typecheck and lint issues"
```

(Only if there were issues to fix.)
