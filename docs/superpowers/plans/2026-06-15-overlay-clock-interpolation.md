# Overlay Clock Interpolation + Leaner Broadcast Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live-stream overlay's SSE stream fire only on real state changes and interpolate both clocks locally, while removing two redundant DB reads per publish.

**Architecture:** Server-side, gate the broadcast publish in `processIngest` behind a pure `broadcastRelevantChange` predicate and thread the already-loaded config + decoded row into `buildBroadcastState` (skipping its two SELECTs). Add a derived `clockMs` to the broadcast payload. Client-side, the overlay anchors on `performance.now()` per SSE event and interpolates the game + shot clock at ~100 ms from the reliable `clockRunning` flag, formatting tenths locally and freezing/dimming after a 30 s event gap. The raw `/scoreboard` channel, `DEDUPE_KEYS`, snapshot history, and DB schema are untouched.

**Tech Stack:** Hono + Drizzle (API), Vitest with a real test Postgres (`setupTestDb`) for API tests and `happy-dom` + `@testing-library/react` for web tests, Next.js App Router (overlay).

**Spec:** `docs/superpowers/specs/2026-06-15-overlay-clock-interpolation-design.md`

**Branch:** `feat/overlay-clock-interpolation` (already created; the spec is committed there).

---

## File Structure

- `packages/shared/src/scoreboard.ts` — add `clockMs` to `PublicLiveSnapshot` (Task 1).
- `apps/api/src/services/broadcast/clock-ms.ts` (new) — pure `deriveClockMs` (Task 1).
- `apps/api/src/services/broadcast/publisher.ts` — set `clockMs` in `rowToScoreboard`; accept injected `config`/`scoreboardRow` in `buildBroadcastState` + `publishBroadcastForDevice` (Tasks 1, 3).
- `apps/api/src/services/scoreboard/broadcast-change.ts` (new) — pure `broadcastRelevantChange` (Task 2).
- `apps/api/src/services/scoreboard/ingest.ts` — full config select, gate publish, pass injected args (Task 4).
- `apps/web/src/app/[locale]/overlay/clock-interpolation.ts` (new) — pure interpolation/format/stale helpers (Task 5).
- `apps/web/src/app/[locale]/overlay/overlay-client.tsx` — anchor + interval + interpolated render (Task 6).
- Co-located `*.test.ts(x)` for each new/changed unit.

---

### Task 1: `clockMs` on the payload, derived

**Files:**
- Create: `apps/api/src/services/broadcast/clock-ms.ts`
- Create: `apps/api/src/services/broadcast/clock-ms.test.ts`
- Modify: `packages/shared/src/scoreboard.ts` (add field to `PublicLiveSnapshot`)
- Modify: `apps/api/src/services/broadcast/publisher.ts` (`rowToScoreboard`)
- Modify: `apps/api/src/services/broadcast/publisher.test.ts` (assert field present)
- Modify: `apps/web/src/app/[locale]/overlay/score-bug.test.tsx` (snapshot helper gains `clockMs`)

- [ ] **Step 1: Write the failing test for `deriveClockMs`**

Create `apps/api/src/services/broadcast/clock-ms.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveClockMs } from "./clock-ms";

describe("deriveClockMs", () => {
  it("converts MM:SS to whole ms", () => {
    expect(deriveClockMs("08:17", 497)).toBe(497_000);
    expect(deriveClockMs("10:00", 600)).toBe(600_000);
  });

  it("recovers sub-minute tenths from SS.t", () => {
    expect(deriveClockMs("42.7", 42)).toBe(42_700);
    expect(deriveClockMs("9.0", 9)).toBe(9_000);
  });

  it("falls back to clockSeconds when text is unparseable", () => {
    expect(deriveClockMs("--:--", 12)).toBe(12_000);
    expect(deriveClockMs("--:--", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @dragons/api test -- clock-ms`
Expected: FAIL — `deriveClockMs` is not defined / module missing.

- [ ] **Step 3: Implement `deriveClockMs`**

Create `apps/api/src/services/broadcast/clock-ms.ts`:

