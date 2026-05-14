# Stramatel Segment Decoder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode the Stramatel 452 M segment protocol end to end — a new pure decoder, a segment-first dispatcher, the `ingest.ts` wiring, and the `Panel2Net.py` frame-detection branch — so the panel's live output reaches the scoreboard pipeline.

**Architecture:** A pure decoder (`stramatel-segment-decoder.ts`) turns 57-byte type-C blocks into `StramatelSnapshot`. A dispatcher (`scoreboard-decoder.ts`) tries the segment decoder first and falls back to the existing `F8 33` decoder. `ingest.ts` calls only the dispatcher. On the Pi, `Panel2Net.py` gets a 4th frame-detection branch that recognizes the `00 F8 E1 C3` marker and forwards hex.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess` on), Hono, Vitest v4, Node `Buffer`, Python 3 (`Panel2Net.py`), pnpm workspaces.

**Input spec:** `docs/superpowers/specs/2026-05-14-stramatel-segment-decoder-implementation-design.md`
**Protocol reference:** `apps/pi/STRAMATEL-PROTOCOL.md`

---

## Background an engineer needs before starting

- The protocol is fully documented in `apps/pi/STRAMATEL-PROTOCOL.md`. Read it. The short version: a 57-byte block, marker `00 F8 E1 C3` at bytes 0–3, block type at bytes 4–5 (`1E 66` = type C — the only type this decoder reads), terminator `0xE5` at byte 56. Digit cells encode `byte = 0x9F - 2 * digit` (so `0x9F`=0 … `0x8D`=9); a blank cell is `0xBF`.
- `StramatelSnapshot` is defined in `packages/shared/src/scoreboard.ts`. Both decoders must return this exact shape. Fields: `scoreHome`, `scoreGuest`, `foulsHome`, `foulsGuest`, `timeoutsHome`, `timeoutsGuest`, `period` (numbers); `clockText` (string), `clockSeconds` (`number | null`), `clockRunning` (boolean), `shotClock` (number), `timeoutActive` (boolean), `timeoutDuration` (string).
- The existing old-protocol decoder is `apps/api/src/services/scoreboard/stramatel-decoder.ts` — read it for the `clockText` / `clockSeconds` conventions this decoder mirrors (zero-padded `MM:SS`, sub-minute `SS.t`, `clockSeconds = null` when unparseable).
- Curated test fixtures already exist and are committed: `apps/api/src/services/scoreboard/__fixtures__/segment-*.bin`. They are raw binary captures. The exact decoded values for each are given in Task 1's test code — they were derived by decoding the fixtures against the protocol spec.
- The repo's vitest coverage thresholds (90% branches, 95% functions/lines/statements) are enforced **globally** across `apps/api`, not per-file.
- Run a single test file with: `pnpm --filter @dragons/api exec vitest run <path>`. Run everything with `pnpm --filter @dragons/api test`. Coverage with `pnpm --filter @dragons/api coverage`. Typecheck with `pnpm --filter @dragons/api typecheck`.
- Commit messages: no `Co-Authored-By` or AI-credit trailers (repo rule). Match the repo's prefix style (`api:`, `pi:`, `docs:`).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/test/segment-block-builder.ts` | create | Test helper — builds synthetic 57-byte type-C blocks. In `src/test/`, which coverage excludes. |
| `apps/api/src/services/scoreboard/stramatel-segment-decoder.ts` | create | Pure decoder: `decodeDigit`, `findSegmentFrames`, `decodeSegmentBlock`. No IO. |
| `apps/api/src/services/scoreboard/stramatel-segment-decoder.test.ts` | create | Unit tests + one assertion block per `segment-*.bin` fixture. |
| `apps/api/src/services/scoreboard/scoreboard-decoder.ts` | create | Dispatcher: `decodeLatestFrame(buf)` — segment-first, old decoder as fallback. |
| `apps/api/src/services/scoreboard/scoreboard-decoder.test.ts` | create | Routing tests. |
| `apps/api/src/services/scoreboard/ingest.ts` | modify | Replace the inline decode loop with one `decodeLatestFrame` call. |
| `apps/api/src/services/scoreboard/ingest.test.ts` | modify | Add a segment-protocol ingest case; keep the old-protocol cases passing. |
| `apps/pi/Panel2Net.py` | modify | Add a 4th frame-detection branch for marker `00 F8 E1 C3`. |
| `apps/pi/STRAMATEL-PROTOCOL.md` | modify (Task 5) | Promote byte 15 out of "Open questions" once confirmed live. |
| `apps/api/src/services/scoreboard/__fixtures__/segment-score-g10.bin` | create (Task 5) | New fixture: guest score ≥ 10, captured live to close the byte-15 gap. |

---

## Task 1: Segment decoder module

**Files:**
- Create: `apps/api/src/test/segment-block-builder.ts`
- Create: `apps/api/src/services/scoreboard/stramatel-segment-decoder.ts`
- Test: `apps/api/src/services/scoreboard/stramatel-segment-decoder.test.ts`
- Reference: `apps/api/src/services/scoreboard/__fixtures__/segment-*.bin` (existing fixtures)

- [ ] **Step 1: Create the synthetic-block test helper**

Create `apps/api/src/test/segment-block-builder.ts`:

