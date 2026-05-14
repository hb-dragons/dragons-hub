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
| `shotClock` | — | not present in this stream; SC24 module not connected — emit `0` |
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

## Open questions

- **Shot clock.** The panel has an SC24 shot-clock module, but it was **not
  connected** during capture, so no shot-clock data appears in this stream.
  When the module is wired up, re-capture `shot_24` / `shot_run` and extend
  this spec — the field is likely within the unmapped bytes 25–48.
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
