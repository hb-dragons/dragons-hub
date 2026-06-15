# Overlay clock interpolation + leaner broadcast events

**Date:** 2026-06-15
**Status:** Design — awaiting approval
**Scope:** `apps/api` (broadcast publish path), `apps/web` (overlay only), `packages/shared`

## Problem

The live-stream overlay (`apps/web/.../overlay`) consumes `BroadcastState`
over SSE from `GET /public/broadcast/stream`. Three things make that stream
heavier and more frequent than it needs to be:

1. **Publishes on every frame, not every change.** `processIngest`
   (`apps/api/src/services/scoreboard/ingest.ts:194`) calls
   `publishBroadcastForDevice` on *every* `isLive` POST, regardless of whether
   anything changed. During a live game the overlay receives the full
   ~1 KB `BroadcastState` at the Pi's POST rate.
2. **Two redundant DB reads per publish.** `buildBroadcastState`
   (`publisher.ts:107`, `:128`) re-`SELECT`s `broadcastConfigs` and
   `liveScoreboards` — rows `processIngest` just wrote/read milliseconds earlier.
3. **The clocks force a high event rate.** The overlay renders `clockText` and
   `shotClockText` verbatim (`score-bug.tsx:209`), so it only advances when a
   server event arrives. Both clocks are dedupe keys (`ingest.ts:33-36`), so
   each tick is a "change": ~1/sec for the game clock, ~1/sec for the shot
   clock, and a ~10/sec burst of tenths in the final 5 s of each shot cycle.

The net effect the user observed: large SSE events arriving very frequently.

## Goals

- Overlay broadcast events fire only on a **real** state change.
- The overlay clock + shot clock advance **smoothly**, interpolated locally,
  including sub-second tenths, independent of network arrival timing.
- Remove the two redundant DB reads per publish.

## Non-goals

- The raw `GET /public/scoreboard/stream` channel and its consumers (`/live`
  page, admin scoreboard debug) are **untouched**.
- `DEDUPE_KEYS`, the snapshot history, and DB write volume are **unchanged**
  (per-frame snapshots still persist as today).
- No DB migration, no decoder change, no change to the base `StramatelSnapshot`.
- Mapping/improving the Stramatel shot-clock decode is out of scope (already
  done — see `2026-06-13-stramatel-shotclock-decode-design.md`).

## Design

### Part C — remove redundant DB reads (no behavior change)

`buildBroadcastState(deviceId, opts?)` gains an optional second argument:

```ts
interface BuildOpts {
  config?: BroadcastConfig;            // skip the broadcastConfigs SELECT
  scoreboardRow?: typeof liveScoreboards.$inferSelect; // skip the liveScoreboards SELECT
}
```

When `opts.config` / `opts.scoreboardRow` are present, `buildBroadcastState`
uses them instead of querying. `publishBroadcastForDevice(deviceId, opts?)`
forwards the same options.

`processIngest`:
- Changes its config lookup (`ingest.ts:189`) from `select({ isLive })` to the
  **full** `broadcastConfigs` row (one query, same round-trip count).
- Passes that config row and a `liveScoreboards`-shaped row built from the
  in-hand `decoded` snapshot (`+ deviceId`, `panelName = deviceId`,
  `lastFrameAt = now`, `updatedAt = now`) into `publishBroadcastForDevice`.

The SSE fresh-connect path (`broadcast.routes.ts`) calls `buildBroadcastState`
with no options and loads from the DB exactly as today.

Net: ingest still does one config read; the publish path does **zero** reads
(was two).

### Part A.1 — gate the broadcast publish on a real change

Add a pure predicate, computed from the pre-upsert `existing` row and the new
`decoded` snapshot (both already in scope inside the ingest transaction):

```ts
function broadcastRelevantChange(existing, decoded): boolean
```

Returns `true` when:
- `existing` is null (first frame for the device); **or**
- any **discrete** field differs: `scoreHome`, `scoreGuest`, `foulsHome`,
  `foulsGuest`, `timeoutsHome`, `timeoutsGuest`, `period`, `clockRunning`,
  `timeoutActive`; **or**
