# Stramatel Protocol Reverse Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reverse-engineer the Stramatel 452 M basketball panel's serial protocol and produce a written spec at `apps/pi/STRAMATEL-PROTOCOL.md`.

**Architecture:** A bash capture helper on the Raspberry Pi records raw bytes from `/dev/ttyACM0` at a chosen baud/framing. A Python analyzer classifies each capture. Phase 1 (framing gate) sweeps baud × framing against one fixed scoreboard state to rule out a serial mis-framing. If the protocol is confirmed new, Phase 2 builds the frame layout, segment table, and field offsets from controlled labelled captures. The decoder itself is a separate follow-up plan, written once this spec exists.

**Tech Stack:** bash, `stty`, systemd, Python 3, SSH (`ssh dragonspi`).

**Companion spec:** `docs/superpowers/specs/2026-05-14-stramatel-segment-decoder-design.md`

---

## File Structure

- `apps/pi/scripts/capture-serial.sh` — capture helper, deployed to and run on the Pi. One responsibility: configure the line and record N seconds of raw bytes.
- `apps/pi/scripts/analyze-capture.py` — single-capture analyzer (dev machine). One responsibility: classify a `.bin` capture (ascii ratio, known tokens, histogram, repeating period, verdict).
- `apps/pi/research/captures/` — gitignored scratch directory for pulled captures during RE.
- `apps/pi/STRAMATEL-PROTOCOL.md` — the deliverable: the reverse-engineered protocol spec.
- `apps/api/src/services/scoreboard/__fixtures__/` — existing fixtures directory; a curated labelled subset of captures is promoted here for the follow-up decoder plan.

---

## Task 1: Capture helper script

**Files:**
- Create: `apps/pi/scripts/capture-serial.sh`

- [ ] **Step 1: Write the capture helper**

Create `apps/pi/scripts/capture-serial.sh`:

```bash
#!/usr/bin/env bash
# capture-serial.sh — record raw bytes from a serial port at a given
# baud/framing, for protocol reverse engineering.
#
# The caller is responsible for stopping panel2net.service first (only one
# reader can own the port) and restarting it afterwards.
#
# Usage: capture-serial.sh <baud> <framing> <seconds> <label>
#   framing in: 8N1 7E1 7O1 7N2 8E1 8O1
# Output: ~/captures/<label>.bin
set -euo pipefail

PORT=/dev/ttyACM0
OUTDIR="$HOME/captures"

baud="${1:?usage: capture-serial.sh <baud> <framing> <seconds> <label>}"
framing="${2:?missing framing}"
secs="${3:?missing seconds}"
label="${4:?missing label}"

case "$framing" in
  8N1) flags="cs8 -parenb -cstopb" ;;
  7E1) flags="cs7 parenb -parodd -cstopb" ;;
  7O1) flags="cs7 parenb parodd -cstopb" ;;
  7N2) flags="cs7 -parenb cstopb" ;;
  8E1) flags="cs8 parenb -parodd -cstopb" ;;
  8O1) flags="cs8 parenb parodd -cstopb" ;;
  *) echo "unknown framing: $framing (want 8N1 7E1 7O1 7N2 8E1 8O1)" >&2; exit 1 ;;
esac

mkdir -p "$OUTDIR"
out="$OUTDIR/${label}.bin"

stty -F "$PORT" raw "$baud" $flags -echo
timeout "$secs" cat "$PORT" > "$out" || true

echo "captured $(wc -c < "$out") bytes -> $out  (baud=$baud framing=$framing ${secs}s)"
```

- [ ] **Step 2: Make it executable and deploy to the Pi**

Run:
```bash
chmod +x apps/pi/scripts/capture-serial.sh
scp apps/pi/scripts/capture-serial.sh dragonspi:~/capture-serial.sh
ssh dragonspi 'chmod +x ~/capture-serial.sh'
```
Expected: file copied, no errors.

- [ ] **Step 3: Verify Pi prerequisites**

Run:
```bash
ssh dragonspi 'id -nG | tr " " "\n" | grep -x dialout && echo DIALOUT_OK'
ssh dragonspi 'sudo -n systemctl is-active panel2net.service && echo SUDO_OK'
```
Expected: `DIALOUT_OK` (user `hb` can read the port without sudo) and `SUDO_OK` (passwordless sudo for systemctl works).
If `SUDO_OK` is missing: the operator must run the `systemctl stop/start` lines in later tasks manually in their own SSH session; note this and continue.