```ts
/**
 * Test helper: build synthetic 57-byte type-C segment blocks for decoder
 * unit tests. Lives in src/test/ so the coverage config excludes it.
 */

/** Segment digit byte for digit 0–9: byte = 0x9F - 2 * digit. */
export function segmentDigit(digit: number): number {
  return 0x9f - 2 * digit;
}

/** A blank type-C cell. */
export const BLANK_CELL = 0xbf;

/**
 * Build a valid 57-byte type-C block. Baseline decodes to: scores/fouls/
 * timeouts 0, period 1, possession none, clock "10:00" stopped, no timeout.
 * Pass byte-offset overrides to vary specific fields.
 */
export function buildTypeCBlock(overrides: Record<number, number> = {}): Buffer {
  const block = Buffer.alloc(57, BLANK_CELL);
  // marker 00 F8 E1 C3
  block[0] = 0x00;
  block[1] = 0xf8;
  block[2] = 0xe1;
  block[3] = 0xc3;
  // block type C
  block[4] = 0x1e;
  block[5] = 0x66;
  // possession: none
  block[6] = 0xfb;
  // clock "10:00": digits 1, 0, 0, 0
  block[7] = segmentDigit(1);
  block[8] = segmentDigit(0);
  block[9] = segmentDigit(0);
  block[10] = segmentDigit(0);
  // period 1
  block[17] = segmentDigit(1);
  // clock-running flag: stopped (0x9D); running would be 0x9F
  block[23] = 0x9d;
  // terminator
  block[56] = 0xe5;
  for (const [offset, value] of Object.entries(overrides)) {
    block[Number(offset)] = value;
  }
  return block;
}
```

- [ ] **Step 2: Write the failing `decodeDigit` test**

Create `apps/api/src/services/scoreboard/stramatel-segment-decoder.test.ts`. The decoder-module import starts with just `decodeDigit` — later steps widen it as more exports exist, so the import line always matches what the module actually provides:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeDigit } from "./stramatel-segment-decoder";
import {
  BLANK_CELL,
  buildTypeCBlock,
  segmentDigit,
} from "../../test/segment-block-builder";

function fixture(name: string): Buffer {
  return readFileSync(resolve(import.meta.dirname, "__fixtures__", name));
}

