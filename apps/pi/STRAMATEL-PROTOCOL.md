# Stramatel 452 M Segment Protocol

Reverse-engineered serial protocol for the club's **Stramatel Multisport
Serie 452 M** basketball panel (console reference `MR20MD7000L00`).

This panel emits neither the 2017 raw panel-drive format nor the documented
Bodet/Stramatel "network output" format. It sends a third, unpublished
format: a repeating stream of fixed-length blocks whose payload bytes are LED
segment-drive values. This document is the result of a controlled
capture-and-diff reverse-engineering pass; it is the input for the decoder
implementation plan.

Every claim below is backed by at least one labelled capture (see
**Provenance**). Bytes that no capture exercised are marked **unknown**.

## Serial parameters

| Parameter | Value |
|-----------|-------|
| Port (on the Pi) | `/dev/ttyACM0` |
| Baud | 19200 |
| Framing | 8N1 |

Confirmed by the Phase 1 framing-gate sweep (36 captures across
baud × framing): no baud/framing recovered the old protocol's `F8 33` token,
and 19200 8N1 produced the most stable, cleanly delimited stream. This
matches the serial settings in the Stramatel "SL Video System" notice
(`UF452SLVIDEO_J`).

The stream is bursty, not continuous — roughly 570 bytes/s of actual data.

## Frame structure

The stream is a sequence of fixed **57-byte blocks**:

```
offset 0    4    6                                              56
       │    │    │                                               │
       ▼    ▼    ▼                                               ▼
       00 F8 E1 C3  TT TT  PP  ... 49 payload bytes ...           E5
       └─ marker ─┘ └type┘  └────────── payload ──────────┘  └term┘
```

- **Marker** — bytes 0–3 are always `00 F8 E1 C3`. None of these four values
  occur anywhere in payload (payload bytes are confined to `0x8D`–`0xBF` plus
  the `0xE5` terminator), so the marker is an unambiguous frame-sync.
- **Block type** — bytes 4–5 identify the block:

  | Bytes 4–5 | Type |
  |-----------|------|
  | `0F 64` | A |
  | `0F EC` | B |
  | `1E 66` | C |

- **Terminator** — byte 56 is always `0xE5`.
- **Refresh cycle** — blocks repeat in the order **A C B C** (228 bytes).
  Type C appears twice per cycle.

Types A and B drive a 7-segment display and encode the clock minutes with a
different, non-linear table. **Type C carries every scoreboard field in the
single linear encoding described below, so the decoder reads type-C blocks
only** (bytes 4–5 == `1E 66`) and ignores A and B.

## SC24-era framing (shot-clock module connected)

> Reverse-engineered 2026-06-13 after the **MR19SC24A00** shot-clock panel was
> daisy-chained to the console. **This is the framing the panel emits now.**

Connecting the SC24 module changed the framing. The marker is no longer a
contiguous `00 F8 E1 C3`; instead the frame is:

```
00 F8 E1  <prefix…>  C3  00 20 F6  FB  …payload…  E5
└─ sync ─┘ └ shot ─┘    └─ type ─┘ poss            term
            clock
```

- **Sync** is the 3-byte `00 F8 E1`.
- **Prefix** is variable length: **2 bytes** (`78 FC` / `F0 FC`) on regular
  frames, **7–8 bytes** on frames that carry shot-clock data. Frame length is
  therefore variable (≈60/65/66 bytes), not fixed at 57.
- After `C3` the type bytes shifted from the old `1E 66` to `00 20 F6` for
  type C (non-type-C frames carry `00 E0 EC`). There is an extra `00` byte, so
  the possession byte sits at **C3+4** (it was C3+3 / byte 6 in the original
  framing).
- The payload after the possession byte is the **same type-C layout** as
  below — every field is addressed relative to the possession byte, so one
  decoder serves both framings.

**The decoder anchors on the possession byte** and detects the layout from the
bytes after `C3` (`1E 66` → poss at C3+3; `00 20 F6` → poss at C3+4). It works
whether or not the SC24 module is connected. On the Pi, `Panel2Net.py` syncs on
the 3-byte `00 F8 E1` (the old 4-byte `00 F8 E1 C3` check stopped matching once
the prefix appeared, which silently dropped the whole panel into baud-cycling).