- [ ] **Step 4: Smoke-test one capture**

Run:
```bash
ssh dragonspi 'sudo systemctl stop panel2net.service'
ssh dragonspi '~/capture-serial.sh 19200 8N1 5 smoke'
ssh dragonspi 'sudo systemctl start panel2net.service'
ssh dragonspi 'wc -c ~/captures/smoke.bin'
```
Expected: the helper prints `captured <N> bytes` with N > 0, and `panel2net.service` is active again. Clean up: `ssh dragonspi 'rm ~/captures/smoke.bin'`.

- [ ] **Step 5: Commit**

```bash
git add apps/pi/scripts/capture-serial.sh
git commit -m "pi: add serial capture helper for protocol RE"
```

---

## Task 2: Gitignore the scratch captures directory

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add the ignore entry**

Append to `.gitignore` (after the `# Python bytecode` block):

```
# Protocol reverse-engineering scratch captures (not committed; promote
# curated fixtures to apps/api/src/services/scoreboard/__fixtures__/ instead)
apps/pi/research/
```

- [ ] **Step 2: Verify it is ignored**

Run:
```bash
mkdir -p apps/pi/research/captures && touch apps/pi/research/captures/probe.bin
git status --short apps/pi/research/
```
Expected: no output (the directory is ignored). Clean up: `rm apps/pi/research/captures/probe.bin`.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "pi: gitignore protocol RE scratch captures"
```

---

## Task 3: Capture analyzer

**Files:**
- Create: `apps/pi/scripts/analyze-capture.py`

- [ ] **Step 1: Write the analyzer**

Create `apps/pi/scripts/analyze-capture.py`:

```python
#!/usr/bin/env python3
"""Analyze a raw serial capture for protocol reverse engineering.

Reports size, printable-ASCII ratio, known-token counts, byte histogram,
and a detected repeating period, then prints a verdict.

Usage: analyze-capture.py <capture.bin>
"""
import sys
from collections import Counter

OLD_TOKENS = {b"\xf8\x33": "F833", b"\xe8\xe8\xe4": "E8E8E4", b"\x0d": "0D"}


def printable_ratio(data: bytes) -> float:
    if not data:
        return 0.0
    return sum(1 for b in data if 0x20 <= b <= 0x7E) / len(data)


