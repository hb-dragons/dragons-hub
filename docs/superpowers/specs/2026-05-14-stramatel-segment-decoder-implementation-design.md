# Stramatel Segment Decoder Implementation — Design

**Date:** 2026-05-14
**Status:** Approved — pending spec review
**Input spec:** `apps/pi/STRAMATEL-PROTOCOL.md` (reverse-engineered protocol reference)
**Predecessor:** `docs/superpowers/specs/2026-05-14-stramatel-segment-decoder-design.md`
(the reverse-engineering design; its Section 3 sketched the decoder at a
branch level — this document is the concrete decoder design that replaces that
sketch now that Branch 2, a genuinely new protocol, is confirmed)

## Problem

The club's Stramatel Multisport Serie 452 M panel emits the segment protocol
reverse-engineered in `apps/pi/STRAMATEL-PROTOCOL.md`. Nothing in the pipeline
decodes it today:

- `Panel2Net.py` on the Pi has frame-detection branches for Mobatime
  (`017F0247`), the old Stramatel panel-drive format (`F83320` / `E8E8E4`), and
  SwissTiming (`0254` / `0244`). None matches the segment protocol's marker
  `00 F8 E1 C3`, so the panel's current output falls through to "not
  recognized" and the baud-cycling path — the Pi never forwards it.
- `apps/api/src/services/scoreboard/ingest.ts` hard-wires the old decoder
  (`findScoreFrames` / `decodeScoreFrame`), which only understands the `F8 33`
  format.

This design adds segment-protocol decoding end to end: a new decoder, a
dispatcher that routes between it and the old decoder, the `ingest.ts`
integration, the `Panel2Net.py` branch, tests, and live verification on the
real panel.

## Scope

In scope:

- New pure decoder `stramatel-segment-decoder.ts`.
- New dispatcher `scoreboard-decoder.ts` (segment-first, old decoder as
  fallback).
- `ingest.ts` change to call the dispatcher.
- `Panel2Net.py` 4th frame-detection branch for the segment marker.
- Vitest coverage for the decoder and dispatcher; an added segment-protocol
  case in `ingest.test.ts`.
- Deploying the updated `Panel2Net.py` to the Pi and verifying decoding against
  the live panel, including closing the byte-15 open question.

Out of scope:

- A possession field on `StramatelSnapshot`. Byte 6 carries possession, but the
  snapshot type has no field for it and adding one is a separate change.
- The SC24 shot-clock module — not connected, not in this stream.
- Fixing the old Stramatel branch in `Panel2Net.py` (see "Transport contract").

## Architecture

Data flow (the spine is unchanged):

```
Pi serial tap -> Panel2Net.py -> POST /api/scoreboard/ingest (hex body)
  -> scoreboard.routes.ts -> processIngest
  -> decodeLatestFrame (dispatcher)
       -> stramatel-segment-decoder  (segment protocol, tried first)
       -> stramatel-decoder          (old F8 33 protocol, fallback)
  -> StramatelSnapshot -> dedupe -> DB (scoreboardSnapshots, liveScoreboards)
  -> SSE publish + Twitch broadcast publish
```

Both decoders return the same `StramatelSnapshot` shape, so everything
downstream of the dispatcher is untouched.