## Segment table

Type-C digit cells use a linear encoding:

```
byte = 0x9F - (2 × digit)
```

| Digit | Byte | Digit | Byte |
|-------|------|-------|------|
| 0 | `9F` | 5 | `95` |
| 1 | `9D` | 6 | `93` |
| 2 | `9B` | 7 | `91` |
| 3 | `99` | 8 | `8F` |
| 4 | `97` | 9 | `8D` |

A **blank cell** (leading-zero blanking, or an unused position) is `0xBF`.

Decode: `digit = (0x9F - byte) / 2`, valid for odd byte values `0x8D`–`0x9F`;
`0xBF` means the cell is blank.

All ten digit values are confirmed — the running-clock captures
(`clock_run_0930`, `clock_run_0045`) tick a digit cell through the full 0–9
range, and the same values appear at the score, period, and foul positions.

## Field offsets (type-C block)

Offsets are byte positions **within the 57-byte block**.

| Byte(s) | Field | Interpretation |
|---------|-------|----------------|
| 0–3 | marker | `00 F8 E1 C3` |
| 4–5 | block type | `1E 66` for type C |
| 6 | possession arrow | `FB` none · `EB` left · `DB` right |
| 7–10 | clock | see **Clock format** |
| 11 | home score hundreds | blank (`BF`) when score < 100 |
| 12 | home score tens | blank (`BF`) when score < 10 |
| 13 | home score units | digit |
| 14 | guest score hundreds | blank (`BF`) when score < 100 |
| 15 | guest score tens | blank (`BF`) when score < 10 |
| 16 | guest score units | digit |
| 17 | period | digit |
| 18 | home team fouls | digit |
| 19 | guest team fouls | digit |
| 20 | home timeouts | digit (count used) |
| 21 | guest timeouts | digit (count used) |
| 22 | unused | `BF` in every capture |
| 23 | clock-running flag | `9D` stopped · `9F` running |
| 24 | timeout-active flag | `BF` inactive · `9F` active |
| 25–48 | unmapped | constant `9F` in every capture — out of scope (likely player fouls / other modules) |
| 49 | timeout countdown tens | `BF` when no timeout active |
| 50 | timeout countdown units | `BF` when no timeout active |
| 51–55 | unused | `BF` in every capture |
| 56 | terminator | `E5` |

### Mapping to `StramatelSnapshot`

`StramatelSnapshot` is defined in `packages/shared/src/scoreboard.ts`.

| `StramatelSnapshot` field | Source | Notes |
|---------------------------|--------|-------|
| `scoreHome` | bytes 11–13 | `hundreds × 100 + tens × 10 + units`; blank cells ⇒ 0 |
| `scoreGuest` | bytes 14–16 | `hundreds × 100 + tens × 10 + units`; blank cells ⇒ 0 |
| `foulsHome` | byte 18 | digit |
| `foulsGuest` | byte 19 | digit |
| `timeoutsHome` | byte 20 | digit |
| `timeoutsGuest` | byte 21 | digit |
| `period` | byte 17 | digit |
| `clockText` | bytes 7–10 | `MM:SS` zero-padded, or `SS.t` sub-minute — see Clock format |
| `clockSeconds` | bytes 7–10 | `mm × 60 + ss` for MM:SS; `floor(seconds.tenths)` sub-minute; `null` if unparseable |
| `clockRunning` | byte 23 | `byte === 0x9F` |
| `shotClock` | shot-clock prefix + ingest carry-forward | `number | null` seconds — decoded from the prefix (see **Shot clock**), carried forward across the ~90% of frames that omit it |
| `shotClockText` | shot-clock prefix | display string: `"24"`…`"5"`, `"4.9"`…`"0.1"`, or `"0"` at expiry |
| `shotClockRunning` | derived in ingest | `true` when the carried value is decreasing — not trusted per-frame (see **Shot clock → Running flag**) |
| `timeoutActive` | byte 24 | `byte === 0x9F` |
| `timeoutDuration` | bytes 49–50 | two-digit countdown string; empty/`"0"` when no timeout |

The `clockText` / `clockSeconds` / `timeoutDuration` conventions mirror the
existing `apps/api/src/services/scoreboard/stramatel-decoder.ts` so both
decoders produce a consistent shape.