def find_period(data: bytes, max_period: int = 512) -> int:
    """Smallest period p (>0.9 match) such that data[i] == data[i+p]."""
    n = len(data)
    if n < 64:
        return 0
    window = data[: n // 2]
    best_p, best_score = 0, 0.0
    for p in range(2, min(max_period, n // 2)):
        matches = sum(1 for i in range(len(window)) if data[i] == data[i + p])
        score = matches / len(window)
        if score > best_score:
            best_p, best_score = p, score
    return best_p if best_score > 0.9 else 0


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    data = open(sys.argv[1], "rb").read()
    ratio = printable_ratio(data)
    tokens = {name: data.count(tok) for tok, name in OLD_TOKENS.items()}
    hist = Counter(data).most_common(10)
    period = find_period(data)

    print(f"file        : {sys.argv[1]}")
    print(f"size        : {len(data)} bytes")
    print(f"ascii ratio : {ratio:.2f}")
    print("old tokens  : " + ", ".join(f"{k}={v}" for k, v in tokens.items()))
    print("top bytes   : " + ", ".join(f"{b:02x}:{c}" for b, c in hist))
    print(f"period      : {period if period else 'none'}")

    old_protocol = tokens["F833"] > 0 and ratio > 0.40
    verdict = (
        "LIKELY OLD PROTOCOL (mis-framed?)"
        if old_protocol
        else "UNRECOGNIZED - candidate new protocol"
    )
    print(f"verdict     : {verdict}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Make it executable and verify it fails cleanly with no args**

Run:
```bash
chmod +x apps/pi/scripts/analyze-capture.py
python3 apps/pi/scripts/analyze-capture.py
```
Expected: prints the usage docstring, exit code 2.

- [ ] **Step 3: Validate against the known old-protocol fixture**

The repo already contains a known sample of the *old* protocol. Run:
```bash
python3 apps/pi/scripts/analyze-capture.py apps/api/src/services/scoreboard/__fixtures__/stramatel-sample.bin
```
Expected: `old tokens` shows `F833` count well above 0, `ascii ratio` above 0.40, and `verdict : LIKELY OLD PROTOCOL`. This confirms the detector recognizes the old protocol — so a "UNRECOGNIZED" verdict on the new captures is meaningful.

- [ ] **Step 4: Commit**

```bash
git add apps/pi/scripts/analyze-capture.py
git commit -m "pi: add capture analyzer for protocol RE"
```

---

## Task 4: Phase 1 — framing-gate sweep and branch decision

**Files:** none created/modified — this task produces captures and a decision recorded in the next tasks.

This is an interactive runbook task: it needs the operator at the console.

- [ ] **Step 1: Operator sets the fixed reference state**

Ask the operator to set the panel to: **Basketball, Home 0 – Guest 0, period 1, game clock stopped at 10:00, no fouls, no timeouts.** Confirm it is displayed and stable.

- [ ] **Step 2: Run the 36-capture sweep**

Run from the dev machine:
```bash
ssh dragonspi 'sudo systemctl stop panel2net.service'
for baud in 1200 2400 4800 9600 19200 38400; do
  for fr in 8N1 7E1 7O1 7N2 8E1 8O1; do
    ssh dragonspi "~/capture-serial.sh $baud $fr 5 gate_${baud}_${fr}"
  done
done
ssh dragonspi 'sudo systemctl start panel2net.service'
```
Expected: 36 `captured <N> bytes` lines. Some combinations may capture 0 bytes — that is itself a signal (wrong baud → no readable framing).

- [ ] **Step 3: Pull captures to the scratch directory**

Run:
```bash
mkdir -p apps/pi/research/captures
scp 'dragonspi:~/captures/gate_*.bin' apps/pi/research/captures/
```
Expected: 36 `.bin` files in `apps/pi/research/captures/`.

- [ ] **Step 4: Analyze every capture**

Run:
```bash
for f in apps/pi/research/captures/gate_*.bin; do
  echo "=== $f ==="
  python3 apps/pi/scripts/analyze-capture.py "$f"
done
```
Expected: a report per file.

- [ ] **Step 5: Decide the branch**

Inspect the reports:
- **If any capture shows `verdict : LIKELY OLD PROTOCOL`** (or an obviously ASCII-heavy, structured stream): the protocol was a serial mis-framing. Record the winning `baud` and `framing`. **Branch 1** — skip Tasks 5 and 6, go to Task 7 and write a short `STRAMATEL-PROTOCOL.md` stating the correct serial parameters and that the existing `stramatel-decoder.ts` format applies (subject to offset re-verification in the follow-up decoder plan).
- **If every capture is `UNRECOGNIZED`**: confirmed new protocol. Note which baud/framing produced the cleanest, most stable stream (highest non-zero size with a detected `period`) — that is the native framing. **Branch 2** — continue to Task 5.

- [ ] **Step 6: Commit the decision note**

Record the outcome so far in the plan or a scratch note, then:
```bash
git commit --allow-empty -m "pi: framing-gate sweep complete - <Branch 1|Branch 2>, native framing <baud>/<framing>"
```

---

## Task 5: Phase 2 — labelled capture matrix (Branch 2 only)

**Files:** none created/modified — produces labelled captures in `apps/pi/research/captures/`.

Interactive runbook task. Use the native baud/framing identified in Task 4 Step 5. For every capture below, the operator sets the state, confirms it on the panel, then you run:
```bash
ssh dragonspi 'sudo systemctl stop panel2net.service'
ssh dragonspi "~/capture-serial.sh <BAUD> <FRAMING> 8 <label>"
ssh dragonspi 'sudo systemctl start panel2net.service'
```
and pull with `scp 'dragonspi:~/captures/<label>.bin' apps/pi/research/captures/`.

- [ ] **Step 1: Baseline**

Capture `base` — Basketball, 0–0, period 1, clock stopped at 10:00, no fouls, no timeouts.

- [ ] **Step 2: Score, one digit at a time**

Captures: `score_h1` (Home 1), `score_h2` (Home 2), `score_h3` (Home 3), `score_g1` (Home 3, Guest 1), `score_h10` (Home 10, Guest 1 — exercises tens carry). Operator returns to baseline between the home and guest series if needed.

- [ ] **Step 3: Game clock**

Captures: `clock_stop_1000` (stopped at 10:00 — same as baseline, recapture for cross-check), `clock_run_0930` (running, caught near 9:30), `clock_stop_0500` (stopped at 5:00), `clock_stop_0059` (stopped at 0:59 — sub-minute format), `clock_run_0045` (running, caught near 0:45).

- [ ] **Step 4: Period**

Captures: `period_2`, `period_3`, `period_4` (clock stopped, scores 0–0).

- [ ] **Step 5: Team fouls**

Captures: `foul_h1` … `foul_h5` (Home fouls 1–5), then `foul_g1` … `foul_g5` (Guest fouls 1–5). Scores 0–0, clock stopped.

- [ ] **Step 6: Timeouts**

Captures: `to_h1` (Home 1 timeout used), `to_g1` (Guest 1 timeout used), `to_running` (a timeout countdown actively running).

- [ ] **Step 7: Shot clock and possession**

Captures: `shot_24` (shot clock at 24 if the panel has the SC24 module), `shot_run` (shot clock running), `poss_left`, `poss_right` (possession arrow). If the panel has no shot-clock module, note that and skip the `shot_*` captures.

- [ ] **Step 8: Verify the capture set**

Run:
```bash
ls -la apps/pi/research/captures/*.bin
for f in apps/pi/research/captures/base.bin apps/pi/research/captures/score_h2.bin; do
  echo "=== $f ==="; python3 apps/pi/scripts/analyze-capture.py "$f"
done
```
Expected: every labelled capture present and non-empty, with a consistent detected `period` across them (same frame length).

- [ ] **Step 9: Commit the capture-set note**

```bash
git commit --allow-empty -m "pi: phase-2 labelled capture matrix recorded"
```

---

## Task 6: Phase 2 — frame structure, segment table, field offsets (Branch 2 only)

**Files:** none created/modified — analysis feeds Task 7.

Analysis runbook task. Work in a Python session (`python3`) loading captures with `data = open("apps/pi/research/captures/<label>.bin", "rb").read()`.

- [ ] **Step 1: Establish the frame structure**

Using the `period` reported by the analyzer on `base.bin`, slice the stream into repeating frames. Confirm the frame length is stable across `base.bin`, `period_2.bin`, and `score_h2.bin`. Identify the start marker and per-block terminators. Record: frame length, block boundaries, marker bytes.

- [ ] **Step 2: Locate dynamic byte positions per field**

For each varied capture, align one stable frame against the corresponding frame of `base.bin` and list the byte indices that differ. Example:
```python
base = open("apps/pi/research/captures/base.bin", "rb").read()
h2   = open("apps/pi/research/captures/score_h2.bin", "rb").read()
FLEN = <frame length from Step 1>
fb, fh = base[:FLEN], h2[:FLEN]   # use a clean aligned frame, not necessarily index 0
diffs = [i for i in range(FLEN) if fb[i] != fh[i]]
print(diffs, [(fb[i], fh[i]) for i in diffs])
```
Record which byte index(es) move for: home score, guest score, period, home fouls, guest fouls, home timeouts, guest timeouts, clock digits, clock-running flag, shot clock, possession.

- [ ] **Step 3: Build the segment table**

From `base` (digit 0), `score_h1` (1), `score_h2` (2), `score_h3` (3), and the clock-tick captures, read the byte value at the home-score units position for each known digit. Extend coverage using the clock digit positions (which cycle 0–9). Record the byte → digit map. Flag any digit value not observed in a capture as `unknown`.

- [ ] **Step 4: Decode the clock format**

Compare `clock_stop_1000`, `clock_stop_0500`, `clock_stop_0059`, and `clock_run_0930`. Determine the byte layout for minutes/seconds, the sub-minute format (per Stramatel docs the <1:00 representation differs), and which byte/bit indicates clock running vs stopped.

- [ ] **Step 5: Cross-check against an independent capture**

Pick a capture not used to build the table (e.g. `foul_h3` or `period_3`), decode it by hand using the draft table and offsets, and confirm it yields the known state. If it does not, revise the table/offsets and repeat.

- [ ] **Step 6: Commit the analysis note**

```bash
git commit --allow-empty -m "pi: phase-2 protocol analysis complete"
```

---

## Task 7: Write `STRAMATEL-PROTOCOL.md` and promote fixtures

**Files:**
- Create: `apps/pi/STRAMATEL-PROTOCOL.md`
- Create: `apps/api/src/services/scoreboard/__fixtures__/segment-*.bin` (curated copies)

- [ ] **Step 1: Write the protocol spec**

Create `apps/pi/STRAMATEL-PROTOCOL.md` with these sections, filled from the Task 4/6 findings:
- **Serial parameters** — port, baud, framing (the values confirmed in Task 4).
- **Frame structure** — overall frame length, start marker, block layout, per-block terminators.
- **Segment table** — the byte → digit map from Task 6 Step 3; mark unobserved values `unknown`.
- **Field offsets** — a table mapping each `StramatelSnapshot` field (`scoreHome`, `scoreGuest`, `foulsHome`, `foulsGuest`, `timeoutsHome`, `timeoutsGuest`, `period`, `clockText`/`clockSeconds`, `clockRunning`, `shotClock`, `timeoutActive`, `timeoutDuration`) to byte position(s) and how to interpret them.
- **Clock format** — minutes/seconds layout and the sub-minute representation from Task 6 Step 4.
- **Open questions** — any byte still `unknown`, and whether the panel has a shot-clock module.
- **Provenance** — for each non-trivial claim, the capture filename(s) that back it.

For Branch 1, the spec is short: it states the correct serial parameters and that the existing `stramatel-decoder.ts` frame format applies, with offset re-verification deferred to the decoder plan.

- [ ] **Step 2: Promote curated fixtures**

Copy a labelled, representative subset of captures into the committed fixtures directory so the follow-up decoder plan can write tests against them:
```bash
cp apps/pi/research/captures/base.bin       apps/api/src/services/scoreboard/__fixtures__/segment-base.bin
cp apps/pi/research/captures/score_h2.bin   apps/api/src/services/scoreboard/__fixtures__/segment-score-h2.bin
cp apps/pi/research/captures/period_3.bin   apps/api/src/services/scoreboard/__fixtures__/segment-period-3.bin
cp apps/pi/research/captures/foul_h3.bin    apps/api/src/services/scoreboard/__fixtures__/segment-foul-h3.bin
cp apps/pi/research/captures/clock_stop_0059.bin apps/api/src/services/scoreboard/__fixtures__/segment-clock-0059.bin
```
Add any others the spec relies on. Each promoted fixture's known state must be written in `STRAMATEL-PROTOCOL.md` so tests can assert against it.

- [ ] **Step 3: Verify no scratch files leak into the commit**

Run:
```bash
git status --short
```
Expected: only `apps/pi/STRAMATEL-PROTOCOL.md` and the `__fixtures__/segment-*.bin` files are staged/untracked — nothing under `apps/pi/research/`.

- [ ] **Step 4: Commit**

```bash
git add apps/pi/STRAMATEL-PROTOCOL.md apps/api/src/services/scoreboard/__fixtures__/segment-*.bin
git commit -m "pi: document reverse-engineered Stramatel 452 M protocol"
```

- [ ] **Step 5: Hand off to the decoder plan**

The protocol spec and labelled fixtures now exist. The follow-up plan — the decoder implementation (`Panel2Net.py` frame detection, `stramatel-segment-decoder.ts`, `ingest.ts` routing, Vitest tests) — should be written next via the brainstorming/writing-plans flow, using `STRAMATEL-PROTOCOL.md` as its input.

---

## Self-Review

**Spec coverage:**
- Capture methodology & tooling (spec §1) → Tasks 1, 2, 3 (tooling), Tasks 4, 5 (sweeps).
- RE analysis & spec deliverable (spec §2) → Tasks 4 (Phase 1 analysis), 6 (Phase 2 analysis), 7 (`STRAMATEL-PROTOCOL.md`).
- Decoder implementation & testing (spec §3) → deliberately deferred to the follow-up plan; Task 7 Step 5 hands off. Fixture promotion (Task 7 Step 2) prepares the test inputs the decoder plan needs.
- Done criteria (spec) — end-to-end validation belongs to the decoder plan, not this one. Consistent with scope.

**Placeholder scan:** No "TBD"/"TODO". The runbook tasks (4–6) intentionally produce findings rather than fixed code — that is the nature of reverse engineering — but every step has exact commands, exact inputs, and an explicit decision/record criterion. The one branch point (Task 4 Step 5) is fully specified for both outcomes.

**Type consistency:** `StramatelSnapshot` field names in Task 7 Step 1 match `apps/api/src/services/scoreboard/stramatel-decoder.ts` / `@dragons/shared`. Capture labels are consistent between Task 5 (created) and Tasks 6–7 (referenced): `base`, `score_h2`, `period_3`, `foul_h3`, `clock_stop_0059`.
