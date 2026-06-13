# SC24 Shot-Clock Decode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode the exact Stramatel SC24 shot-clock value (whole seconds 5–24, tenths under 5 s, "0" at expiry) from the frame prefix, carry it across frames in ingest, and surface it on `StramatelSnapshot` + the web scoreboard — with no regression when the SC24 module is absent.

**Architecture:** A pure table-driven `decodeShotClock(prefix)` reads the value from the variable-length frame prefix. `decodeLatestFrame` scans the buffer newest-first for the latest shot-bearing frame so a snapshot reflects the most recent reading even though ~90% of frames carry none. The ingest layer carries the value forward across POSTs (via the DB `liveScoreboards` row) and derives `shotClockRunning` from value movement, because the per-frame running flag is unreliable on 7-byte prefixes.

**Tech Stack:** TypeScript, Hono, Drizzle ORM (Postgres), Vitest, Next.js (web), pnpm workspaces.

**Design spec:** `docs/superpowers/specs/2026-06-13-stramatel-shotclock-decode-design.md`

---

## Decode reference (used throughout)

Prefix = bytes between the `00 F8 E1` sync and the first `C3`. `p[0]` flickers (`0x18/0x30/0x38`) — ignore. Classify on `p[2]` **first** (p[1] ranges overlap across modes; p[2] ranges don't):

```
TENTHS (0.0–4.9):  p[2] odd in 0x6d..0x7f AND p[1] in {0x58,0x68,0x98,0xa8,0xc8}
                   integer = {0x58:4,0x68:3,0x98:2,0xa8:1,0xc8:0}[p[1]]
                   tenths  = (0x7f - p[2]) / 2          value = integer + tenths/10
TWO-DIGIT (10–24): p[1] in {0x98:20s, 0xa8:10s}
                   units = {0x99:0,0x95:1,0x93:2,0x8d:3,0x8b:4,
                            0x27:5,0xd3:6,0xcd:7,0xcb:8,0xc7:9}[p[2]]   value = decade+units
SINGLE 5–9:        p[1]==0x68, key (p[2],p[3]) =
                   {(0x3a,0x5a):9,(0x5a,0x5a):8,(0x6a,0x5a):7,(0x9a,0x5a):6,(0x3a,0x6a):5}
RUNNING HINT:      p[4]==0x2d running / 0x95 stopped (reliable only on 8-byte prefixes)
```

`"0"` at expiry encodes as `0.0` (`p[1]=0xc8, p[2]=0x7f`); display string is `"0"`.

---

## File structure

- Create: `apps/api/src/services/scoreboard/shot-clock-decoder.ts` — pure `decodeShotClock`.
- Create: `apps/api/src/services/scoreboard/shot-clock-decoder.test.ts`.
- Create: 16 fixtures under `apps/api/src/services/scoreboard/__fixtures__/segment-shot-*.bin`.
- Modify: `apps/api/src/services/scoreboard/stramatel-segment-decoder.ts` — expose prefix, emit shot fields.
- Modify: `apps/api/src/services/scoreboard/scoreboard-decoder.ts` — buffer-level latest-shot scan.
- Modify: `apps/api/src/services/scoreboard/ingest.ts` — carry-forward + running inference + dedupe keys.
- Modify: `packages/shared/src/scoreboard.ts` — snapshot shape.
- Modify: `packages/db/src/schema/scoreboard.ts` + new migration.
- Modify: `apps/web/.../live/scoreboard-live.tsx`, `.../overlay/score-bug.tsx`, `.../admin/scoreboard/scoreboard-debug.tsx` + their tests.
- Modify: `apps/pi/STRAMATEL-PROTOCOL.md`.

---

## Task 1: Promote capture fixtures

**Files:**
- Create: `apps/api/src/services/scoreboard/__fixtures__/segment-shot-{24,20,14,9,8,7,6,5,40,30,20t,10t,31,05,expiry0,desc}.bin`
- Create: `apps/api/src/services/scoreboard/__fixtures__/SHOT-CLOCK-FIXTURES.md`

- [ ] **Step 1: Copy the gitignored captures into the committed fixtures dir**

```bash
cd /Users/jn/git/dragons-all
C=apps/pi/research/captures
F=apps/api/src/services/scoreboard/__fixtures__
cp $C/sc24_stop.bin   $F/segment-shot-24.bin
cp $C/sc20_stop.bin   $F/segment-shot-20.bin
cp $C/sc14_stop.bin   $F/segment-shot-14.bin
cp $C/sd9_run.bin     $F/segment-shot-9.bin
cp $C/sd8.bin         $F/segment-shot-8.bin
cp $C/sd7.bin         $F/segment-shot-7.bin
cp $C/sd6.bin         $F/segment-shot-6.bin
cp $C/sd5b.bin        $F/segment-shot-5.bin
cp $C/t40.bin         $F/segment-shot-40.bin
cp $C/t30.bin         $F/segment-shot-30.bin
cp $C/t20.bin         $F/segment-shot-20t.bin
cp $C/t10.bin         $F/segment-shot-10t.bin
cp $C/t31.bin         $F/segment-shot-31.bin
cp $C/t05.bin         $F/segment-shot-05.bin
cp $C/expiry0.bin     $F/segment-shot-expiry0.bin
cp $C/sc_desc.bin     $F/segment-shot-desc.bin
```

- [ ] **Step 2: Write the fixture manifest**

Create `SHOT-CLOCK-FIXTURES.md` documenting each fixture's displayed value and capture date (2026-06-13, paused unless noted), mirroring `research/captures/LABELS.md`:

```markdown
# Shot-clock decode fixtures (captured 2026-06-13, 19200 8N1, SC24 connected)

Each holds the panel at a known shot-clock value (paused unless noted).

| Fixture | Displayed value |
|---|---|
| segment-shot-24 | 24 |
| segment-shot-20 | 20 |
| segment-shot-14 | 14 |
| segment-shot-9 | 9 |
| segment-shot-8 | 8 |
| segment-shot-7 | 7 |
| segment-shot-6 | 6 |
| segment-shot-5 | 5 |
| segment-shot-40 | 4.0 |
| segment-shot-30 | 3.0 |
| segment-shot-20t | 2.0 |
| segment-shot-10t | 1.0 |
| segment-shot-31 | 3.1 |
| segment-shot-05 | 0.5 |
| segment-shot-expiry0 | 0 (expiry hold) |
| segment-shot-desc | running descent 24 -> 0.0 (multi-value) |
```

- [ ] **Step 3: Verify fixtures are NOT gitignored**

Run: `git check-ignore apps/api/src/services/scoreboard/__fixtures__/segment-shot-24.bin; echo "exit=$?"`
Expected: `exit=1` (not ignored — `__fixtures__` is a committed path).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/scoreboard/__fixtures__/segment-shot-*.bin \
        apps/api/src/services/scoreboard/__fixtures__/SHOT-CLOCK-FIXTURES.md
git commit -m "test(scoreboard): add SC24 shot-clock decode fixtures"
```

---

## Task 2: Pure `decodeShotClock`

**Files:**
- Create: `apps/api/src/services/scoreboard/shot-clock-decoder.ts`
- Test: `apps/api/src/services/scoreboard/shot-clock-decoder.test.ts`

- [ ] **Step 1: Write the failing test** (`shot-clock-decoder.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { decodeShotClock } from "./shot-clock-decoder";

// Prefix bytes are passed directly (sync+3 .. first C3), p[0] = flicker byte.
const px = (...bytes: number[]) => Buffer.from(bytes);

describe("decodeShotClock", () => {
  it("returns null for a short (no-shot-data) prefix", () => {
    expect(decodeShotClock(px(0x78, 0xfc))).toBeNull();
    expect(decodeShotClock(Buffer.alloc(0))).toBeNull();
  });

  it("decodes two-digit values (decade-independent units)", () => {
    expect(decodeShotClock(px(0x18, 0x98, 0x8b, 0x2d, 0x95, 0x95, 0x7f, 0xf0)))
      .toMatchObject({ value: 24, text: "24" });
    expect(decodeShotClock(px(0x18, 0x98, 0x99, 0x2d, 0x95, 0x95, 0x6f, 0xf0)))
      .toMatchObject({ value: 20, text: "20" });
    expect(decodeShotClock(px(0x18, 0xa8, 0x8b, 0x2d, 0x95, 0x95, 0x7f, 0xf0)))
      .toMatchObject({ value: 14, text: "14" });
    expect(decodeShotClock(px(0x18, 0xa8, 0xc7, 0x4b, 0x4b, 0x65, 0x5b)))
      .toMatchObject({ value: 19, text: "19" });
  });

  it("decodes single-digit plain values 5-9 via (p2,p3)", () => {
    expect(decodeShotClock(px(0x18, 0x68, 0x3a, 0x5a, 0x95, 0x95, 0x73, 0xf0)))
      .toMatchObject({ value: 9, text: "9" });
    expect(decodeShotClock(px(0x18, 0x68, 0x3a, 0x6a, 0xaa, 0x95, 0x6f, 0xf0)))
      .toMatchObject({ value: 5, text: "5" }); // p2=3a collides with 9; p3=6a => 5
  });

  it("decodes tenths under 5s: value fractional, text 'I.t'", () => {
    expect(decodeShotClock(px(0x18, 0x58, 0x7f, 0x2d, 0x95, 0x95, 0x7f, 0xf0)))
      .toMatchObject({ value: 4, text: "4.0" });
    expect(decodeShotClock(px(0x18, 0x68, 0x7d, 0x2d, 0x95, 0x95, 0x7d, 0xf0)))
      .toMatchObject({ value: 3.1, text: "3.1" });
    expect(decodeShotClock(px(0x18, 0xc8, 0x75, 0x2d, 0x95, 0x95, 0x75, 0xf0)))
      .toMatchObject({ value: 0.5, text: "0.5" });
  });

  it("decodes expiry 0 (encoded as 0.0) with display '0'", () => {
    expect(decodeShotClock(px(0x18, 0xc8, 0x7f, 0x2d, 0x95, 0x95, 0x7f, 0xf0)))
      .toMatchObject({ value: 0, text: "0" });
  });

  it("reports the running hint from p[4] on 8-byte prefixes", () => {
    expect(decodeShotClock(px(0x18, 0x98, 0x8d, 0x2d, 0x2d, 0x95, 0x6d, 0xf0))?.runningHint).toBe(true);
    expect(decodeShotClock(px(0x18, 0x98, 0x8b, 0x2d, 0x95, 0x95, 0x7f, 0xf0))?.runningHint).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test shot-clock-decoder`
Expected: FAIL — `decodeShotClock` not exported.

- [ ] **Step 3: Write the implementation** (`shot-clock-decoder.ts`)

```ts
/**
 * Decode the SC24 shot-clock value from a Stramatel frame prefix.
 *
 * The value rides in the variable-length prefix (bytes between the 00 F8 E1
 * sync and the first C3), present on ~10% of frames. p[0] flickers and is
 * ignored. See docs/superpowers/specs/2026-06-13-stramatel-shotclock-decode-design.md
 * and apps/pi/STRAMATEL-PROTOCOL.md "Shot clock".
 */
export interface ShotClockReading {
  /** Seconds; fractional (e.g. 4.7) under 5 s; 0 at expiry. */
  value: number;
  /** Display string: "24" | "4.7" | "0". */
  text: string;
  /** p[4] running flag; reliable only on 8-byte prefixes (else best-effort). */
  runningHint: boolean;
}

const TENTHS_INT: Record<number, number> = {
  0x58: 4, 0x68: 3, 0x98: 2, 0xa8: 1, 0xc8: 0,
};
const TWO_DIGIT_UNITS: Record<number, number> = {
  0x99: 0, 0x95: 1, 0x93: 2, 0x8d: 3, 0x8b: 4,
  0x27: 5, 0xd3: 6, 0xcd: 7, 0xcb: 8, 0xc7: 9,
};
// (p2 << 8) | p3 -> single-digit plain value.
const SINGLE: Record<number, number> = {
  [(0x3a << 8) | 0x5a]: 9,
  [(0x5a << 8) | 0x5a]: 8,
  [(0x6a << 8) | 0x5a]: 7,
  [(0x9a << 8) | 0x5a]: 6,
  [(0x3a << 8) | 0x6a]: 5,
};

function isTenthsByte(p2: number): boolean {
  return p2 >= 0x6d && p2 <= 0x7f && (0x7f - p2) % 2 === 0;
}

export function decodeShotClock(prefix: Buffer): ShotClockReading | null {
  if (prefix.length < 4) return null;
  const p1 = prefix[1]!;
  const p2 = prefix[2]!;
  const p3 = prefix[3]!;
  const runningHint = prefix.length > 4 && prefix[4] === 0x2d;

  // 1. Tenths mode — classify on p2 range first.
  if (isTenthsByte(p2) && p1 in TENTHS_INT) {
    const integer = TENTHS_INT[p1]!;
    const tenths = (0x7f - p2) / 2;
    const value = integer + tenths / 10;
    const text = value === 0 ? "0" : `${integer}.${tenths}`;
    return { value, text, runningHint };
  }

  // 2. Two-digit 10-24.
  if (p1 === 0x98 || p1 === 0xa8) {
    const decade = p1 === 0x98 ? 20 : 10;
    if (p2 in TWO_DIGIT_UNITS) {
      const value = decade + TWO_DIGIT_UNITS[p2]!;
      return { value, text: String(value), runningHint };
    }
    return null;
  }

  // 3. Single-digit plain 5-9.
  if (p1 === 0x68) {
    const v = SINGLE[(p2 << 8) | p3];
    if (v !== undefined) return { value: v, text: String(v), runningHint };
    return null;
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test shot-clock-decoder`
Expected: PASS (all cases).

- [ ] **Step 5: Add fixture round-trip test**

Append to `shot-clock-decoder.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findSegmentFrames } from "./stramatel-segment-decoder";

function prefixesOf(name: string): Buffer[] {
  const buf = readFileSync(resolve(import.meta.dirname, "__fixtures__", name));
  return findSegmentFrames(buf)
    .map((f) => {
      const c3 = f.indexOf(0xc3, 3);
      return f.subarray(3, c3);
    })
    .filter((p) => p.length >= 4);
}

describe("decodeShotClock fixtures", () => {
  const cases: Array<[string, number, string]> = [
    ["segment-shot-24.bin", 24, "24"],
    ["segment-shot-20.bin", 20, "20"],
    ["segment-shot-14.bin", 14, "14"],
    ["segment-shot-9.bin", 9, "9"],
    ["segment-shot-8.bin", 8, "8"],
    ["segment-shot-7.bin", 7, "7"],
    ["segment-shot-6.bin", 6, "6"],
    ["segment-shot-5.bin", 5, "5"],
    ["segment-shot-40.bin", 4, "4.0"],
    ["segment-shot-30.bin", 3, "3.0"],
    ["segment-shot-20t.bin", 2, "2.0"],
    ["segment-shot-10t.bin", 1, "1.0"],
    ["segment-shot-31.bin", 3.1, "3.1"],
    ["segment-shot-05.bin", 0.5, "0.5"],
    ["segment-shot-expiry0.bin", 0, "0"],
  ];
  it.each(cases)("%s decodes to the labelled value", (name, value, text) => {
    const readings = prefixesOf(name).map(decodeShotClock).filter(Boolean);
    expect(readings.length).toBeGreaterThan(0);
    for (const r of readings) {
      expect(r!.value).toBe(value);
      expect(r!.text).toBe(text);
    }
  });

  it("decodes the full running descent with no garbage values", () => {
    const seen = new Set<number>();
    for (const p of prefixesOf("segment-shot-desc.bin")) {
      const r = decodeShotClock(p);
      if (r) seen.add(r.value);
    }
    // every integer 0..24 plus fractional tenths appear, nothing outside 0..24
    expect([...seen].every((v) => v >= 0 && v <= 24)).toBe(true);
    expect(seen.has(24)).toBe(true);
    expect(seen.has(0)).toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test shot-clock-decoder`
Expected: PASS — all 15 point fixtures + descent.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/scoreboard/shot-clock-decoder.ts \
        apps/api/src/services/scoreboard/shot-clock-decoder.test.ts
git commit -m "feat(scoreboard): pure SC24 shot-clock decoder"
```

---

## Task 3: Snapshot shape + DB schema + migration

This task changes the shared type and DB columns and updates every producer/consumer in the same commit so the build stays green.

**Files:**
- Modify: `packages/shared/src/scoreboard.ts`
- Modify: `packages/db/src/schema/scoreboard.ts`
- Create: migration under `packages/db/drizzle/` (generated)

- [ ] **Step 1: Update `StramatelSnapshot`** (`packages/shared/src/scoreboard.ts`)

Replace `shotClock: number;` with:

```ts
  shotClock: number | null;
  shotClockText: string;
  shotClockRunning: boolean;
```

- [ ] **Step 2: Update DB schema** (`packages/db/src/schema/scoreboard.ts`)

In `liveScoreboards` (the `.notNull().default(0)` row, line ~23) replace `shotClock` and add two columns:

```ts
  shotClock: integer("shot_clock"),
  shotClockText: text("shot_clock_text").notNull().default(""),
  shotClockRunning: boolean("shot_clock_running").notNull().default(false),
```

In `scoreboardSnapshots` (line ~50) replace `shotClock` and add:

```ts
  shotClock: integer("shot_clock"),
  shotClockText: text("shot_clock_text").notNull().default(""),
  shotClockRunning: boolean("shot_clock_running").notNull().default(false),
```

Ensure `text` and `boolean` are imported from `drizzle-orm/pg-core` at the top of the file (add to the existing import if missing).

- [ ] **Step 3: Update the other snapshot producers so the API package compiles**

The new required fields break every `StramatelSnapshot`/`PublicLiveSnapshot` producer. Update them with safe defaults now (the segment decoder gets real values in Task 4):

`stramatel-segment-decoder.ts` `decodeSegmentBlock` — replace `shotClock: 0,` (and its comment) with a temporary placeholder:

```ts
    shotClock: null,
    shotClockText: "",
    shotClockRunning: false,
```

`stramatel-decoder.ts` (old decoder) return object — after `shotClock,` add:

```ts
    shotClockText: shotClock != null ? String(shotClock) : "",
    shotClockRunning: false,
```

`apps/api/src/services/broadcast/publisher.ts` `toPublicSnapshot` — after `shotClock: row.shotClock,` add:

```ts
    shotClockText: row.shotClockText,
    shotClockRunning: row.shotClockRunning,
```

(`phase.ts` takes a narrow `{ period, clockRunning }` input and needs no change.)

- [ ] **Step 4: Generate the migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: a new `packages/db/drizzle/NNNN_*.sql` adding `shot_clock_text`, `shot_clock_running`, and dropping the NOT NULL/default on `shot_clock`. Inspect it.

- [ ] **Step 5: Verify shared + db + api typecheck**

Run: `pnpm --filter @dragons/shared build && pnpm --filter @dragons/db build && pnpm --filter @dragons/api typecheck`
Expected: PASS. (Web typecheck stays broken until Task 7 — that's expected; do not run repo-wide `pnpm typecheck` until then.)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/scoreboard.ts packages/db/src/schema/scoreboard.ts packages/db/drizzle \
        apps/api/src/services/scoreboard/stramatel-segment-decoder.ts \
        apps/api/src/services/scoreboard/stramatel-decoder.ts \
        apps/api/src/services/broadcast/publisher.ts
git commit -m "feat(scoreboard): shot-clock snapshot shape + columns (shotClock nullable, +text/+running)"
```

---

## Task 4: Wire shot clock into the segment decoder

**Files:**
- Modify: `apps/api/src/services/scoreboard/stramatel-segment-decoder.ts`
- Test: `apps/api/src/services/scoreboard/stramatel-segment-decoder.test.ts`

- [ ] **Step 1: Write the failing test** (append to `stramatel-segment-decoder.test.ts`)

```ts
describe("decodeSegmentBlock shot clock", () => {
  function frame(name: string): Buffer {
    return findSegmentFrames(fixture(name))[0]!;
  }
  it("emits the shot-clock value from a shot-bearing frame", () => {
    const snap = decodeSegmentBlock(frame("segment-shot-24.bin"))!;
    expect(snap.shotClock).toBe(24);
    expect(snap.shotClockText).toBe("24");
  });
  it("leaves shot clock null on a frame with no shot data", () => {
    // segment-base.bin is the original framing (no SC24 prefix).
    const snap = decodeSegmentBlock(findSegmentFrames(fixture("segment-base.bin"))[0]!)!;
    expect(snap.shotClock).toBeNull();
    expect(snap.shotClockText).toBe("");
    expect(snap.shotClockRunning).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test stramatel-segment-decoder`
Expected: FAIL — `shotClock` is `0`, `shotClockText` undefined.

- [ ] **Step 3: Implement** (`stramatel-segment-decoder.ts`)

At top, import the decoder:

```ts
import { decodeShotClock } from "./shot-clock-decoder";
```

In `decodeSegmentBlock`, compute the prefix and reading before the return:

```ts
  const c3 = frame.indexOf(C3, SYNC.length);
  const prefix = c3 > SYNC.length ? frame.subarray(SYNC.length, c3) : Buffer.alloc(0);
  const shot = decodeShotClock(prefix);
```

Then replace the Task 3 placeholder lines (`shotClock: null, shotClockText: "", shotClockRunning: false,`) with the real values:

```ts
    shotClock: shot ? shot.value : null,
    shotClockText: shot ? shot.text : "",
    shotClockRunning: shot ? shot.runningHint : false,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test stramatel-segment-decoder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/scoreboard/stramatel-segment-decoder.ts \
        apps/api/src/services/scoreboard/stramatel-segment-decoder.test.ts
git commit -m "feat(scoreboard): emit shot-clock fields from segment decoder"
```

---

## Task 5: Buffer-level latest-shot scan in the dispatcher

The latest frame overall usually has no shot data. Scan the buffer newest-first for the most recent shot-bearing reading and graft it onto the chosen snapshot.

**Files:**
- Modify: `apps/api/src/services/scoreboard/scoreboard-decoder.ts`
- Test: `apps/api/src/services/scoreboard/scoreboard-decoder.test.ts`

- [ ] **Step 1: Write the failing test** (append to `scoreboard-decoder.test.ts`)

```ts
it("grafts the latest shot reading from the buffer onto the snapshot", () => {
  // desc fixture: many frames, only ~10% carry shot data.
  const result = decodeLatestFrame(fixture("segment-shot-desc.bin"))!;
  expect(result.snapshot.shotClock).not.toBeNull();
  expect(result.snapshot.shotClockText).not.toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test scoreboard-decoder`
Expected: FAIL only if the chosen latest frame lacks shot data (value null). If it already passes, still add the helper below for robustness and keep the test.

- [ ] **Step 3: Implement** (`scoreboard-decoder.ts`)

Add imports:

```ts
import { decodeShotClock } from "./shot-clock-decoder";
```

In `decodeLatestFrame`, after a segment snapshot is chosen but before returning it, scan for the latest shot reading and overwrite the shot fields when the snapshot itself lacks one:

```ts
  for (let i = segmentFrames.length - 1; i >= 0; i--) {
    const frame = segmentFrames[i]!;
    const snapshot = decodeSegmentBlock(frame);
    if (!snapshot) continue;
    if (snapshot.shotClock === null) {
      const shot = latestShotReading(segmentFrames);
      if (shot) {
        snapshot.shotClock = shot.value;
        snapshot.shotClockText = shot.text;
        snapshot.shotClockRunning = shot.runningHint;
      }
    }
    return { frame, snapshot };
  }
```

Add the helper at module scope:

```ts
function latestShotReading(frames: Buffer[]) {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i]!;
    const c3 = f.indexOf(0xc3, 3);
    if (c3 <= 3) continue;
    const shot = decodeShotClock(f.subarray(3, c3));
    if (shot) return shot;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test scoreboard-decoder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/scoreboard/scoreboard-decoder.ts \
        apps/api/src/services/scoreboard/scoreboard-decoder.test.ts
git commit -m "feat(scoreboard): graft latest buffer shot reading onto snapshot"
```

---

## Task 6: Ingest carry-forward + running inference

When a POST buffer carries no shot reading, inherit the previous value from the DB row. Derive `shotClockRunning` from value movement.

**Files:**
- Modify: `apps/api/src/services/scoreboard/ingest.ts`
- Test: `apps/api/src/services/scoreboard/ingest.test.ts`

- [ ] **Step 1: Write the failing test** (append inside the `describe` in `ingest.test.ts`; it uses a real pglite test DB via `ctx.db` and reads rows with `ctx.db.select().from(liveScoreboards)`)

```ts
it("carries the shot clock forward when a frame has none", async () => {
  const hex = (name: string) =>
    readFileSync(resolve(import.meta.dirname, "__fixtures__", name)).toString("hex");
  // First POST: a shot-bearing buffer at 24.
  await processIngest({ deviceId: "d1", hex: hex("segment-shot-24.bin") });
  // Second POST: original-framing buffer with no shot data -> value inherited.
  await processIngest({ deviceId: "d1", hex: hex("segment-base.bin") });
  const [live] = await ctx.db.select().from(liveScoreboards);
  expect(live!.shotClock).toBe(24); // carried forward, not reset to null
});
```

(`readFileSync`, `resolve`, `ctx`, and `liveScoreboards` are already imported at the top of `ingest.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/api test ingest`
Expected: FAIL — second POST overwrites `shotClock` with null.

- [ ] **Step 3: Implement carry-forward + running inference** (`ingest.ts`)

After `const { frame, snapshot: decoded } = decodedResult;` and inside the transaction after `existing` is fetched, reconcile the shot clock:

```ts
    // Shot clock is absent on ~90% of frames; carry the last known value
    // forward, and infer "running" from a decreasing value (the per-frame
    // flag is unreliable on 7-byte prefixes — see the decoder).
    if (decoded.shotClock === null && existing) {
      decoded.shotClock = existing.shotClock;
      decoded.shotClockText = existing.shotClockText;
      decoded.shotClockRunning = existing.shotClockRunning;
    } else if (decoded.shotClock !== null && existing?.shotClock != null) {
      const decreased = decoded.shotClock < existing.shotClock;
      decoded.shotClockRunning = decreased || decoded.shotClockRunning;
    }
```

- [ ] **Step 4: Add `shotClockText` to the dedupe keys**

In `DEDUPE_KEYS`, add `"shotClockText"` after `"shotClock"` so tenths transitions (which keep the integer `shotClock` the same but change the text) still produce a snapshot row. Leave `shotClockRunning` out of dedupe (derived/noisy).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dragons/api test ingest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/scoreboard/ingest.ts \
        apps/api/src/services/scoreboard/ingest.test.ts
git commit -m "feat(scoreboard): carry shot clock across frames + infer running in ingest"
```

---

## Task 7: Web consumers

**Files:**
- Modify: `apps/web/src/app/[locale]/live/scoreboard-live.tsx`
- Modify: `apps/web/src/app/[locale]/overlay/score-bug.tsx`
- Modify: `apps/web/src/app/[locale]/admin/scoreboard/scoreboard-debug.tsx`
- Test: `apps/web/src/app/[locale]/live/scoreboard-live.test.tsx`, `apps/web/src/app/[locale]/overlay/score-bug.test.tsx`

- [ ] **Step 1: Update the snapshot literals + write the failing tests** (`scoreboard-live.test.tsx`)

First, the `initial` literal (line ~80) must gain the two new required fields so it typechecks under the new shape:

```ts
  shotClock: 24,
  shotClockText: "24",
  shotClockRunning: false,
```

Then add two cases inside `describe("ScoreboardLive", ...)`, using the file's SSE pattern (`initialSnapshot` prop + `MockEventSource.dispatch("snapshot", ...)`):

```tsx
it("renders tenths under 5s", async () => {
  render(wrap(<ScoreboardLive deviceId="d1" initialSnapshot={initial} />));
  await act(async () => {
    MockEventSource.instances[0]!.dispatch("snapshot", {
      ...initial, shotClock: 4.7, shotClockText: "4.7",
    });
  });
  expect(screen.getByText("4.7")).toBeInTheDocument();
});

it("renders blank shot clock when absent", async () => {
  render(wrap(<ScoreboardLive deviceId="d1" initialSnapshot={initial} />));
  await act(async () => {
    MockEventSource.instances[0]!.dispatch("snapshot", {
      ...initial, shotClock: null, shotClockText: "",
    });
  });
  // the old formatter would have shown "24" padded; with text "" the cell is empty
  expect(screen.queryByText("24")).not.toBeInTheDocument();
});
```

Also update any snapshot literal in `score-bug.test.tsx` to include `shotClockText`/`shotClockRunning` so it typechecks.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/web test scoreboard-live`
Expected: FAIL — component still formats `String(snap.shotClock).padStart(2,"0")` → `"4"`/`"null"`.

- [ ] **Step 3: Implement** — render `shotClockText`

`scoreboard-live.tsx`:
- line ~215: `const shotLow = snap.shotClock != null && snap.shotClock > 0 && snap.shotClock <= SHOT_CLOCK_RED_AT;`
- line ~280: replace `{String(snap.shotClock).padStart(2, "0")}` with `{snap.shotClockText}`.

`score-bug.tsx`:
- prop type (line ~181): `shotClock: number | null;` and add `shotClockText: string;`; thread `shotClockText={scoreboard.shotClockText}` at line ~93.
- line ~196: `const red = shotClock != null && shotClock > 0 && shotClock <= SHOT_CLOCK_RED_AT;`
- line ~206: replace `{String(shotClock).padStart(2, "0")}` with `{shotClockText}`.

`scoreboard-debug.tsx`: render `shotClockText` (and keep showing the raw `shotClock`/`shotClockRunning` for debugging).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/web test scoreboard-live score-bug`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\[locale\]/live/scoreboard-live.tsx \
        apps/web/src/app/\[locale\]/overlay/score-bug.tsx \
        apps/web/src/app/\[locale\]/admin/scoreboard/scoreboard-debug.tsx \
        apps/web/src/app/\[locale\]/live/scoreboard-live.test.tsx \
        apps/web/src/app/\[locale\]/overlay/score-bug.test.tsx
git commit -m "feat(web): render shot-clock text incl. tenths + blank when absent"
```

---

## Task 8: Spec update + full verification

**Files:**
- Modify: `apps/pi/STRAMATEL-PROTOCOL.md`

- [ ] **Step 1: Rewrite the "Shot clock" open-question section**

Replace the "partially reverse-engineered / emits 0" content with the solved tables (two-digit units, single-digit `(p2,p3)`, tenths formula, expiry, running-hint caveat) from the Decode reference above, and update the `shotClock` row in the `StramatelSnapshot` mapping table to the new three-field shape. Correct the note that called the `6d..7f` ramp a "self-test sweep" — it is the tenths countdown.

- [ ] **Step 2: Run the AI-slop check**

Run: `node scripts/check-ai-slop.mjs`
Expected: `AI slop check passed.`

- [ ] **Step 3: Full API test + coverage**

Run: `pnpm --filter @dragons/api coverage`
Expected: PASS, coverage still above gate (90% branches, 95% fn/line/stmt).

- [ ] **Step 4: Typecheck + lint across the repo**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (no `any`, no floating promises, snapshot shape consistent everywhere).

- [ ] **Step 5: Web tests**

Run: `pnpm --filter @dragons/web test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/pi/STRAMATEL-PROTOCOL.md
git commit -m "docs(scoreboard): document solved SC24 shot-clock decode"
```

---

## Verification checklist (definition of done)

- [ ] Every labelled fixture decodes to its exact value (Task 2 fixture test green).
- [ ] Running descent decodes 24→0.0 with no out-of-range values.
- [ ] SC24 absent (original framing) → `shotClock` null, `shotClockText` ""  → no regression.
- [ ] Shot clock carried forward across no-shot POSTs (ingest test green).
- [ ] Web renders tenths under 5 s and blanks when absent.
- [ ] `pnpm typecheck && pnpm lint && pnpm --filter @dragons/api coverage && pnpm --filter @dragons/web test` all green.
- [ ] Migration generated and inspected.
- [ ] STRAMATEL-PROTOCOL.md updated; AI-slop check passes.