## Clock format

The clock occupies bytes 7–10. There are two modes:

- **MM:SS** (time ≥ 1:00) — `byte7 byte8 : byte9 byte10` = minutes-tens,
  minutes-units, seconds-tens, seconds-units. Byte 7 is blank (`BF`) when
  minutes < 10.
- **Sub-minute** (time < 1:00) — `byte7 byte8 . byte9` = seconds-tens,
  seconds-units, tenths. Byte 10 is blank (`BF`).

**Mode discriminator:** byte 10 is `0xBF` in sub-minute mode and a digit in
MM:SS mode. Decode as sub-minute when `byte10 === 0xBF`.

Worked examples:

| Capture | Bytes 7–10 | Decodes to |
|---------|-----------|------------|
| `base` | `9D 9F 9F 9F` | `10:00` |
| `clock_stop_0500` | `BF 9F 9F 9F`* | `5:00` (byte7 blank) |
| `clock_stop_0059` | `95 91 8D BF` | `57.9` (sub-minute) |

\* `clock_stop_0500` byte7 went `9D → BF`; bytes 8–10 stayed `9F`.

The running-clock captures confirm both modes tick correctly: `clock_run_0930`
decodes as `_9:22` → `_9:15`, and `clock_run_0045` decodes as `37.5` → `29.9`.

## Shot clock

> **SOLVED** 2026-06-14. The SC24 module's value is fully decoded from the
> variable-length frame **prefix** and validated against committed fixtures.

The shot-clock value rides in the frame **prefix** — the bytes between the
`00 F8 E1` sync and the first `C3` (see **SC24-era framing**). It is *not* in
bytes 25–48, where it was originally guessed.

The prefix carries shot data on only **~10% of frames**. The other ~90% carry a
2-byte prefix with no shot data, so the ingest layer carries the last decoded
value forward across frames (see **Carry-forward** below).

Prefix **byte 0** flickers between `0x18` / `0x30` / `0x38` and is ignored.
The decoded value lives in bytes 1–3.

### Classification

Classify on **prefix byte 2 first**, because prefix byte 1 overlaps between
modes (for example `0x68` is both the single-digit marker and a tenths-mode
column) while the byte-2 value ranges do not overlap. Once the mode is known,
the remaining bytes give the value.

### Two-digit (10–24)

Prefix **byte 1** selects the decade and **byte 2** gives the units. Units are
decade-independent (the same byte-2 value means the same units digit whether the
tens digit is 1 or 2).

| Byte 1 | Tens |
|--------|------|
| `0x98` | 2x (20–24) |
| `0xA8` | 1x (10–19) |

| Byte 2 | Units | Byte 2 | Units |
|--------|-------|--------|-------|
| `0x99` | 0 | `0x27` | 5 |
| `0x95` | 1 | `0xD3` | 6 |
| `0x93` | 2 | `0xCD` | 7 |
| `0x8D` | 3 | `0xCB` | 8 |
| `0x8B` | 4 | `0xC7` | 9 |

### Single-digit (5–9)

Prefix **byte 1** is `0x68`. The value is keyed on the **pair (byte 2, byte 3)**,
because byte 2 alone collides — 9 and 5 both use `0x3A`, so byte 3 disambiguates.

| (Byte 2, Byte 3) | Value |
|------------------|-------|
| `(0x3A, 0x5A)` | 9 |
| `(0x5A, 0x5A)` | 8 |
| `(0x6A, 0x5A)` | 7 |
| `(0x9A, 0x5A)` | 6 |
| `(0x3A, 0x6A)` | 5 |

### Tenths (under 5.0 s, shown as `S.t`)

Below 5.0 s the panel shows seconds and tenths (`S.t`), like the game clock's
sub-minute mode. Prefix **byte 1** encodes the integer second as a multiplex
column, and **byte 2** gives the tenths.

| Byte 1 | Integer second |
|--------|----------------|
| `0x58` | 4 |
| `0x68` | 3 |
| `0x98` | 2 |
| `0xA8` | 1 |
| `0xC8` | 0 |

Tenths come from byte 2:

```
tenths = (0x7F - byte2) / 2
```

So `0x7F` → .0, `0x7D` → .1, … `0x6D` → .9.

