# SC24 shot-clock decode — design

**Date:** 2026-06-13
**Status:** approved (design), pending implementation
**Follows:** PR #43 `fix(scoreboard): decode SC24-era Stramatel framing`
**Spec to update on landing:** `apps/pi/STRAMATEL-PROTOCOL.md` (Shot clock + SC24-era framing sections)

## Goal

Decode the exact shot-clock value from the Stramatel 452 M / MR19SC24A00 stream,
**including tenths under 5 s and the held "0" at expiry**, while the clock is
running — carried across frames in the ingest layer and surfaced on
`StramatelSnapshot`. Must keep working when the SC24 module is **not** connected
(old framing → no shot clock, no regression).

## Key finding (supersedes the old "open question")

The shot-clock value rides in the **variable-length frame prefix** (bytes
between the `00 F8 E1` sync and the `C3`), present on ~10% of frames (the rest
carry a 2-byte prefix and no shot data). The prefix is **not** opaque multiplex
noise — it decodes with small lookup tables. The countdown the previous
investigation flagged as a "self-test sweep / garbage" (the `6d…7f` ramp) is in
fact the **legitimate tenths countdown**.

A prototype decoder built from these tables decodes **every value 0.0 → 24
correctly** across 16 single-value paused fixtures and 6 running-descent
captures (`sc_desc`, `sc_run`, `sc_90`, `sc_full`, `sc_full2`, `run22`) with
zero spurious values.

### Prefix byte roles

Prefix indexing (byte 0 is a refresh-phase flicker — `0x18/0x30/0x38` — and is
ignored; byte 7, when present, also flickers):

| Byte | Role |
|------|------|
| `p[1]` | mode / column selector + tens (see below) |
| `p[2]` | value byte (units, or tenths ramp) |
| `p[3]` | discriminator for single-digit plain (5–9) |
| `p[4]` | running flag — `0x2d` running / `0x95` stopped (reliable only on 8-byte prefixes) |

### Region classification (order matters)

Classify on `p[2]` **first**, because `p[1]` values overlap across modes
(`0x98` = both two-digit-20s and tenths-2.x; `0x68` = both single-digit and
tenths-3.x). The `p[2]` value ranges do **not** overlap between modes, so they
disambiguate cleanly:

1. **Tenths (0.0–4.9):** `p[2]` is odd in `0x6d…0x7f` **and** `p[1] ∈ {58,68,98,a8,c8}`.
   - integer = `{0x58:4, 0x68:3, 0x98:2, 0xa8:1, 0xc8:0}[p[1]]`
   - tenths = `(0x7f - p[2]) / 2`
   - value = `integer + tenths/10`
2. **Two-digit (10–24):** `p[1] ∈ {0x98 (20s), 0xa8 (10s)}`.
   - units = `UNITS[p[2]]` where
     `UNITS = {0x99:0, 0x95:1, 0x93:2, 0x8d:3, 0x8b:4, 0x27:5, 0xd3:6, 0xcd:7, 0xcb:8, 0xc7:9}`
   - value = decade + units (units are decade-independent)
3. **Single-digit plain (5–9):** `p[1] == 0x68`, keyed on `(p[2], p[3])`:
   `{(0x3a,0x5a):9, (0x5a,0x5a):8, (0x6a,0x5a):7, (0x9a,0x5a):6, (0x3a,0x6a):5}`
   (units 9 and 5 collide on `p[2]=0x3a`; `p[3]` separates them.)
4. Anything else → unknown → decoder returns `null`.

"0" at expiry encodes identically to "0.0" (`p[1]=0xc8, p[2]=0x7f`); displayed as
`"0"`.

### Running flag is unreliable — derive it in ingest

`p[4]` (`0x2d`/`0x95`) is reliable only on 8-byte-prefix frames. Two-digit units
6–9 and single-digit 5 use a **7-byte prefix** where `p[4]` sits elsewhere, so
their running state reads as false. The **value is always correct**; only the
boolean flakes. Therefore `shotClockRunning` is computed in the **ingest layer**
from value movement (value changed within a short window → running), with `p[4]`
as a secondary hint, rather than trusted per-frame from the decoder.