### File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/services/scoreboard/stramatel-segment-decoder.ts` | create | Pure segment-protocol decoder: `findSegmentFrames` + `decodeSegmentBlock` |
| `apps/api/src/services/scoreboard/stramatel-segment-decoder.test.ts` | create | Vitest against the `segment-*.bin` fixtures + unit cases |
| `apps/api/src/services/scoreboard/scoreboard-decoder.ts` | create | Dispatcher: `decodeLatestFrame(buf)` — segment-first, old fallback |
| `apps/api/src/services/scoreboard/scoreboard-decoder.test.ts` | create | Routing tests |
| `apps/api/src/services/scoreboard/ingest.ts` | modify | Replace the inline decode loop with one `decodeLatestFrame` call |
| `apps/api/src/services/scoreboard/ingest.test.ts` | modify | Add a segment-protocol ingest case; keep old-protocol cases passing |
| `apps/api/src/services/scoreboard/stramatel-decoder.ts` | keep as-is | Old decoder stays a pure unit, now reached only via the dispatcher fallback |
| `apps/pi/Panel2Net.py` | modify | Add a 4th frame-detection branch for marker `00 F8 E1 C3` |
| `apps/pi/STRAMATEL-PROTOCOL.md` | modify (after live verify) | Promote byte 15 out of "Open questions" if confirmed |

Each decoder is a pure function with no DB or IO knowledge. The dispatcher is
the only unit that knows two protocols exist. `ingest.ts` loses all
decoder-specific logic.

## Component: `stramatel-segment-decoder.ts`

Two pure exports.

### `findSegmentFrames(buf: Buffer): Buffer[]`

Scans `buf` for the marker `00 F8 E1 C3`. For each hit, takes the 57-byte
slice and keeps it only if all of:

- the slice is a full 57 bytes,
- byte 56 is `0xE5` (terminator),
- bytes 4–5 are `1E 66` (block type C).

Type A (`0F 64`), type B (`0F EC`), and malformed slices are dropped. Returns
the surviving type-C blocks in stream order. Type C carries every scoreboard
field in the clean linear encoding, so the decoder only ever needs type C.

### `decodeSegmentBlock(block: Buffer): StramatelSnapshot | null`

Structural guard first — wrong length, wrong marker, wrong type, or wrong
terminator returns `null`. Then decodes fields per `STRAMATEL-PROTOCOL.md`.

Digit helper `decodeDigit(byte)`:

- `0xBF` -> blank,
- odd byte in `0x8D`–`0x9F` -> `(0x9F - byte) / 2`,
- anything else -> invalid.

Field decoding is lenient — a blank or invalid digit cell resolves to `0`,
mirroring the old decoder's `parseInt0` behaviour. Structural problems return
`null`; bad field values do not.

Field map (byte offsets within the 57-byte block):

| Field | Source | Notes |
|-------|--------|-------|
| `scoreHome` | bytes 12–13 | tens x 10 + units |
| `scoreGuest` | bytes 15–16 | tens x 10 + units |
| `period` | byte 17 | digit |
| `foulsHome` | byte 18 | digit |
| `foulsGuest` | byte 19 | digit |
| `timeoutsHome` | byte 20 | digit |
| `timeoutsGuest` | byte 21 | digit |
| `clockText` / `clockSeconds` | bytes 7–10 | see Clock below |
| `clockRunning` | byte 23 | `byte === 0x9F` |
| `timeoutActive` | byte 24 | `byte === 0x9F` |
| `timeoutDuration` | bytes 49–50 | two-digit string; empty when both blank |
| `shotClock` | — | always `0` — SC24 not in this stream |

Clock (bytes 7–10), two modes:

- `byte10 === 0xBF` -> sub-minute mode: `clockText` is `"SS.t"` (seconds-tens,
  seconds-units, tenths), `clockSeconds = floor(seconds)`.
- otherwise -> MM:SS mode: `clockText` is zero-padded `"MM:SS"`, `clockSeconds
  = minutes * 60 + seconds`. Byte 7 is blank when minutes < 10.
- If the clock cells are unparseable, the snapshot is still returned with
  `clockSeconds = null` — this matches the old decoder.

Byte 6 (possession) is not decoded — there is no `StramatelSnapshot` field for
it.

## Component: `scoreboard-decoder.ts`

One export:

```ts
export interface DecodedFrame {
  frame: Buffer;          // the raw bytes that decoded — stored as rawHex
  snapshot: StramatelSnapshot;
}
export function decodeLatestFrame(buf: Buffer): DecodedFrame | null;
```