**Expiry "0"** encodes identically to 0.0 (byte 1 `0xC8`, byte 2 `0x7F`) and is
displayed as `"0"` rather than `"0.0"`.

### Running flag

Prefix **byte 4** is `0x2D` when running and `0x95` when stopped, but this is
reliable **only on 8-byte prefixes**. Two-digit units 6–9 and single-digit 5
use a **7-byte prefix**, where byte 4 sits in a different position, so the
per-frame running bit cannot be trusted across all values.

The decoded **value is always correct**; only the per-frame running flag is
unreliable. Therefore `shotClockRunning` is **not** read from byte 4. Instead it
is derived in the ingest layer from value movement: a decreasing carried value
means the clock is running.

This is best-effort: a manual reset to a *lower* value (e.g. 24 → 14 after an
offensive rebound) reads as "running" for the single frame of the drop, and a
reset to a higher or equal value does not flip the flag until the next tick.
`shotClockRunning` is informational only — the live and overlay scoreboards show
the value, not the flag.

### Carry-forward

Because the value is absent on ~90% of frames, the ingest layer holds the last
decoded value and re-emits it on prefix-less frames. A new prefix value replaces
the carried one; comparing successive carried values is what drives
`shotClockRunning`.

### Validation

This decode was validated against committed fixtures
`apps/api/src/services/scoreboard/__fixtures__/segment-shot-*.bin` — one per
value across the full 0.0–24 range, plus a complete running descent.

## Open questions

- **Bytes 25–48.** Constant `0x9F` across all 29 captures. Unmapped; out of
  scope for the current `StramatelSnapshot` contract (no player-level fields).
- **Timeout countdown range (bytes 49–50).** Only one running timeout value
  was captured (`41`). The digit encoding matches the segment table, but the
  countdown's start value and range are unconfirmed.
- **Types A and B.** Documented here only as part of the refresh cycle. Their
  payload layout was not fully mapped because type C is sufficient for the
  decoder. Their clock-minutes cells use a non-linear (true 7-segment) table —
  e.g. minutes-units `0 → 9F`, `5 → AB`, `9 → 6B` — distinct from the type-C
  linear encoding.

## Provenance

Captures live in the gitignored scratch directory `apps/pi/research/captures/`
(see its `LABELS.md` for the exact panel state of each). A curated subset is
committed under `apps/api/src/services/scoreboard/__fixtures__/segment-*.bin`
for the decoder plan's tests:

| Fixture | Panel state | Backs |
|---------|-------------|-------|
| `segment-base.bin` | 0–0, period 1, clock 10:00 stopped, no fouls/timeouts | frame structure, blank cells, MM:SS clock, digit 0 |
| `segment-score-h2.bin` | Home 2, Guest 0 | home-score units (byte 13), digit 2 |
| `segment-score-h10.bin` | Home 10, Guest 1 | home-score tens (byte 12), guest-score units (byte 16) |
| `segment-period-3.bin` | period 3 | period (byte 17) |
| `segment-foul-h3.bin` | Home fouls 3 | home fouls (byte 18) |
| `segment-clock-0059.bin` | clock stopped, displayed `57.9` | sub-minute clock format |
| `segment-clock-run-0930.bin` | clock running near 9:30 | MM:SS clock, clock-running flag (byte 23) |
| `segment-to-running.bin` | guest timeout 1, a timeout countdown running | timeout-active flag (byte 24), timeout countdown (bytes 49–50) |
| `segment-poss-left.bin` | possession arrow left (guest timeout 1 also set) | possession (byte 6) |
| `segment-score-g10.bin` | Home 0, Guest 12 | guest-score tens (byte 15) |
| `segment-score-3digit.bin` | Home 101, Guest 117 | score hundreds (bytes 11, 14) |

Other claims are backed by the matching capture in the scratch directory:
serial parameters by the `gate_*` sweep; the full 0–9 segment table by
`clock_run_0930` / `clock_run_0045`; per-field offsets by the `score_*`,
`period_*`, `foul_*`, `to_*`, `poss_*` captures.

Note: `segment-poss-left.bin` was captured with a leftover guest timeout
(byte 21 = `9D`). That is expected — possession lives in byte 6, and byte 21
reflects the stale timeout, not a possession side effect.