- the **shot clock resets or toggles on/off**:
  `(existing.shotClock == null) !== (decoded.shotClock == null)`, or
  `decoded.shotClock != null && existing.shotClock != null &&
   decoded.shotClock > existing.shotClock + EPS` (an increase = a reset); **or**
- the **game clock jumps non-monotonically** (referee correction / period
  reset): `decoded.clockSeconds`/`existing.clockSeconds` null-state changes, or
  `decoded.clockSeconds > existing.clockSeconds`.

It returns `false` for the common case — a plain one-tick **decrement** of
either clock with nothing else changed. Those are exactly the events the client
now interpolates instead of receiving.

The gate at `ingest.ts:194` becomes:
`if (cfg?.isLive && broadcastRelevantChange(existing, decoded)) { publish... }`.

Config-driven updates are unaffected: the admin broadcast routes
(`admin/broadcast.routes.ts:73,94,120`) call `publishBroadcastForDevice`
directly when an admin toggles live / sets the match / edits overrides.

`EPS` accounts for `shotClock` being a `real` (e.g. `0.01`).

### Part A.2 — `clockMs` on the broadcast payload (derived, no migration)

`PublicLiveSnapshot` (`packages/shared/src/scoreboard.ts`) gains:

```ts
clockMs: number | null; // whole milliseconds remaining on the game clock
```

It is **derived** in `rowToScoreboard` (`publisher.ts`) via a pure helper, not
stored or decoded:

```ts
function deriveClockMs(clockText: string, clockSeconds: number | null): number | null
//  "MM:SS" -> (MM*60+SS)*1000
//  "SS.t"  -> SS*1000 + t*100        (recovers the sub-minute tenths)
//  else    -> clockSeconds != null ? clockSeconds*1000 : null
```

This recovers the tenths the panel shows under a minute (which `clockSeconds`
floors away) without touching the decoder or DB. The shot clock needs no
equivalent — `shotClock` is already fractional.

### Part A.3 — client-side interpolation (overlay only)

New pure module `apps/web/src/app/[locale]/overlay/clock-interpolation.ts`:

```ts
interface ClockAnchor {
  clockMs: number | null;
  shotClock: number | null;
  clockRunning: boolean;
  timeoutActive: boolean;
  anchorAt: number;          // performance.now() at SSE receipt
}

function interpolate(anchor: ClockAnchor, now: number): {
  clockText: string;
  shotClockText: string;
}

function formatGameClock(ms: number): string  // ">=60000 -> MM:SS, else S.t"
function formatShotClock(value: number): string // ">=5 -> "S", <5 -> "S.t", ~0 -> "0""
```

**Rounding (to match the panel's whole-second hold).** In the whole-second
regimes — game clock >= 1:00, shot clock >= 5 — display `Math.ceil` of the
remaining seconds, so a value shows for its full second and flips on the
boundary (e.g. 5:30 holds from 330.9 s down to 329.01 s). In the tenths regimes
— game clock < 1:00, shot clock < 5 — display floored to a tenth
(`Math.floor(ms/100)/10`). The anchor moment is not the panel's second boundary,
so the flip can land up to ~1 s off the panel; sub-second and accepted.

Rules:
- `elapsed = (now - anchorAt) / 1000` seconds.
- **Game clock:** `running && clockMs != null` ->
  `formatGameClock(max(0, clockMs - elapsed*1000))`; else fall back to the
  server's `clockText`.
- **Shot clock:** `running && !timeoutActive && shotClock != null` ->
  `formatShotClock(max(0, shotClock - elapsed))`; else fall back to the
  server's `shotClockText`.
- Both clamp at 0. Both interpolate off the **reliable** `clockRunning` flag;
  the unreliable `shotClockRunning` is ignored.
- Formatting matches the decoders' string conventions (segment decoder:
  sub-minute `${seconds}.${tenths}` with no leading zero; `MM:SS` zero-padded).