Logic, segment-first:

1. `findSegmentFrames(buf)` — iterate the results from the **end**, calling
   `decodeSegmentBlock` on each; the first success returns
   `{ frame: block, snapshot }`. End-first picks the most recent panel state,
   the same rationale as the existing ingest loop.
2. If no segment frame decoded: `findScoreFrames(buf)` — iterate from the end,
   calling `decodeScoreFrame`; the first success returns `{ frame, snapshot }`.
3. Neither path produced a frame -> `null`.

This is the only unit aware of both protocols. Both decoders stay pure and
ignorant of each other.

## Integration: `ingest.ts`

The hex-string-to-`Buffer` conversion and its `try/catch` stay in `ingest.ts`
— that is transport-level, not a decoder concern. The block that changes is
the frame-finding and decode loop:

```ts
// before: findScoreFrames(buf) + a manual reverse loop over decodeScoreFrame
// after:
const decoded = decodeLatestFrame(buf);
if (!decoded) return { ok: true, changed: false, snapshotId: null };
const { frame, snapshot } = decoded;
```

`snapshot` then feeds the existing dedupe / `scoreboardSnapshots` insert /
`liveScoreboards` upsert / `publishSnapshot` / broadcast code unchanged — only
the local variable name changes from `decoded` to `snapshot`.
`frame.toString("hex")` still supplies `rawHex`. The `findScoreFrames` /
`decodeScoreFrame` imports are removed from `ingest.ts`; they are now reached
only through the dispatcher.

## Pi side: `Panel2Net.py`

A 4th `elif` branch is added after the old-Stramatel branch (both are panels
"ours to forward"):

```python
elif (response_hex.find(b'00F8E1C3') != -1) and (response_hex.rfind(b'E5') != -1):
    # Stramatel 452 M segment protocol - ours to forward
    StartToken = response_hex.find(b'00F8E1C3')
    EndToken = response_hex.rfind(b'E5')
    remainder_hex = response_hex[EndToken + 2:]
    response_hex = response_hex[StartToken:EndToken + 2]
    response = response_hex          # forward HEX - route does Buffer.from(hex,"hex")
    RequestURL = '/api/scoreboard/ingest'
    should_post = True
    RetryCount = 0
```

### Transport contract

The route does `Buffer.from(hex, "hex")` and `apps/pi/scripts/replay-fixture.mjs`
POSTs `frame.toString("hex")` — the ingest body is hex text. The new branch
forwards hex by setting `response = response_hex` before the shared POST block
runs, without touching the other branches.

The existing old-Stramatel branch posts the raw `response` rather than
`response_hex`, which is inconsistent with this contract. That is recorded here
as an observation and left **unfixed**: it is the fallback path, the panel does
not emit that protocol, and it cannot be tested without old-format hardware.

### Framing authority

The Pi forwards a chunk from the first marker to the last `E5` and tracks the
leftover in `remainder_hex` for stream continuity, the same pattern the other
branches use. The API decoder's `findSegmentFrames` does the real byte-aligned
framing and drops anything malformed, so a slightly over- or under-trimmed
chunk still decodes correctly.

### Deploy

`scp` the file to `/home/hb/Panel2Net/Panel2Net.py`, then
`sudo systemctl restart panel2net.service`. Confirm with `systemctl status`,
`/tmp/Panel2Net.log`, and the live ingest.

## Testing

`stramatel-segment-decoder.test.ts` — one assertion block per `segment-*.bin`
fixture, checking the decoded `StramatelSnapshot` against the labelled state
from the protocol spec's Provenance table:

