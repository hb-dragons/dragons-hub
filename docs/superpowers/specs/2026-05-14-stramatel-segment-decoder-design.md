# Stramatel Segment-Protocol Reverse Engineering & Decoder — Design

**Date:** 2026-05-14
**Status:** Approved (brainstorming) — pending spec review
**Branch:** `stramatel-segment-decoder`

## Context

The Raspberry Pi (`apps/pi/Panel2Net.py`) taps the serial line between the
club's Stramatel basketball console and its LED panel, and POSTs raw hex to
`POST /api/scoreboard/ingest`. The API decodes it via
`apps/api/src/services/scoreboard/stramatel-decoder.ts` into a
`StramatelSnapshot` (`@dragons/shared`), which feeds the live scoreboard,
SSE stream, and Twitch broadcast overlay.

The current panel — Stramatel Multisport Serie 452 M, console reference
`MR20MD7000L00` — does not produce either protocol the code understands:

- **Not** the 2017 raw panel-drive format (`F8 33` / `E8 E8 E4` … `0D`,
  ASCII payload at fixed offsets) that `stramatel-decoder.ts` expects.
- **Not** the documented Bodet/Stramatel "Network output" format
  (`01 7F 02 47 … 03 LRC`) from reference `608264A`.

A 6-minute SSH capture of `/dev/ttyACM0` shows a continuous, highly regular,
repeating frame stream — roughly 4–5 blocks per refresh cycle with distinct
terminators — whose bytes look like LED segment patterns rather than ASCII.
A clock is visibly ticking inside it, so the data is real and structured, not
line noise. The 452 M console has **no menu option to change its output
protocol** (confirmed against the full operating manual `UFXBF20MXX1XX_H`);
Stramatel's own "SL Video System" software decodes this same stream, so the
format is deterministic — it just is not published.

One detail from the capture and from the operator's own `parity.py` probe on
the Pi: the data nibbles only ever took odd values (bit 0 always set), which
is a known symptom of a serial **framing mismatch** (7 data bits read as 8, or
a parity bit captured as data). That observation shapes the approach below.

## Goal

Produce a working decoder for this panel's basketball output, so the live
scoreboard, SSE stream, and broadcast overlay show correct values during
real games.

## Non-goals

- Other sports (handball, volleyball, …). Basketball only — confirmed with
  the operator.
- Player-level points/fouls and team names. The current `StramatelSnapshot`
  contract does not include them; out of scope.
- Pursuing the protocol spec from Stramatel. The operator has chosen to
  reverse-engineer.

## Approach

**Approach A — framing-elimination gate, then semantic reverse engineering.**

Before building a new decoder, rule out a serial-framing mismatch: the "new
protocol" may be the old protocol read at the wrong baud/framing. If a framing
gate finds known structure, the fix collapses to a serial-config change. Only
if the gate finds nothing do we treat it as a genuinely new protocol and
reverse-engineer it from controlled labelled captures.

The operator has full, on-demand access to the console, so controlled
labelled captures are practical.

## Section 1 — Capture methodology & tooling

**Capture helper.** A small routine, run over SSH per capture: stop
`panel2net.service`, set the line discipline (`stty -F /dev/ttyACM0 raw
<baud> <framing>`), capture N seconds of raw bytes
(`timeout <N> cat /dev/ttyACM0 > <label>.bin`), restart the service. The
filename encodes both the serial settings and the known scoreboard state.

**Storage.** Captures live on the Pi under `~/captures/` and are pulled to a
gitignored scratch directory in the repo during reverse engineering. Only a
curated, labelled subset is promoted to committed test fixtures under
`apps/api/src/services/scoreboard/__fixtures__/`. A `.gitignore` entry for the
scratch directory is added as part of implementation.

**Phase 1 — framing gate.** The operator holds the panel at one fixed known
state (Basketball, 0–0, period 1, clock stopped at 10:00, no fouls, no
timeouts). We sweep the matrix:

- baud ∈ {1200, 2400, 4800, 9600, 19200, 38400}
- framing ∈ {8N1, 7E1, 7O1, 7N2, 8E1, 8O1}
- 36 captures, roughly 5 s each.

This is more thorough than the existing `parity.py` probe: longer reads, all
bauds, and comparison against a known state rather than only grepping for
`F8 33`.

**Phase 2 — semantic-RE capture matrix** (only if the gate finds nothing). At
the native framing, controlled captures varying **one field at a time** from a
baseline:

- baseline: all zero, clock stopped
- score: Home 0→1→2→3, Guest 0→1 (isolates per-digit encoding and tens carry)
- clock: stopped vs running; values 10:00, 5:00, 0:59 (Stramatel docs show the
  sub-minute format differs)
- period: 1→2→3→4
- fouls: Home 0→1→2→3→4→5, then Guest
- timeouts: Home/Guest; a timeout running
- shot clock: only if the panel has the SC24 module — visible from the data
- possession arrow: left/right

The operator labels each capture precisely as it is taken.

## Section 2 — RE analysis & the spec deliverable