`overlay-client.tsx` / `score-bug.tsx`:
- On each SSE `snapshot`, set a new `ClockAnchor` (capturing `performance.now()`).
  Using receipt time as the anchor sidesteps any server/browser clock skew.
- A `setInterval(~100ms)` recomputes the two display strings via `interpolate`.
  Scores/fouls/etc. continue to render from `state` directly (NumberFlow on
  scores unchanged).
- Each real event re-anchors and corrects drift. Natural events (scores,
  shot-clock resets at <=24 s) keep drift well under a tenth.

### Staleness / feed-death safety

Because the broadcast is now event-driven, "no events" is normal during play,
so it can no longer signal a dead feed. The client adds a local guard: track
`lastEventAt = performance.now()` per SSE event; if
`now - lastEventAt > STALE_MS` (30 s, matching `BROADCAST_STALE_THRESHOLD_MS`)
**freeze** interpolation and apply the existing dimmed style. A live shot clock
resets at least every 24 s, so a >30 s gap means the feed stalled. This makes
feed-death dimming work client-side — today the server `stale` flag never
updates on a fully dead feed, so this is a net improvement, not a regression.

## Data flow (after)

```
Pi -> POST ingest -> Postgres (unchanged) + raw "scoreboard:<id>" (unchanged)
                  -> broadcastRelevantChange?  --no-->  (no broadcast event)
                                               --yes--> buildBroadcastState(decoded, config)  [0 DB reads]
                                                        -> "broadcast:<id>" -> SSE -> overlay
overlay: anchor on each event; interpolate game+shot clock locally @100ms;
         freeze+dim if no event > 30 s.
```

## Testing

- `clock-interpolation.test.ts` (pure): `formatGameClock` (MM:SS vs tenths
  boundary at 60 s), `formatShotClock` (>=5 integer, <5 tenths, 0), `interpolate`
  (running counts down + clamps at 0; stopped holds; null falls back to server
  text; timeout holds shot clock), staleness boundary.
- `deriveClockMs` (pure): MM:SS, SS.t, malformed/`--:--` fallback, null.
- `broadcastRelevantChange` (pure): first frame; discrete change; shot reset
  (increase); shot on/off; clock correction (increase); plain decrement of each
  clock -> false.
- `buildBroadcastState`: with injected `config` + `scoreboardRow`, asserts the
  DB is not queried (mock `getDb`) and the state is correct; `deriveClockMs`
  reflected in the payload.
- `processIngest`: publishes broadcast on a real change; does **not** publish on
  a plain clock/shot decrement; still publishes the raw snapshot every frame
  (unchanged).

## Risks / trade-offs

- **Shot-clock-off in the final 24 s of a period.** When the game clock drops
  below the shot-clock value the panel turns the shot clock off; the decoder
  carries the last value forward (`ingest.ts:89-92`), a pre-existing data wrinkle.
  Interpolation clamps at 0, bounding any visible artifact. Accepted.
- **`shotClockRunning` ignored.** Driving shot-clock interpolation off
  `clockRunning` is deliberate — the per-frame shot-running flag is best-effort
  (`shot-clock-decoder.ts:14`). Brief possession dead-time where the game clock
  runs but the shot clock is momentarily reset re-anchors on the next event.

## Files

- `packages/shared/src/scoreboard.ts` — add `clockMs` to `PublicLiveSnapshot`.
- `apps/api/src/services/broadcast/publisher.ts` — `deriveClockMs`,
  `rowToScoreboard` sets `clockMs`, `buildBroadcastState`/
  `publishBroadcastForDevice` accept `opts`.
- `apps/api/src/services/scoreboard/ingest.ts` — full config select,
  `broadcastRelevantChange`, gated publish passing `config` + decoded row.
- `apps/web/src/app/[locale]/overlay/clock-interpolation.ts` — new pure module.
- `apps/web/src/app/[locale]/overlay/overlay-client.tsx` /
  `score-bug.tsx` — anchor on event, interpolate @100 ms, staleness freeze.
- Co-located `*.test.ts` for each of the above.