| Fixture | Key assertions |
|---------|----------------|
| `segment-base` | 0–0, period 1, `clockText "10:00"`, `clockRunning false`, fouls/timeouts 0 |
| `segment-score-h2` | `scoreHome 2`, `scoreGuest 0` |
| `segment-score-h10` | `scoreHome 10`, `scoreGuest 1` |
| `segment-period-3` | `period 3` |
| `segment-foul-h3` | `foulsHome 3` |
| `segment-clock-0059` | `clockText "57.9"`, `clockSeconds 57` (sub-minute) |
| `segment-clock-run-0930` | MM:SS clock, `clockRunning true` |
| `segment-to-running` | `timeoutActive true`, `timeoutsGuest 1`, `timeoutDuration "41"` |
| `segment-poss-left` | decodes cleanly; `timeoutsGuest 1` (stale, documented) |

Plus unit cases:

- `findSegmentFrames` — returns type-C blocks only, ignores type A and B,
  returns `[]` on a buffer with no marker, drops a truncated trailing block.
- `decodeSegmentBlock` — structural guards: bad length, bad marker, bad type,
  bad terminator all return `null`.
- digit helper — all ten digits, blank cell, invalid byte resolves to `0`.
- clock — both modes, including byte-7-blank (minutes < 10).

`scoreboard-decoder.test.ts` — `decodeLatestFrame`:

- a `segment-*.bin` buffer routes through the segment decoder, `frame` is the
  57-byte block,
- a `stramatel-sample.bin` buffer routes through the old fallback decoder,
- a garbage buffer returns `null`,
- a buffer with two differing type-C blocks returns the **last** block's
  snapshot.

`ingest.test.ts` — the existing old-protocol cases must still pass through the
fallback path; add one case that ingests a segment-protocol hex body and
asserts the snapshot persists.

Coverage stays above the enforced thresholds (90% branches, 95%
functions/lines/statements) — the decoder's branches (digit cases, clock
modes, structural guards) are all exercised by the cases above.

## Live verification and the byte-15 gap

`STRAMATEL-PROTOCOL.md` flags one open question: guest score tens (byte 15) was
never observed non-blank, so it is mapped by symmetry with the home-score pair.
The club has full on-demand panel access, so live verification closes it.

After deploy:

1. Confirm `panel2net.service` is running and `/tmp/Panel2Net.log` shows
   segment frames POSTing `200`.
2. Confirm `liveScoreboards` and the admin live view reflect the panel state.
3. Full sweep — set the panel through base / scores / period / fouls / timeout
   / running clock and confirm each decodes correctly end to end. Include a
   **guest score of 10 or more** to exercise byte 15.
4. If byte 15 behaves as the symmetric mapping predicts: update
   `STRAMATEL-PROTOCOL.md` — promote guest-score-tens out of "Open questions",
   capture a `segment-score-g10.bin` fixture, add a decoder test for it.
5. Commit the spec and fixture update.

## Error handling

- Non-hex ingest body — caught in `ingest.ts` as today, returns
  `{ ok: true, changed: false, snapshotId: null }`.
- No decodable frame in the buffer — `decodeLatestFrame` returns `null`,
  `ingest.ts` returns the same no-op result.
- Malformed or partial segment block — dropped by `findSegmentFrames` (bad
  length or terminator) or rejected by `decodeSegmentBlock`'s structural guard.
- Bad field bytes within an otherwise valid block — decoded leniently to `0`
  (digits) or `null` (`clockSeconds`); the snapshot is still produced, matching
  the old decoder.
- Pi cannot reach the API — existing `Panel2Net.py` retry and logging path,
  unchanged.

## References

- `apps/pi/STRAMATEL-PROTOCOL.md` — the reverse-engineered protocol reference
  this decoder implements.
- `docs/superpowers/specs/2026-05-14-stramatel-segment-decoder-design.md` — the
  reverse-engineering design that produced the protocol spec.
- `docs/superpowers/specs/2026-04-29-stramatel-live-scoreboard-design.md` — the
  scoreboard ingest pipeline this plugs into.
- `apps/api/src/services/scoreboard/stramatel-decoder.ts` — the old-protocol
  decoder, kept as the dispatcher fallback.