**Phase 1 analysis.** For each of the 36 captures: printable-ASCII ratio,
presence of the old `F8 33` / `0D` tokens, byte-value histogram,
repeating-structure detection. If one framing resolves into known structure,
reverse engineering is finished — the protocol was mis-framed, and decoder
work collapses to a serial-config fix (Branch 1 below). If nothing resolves,
the protocol is confirmed new and we proceed to Phase 2.

**Phase 2 analysis.**

- **Frame structure** — identify markers/delimiters, frame length, and block
  layout. The captured stream already shows distinct per-block terminators.
- **Static vs dynamic** — diff the baseline against each one-field-varied
  capture to find which byte positions move for which field.
- **Segment encoding** — from score 0→1→2→3 and the ticking clock, build the
  byte→digit table.
- **Field offsets** — map each `StramatelSnapshot` field to byte position(s).
- **Edge cases** — tens carry (9→10), sub-minute clock format, leading-zero
  blanking, clock-running flag, period.

**Deliverable: a standalone protocol spec at `apps/pi/STRAMATEL-PROTOCOL.md`** —
framing parameters, frame layout, per-field byte offsets, and the segment→value
table. The decoder is built from it, and it lets anyone re-derive or extend the
work later.

**Rule:** every claim in the spec must be backed by at least one labelled
capture. Bytes we cannot explain are flagged `unknown` rather than guessed.

## Section 3 — Decoder implementation & testing

Two branches, decided by the Phase 1 outcome.

**Branch 1 — framing gate succeeds (old protocol, mis-framed).**

- `Panel2Net.py`: set the serial configuration to the winning baud/framing.
- `stramatel-decoder.ts`: may need offset/format adjustments for this specific
  basketball panel (the existing fixture is from a different panel). Adjust and
  re-verify against the new fixtures.
- Small change.

**Branch 2 — confirmed new protocol.**

- `Panel2Net.py`: add a detection branch for the new frame markers and forward
  raw hex (`should_post = True`, matching the existing Stramatel branch).
  Existing branches stay intact.
- New API module `apps/api/src/services/scoreboard/stramatel-segment-decoder.ts`
  — parses the new frame format and produces a `StramatelSnapshot`.
- `ingest.ts`: route by frame marker — dispatch each frame to the matching
  decoder (existing or segment) based on its start bytes.

**Contract.** Either branch outputs the existing `StramatelSnapshot` shape from
`@dragons/shared`. The database, SSE stream, and broadcast publisher are
untouched.

**Testing.**

- Labelled captures become committed `.bin` fixtures in `__fixtures__/`.
- Vitest: `decode(fixture)` equals the expected `StramatelSnapshot` for each
  known state — covering the segment table, field offsets, and edge cases
  (tens carry, sub-minute clock, blanking).
- Coverage thresholds (90% branches, 95% functions/lines/statements) apply to
  the new decoder and are enforced.
- `Panel2Net.py`: no Pi-side test infrastructure exists today. Where practical,
  factor frame detection into a pure function with a small Python test;
  otherwise verify manually end to end.
- End-to-end validation: a controlled session where the operator changes the
  scoreboard state and we confirm the `liveScoreboards` row and the live page
  reflect it.

**Docs sync.** Update `apps/pi/README.md`, the new `apps/pi/STRAMATEL-PROTOCOL.md`,
and `AGENTS.md` where it documents the ingest/decoder path.

## Validation / done criteria

During a controlled console session, every field in scope (score, clock,
period, fouls, timeouts, and shot clock if the module is present) changes on
the panel and is reflected correctly in the API `liveScoreboards` row and on
the live scoreboard page.

## Risks & open questions

- **Panel module set unknown.** Whether this panel has the SC24 shot-clock
  module or individual-foul modules affects which fields appear in the frame.
  Resolved by inspecting the captures.
- **Segment encoding may not be a clean 7-segment map.** The odd-only-nibble
  observation suggests the encoding or framing is unusual. Phase 1 addresses
  framing; if Phase 2 still yields an irregular map, the segment table is built
  empirically from captures regardless.
- **`Panel2Net.py` test coverage.** The Pi side has no test harness; frame
  detection there is verified manually or via a minimal standalone test.
- **Service path inconsistency.** `panel2net.service` references
  `/home/pi/Panel2Net/` while the files live in `/home/hb/Panel2Net/`. Noted
  for cleanup during implementation; not blocking.

## References

- `docs/superpowers/specs/2026-04-29-stramatel-live-scoreboard-design.md` —
  the existing scoreboard ingest pipeline.
- `docs/superpowers/specs/2026-04-30-twitch-broadcast-overlay-design.md` —
  the broadcast overlay that consumes `StramatelSnapshot`.
- `apps/api/src/services/scoreboard/stramatel-decoder.ts` — current decoder
  (old protocol).
- `apps/pi/Panel2Net.py` — the Pi-side capture/forward script.
- Stramatel "SL Video System" notice `UF452SLVIDEO_J` — confirms the same
  stream is decodable; serial settings shown as 19200 8N1 over RS485.
- Stramatel 452 M console manual `UFXBF20MXX1XX_H` — confirms no
  protocol-selection menu on this console.