```ts
/**
 * Whole milliseconds remaining on the game clock, recovered from the decoded
 * display text. `clockSeconds` is floored to whole seconds by the decoder, so
 * the sub-minute tenths only survive in `clockText` ("SS.t"). Used to seed the
 * overlay's client-side interpolation; derived here so no DB column or decoder
 * change is needed.
 */
export function deriveClockMs(
  clockText: string,
  clockSeconds: number | null,
): number | null {
  if (clockText.includes(":")) {
    const [mm, ss] = clockText.split(":");
    const m = Number(mm);
    const s = Number(ss);
    if (Number.isFinite(m) && Number.isFinite(s)) return (m * 60 + s) * 1000;
  } else if (clockText.includes(".")) {
    const [whole, tenth] = clockText.split(".");
    const w = Number(whole);
    const t = Number(tenth);
    if (Number.isFinite(w) && Number.isFinite(t)) return w * 1000 + t * 100;
  }
  return clockSeconds != null ? clockSeconds * 1000 : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test -- clock-ms`
Expected: PASS (3 tests).

- [ ] **Step 5: Add `clockMs` to the payload type**

In `packages/shared/src/scoreboard.ts`, inside `interface PublicLiveSnapshot extends StramatelSnapshot`, add after `secondsSinceLastFrame`:

```ts
  /** Whole ms remaining on the game clock; seeds overlay interpolation. */
  clockMs: number | null;
```

- [ ] **Step 6: Set `clockMs` in `rowToScoreboard`**

In `apps/api/src/services/broadcast/publisher.ts`, add the import near the top:

```ts
import { deriveClockMs } from "./clock-ms";
```

In `rowToScoreboard`, add to the returned object (after `secondsSinceLastFrame: seconds,`):

```ts
    clockMs: deriveClockMs(row.clockText, row.clockSeconds),
```

- [ ] **Step 7: Keep web + API test fixtures compiling**

In `apps/web/src/app/[locale]/overlay/score-bug.test.tsx`, add `clockMs` to the `snapshot()` helper's base object (after `clockText: "08:17",`):

```ts
    clockMs: 497_000,
```

In `apps/api/src/services/broadcast/publisher.test.ts`, find an existing assertion block that inspects a built `state.scoreboard` and add (or add a new `it`) asserting the field is derived. If the file already builds a live row with `clockText`, add near an existing scoreboard assertion:

```ts
    expect(state.scoreboard?.clockMs).toBe(600_000); // for a "10:00" / clockSeconds 600 row
```

(Match the clockText/clockSeconds the surrounding test seeds; adjust the literal accordingly.)

- [ ] **Step 8: Run the affected suites**

Run: `pnpm --filter @dragons/api test -- publisher clock-ms`
Run: `pnpm --filter @dragons/web test -- score-bug`
Run: `pnpm --filter @dragons/shared build`
Expected: PASS. If the web test fails to find `clockMs`, confirm Step 7 was applied.

- [ ] **Step 9: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — no other `PublicLiveSnapshot` constructor exists. If typecheck reports another construction site, add `clockMs` there too (derive from its `clockText`/`clockSeconds`).

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/scoreboard.ts \
  apps/api/src/services/broadcast/clock-ms.ts \
  apps/api/src/services/broadcast/clock-ms.test.ts \
  apps/api/src/services/broadcast/publisher.ts \
  apps/api/src/services/broadcast/publisher.test.ts \
  "apps/web/src/app/[locale]/overlay/score-bug.test.tsx"
git commit -m "feat(broadcast): derive clockMs onto the live snapshot payload"
```

---

### Task 2: Pure `broadcastRelevantChange` predicate

**Files:**
- Create: `apps/api/src/services/scoreboard/broadcast-change.ts`
- Create: `apps/api/src/services/scoreboard/broadcast-change.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/scoreboard/broadcast-change.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  broadcastRelevantChange,
  type BroadcastChangeFields,
} from "./broadcast-change";

function base(overrides: Partial<BroadcastChangeFields> = {}): BroadcastChangeFields {
  return {
    scoreHome: 10,
    scoreGuest: 8,
    foulsHome: 1,
    foulsGuest: 2,
    timeoutsHome: 2,
    timeoutsGuest: 1,
    period: 2,
    clockRunning: true,
    timeoutActive: false,
    clockSeconds: 300,
    shotClock: 18,
    ...overrides,
  };
}