describe("decodeDigit", () => {
  it("decodes all ten digit bytes", () => {
    const bytes = [0x9f, 0x9d, 0x9b, 0x99, 0x97, 0x95, 0x93, 0x91, 0x8f, 0x8d];
    bytes.forEach((byte, digit) => {
      expect(decodeDigit(byte)).toBe(digit);
    });
  });

  it("returns null for a blank cell", () => {
    expect(decodeDigit(0xbf)).toBeNull();
  });

  it("returns null for a byte outside the segment table", () => {
    expect(decodeDigit(0x00)).toBeNull();
    expect(decodeDigit(0x9e)).toBeNull(); // even byte inside the value range
    expect(decodeDigit(0xff)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api exec vitest run src/services/scoreboard/stramatel-segment-decoder.test.ts`
Expected: FAIL — `decodeDigit` (and the other imports) are not exported / the module does not exist.

- [ ] **Step 4: Create the module with constants and `decodeDigit`**

Create `apps/api/src/services/scoreboard/stramatel-segment-decoder.ts`:

```ts
import type { StramatelSnapshot } from "@dragons/shared";

const MARKER = Buffer.from([0x00, 0xf8, 0xe1, 0xc3]);
const BLOCK_LENGTH = 57;
const TERMINATOR = 0xe5;
const TYPE_C_HIGH = 0x1e;
const TYPE_C_LOW = 0x66;
const BLANK_CELL = 0xbf;
const RUNNING_FLAG = 0x9f; // bytes 23/24: 0x9F means running / active

/**
 * Decode a type-C digit cell. Returns the digit 0–9, or null when the cell is
 * blank (0xBF) or holds a value outside the segment table.
 * Encoding: byte = 0x9F - 2 * digit, so digit = (0x9F - byte) / 2 for odd
 * bytes in 0x8D–0x9F.
 */
export function decodeDigit(byte: number): number | null {
  if (byte >= 0x8d && byte <= 0x9f && byte % 2 === 1) {
    return (0x9f - byte) / 2;
  }
  return null;
}
```

- [ ] **Step 5: Run the test to verify `decodeDigit` passes**

Run: `pnpm --filter @dragons/api exec vitest run src/services/scoreboard/stramatel-segment-decoder.test.ts`
Expected: PASS — the three `decodeDigit` tests.

- [ ] **Step 6: Add the failing `findSegmentFrames` tests**

In `stramatel-segment-decoder.test.ts`, widen the decoder-module import to add `findSegmentFrames`:

```ts
import { decodeDigit, findSegmentFrames } from "./stramatel-segment-decoder";
```

Then append:

```ts
describe("findSegmentFrames", () => {
  it("returns no frames for an empty buffer", () => {
    expect(findSegmentFrames(Buffer.alloc(0))).toEqual([]);
  });

  it("returns no frames when the marker is absent", () => {
    expect(findSegmentFrames(Buffer.from("deadbeefcafe", "hex"))).toEqual([]);
  });

  it("extracts type-C blocks from a real fixture", () => {
    const frames = findSegmentFrames(fixture("segment-base.bin"));
    expect(frames.length).toBeGreaterThan(30);
    for (const f of frames) {
      expect(f).toHaveLength(57);
      expect(f[4]).toBe(0x1e);
      expect(f[5]).toBe(0x66);
      expect(f[56]).toBe(0xe5);
    }
  });

  it("ignores type A and type B blocks", () => {
    const typeA = buildTypeCBlock({ 4: 0x0f, 5: 0x64 });
    const typeB = buildTypeCBlock({ 4: 0x0f, 5: 0xec });
    const typeC = buildTypeCBlock();
    const frames = findSegmentFrames(Buffer.concat([typeA, typeB, typeC]));
    expect(frames).toHaveLength(1);
    expect(frames[0]![4]).toBe(0x1e);
  });

  it("drops a truncated trailing block", () => {
    const whole = buildTypeCBlock();
    const truncated = buildTypeCBlock().subarray(0, 30);
    const frames = findSegmentFrames(Buffer.concat([whole, truncated]));
    expect(frames).toHaveLength(1);
  });

  it("drops a block whose terminator is wrong", () => {
    const bad = buildTypeCBlock({ 56: 0x00 });
    expect(findSegmentFrames(bad)).toEqual([]);
  });
});
```

- [ ] **Step 7: Run the tests to verify the new ones fail**

Run: `pnpm --filter @dragons/api exec vitest run src/services/scoreboard/stramatel-segment-decoder.test.ts`
Expected: FAIL — `findSegmentFrames` is not exported.

- [ ] **Step 8: Implement `findSegmentFrames`**

Append to `stramatel-segment-decoder.ts`:

```ts
/**
 * Find every well-formed type-C segment block in a buffer.
 * A block is kept only when it is a full 57 bytes, ends with the 0xE5
 * terminator, and carries the type-C signature (bytes 4–5 = 1E 66).
 * Type A, type B, and truncated or malformed slices are dropped.
 */
export function findSegmentFrames(buf: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  let cursor = 0;
  while (cursor < buf.length) {
    const idx = buf.indexOf(MARKER, cursor);
    if (idx === -1) break;
    const block = buf.subarray(idx, idx + BLOCK_LENGTH);
    if (
      block.length === BLOCK_LENGTH &&
      block[BLOCK_LENGTH - 1] === TERMINATOR &&
      block[4] === TYPE_C_HIGH &&
      block[5] === TYPE_C_LOW
    ) {
      frames.push(block);
    }
    cursor = idx + 1;
  }
  return frames;
}
```

- [ ] **Step 9: Run the tests to verify `findSegmentFrames` passes**

Run: `pnpm --filter @dragons/api exec vitest run src/services/scoreboard/stramatel-segment-decoder.test.ts`
Expected: PASS — all `decodeDigit` and `findSegmentFrames` tests. (The `decodeSegmentBlock` tests are added in the next step.)

- [ ] **Step 10: Add the failing `decodeSegmentBlock` tests**

In `stramatel-segment-decoder.test.ts`, widen the decoder-module import to add `decodeSegmentBlock`:

```ts
import {
  decodeDigit,
  decodeSegmentBlock,
  findSegmentFrames,
} from "./stramatel-segment-decoder";
```

Then append:

```ts
describe("decodeSegmentBlock — structural guards", () => {
  it("returns null for a block of the wrong length", () => {
    expect(decodeSegmentBlock(buildTypeCBlock().subarray(0, 56))).toBeNull();
  });

  it("returns null when the marker is wrong", () => {
    expect(decodeSegmentBlock(buildTypeCBlock({ 0: 0x01 }))).toBeNull();
  });

  it("returns null for a non-type-C block", () => {
    expect(decodeSegmentBlock(buildTypeCBlock({ 4: 0x0f, 5: 0x64 }))).toBeNull();
  });

  it("returns null when the terminator is wrong", () => {
    expect(decodeSegmentBlock(buildTypeCBlock({ 56: 0x00 }))).toBeNull();
  });
});

describe("decodeSegmentBlock — fields", () => {
  it("decodes the baseline synthetic block", () => {
    expect(decodeSegmentBlock(buildTypeCBlock())).toEqual({
      scoreHome: 0,
      scoreGuest: 0,
      foulsHome: 0,
      foulsGuest: 0,
      timeoutsHome: 0,
      timeoutsGuest: 0,
      period: 1,
      clockText: "10:00",
      clockSeconds: 600,
      clockRunning: false,
      shotClock: 0,
      timeoutActive: false,
      timeoutDuration: "",
    });
  });

  it("decodes a two-digit home score (tens + units)", () => {
    const block = buildTypeCBlock({ 12: segmentDigit(1), 13: segmentDigit(7) });
    expect(decodeSegmentBlock(block)!.scoreHome).toBe(17);
  });

  it("treats an invalid digit byte as 0", () => {
    const block = buildTypeCBlock({ 13: 0x00 });
    expect(decodeSegmentBlock(block)!.scoreHome).toBe(0);
  });

  it("decodes the clock-running and timeout-active flags", () => {
    const block = buildTypeCBlock({ 23: 0x9f, 24: 0x9f });
    const snapshot = decodeSegmentBlock(block)!;
    expect(snapshot.clockRunning).toBe(true);
    expect(snapshot.timeoutActive).toBe(true);
  });

  it("decodes a sub-minute clock (byte 10 blank)", () => {
    const block = buildTypeCBlock({
      7: segmentDigit(5),
      8: segmentDigit(7),
      9: segmentDigit(9),
      10: BLANK_CELL,
    });
    const snapshot = decodeSegmentBlock(block)!;
    expect(snapshot.clockText).toBe("57.9");
    expect(snapshot.clockSeconds).toBe(57);
  });

  it("decodes an MM:SS clock with blanked minutes-tens", () => {
    const block = buildTypeCBlock({
      7: BLANK_CELL,
      8: segmentDigit(9),
      9: segmentDigit(2),
      10: segmentDigit(2),
    });
    const snapshot = decodeSegmentBlock(block)!;
    expect(snapshot.clockText).toBe("09:22");
    expect(snapshot.clockSeconds).toBe(562);
  });

  it("emits clockSeconds null when a clock byte is unparseable", () => {
    const block = buildTypeCBlock({ 9: 0x00 });
    const snapshot = decodeSegmentBlock(block)!;
    expect(snapshot.clockSeconds).toBeNull();
    expect(snapshot.clockText).toBe("10:00");
  });

  it("decodes a two-digit timeout countdown", () => {
    const block = buildTypeCBlock({
      24: 0x9f,
      49: segmentDigit(4),
      50: segmentDigit(1),
    });
    expect(decodeSegmentBlock(block)!.timeoutDuration).toBe("41");
  });
});

describe("decodeSegmentBlock — fixtures", () => {
  function decodeFixture(name: string) {
    const frames = findSegmentFrames(fixture(name));
    expect(frames.length).toBeGreaterThan(0);
    const snapshot = decodeSegmentBlock(frames[0]!);
    expect(snapshot).not.toBeNull();
    return snapshot!;
  }

  it("segment-base.bin → 0–0, period 1, 10:00 stopped", () => {
    expect(decodeFixture("segment-base.bin")).toMatchObject({
      scoreHome: 0,
      scoreGuest: 0,
      foulsHome: 0,
      foulsGuest: 0,
      timeoutsHome: 0,
      timeoutsGuest: 0,
      period: 1,
      clockText: "10:00",
      clockSeconds: 600,
      clockRunning: false,
      timeoutActive: false,
      shotClock: 0,
    });
  });

  it("segment-score-h2.bin → home 2, guest 0", () => {
    expect(decodeFixture("segment-score-h2.bin")).toMatchObject({
      scoreHome: 2,
      scoreGuest: 0,
    });
  });

  it("segment-score-h10.bin → home 10, guest 1", () => {
    expect(decodeFixture("segment-score-h10.bin")).toMatchObject({
      scoreHome: 10,
      scoreGuest: 1,
    });
  });

  it("segment-period-3.bin → period 3", () => {
    expect(decodeFixture("segment-period-3.bin").period).toBe(3);
  });

  it("segment-foul-h3.bin → home fouls 3", () => {
    expect(decodeFixture("segment-foul-h3.bin").foulsHome).toBe(3);
  });

  it("segment-clock-0059.bin → sub-minute 57.9", () => {
    expect(decodeFixture("segment-clock-0059.bin")).toMatchObject({
      clockText: "57.9",
      clockSeconds: 57,
    });
  });

  it("segment-clock-run-0930.bin → MM:SS clock, running", () => {
    expect(decodeFixture("segment-clock-run-0930.bin")).toMatchObject({
      clockText: "09:22",
      clockSeconds: 562,
      clockRunning: true,
    });
  });

  it("segment-to-running.bin → timeout active, countdown running", () => {
    expect(decodeFixture("segment-to-running.bin")).toMatchObject({
      timeoutActive: true,
      timeoutsGuest: 1,
      timeoutDuration: "40",
    });
  });

  it("segment-poss-left.bin → decodes cleanly, stale guest timeout", () => {
    // Possession (byte 6) is not mapped to StramatelSnapshot. This fixture was
    // captured with a leftover guest timeout — byte 21 reflects that, not a
    // possession side effect (see STRAMATEL-PROTOCOL.md Provenance note).
    expect(decodeFixture("segment-poss-left.bin")).toMatchObject({
      scoreHome: 0,
      scoreGuest: 0,
      timeoutsGuest: 1,
    });
  });
});
```

- [ ] **Step 11: Run the tests to verify the new ones fail**

Run: `pnpm --filter @dragons/api exec vitest run src/services/scoreboard/stramatel-segment-decoder.test.ts`
Expected: FAIL — `decodeSegmentBlock` is not exported.

- [ ] **Step 12: Implement `decodeSegmentBlock` and its helpers**

Append to `stramatel-segment-decoder.ts`:

```ts
/** Lenient digit read for numeric fields: a blank or invalid cell counts as 0. */
function digitOrZero(byte: number): number {
  return decodeDigit(byte) ?? 0;
}

/** True when a clock byte is either a valid digit cell or a blank cell. */
function isClockByte(byte: number): boolean {
  return byte === BLANK_CELL || decodeDigit(byte) !== null;
}

interface ClockFields {
  clockText: string;
  clockSeconds: number | null;
}

/**
 * Decode the four clock bytes (block offsets 7–10).
 * byte10 === 0xBF -> sub-minute mode "SS.t"; otherwise zero-padded "MM:SS".
 * If any clock byte is neither a digit nor blank, clockSeconds is null but
 * clockText is still emitted best-effort — this mirrors the old decoder.
 */
function decodeClock(
  b7: number,
  b8: number,
  b9: number,
  b10: number,
): ClockFields {
  const allValid =
    isClockByte(b7) && isClockByte(b8) && isClockByte(b9) && isClockByte(b10);
  if (b10 === BLANK_CELL) {
    const seconds = digitOrZero(b7) * 10 + digitOrZero(b8);
    const tenths = digitOrZero(b9);
    return {
      clockText: `${seconds}.${tenths}`,
      clockSeconds: allValid ? seconds : null,
    };
  }
  const minutes = digitOrZero(b7) * 10 + digitOrZero(b8);
  const seconds = digitOrZero(b9) * 10 + digitOrZero(b10);
  return {
    clockText: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    clockSeconds: allValid ? minutes * 60 + seconds : null,
  };
}

/** Decode the two-digit timeout countdown (block offsets 49–50). */
function decodeTimeoutDuration(b49: number, b50: number): string {
  if (b49 === BLANK_CELL && b50 === BLANK_CELL) return "";
  return `${digitOrZero(b49)}${digitOrZero(b50)}`;
}

/**
 * Decode one 57-byte type-C block into a StramatelSnapshot.
 * Returns null when the block fails structural validation (length, marker,
 * type, or terminator). Bad field bytes are decoded leniently rather than
 * rejecting the whole block.
 */
export function decodeSegmentBlock(block: Buffer): StramatelSnapshot | null {
  if (block.length !== BLOCK_LENGTH) return null;
  if (
    block[0] !== MARKER[0] ||
    block[1] !== MARKER[1] ||
    block[2] !== MARKER[2] ||
    block[3] !== MARKER[3]
  ) {
    return null;
  }
  if (block[4] !== TYPE_C_HIGH || block[5] !== TYPE_C_LOW) return null;
  if (block[BLOCK_LENGTH - 1] !== TERMINATOR) return null;

  const { clockText, clockSeconds } = decodeClock(
    block[7]!,
    block[8]!,
    block[9]!,
    block[10]!,
  );

  return {
    scoreHome: digitOrZero(block[12]!) * 10 + digitOrZero(block[13]!),
    scoreGuest: digitOrZero(block[15]!) * 10 + digitOrZero(block[16]!),
    foulsHome: digitOrZero(block[18]!),
    foulsGuest: digitOrZero(block[19]!),
    timeoutsHome: digitOrZero(block[20]!),
    timeoutsGuest: digitOrZero(block[21]!),
    period: digitOrZero(block[17]!),
    clockText,
    clockSeconds,
    clockRunning: block[23] === RUNNING_FLAG,
    shotClock: 0,
    timeoutActive: block[24] === RUNNING_FLAG,
    timeoutDuration: decodeTimeoutDuration(block[49]!, block[50]!),
  };
}
```

- [ ] **Step 13: Run the test file to verify all decoder tests pass**

Run: `pnpm --filter @dragons/api exec vitest run src/services/scoreboard/stramatel-segment-decoder.test.ts`
Expected: PASS — every test in the file.

- [ ] **Step 14: Run typecheck and the full API test suite**

Run: `pnpm --filter @dragons/api typecheck`
Expected: no errors.
Run: `pnpm --filter @dragons/api test`
Expected: all tests pass (the new file plus the existing suite, unchanged).

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/test/segment-block-builder.ts \
        apps/api/src/services/scoreboard/stramatel-segment-decoder.ts \
        apps/api/src/services/scoreboard/stramatel-segment-decoder.test.ts
git commit -m "api: add Stramatel 452 M segment-protocol decoder"
```

---

## Task 2: Protocol dispatcher

**Files:**
- Create: `apps/api/src/services/scoreboard/scoreboard-decoder.ts`
- Test: `apps/api/src/services/scoreboard/scoreboard-decoder.test.ts`

- [ ] **Step 1: Write the failing dispatcher tests**

Create `apps/api/src/services/scoreboard/scoreboard-decoder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeLatestFrame } from "./scoreboard-decoder";
import { buildTypeCBlock, segmentDigit } from "../../test/segment-block-builder";

function fixture(name: string): Buffer {
  return readFileSync(resolve(import.meta.dirname, "__fixtures__", name));
}

// A minimal old-protocol frame: F8 33 + 48-byte ASCII payload + 0D.
// Payload layout matches stramatel-decoder.ts fixed offsets — home score
// "  9" at bytes 6..9, guest "  4" at bytes 9..12, MM:SS "10:00".
function oldProtocolFrame(): Buffer {
  const payload =
    "  " + // 0..2 filler
    "10" + // 2..4 mm
    "00" + // 4..6 ss
    "  9" + // 6..9 scoreHome
    "  4" + // 9..12 scoreGuest
    "1" + // 12 period
    "0" + // 13 foulsHome
    "0" + // 14 foulsGuest
    "0" + // 15 timeoutsHome
    "0" + // 16 timeoutsGuest
    " " + // 17 filler
    " " + // 18 status
    " " + // 19 timeout
    "                        " + // 20..44 filler (24 chars)
    "00" + // 44..46 timeoutDuration
    "20"; // 46..48 shotClock
  return Buffer.concat([
    Buffer.from([0xf8, 0x33]),
    Buffer.from(payload, "ascii"),
    Buffer.from([0x0d]),
  ]);
}

describe("decodeLatestFrame", () => {
  it("routes a segment-protocol buffer through the segment decoder", () => {
    const result = decodeLatestFrame(fixture("segment-score-h2.bin"));
    expect(result).not.toBeNull();
    expect(result!.frame).toHaveLength(57);
    expect(result!.snapshot.scoreHome).toBe(2);
    expect(result!.snapshot.scoreGuest).toBe(0);
  });

  it("falls back to the old decoder when no segment frame is present", () => {
    const result = decodeLatestFrame(oldProtocolFrame());
    expect(result).not.toBeNull();
    expect(result!.frame[0]).toBe(0xf8);
    expect(result!.snapshot.scoreHome).toBe(9);
    expect(result!.snapshot.scoreGuest).toBe(4);
  });

  it("returns null for a buffer with no recognizable frame", () => {
    expect(decodeLatestFrame(Buffer.from("deadbeefcafe", "hex"))).toBeNull();
  });

  it("returns the last decodable type-C block when several are present", () => {
    const first = buildTypeCBlock({ 13: segmentDigit(3) }); // home score 3
    const last = buildTypeCBlock({ 13: segmentDigit(7) }); // home score 7
    const result = decodeLatestFrame(Buffer.concat([first, last]));
    expect(result).not.toBeNull();
    expect(result!.snapshot.scoreHome).toBe(7);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api exec vitest run src/services/scoreboard/scoreboard-decoder.test.ts`
Expected: FAIL — `./scoreboard-decoder` does not exist.

- [ ] **Step 3: Implement the dispatcher**

Create `apps/api/src/services/scoreboard/scoreboard-decoder.ts`:

```ts
import type { StramatelSnapshot } from "@dragons/shared";
import {
  decodeSegmentBlock,
  findSegmentFrames,
} from "./stramatel-segment-decoder";
import { decodeScoreFrame, findScoreFrames } from "./stramatel-decoder";

export interface DecodedFrame {
  /** The raw bytes that decoded — stored as rawHex by the ingest path. */
  frame: Buffer;
  snapshot: StramatelSnapshot;
}

/**
 * Decode the most recent scoreboard frame in a buffer.
 *
 * The segment protocol (00 F8 E1 C3 marker) is tried first; the old F8 33
 * decoder is the fallback. Both decoders are pure and unaware of each other —
 * this is the only unit that knows two protocols exist. Iterating from the end
 * picks the most recent panel state in a multi-frame capture window.
 */
export function decodeLatestFrame(buf: Buffer): DecodedFrame | null {
  const segmentFrames = findSegmentFrames(buf);
  for (let i = segmentFrames.length - 1; i >= 0; i--) {
    const frame = segmentFrames[i]!;
    const snapshot = decodeSegmentBlock(frame);
    if (snapshot) return { frame, snapshot };
  }

  const oldFrames = findScoreFrames(buf);
  for (let i = oldFrames.length - 1; i >= 0; i--) {
    const frame = oldFrames[i]!;
    const snapshot = decodeScoreFrame(frame);
    if (snapshot) return { frame, snapshot };
  }

  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @dragons/api exec vitest run src/services/scoreboard/scoreboard-decoder.test.ts`
Expected: PASS — all four tests.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @dragons/api typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/scoreboard/scoreboard-decoder.ts \
        apps/api/src/services/scoreboard/scoreboard-decoder.test.ts
git commit -m "api: add segment-first scoreboard decoder dispatcher"
```

---

## Task 3: Wire `ingest.ts` to the dispatcher

**Files:**
- Modify: `apps/api/src/services/scoreboard/ingest.ts` (imports at lines 8–12; decode block at lines 62–81)
- Test: `apps/api/src/services/scoreboard/ingest.test.ts` (add one case)

- [ ] **Step 1: Add the failing segment-protocol ingest test**

In `apps/api/src/services/scoreboard/ingest.test.ts`, inside the existing `describe("processIngest", ...)` block, add this test after the `"decodes the latest real frame in a multi-frame capture window"` test:

```ts
  it("decodes a segment-protocol (00 F8 E1 C3) capture", async () => {
    const fixture = readFileSync(
      resolve(import.meta.dirname, "__fixtures__/segment-score-h2.bin"),
    );
    const r = await processIngest({
      deviceId: "d1",
      hex: fixture.toString("hex"),
    });
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(true);
    expect(r.snapshotId).toEqual(expect.any(Number));
    const live = await ctx.db.select().from(liveScoreboards);
    expect(live).toHaveLength(1);
    expect(live[0]!.scoreHome).toBe(2);
    expect(live[0]!.scoreGuest).toBe(0);
    expect(mocks.publishSnapshot).toHaveBeenCalledTimes(1);
  });
```

(`readFileSync`, `resolve`, `liveScoreboards`, and `mocks` are already imported at the top of this test file — no new imports needed.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dragons/api exec vitest run src/services/scoreboard/ingest.test.ts`
Expected: FAIL on the new test — `ingest.ts` still uses `findScoreFrames`, which does not recognize the `00 F8 E1 C3` marker, so `processIngest` returns `{ changed: false, snapshotId: null }`.

- [ ] **Step 3: Replace the imports in `ingest.ts`**

In `apps/api/src/services/scoreboard/ingest.ts`, replace this import block (currently lines 8–12):

```ts
import {
  decodeScoreFrame,
  findScoreFrames,
  type StramatelSnapshot,
} from "./stramatel-decoder";
```

with:

```ts
import { decodeLatestFrame } from "./scoreboard-decoder";
import type { StramatelSnapshot } from "@dragons/shared";
```

- [ ] **Step 4: Replace the decode block in `ingest.ts`**

In `processIngest`, replace this block (currently lines 62–81, starting at `const frames = findScoreFrames(buf);` and ending at the closing brace of the `if (!decoded || !frame)` guard):

```ts
  const frames = findScoreFrames(buf);
  if (frames.length === 0) {
    return { ok: true, changed: false, snapshotId: null };
  }
  // Pick the latest frame that actually decodes. The capture stream
  // contains E8 E8 E4 preamble bursts that look like frames but fail the
  // ASCII guard; iterate from the end so we land on the most recent real
  // Stramatel frame.
  let decoded: ReturnType<typeof decodeScoreFrame> = null;
  let frame: Buffer | undefined;
  for (let i = frames.length - 1; i >= 0; i--) {
    decoded = decodeScoreFrame(frames[i]!);
    if (decoded) {
      frame = frames[i]!;
      break;
    }
  }
  if (!decoded || !frame) {
    return { ok: true, changed: false, snapshotId: null };
  }
```

with:

```ts
  // Decode the latest frame from whichever protocol the buffer carries — the
  // segment protocol is tried first, the old F8 33 decoder is the fallback.
  // See scoreboard-decoder.ts.
  const result = decodeLatestFrame(buf);
  if (!result) {
    return { ok: true, changed: false, snapshotId: null };
  }
  const { frame, snapshot: decoded } = result;
```

The code below this point is unchanged: it already uses `decoded` (the snapshot) and `frame` (for `frame.toString("hex")`). `decoded` is now a non-null `StramatelSnapshot`.

- [ ] **Step 5: Run the ingest tests to verify they pass**

Run: `pnpm --filter @dragons/api exec vitest run src/services/scoreboard/ingest.test.ts`
Expected: PASS — the new segment-protocol test and every existing old-protocol test (the old-protocol cases now reach the old decoder through the dispatcher fallback).

- [ ] **Step 6: Run typecheck, the full suite, and coverage**

Run: `pnpm --filter @dragons/api typecheck`
Expected: no errors.
Run: `pnpm --filter @dragons/api test`
Expected: all tests pass.
Run: `pnpm --filter @dragons/api coverage`
Expected: passes — global thresholds (90% branches, 95% functions/lines/statements) still met.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/scoreboard/ingest.ts \
        apps/api/src/services/scoreboard/ingest.test.ts
git commit -m "api: route scoreboard ingest through the protocol dispatcher"
```

---

## Task 4: `Panel2Net.py` segment-protocol branch

**Files:**
- Modify: `apps/pi/Panel2Net.py` (insert a new `elif` after the old-Stramatel branch, which currently ends at line 198)

- [ ] **Step 1: Add the segment-protocol detection branch**

In `apps/pi/Panel2Net.py`, find the old-Stramatel branch — it starts at `elif (((response_hex.find(b'F83320') != -1)` and ends with `RetryCount = 0` (currently line 198). Immediately after that branch's `RetryCount = 0` line and before the next `elif` (the SwissTiming branch, `elif (((response_hex.find(b'0254')`), insert this new branch:

```python
                        elif ((response_hex.find(b'00F8E1C3') != -1) and (response_hex.rfind(b'E5') != -1)):
                            # found Stramatel 452 M segment protocol - ours to forward
                            StartToken = response_hex.find(b'00F8E1C3')
                            EndToken = response_hex.rfind(b'E5')
                            # End Token + 2: the 'E5' terminator is two hex chars, no checksum follows
                            remainder_hex = response_hex[EndToken + 2:]
                            response_hex = response_hex[StartToken:EndToken + 2]
                            # Forward HEX text: the API route does Buffer.from(hex, "hex").
                            # The other Stramatel branch posts the raw bytes instead;
                            # that path is the API-side fallback only and is left as-is.
                            response = response_hex
                            RequestURL = '/api/scoreboard/ingest'
                            should_post = True
                            RetryCount = 0
```

Indentation must match the surrounding `elif` branches exactly (24 spaces before `elif`). `response_hex` is uppercase here because the non-hex serial bytes go through `binascii.hexlify(...).upper()` earlier in the loop, so the literals `b'00F8E1C3'` and `b'E5'` are uppercase to match.

- [ ] **Step 2: Verify the file still parses as valid Python**

Run: `python3 -m py_compile apps/pi/Panel2Net.py`
Expected: no output, exit code 0 (syntax is valid).

- [ ] **Step 3: Confirm the branch is correctly placed**

Run: `grep -n "find(b'F83320')\|find(b'00F8E1C3')\|find(b'0254')" apps/pi/Panel2Net.py`
Expected: three lines, in this order — `F83320` (old Stramatel), then `00F8E1C3` (the new branch), then `0254` (SwissTiming).

- [ ] **Step 4: Commit**

```bash
git add apps/pi/Panel2Net.py
git commit -m "pi: forward Stramatel 452 M segment protocol frames"
```

---

## Task 5: Deploy to the Pi and close the byte-15 gap

This task involves the real panel and the Raspberry Pi. It needs the operator (the human partner) to set panel states — pause and ask them at each interactive step, the same way the reverse-engineering capture session worked.

**Pi access:** `ssh dragonspi`. The deployed `Panel2Net.py` lives at `/home/hb/Panel2Net/Panel2Net.py`. There is passwordless sudo for `systemctl start|stop|restart panel2net.service`. The capture helper is `apps/pi/scripts/capture-serial.sh` (already on the Pi under `~/`, or copy it over) — it writes to `~/captures/<label>.bin` and requires the service stopped first.

**Files:**
- Create: `apps/api/src/services/scoreboard/__fixtures__/segment-score-g10.bin` (captured live)
- Modify: `apps/api/src/services/scoreboard/stramatel-segment-decoder.test.ts` (add the g10 fixture test)
- Modify: `apps/pi/STRAMATEL-PROTOCOL.md` (promote byte 15 out of "Open questions")

- [ ] **Step 1: Deploy the updated `Panel2Net.py`**

```bash
scp apps/pi/Panel2Net.py dragonspi:/home/hb/Panel2Net/Panel2Net.py
ssh dragonspi 'sudo systemctl restart panel2net.service && sleep 3 && systemctl is-active panel2net.service'
```

Expected: `active`.

- [ ] **Step 2: Confirm the Pi recognizes and forwards segment frames**

```bash
ssh dragonspi 'sleep 5 && tail -n 30 /tmp/Panel2Net.log'
```

Expected: the log shows POSTs returning `200`, and no `Panel not recognized` / `Changing Baudrate` lines. (The production API cannot decode the segment protocol yet — it returns `200` with no state change — but a `200` here confirms the Pi-side branch matches the marker and forwards. The full panel → DB path goes live when this branch is merged and the API redeploys.)

If the log instead shows `Panel not recognized`: STOP. The marker match is failing — re-check the branch from Task 4 and the `00F8E1C3` literal casing.

- [ ] **Step 3: Ask the operator to set a guest score of 10 or more**

Ask the operator to set the panel to **guest score ≥ 10** (any home score) and tell you the exact guest score they set. Wait for their confirmation before continuing.

- [ ] **Step 4: Capture the guest-score state from the panel**

Replace `<GUEST_SCORE>` with the value the operator reported (used only in the label):

```bash
ssh dragonspi 'sudo systemctl stop panel2net.service && \
  ~/scripts/capture-serial.sh 19200 8N1 5 score-g<GUEST_SCORE> ; \
  sudo systemctl start panel2net.service'
```

If `~/scripts/capture-serial.sh` is not present on the Pi, copy it first: `scp apps/pi/scripts/capture-serial.sh dragonspi:~/scripts/capture-serial.sh && ssh dragonspi 'chmod +x ~/scripts/capture-serial.sh'`.

Expected: `captured <N> bytes -> /home/hb/captures/score-g<GUEST_SCORE>.bin` with N in the thousands.

- [ ] **Step 5: Pull the capture into the gitignored scratch directory**

```bash
mkdir -p apps/pi/research/captures
scp dragonspi:~/captures/score-g<GUEST_SCORE>.bin apps/pi/research/captures/score-g<GUEST_SCORE>.bin
```

(`apps/pi/research/` is gitignored — this is scratch, not a committed fixture yet.)

- [ ] **Step 6: Promote the capture to a committed fixture**

```bash
cp apps/pi/research/captures/score-g<GUEST_SCORE>.bin \
   apps/api/src/services/scoreboard/__fixtures__/segment-score-g10.bin
```

- [ ] **Step 7: Add a decoder test for the guest-score fixture**

In `apps/api/src/services/scoreboard/stramatel-segment-decoder.test.ts`, inside the `describe("decodeSegmentBlock — fixtures", ...)` block, add (replace `<GUEST_SCORE>` with the actual number the operator set):

```ts
  it("segment-score-g10.bin → guest score >= 10 confirms byte 15", () => {
    expect(decodeFixture("segment-score-g10.bin").scoreGuest).toBe(<GUEST_SCORE>);
  });
```

- [ ] **Step 8: Run the decoder test to confirm byte 15 decodes correctly**

Run: `pnpm --filter @dragons/api exec vitest run src/services/scoreboard/stramatel-segment-decoder.test.ts`
Expected: PASS, including the new `segment-score-g10.bin` test.

If it FAILS — the decoded `scoreGuest` does not match — then byte 15 is **not** the symmetric mapping the spec assumed. STOP and use the superpowers:systematic-debugging skill: decode the raw capture byte by byte (the `analyze.py` approach in `apps/pi/research/`) to find where the guest-score tens actually live, then correct `decodeSegmentBlock` and `STRAMATEL-PROTOCOL.md` before continuing.

- [ ] **Step 9: Update `STRAMATEL-PROTOCOL.md` — promote byte 15 out of "Open questions"**

In `apps/pi/STRAMATEL-PROTOCOL.md`:

1. In the **Field offsets** table, change the byte-15 row's interpretation from `**unknown** — see **Open questions**` to `guest score tens — blank (BF) when score < 10` (matching the byte-12 home-score-tens row).
2. In the **Mapping to `StramatelSnapshot`** table, change the `scoreGuest` row's Notes from `same; byte 15 mapping unconfirmed (see Open questions)` to `tens × 10 + units; byte 15 blank ⇒ tens 0`.
3. In the **Open questions** section, delete the entire `**Guest score tens (byte 15).**` bullet.
4. In the **Provenance** table, add a row: `| segment-score-g10.bin | Guest <GUEST_SCORE> | guest-score tens (byte 15) |`.

- [ ] **Step 10: Ask the operator to sweep the remaining panel states**

Ask the operator to step the panel through: a home score change, a period change, a team-foul change, a timeout with the countdown running, and the clock running. After each, confirm verbally with them that it is set. These are a confidence sweep — no captures need to be committed — but if any state looks wrong when the API is later deployed, that is the list to re-capture. Note in your report to the operator that the full panel → Pi → API → live-scoreboard check completes once this branch is merged and the API redeploys.

- [ ] **Step 11: Run the full API suite and coverage**

Run: `pnpm --filter @dragons/api test`
Expected: all tests pass.
Run: `pnpm --filter @dragons/api coverage`
Expected: passes — global thresholds still met.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/services/scoreboard/__fixtures__/segment-score-g10.bin \
        apps/api/src/services/scoreboard/stramatel-segment-decoder.test.ts \
        apps/pi/STRAMATEL-PROTOCOL.md
git commit -m "api: confirm segment-protocol guest-score tens (byte 15)"
```

---

## Done criteria

- `pnpm --filter @dragons/api test` and `pnpm --filter @dragons/api coverage` both pass.
- `pnpm --filter @dragons/api typecheck` passes.
- `decodeLatestFrame` decodes every `segment-*.bin` fixture to its labelled panel state, and still decodes old `F8 33` frames via the fallback.
- `Panel2Net.py` is deployed; the Pi log shows segment frames forwarding with `200` and no baud-cycling.
- Byte 15 (guest score tens) is confirmed against a live capture, with a committed fixture, a passing test, and `STRAMATEL-PROTOCOL.md` updated.
- After this branch merges and the API redeploys, the live scoreboard reflects the panel end to end — call this out to the operator; it is the one check that cannot be done from a feature branch.