## Components

### 1. Pure decoder — `decodeShotClock(prefix: Buffer)`

New function in `apps/api/src/services/scoreboard/stramatel-segment-decoder.ts`.

- Input: the prefix bytes (sync+3 .. first `C3`).
- Short prefix (`< 4` bytes) or unknown signature → returns `null` (this frame
  carries no shot data; covers SC24-not-connected → **no regression**).
- Long prefix → `{ value: number, text: string, runningHint: boolean | null }`.
- One pure function, fully table-driven, unit-tested against every fixture.

The existing `decodeSegmentBlock` exposes the prefix to this function (it
currently discards it). `shotClock` stops being hard-coded `0`.

### 2. Carry-forward + running inference — ingest layer

In `apps/api/src/services/scoreboard/ingest.ts`:

- Hold the last decoded shot-clock value/text per device; frames with no shot
  data (~90%) inherit it.
- Compute `shotClockRunning`: true when the value has changed (decreased) within
  the last ~1.5 s; false when stable; seed/override with `runningHint` when the
  8-byte prefix provides a reliable one.
- Reset/clear on expiry hold and on stream gaps.

### 3. Snapshot shape — mirror the game clock

`packages/shared/src/scoreboard.ts` `StramatelSnapshot`:

```ts
shotClock: number | null;     // seconds; fractional under 5 s (e.g. 4.7); 0 at expiry; null when SC24 absent
shotClockText: string;        // display: "24" | "4.7" | "0" | "" (empty when absent)
shotClockRunning: boolean;
```

Replaces the current `shotClock: number`. Ripples to `PublicLiveSnapshot`,
`ScoreboardSnapshotRow`, the DB snapshot row, and exact-shape `toEqual` tests.

### 4. Spec update

Fill `apps/pi/STRAMATEL-PROTOCOL.md` "Shot clock" with the tables above; correct
the "self-test sweep = garbage" note (it is the tenths countdown).

### 5. Consumers — web + native

Web scoreboard page and native scoreboard view: render `shotClockText`; handle
the tenths display under 5 s; hide/blank when `shotClock == null`.

## Fixtures (committed)

Single-value paused: `sc24_stop`(24) `sc20_stop`(20) `sc14_stop`(14)
`sd9_run`(9) `sd8`(8) `sd7`(7) `sd6`(6) `sd5b`(5) `t40`(4.0) `t30`(3.0)
`t20`(2.0) `t10`(1.0) `t31`(3.1) `t05`(0.5) `expiry0`(0).
Running descents: `sc_desc` (full 24→0.0), `sc_run`, `sc_90`, `run22`.
All in `apps/pi/research/captures/` (gitignored today — promote the
decode-relevant ones into a committed test-fixtures path, or load via a small
base64 fixture, per the package's existing fixture convention).

## Testing (TDD, high coverage gate: 95% fn/line, 90% branch)

- Decoder unit tests: assert each fixture's prefix → expected value/text.
- Region-classification tests: boundary cases (5.0 plain vs 4.9 tenths;
  20s vs 2.x on `p[1]=0x98`; 9 vs 5 on `p[2]=0x3a`).
- Ingest tests: carry-forward across no-shot frames; running inference from a
  value sequence; expiry/reset; SC24-absent stream → `shotClock` stays null.
- Snapshot-shape tests updated for the new fields.

## Out of scope

- Full raw-framebuffer multiplex reconstruction (the lookup tables make it
  unnecessary).
- Bytes 25–48 (constant `0x9F`), types A/B payloads.

## Edge cases / open items

- `shotClockRunning` is best-effort by design (per-frame flag unreliable on
  7-byte prefixes); value-movement inference is the source of truth.
- Reset 24→24 (no value change) reads as "not running" until the next tick —
  acceptable; the game-clock running flag can refine if needed.
- Tenths boundary at exactly 5.0 shows plain "5"; 4.9 and below show tenths —
  both decode correctly.