describe("broadcastRelevantChange", () => {
  it("is true on the first frame (no previous)", () => {
    expect(broadcastRelevantChange(null, base())).toBe(true);
  });

  it("is true when a discrete field changes", () => {
    expect(broadcastRelevantChange(base(), base({ scoreHome: 12 }))).toBe(true);
    expect(broadcastRelevantChange(base(), base({ clockRunning: false }))).toBe(true);
    expect(broadcastRelevantChange(base(), base({ timeoutActive: true }))).toBe(true);
  });

  it("is true when the shot clock resets (increases)", () => {
    expect(broadcastRelevantChange(base({ shotClock: 4 }), base({ shotClock: 24 }))).toBe(true);
    expect(broadcastRelevantChange(base({ shotClock: 8 }), base({ shotClock: 14 }))).toBe(true);
  });

  it("is true when the shot clock toggles on/off", () => {
    expect(broadcastRelevantChange(base({ shotClock: null }), base({ shotClock: 24 }))).toBe(true);
    expect(broadcastRelevantChange(base({ shotClock: 12 }), base({ shotClock: null }))).toBe(true);
  });

  it("is true on a game-clock correction (increase)", () => {
    expect(broadcastRelevantChange(base({ clockSeconds: 290 }), base({ clockSeconds: 300 }))).toBe(true);
  });

  it("is false on a plain countdown of either clock", () => {
    expect(broadcastRelevantChange(base({ clockSeconds: 300, shotClock: 18 }), base({ clockSeconds: 299, shotClock: 17 }))).toBe(false);
    expect(broadcastRelevantChange(base({ shotClock: 4.7 }), base({ shotClock: 4.6 }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @dragons/api test -- broadcast-change`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the predicate**

Create `apps/api/src/services/scoreboard/broadcast-change.ts`:

```ts
/**
 * The fields that, when they change, the overlay must see immediately. A plain
 * countdown decrement of either clock is NOT relevant — the overlay
 * interpolates those locally. See the overlay clock-interpolation design.
 */
export interface BroadcastChangeFields {
  scoreHome: number;
  scoreGuest: number;
  foulsHome: number;
  foulsGuest: number;
  timeoutsHome: number;
  timeoutsGuest: number;
  period: number;
  clockRunning: boolean;
  timeoutActive: boolean;
  clockSeconds: number | null;
  shotClock: number | null;
}

// shotClock is a float (fractional under 5 s); guard equality with an epsilon.
const SHOT_EPS = 0.01;

const DISCRETE_KEYS = [
  "scoreHome",
  "scoreGuest",
  "foulsHome",
  "foulsGuest",
  "timeoutsHome",
  "timeoutsGuest",
  "period",
  "clockRunning",
  "timeoutActive",
] as const satisfies ReadonlyArray<keyof BroadcastChangeFields>;

export function broadcastRelevantChange(
  prev: BroadcastChangeFields | null,
  next: BroadcastChangeFields,
): boolean {
  if (!prev) return true;
  if (DISCRETE_KEYS.some((k) => prev[k] !== next[k])) return true;

  // Shot clock: a reset is an increase; on/off is a null toggle. Decrements are
  // interpolated, so they are not relevant.
  if ((prev.shotClock == null) !== (next.shotClock == null)) return true;
  if (
    prev.shotClock != null &&
    next.shotClock != null &&
    next.shotClock > prev.shotClock + SHOT_EPS
  ) {
    return true;
  }

  // Game clock: a referee correction or period reset is an increase or a null
  // toggle. Decrements are interpolated.
  if ((prev.clockSeconds == null) !== (next.clockSeconds == null)) return true;
  if (
    prev.clockSeconds != null &&
    next.clockSeconds != null &&
    next.clockSeconds > prev.clockSeconds
  ) {
    return true;
  }

  return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api test -- broadcast-change`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/scoreboard/broadcast-change.ts \
  apps/api/src/services/scoreboard/broadcast-change.test.ts
git commit -m "feat(scoreboard): pure predicate for broadcast-relevant changes"
```

---

### Task 3: Inject config + scoreboard into `buildBroadcastState`

**Files:**
- Modify: `apps/api/src/services/broadcast/publisher.ts`
- Modify: `apps/api/src/services/broadcast/publisher.test.ts`

- [ ] **Step 1: Write the failing test (injected row is used, not the DB)**

In `apps/api/src/services/broadcast/publisher.test.ts`, add a test that seeds the live row with one score, then calls `buildBroadcastState` with an *injected* `scoreboardRow` carrying a different score, and asserts the output reflects the injected value (proving the DB read was skipped). Mirror the existing seeding helpers in that file:

```ts
it("uses an injected scoreboardRow instead of querying live_scoreboards", async () => {
  // Seed config (isLive + matchId) and a live row showing scoreHome 10.
  await seedLiveConfigAndScore(ctx, { deviceId: "d1", scoreHome: 10 }); // use the file's existing seed helpers; inline the inserts if none

  const injected = makeLiveRow({ deviceId: "d1", scoreHome: 99, clockText: "05:00", clockSeconds: 300 });
  const config = makeConfig({ deviceId: "d1", matchId: 1, isLive: true });

  const state = await buildBroadcastState("d1", { config, scoreboardRow: injected });
  expect(state.scoreboard?.scoreHome).toBe(99);
  expect(state.scoreboard?.clockMs).toBe(300_000);
});
```

If the file has no `makeLiveRow`/`makeConfig`/`seed*` helpers, build the objects inline: `config` is a `BroadcastConfig` (see `rowToConfig` output shape — `deviceId`, `matchId`, `isLive`, the four override fields, `startedAt`/`endedAt`/`updatedAt` ISO strings); `injected` is a full `typeof liveScoreboards.$inferSelect` row (all scoreboard columns + `panelName`, `lastFrameAt: new Date()`, `updatedAt: new Date()`). The match-cache load still hits the DB, so seed `matches`/`teams` for `matchId: 1` exactly as the existing passing tests in this file do, or set `matchId: null` and assert `state.match` is null to keep the test focused on the scoreboard injection.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @dragons/api test -- publisher`
Expected: FAIL — `buildBroadcastState` does not accept a second argument / ignores it.

- [ ] **Step 3: Add the options to `buildBroadcastState`**

In `apps/api/src/services/broadcast/publisher.ts`, change the signature and the two loads:

```ts
import type { BroadcastConfig, /* ...existing... */ } from "@dragons/shared";
import type { liveScoreboards as liveScoreboardsTable } from "@dragons/db/schema"; // if a type alias is convenient; otherwise use typeof liveScoreboards.$inferSelect inline

export interface BuildBroadcastOpts {
  config?: BroadcastConfig;
  scoreboardRow?: typeof liveScoreboards.$inferSelect;
}

export async function buildBroadcastState(
  deviceId: string,
  opts: BuildBroadcastOpts = {},
): Promise<BroadcastState> {
  let config: BroadcastConfig;
  if (opts.config) {
    config = opts.config;
  } else {
    const [configRow] = await getDb()
      .select()
      .from(broadcastConfigs)
      .where(eq(broadcastConfigs.deviceId, deviceId))
      .limit(1);
    config = configRow
      ? rowToConfig(configRow)
      : {
          deviceId,
          matchId: null,
          isLive: false,
          homeAbbr: null,
          guestAbbr: null,
          homeColorOverride: null,
          guestColorOverride: null,
          startedAt: null,
          endedAt: null,
          updatedAt: new Date().toISOString(),
        };
  }

  let scoreRow: typeof liveScoreboards.$inferSelect | undefined;
  if (opts.scoreboardRow) {
    scoreRow = opts.scoreboardRow;
  } else {
    [scoreRow] = await getDb()
      .select()
      .from(liveScoreboards)
      .where(eq(liveScoreboards.deviceId, deviceId))
      .limit(1);
  }

  const scoreboard = scoreRow ? rowToScoreboard(scoreRow) : null;
  const match = await getCachedMatch(deviceId, config);
  const phase = computePhase({
    isLive: config.isLive,
    matchId: config.matchId,
    period: scoreRow?.period ?? 0,
    clockRunning: scoreRow?.clockRunning ?? false,
  });
  const stale =
    config.isLive &&
    scoreRow !== undefined &&
    Date.now() - new Date(scoreRow.lastFrameAt).getTime() >
      BROADCAST_STALE_THRESHOLD_MS;

  return {
    deviceId,
    isLive: config.isLive,
    phase,
    match,
    scoreboard,
    stale,
    startedAt: config.startedAt,
    endedAt: config.endedAt,
    updatedAt: config.updatedAt,
  };
}
```

(Keep the existing `rowToConfig`/`rowToScoreboard`/`getCachedMatch`/`computePhase` imports.)

- [ ] **Step 4: Forward the options through `publishBroadcastForDevice`**

In the same file:

```ts
export async function publishBroadcastForDevice(
  deviceId: string,
  opts: BuildBroadcastOpts = {},
): Promise<void> {
  const state = await buildBroadcastState(deviceId, opts);
  await publishBroadcast(deviceId, state);
}
```

- [ ] **Step 5: Run the publisher suite**

Run: `pnpm --filter @dragons/api test -- publisher`
Expected: PASS, including the new injection test.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/broadcast/publisher.ts \
  apps/api/src/services/broadcast/publisher.test.ts
git commit -m "perf(broadcast): let buildBroadcastState take preloaded config + scoreboard"
```

---

### Task 4: Gate + feed the publish from `processIngest`

**Files:**
- Modify: `apps/api/src/services/scoreboard/ingest.ts`
- Modify: `apps/api/src/services/scoreboard/ingest.test.ts`

- [ ] **Step 1: Write the failing tests (gating behavior)**

In `apps/api/src/services/scoreboard/ingest.test.ts`, the broadcast publisher is already mocked as `mocks.publishBroadcastForDevice`. Add tests that, with a live config seeded, assert it fires on a real change but NOT on a pure clock/shot decrement. Use the file's existing frame builders/fixtures; sketch:

```ts
it("publishes broadcast on a real change but not on a plain clock decrement", async () => {
  await seedLiveBroadcastConfig(ctx, "panel-1"); // isLive=true + matchId; reuse existing helper or inline insert into broadcastConfigs

  // Frame A: establishes state -> first frame is always relevant.
  await processIngest({ deviceId: "panel-1", hex: frameClock("10:00") });
  // Frame B: only the game clock ticked down 1 s, nothing else.
  await processIngest({ deviceId: "panel-1", hex: frameClock("09:59") });
  // Frame C: a score changed.
  await processIngest({ deviceId: "panel-1", hex: frameScore({ home: 2 }) });

  const calls = mocks.publishBroadcastForDevice.mock.calls.length;
  // A (first) + C (score) publish; B (pure decrement) does not.
  expect(calls).toBe(2);
});
```

Use the existing `frameOk`-style builders already in this test file to produce the hex for each frame (same period/score except the one field under test). If no `seedLiveBroadcastConfig` helper exists, insert directly: `await ctx.db.insert(broadcastConfigs).values({ deviceId: "panel-1", matchId: 1, isLive: true, updatedAt: new Date() })`.

Also assert the raw snapshot publish is unaffected:

```ts
it("still publishes the raw snapshot on every changed frame", async () => {
  await processIngest({ deviceId: "panel-2", hex: frameClock("10:00") });
  await processIngest({ deviceId: "panel-2", hex: frameClock("09:59") });
  expect(mocks.publishSnapshot.mock.calls.length).toBe(2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/api test -- ingest`
Expected: FAIL — broadcast currently publishes on every `isLive` frame, so the count is 3 (or more), not 2.

- [ ] **Step 3: Import the predicate, config helper, and full config select**

In `apps/api/src/services/scoreboard/ingest.ts`, add imports:

```ts
import { broadcastRelevantChange } from "./broadcast-change";
import { rowToConfig } from "../broadcast/config";
```

- [ ] **Step 4: Compute relevance inside the transaction and return it**

Inside the `getDb().transaction` callback, after `const changed = snapshotsDiffer(existing ?? null, decoded);`, add:

```ts
    const broadcastRelevant = broadcastRelevantChange(existing ?? null, decoded);
```

Then include it in BOTH `return` objects from the transaction. The early "shot reading before any board" return (currently `{ changed: false, snapshotId: null, lastFrameAt, decoded: null }`) gets `broadcastRelevant: false`. The main return (`{ changed, snapshotId, lastFrameAt, decoded }`) gets `broadcastRelevant`.

- [ ] **Step 5: Gate the publish and pass preloaded args**

Replace the broadcast block (currently `ingest.ts:188-202`) with:

```ts
  try {
    const [cfgRow] = await getDb()
      .select()
      .from(broadcastConfigs)
      .where(eq(broadcastConfigs.deviceId, deviceId))
      .limit(1);
    if (cfgRow?.isLive === true && result.broadcastRelevant) {
      const now = new Date(result.lastFrameAt);
      await publishBroadcastForDevice(deviceId, {
        config: rowToConfig(cfgRow),
        scoreboardRow: {
          deviceId,
          ...decoded,
          panelName: deviceId,
          lastFrameAt: now,
          updatedAt: now,
        },
      });
    }
  } catch (err) {
    logger.warn(
      { err, deviceId, snapshotId: result.snapshotId },
      "broadcast.publish failed",
    );
  }
```

Note: `decoded` here is the already-unwrapped `result.decoded` (the code above this block already does `const decoded = result.decoded;` after the null guard). The `...decoded` spread plus `deviceId`/`panelName`/`lastFrameAt`/`updatedAt` produces a complete `liveScoreboards` row shape.

- [ ] **Step 6: Run the ingest suite**

Run: `pnpm --filter @dragons/api test -- ingest`
Expected: PASS, including the two new tests.

- [ ] **Step 7: Typecheck the API package**

Run: `pnpm --filter @dragons/api typecheck` (or `pnpm typecheck`)
Expected: PASS. If the `scoreboardRow` literal complains about a missing column, add it from `decoded` (the decoded snapshot already carries every scoreboard field; only the metadata columns are added manually).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/scoreboard/ingest.ts \
  apps/api/src/services/scoreboard/ingest.test.ts
git commit -m "perf(scoreboard): publish broadcast only on real changes, no re-read"
```

---

### Task 5: Pure overlay interpolation module

**Files:**
- Create: `apps/web/src/app/[locale]/overlay/clock-interpolation.ts`
- Create: `apps/web/src/app/[locale]/overlay/clock-interpolation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/[locale]/overlay/clock-interpolation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatGameClock,
  formatShotClock,
  interpolate,
  isStale,
  STALE_MS,
  type ClockAnchor,
} from "./clock-interpolation";

describe("formatGameClock", () => {
  it("renders MM:SS at or above one minute (ceil to the whole second)", () => {
    expect(formatGameClock(600_000)).toBe("10:00");
    expect(formatGameClock(60_000)).toBe("01:00");
    expect(formatGameClock(329_500)).toBe("05:30"); // ceil(329.5)=330
  });
  it("renders S.t tenths under a minute (floor to a tenth)", () => {
    expect(formatGameClock(59_900)).toBe("59.9");
    expect(formatGameClock(42_750)).toBe("42.7");
    expect(formatGameClock(0)).toBe("0.0");
  });
});

describe("formatShotClock", () => {
  it("renders whole seconds at/above 5 (ceil)", () => {
    expect(formatShotClock(24)).toBe("24");
    expect(formatShotClock(23.4)).toBe("24");
    expect(formatShotClock(5)).toBe("5");
  });
  it("renders tenths under 5 and 0 at expiry", () => {
    expect(formatShotClock(4.7)).toBe("4.7");
    expect(formatShotClock(0)).toBe("0");
    expect(formatShotClock(-1)).toBe("0");
  });
});

function anchor(o: Partial<ClockAnchor> = {}): ClockAnchor {
  return {
    clockMs: 300_000,
    clockText: "05:00",
    shotClock: 18,
    shotClockText: "18",
    clockRunning: true,
    timeoutActive: false,
    anchorAt: 1_000,
    ...o,
  };
}

describe("interpolate", () => {
  it("counts both clocks down from the anchor while running", () => {
    const r = interpolate(anchor(), 3_000); // 2s later
    expect(r.clockText).toBe("04:58");
    expect(r.shotClockText).toBe("16");
  });
  it("holds server text when the clock is stopped", () => {
    const r = interpolate(anchor({ clockRunning: false, clockText: "05:00", shotClockText: "18" }), 9_000);
    expect(r.clockText).toBe("05:00");
    expect(r.shotClockText).toBe("18");
  });
  it("holds the shot clock during a timeout", () => {
    const r = interpolate(anchor({ timeoutActive: true, shotClockText: "18" }), 5_000);
    expect(r.shotClockText).toBe("18");
  });
  it("clamps at zero", () => {
    const r = interpolate(anchor({ clockMs: 1_000, shotClock: 1 }), 11_000); // 10s later
    expect(r.clockText).toBe("0.0");
    expect(r.shotClockText).toBe("0");
  });
});

describe("isStale", () => {
  it("is true once the gap exceeds STALE_MS", () => {
    expect(isStale(anchor({ anchorAt: 0 }), STALE_MS - 1)).toBe(false);
    expect(isStale(anchor({ anchorAt: 0 }), STALE_MS + 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/web test -- clock-interpolation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `apps/web/src/app/[locale]/overlay/clock-interpolation.ts`:

```ts
/**
 * Client-side clock interpolation for the broadcast overlay. The server now
 * sends a broadcast event only on a real change, so the overlay advances the
 * game + shot clock locally between events, re-anchoring on each event. Both
 * clocks are driven off the reliable `clockRunning` flag (the per-frame
 * shotClockRunning flag is best-effort and ignored). Pure + framework-free so
 * it is unit-testable in the node/happy-dom suite.
 */

/** Freeze + dim after this long without an event (matches the server stale window). */
export const STALE_MS = 30_000;

export interface ClockAnchor {
  clockMs: number | null;
  clockText: string; // server value, used as the fallback when not interpolating
  shotClock: number | null;
  shotClockText: string; // server value, used as the fallback
  clockRunning: boolean;
  timeoutActive: boolean;
  anchorAt: number; // performance.now() captured at SSE receipt
}

/** "MM:SS" at/above a minute (ceil whole seconds); "S.t" below (floor to a tenth). */
export function formatGameClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped >= 60_000) {
    const total = Math.ceil(clamped / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  const tenths = Math.floor(clamped / 100);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

/** ">=5" whole seconds (ceil); "S.t" tenths under 5; "0" at expiry. */
export function formatShotClock(value: number): string {
  const v = Math.max(0, value);
  if (v >= 5) return String(Math.ceil(v));
  const tenths = Math.floor(v * 10);
  if (tenths <= 0) return "0";
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

export function isStale(anchor: ClockAnchor, now: number): boolean {
  return now - anchor.anchorAt > STALE_MS;
}

export function interpolate(
  anchor: ClockAnchor,
  now: number,
): { clockText: string; shotClockText: string } {
  const elapsed = Math.max(0, (now - anchor.anchorAt) / 1000); // seconds

  let clockText = anchor.clockText;
  if (anchor.clockRunning && anchor.clockMs != null) {
    clockText = formatGameClock(anchor.clockMs - elapsed * 1000);
  }

  let shotClockText = anchor.shotClockText;
  if (anchor.clockRunning && !anchor.timeoutActive && anchor.shotClock != null) {
    shotClockText = formatShotClock(anchor.shotClock - elapsed);
  }

  return { clockText, shotClockText };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @dragons/web test -- clock-interpolation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/[locale]/overlay/clock-interpolation.ts" \
  "apps/web/src/app/[locale]/overlay/clock-interpolation.test.ts"
git commit -m "feat(overlay): pure clock interpolation + formatting helpers"
```

---

### Task 6: Wire interpolation into the overlay client

**Files:**
- Modify: `apps/web/src/app/[locale]/overlay/overlay-client.tsx`
- Modify: `apps/web/src/app/[locale]/overlay/overlay-client.test.tsx`

- [ ] **Step 1: Write the failing test (interpolated clock reaches ScoreBug)**

The existing `overlay-client.test.tsx` mocks `ScoreBug`. Change that mock to surface the `scoreboard.clockText` it receives, and add a test that drives a `live` initial state with a running clock and asserts the rendered clock advances after time passes. Add at the top (replacing the existing `ScoreBug` mock):

```tsx
let lastClockText = "";
vi.mock("./score-bug", () => ({
  ScoreBug: ({ scoreboard }: { scoreboard: { clockText: string } }) => {
    lastClockText = scoreboard.clockText;
    return <div data-testid="bug">{scoreboard.clockText}</div>;
  },
}));
```

Add a test (uses fake timers; `performance.now` advances with vi fake timers in happy-dom):

```tsx
it("interpolates the game clock between events", async () => {
  vi.useFakeTimers();
  const initial = {
    deviceId: "d1",
    isLive: true,
    phase: "live" as const,
    match: {
      id: 1, kickoffDate: "2026-05-02", kickoffTime: "19:30:00",
      league: { id: 1, name: "Liga" },
      home: { name: "D", abbr: "DRA", color: "#000", clubId: 1 },
      guest: { name: "V", abbr: "VIS", color: "#fff", clubId: 2 },
    },
    scoreboard: {
      deviceId: "d1", scoreHome: 0, scoreGuest: 0, foulsHome: 0, foulsGuest: 0,
      timeoutsHome: 0, timeoutsGuest: 0, period: 1,
      clockText: "05:00", clockMs: 300_000, clockSeconds: 300, clockRunning: true,
      shotClock: 18, shotClockText: "18", shotClockRunning: false,
      timeoutActive: false, timeoutDuration: "",
      panelName: "d1", lastFrameAt: new Date().toISOString(), secondsSinceLastFrame: 0,
    },
    stale: false, startedAt: null, endedAt: null, updatedAt: new Date().toISOString(),
  };
  render(<OverlayClient deviceId="d1" initial={initial} />);
  await vi.advanceTimersByTimeAsync(2_100); // ~2s of interpolation
  expect(lastClockText).toBe("04:58");
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dragons/web test -- overlay-client`
Expected: FAIL — the overlay currently passes the static `state.scoreboard`, so `lastClockText` stays "05:00".

- [ ] **Step 3: Implement the wiring**

Rewrite `apps/web/src/app/[locale]/overlay/overlay-client.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { BroadcastState } from "@dragons/shared";
import { PregameCard } from "./pregame-card";
import { ScoreBug } from "./score-bug";
import {
  interpolate,
  isStale,
  type ClockAnchor,
} from "./clock-interpolation";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Props {
  deviceId: string;
  initial: BroadcastState | null;
}

function anchorFrom(state: BroadcastState | null): ClockAnchor | null {
  const s = state?.scoreboard;
  if (!s) return null;
  return {
    clockMs: s.clockMs,
    clockText: s.clockText,
    shotClock: s.shotClock,
    shotClockText: s.shotClockText,
    clockRunning: s.clockRunning,
    timeoutActive: s.timeoutActive,
    anchorAt: performance.now(),
  };
}

export function OverlayClient({ deviceId, initial }: Props) {
  const [state, setState] = useState<BroadcastState | null>(initial);
  const anchorRef = useRef<ClockAnchor | null>(anchorFrom(initial));
  const [, setTick] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  // Re-anchor whenever a new broadcast state arrives.
  useEffect(() => {
    anchorRef.current = anchorFrom(state);
  }, [state]);

  // ~100ms render loop so the interpolated clocks advance smoothly.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    const url = `${apiBase}/public/broadcast/stream?deviceId=${encodeURIComponent(
      deviceId,
    )}`;
    const es = new EventSource(url);
    esRef.current = es;
    const onSnapshot = (ev: MessageEvent) => {
      try {
        setState(JSON.parse(ev.data) as BroadcastState);
      } catch {
        // discard
      }
    };
    es.addEventListener("snapshot", onSnapshot);
    return () => {
      es.removeEventListener("snapshot", onSnapshot);
      es.close();
      esRef.current = null;
    };
  }, [deviceId]);

  if (!state || state.phase === "idle") {
    // OBS source stays loaded but invisible.
    return null;
  }

  if (state.phase === "pregame" && state.match) {
    return <PregameCard match={state.match} />;
  }

  if (state.phase === "live" && state.match && state.scoreboard) {
    const anchor = anchorRef.current;
    const now = performance.now();
    const interp = anchor ? interpolate(anchor, now) : null;
    const stale = state.stale || (anchor ? isStale(anchor, now) : false);
    const scoreboard = interp
      ? {
          ...state.scoreboard,
          clockText: interp.clockText,
          shotClockText: interp.shotClockText,
        }
      : state.scoreboard;
    return <ScoreBug match={state.match} scoreboard={scoreboard} stale={stale} />;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @dragons/web test -- overlay-client`
Expected: PASS. If `performance.now()` does not advance under fake timers in the local happy-dom version, switch the test to assert on `Date.now`-based timing by stubbing `performance.now`; simplest: in the test, `vi.spyOn(performance, "now")` returning a controllable counter advanced alongside `advanceTimersByTimeAsync`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/[locale]/overlay/overlay-client.tsx" \
  "apps/web/src/app/[locale]/overlay/overlay-client.test.tsx"
git commit -m "feat(overlay): interpolate game + shot clock between broadcast events"
```

---

### Task 7: Full verification

- [ ] **Step 1: Run the full test + quality gates**

Run: `pnpm test`
Run: `pnpm typecheck`
Run: `pnpm lint`
Expected: all PASS.

- [ ] **Step 2: Coverage for the touched packages**

Run: `pnpm --filter @dragons/api coverage`
Run: `pnpm --filter @dragons/web coverage`
Run: `pnpm --filter @dragons/shared coverage`
Expected: PASS — no threshold dropped. The new pure modules carry their own tests; if web coverage dips, add a direct render assertion for the `stale` dim path in `overlay-client.test.tsx`.

- [ ] **Step 3: Manual smoke (optional, if a panel feed or replay fixture is available)**

With `pnpm dev` running and a device feeding ingest (or the replay fixture used by `replay-fixture.test.ts`), open `/overlay`, confirm: the clock ticks smoothly between events, tenths show under a minute and under 5 s on the shot clock, a score change updates instantly, and pulling the feed dims the overlay after ~30 s.

- [ ] **Step 4: Final commit (if any fixups were needed)**

```bash
git add -A
git commit -m "test(overlay): verification fixups for clock interpolation"
```

---

## Self-Review Notes

- **Spec coverage:** Part C → Tasks 3 + 4; Part A.1 (gate) → Tasks 2 + 4; Part A.2 (`clockMs`) → Task 1; Part A.3 (interpolation) → Tasks 5 + 6; staleness → Tasks 5 + 6. Non-goals (raw channel, dedupe, DB schema) untouched — verified by the "still publishes raw snapshot" test in Task 4.
- **Type consistency:** `BuildBroadcastOpts` (Task 3) used by Task 4; `BroadcastChangeFields` (Task 2) consumed via `broadcastRelevantChange(existing, decoded)` in Task 4 — both `existing` (live row) and `decoded` (snapshot) carry all of its fields; `ClockAnchor` (Task 5) consumed in Task 6.
- **Known follow-up (out of scope):** in the final 24 s of a period the panel turns the shot clock off and ingest carries the last value forward; interpolation clamps at 0, bounding the artifact.
