# Stramatel Live Scoreboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive live Stramatel basketball console frames from a Raspberry Pi, decode them server-side, persist deduplicated history in Postgres, and stream the current score via SSE to public and admin pages on the existing Dragons web app.

**Architecture:** A new Hono ingest route accepts raw hex POSTs from the Pi (Bearer-key auth), runs them through a TypeScript port of the Stramatel decoder, upserts the latest snapshot in `live_scoreboards`, appends a deduplicated row to `scoreboard_snapshots`, and publishes the result on a Redis channel. Two SSE endpoints (public + admin) subscribe to that channel and forward to the browser, with snapshot-on-connect, `Last-Event-ID` replay and 15 s heartbeats. A new public Next.js page renders the live score; an admin page renders a debug view with raw hex.

**Tech Stack:** Hono 4, Drizzle ORM, PostgreSQL (pglite for service tests), ioredis, Vitest 4, TypeScript (strict, ESNext), Next.js 16 App Router, next-intl, Tailwind, SWR, EventSource on the browser.

**Spec:** `docs/superpowers/specs/2026-04-29-stramatel-live-scoreboard-design.md`

---

## File Structure

### Backend (`apps/api`)

| Path | Responsibility |
|---|---|
| `packages/db/src/schema/scoreboard.ts` | `live_scoreboards` + `scoreboard_snapshots` Drizzle schema. |
| `packages/db/src/schema/index.ts` | Re-export the new schema. |
| `packages/db/drizzle/<n>_scoreboard.sql` | Generated migration. |
| `apps/api/src/services/scoreboard/stramatel-decoder.ts` | Pure-function decoder (`findScoreFrames`, `decodeScoreFrame`). |
| `apps/api/src/services/scoreboard/__fixtures__/stramatel-sample.bin` | Captured Stramatel byte stream. |
| `apps/api/src/services/scoreboard/__fixtures__/expected.json` | Ground-truth snapshots for the first 10 frames. |
| `apps/api/src/services/scoreboard/pubsub.ts` | Redis pub/sub helpers. |
| `apps/api/src/services/scoreboard/ingest.ts` | Decode + dedupe + persist + publish. |
| `apps/api/src/services/scoreboard/sse.ts` | SSE response builder, snapshot-on-connect, replay, heartbeat. |
| `apps/api/src/middleware/ingest-key.ts` | Bearer-key check + device id check + per-second rate limit. |
| `apps/api/src/routes/api/scoreboard.routes.ts` | `POST /api/scoreboard/ingest`. |
| `apps/api/src/routes/api/scoreboard.schemas.ts` | Zod request/response shapes for ingest. |
| `apps/api/src/routes/public/scoreboard.routes.ts` | `GET /public/scoreboard/latest`, `GET /public/scoreboard/stream`. |
| `apps/api/src/routes/admin/scoreboard.routes.ts` | `GET /admin/scoreboard/snapshots`, `GET /admin/scoreboard/health`. |
| `apps/api/src/routes/index.ts` | Mount the three new routers. |
| `apps/api/src/config/env.ts` | Add `SCOREBOARD_INGEST_KEY`, `SCOREBOARD_DEVICE_ID`. |
| `.env.example` | Document the new env vars. |

Each file gets a co-located `*.test.ts` per the repo convention.

### Frontend (`apps/web`)

| Path | Responsibility |
|---|---|
| `apps/web/src/app/[locale]/(public)/live/page.tsx` | Server component: fetch initial snapshot, render shell. |
| `apps/web/src/app/[locale]/(public)/live/scoreboard-live.tsx` | Client component: EventSource consumer, layout. |
| `apps/web/src/app/[locale]/admin/scoreboard/page.tsx` | Server component shell. |
| `apps/web/src/app/[locale]/admin/scoreboard/scoreboard-debug.tsx` | Client component: health bar, snapshots table, pause toggle. |
| `apps/web/src/messages/{en,de}.json` | i18n strings (uses whichever locales the repo currently ships). |

### External (`Panel2Net` repo)

`Panel2Net.py` edits land on a new `hbdragons-ingest` branch in `/Users/jn/git/Panel2Net`. No changes to the dragons-all repo.

---

## Conventions used by every task

- TDD: write the failing test, run it (must fail), implement, run again (must pass), commit.
- Test runner: `pnpm --filter @dragons/api test -- <path>` for the API, `pnpm --filter @dragons/web test -- <path>` for the web app.
- Type check: `pnpm --filter @dragons/api typecheck` (and `web`).
- Coverage thresholds (already enforced in CI): 90 % branches, 95 % functions/lines/statements. Each test added below covers a new branch or function.
- Commits are small, present-tense, no AI-trailers (per the repo's CLAUDE.md). Format: `<area>: <what>`.

---

### Task 1: DB schema for live_scoreboards and scoreboard_snapshots

**Files:**
- Create: `packages/db/src/schema/scoreboard.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Write the schema file**

Create `packages/db/src/schema/scoreboard.ts`:

```ts
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const liveScoreboards = pgTable("live_scoreboards", {
  deviceId: text("device_id").primaryKey(),
  scoreHome: integer("score_home").notNull().default(0),
  scoreGuest: integer("score_guest").notNull().default(0),
  foulsHome: integer("fouls_home").notNull().default(0),
  foulsGuest: integer("fouls_guest").notNull().default(0),
  timeoutsHome: integer("timeouts_home").notNull().default(0),
  timeoutsGuest: integer("timeouts_guest").notNull().default(0),
  period: integer("period").notNull().default(0),
  clockText: text("clock_text").notNull().default(""),
  clockSeconds: integer("clock_seconds"),
  clockRunning: boolean("clock_running").notNull().default(false),
  shotClock: integer("shot_clock").notNull().default(0),
  timeoutActive: boolean("timeout_active").notNull().default(false),
  timeoutDuration: text("timeout_duration").notNull().default(""),
  panelName: text("panel_name"),
  lastFrameAt: timestamp("last_frame_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const scoreboardSnapshots = pgTable(
  "scoreboard_snapshots",
  {
    id: serial("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    scoreHome: integer("score_home").notNull(),
    scoreGuest: integer("score_guest").notNull(),
    foulsHome: integer("fouls_home").notNull(),
    foulsGuest: integer("fouls_guest").notNull(),
    timeoutsHome: integer("timeouts_home").notNull(),
    timeoutsGuest: integer("timeouts_guest").notNull(),
    period: integer("period").notNull(),
    clockText: text("clock_text").notNull(),
    clockSeconds: integer("clock_seconds"),
    clockRunning: boolean("clock_running").notNull(),
    shotClock: integer("shot_clock").notNull(),
    timeoutActive: boolean("timeout_active").notNull(),
    timeoutDuration: text("timeout_duration").notNull(),
    rawHex: text("raw_hex"),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    deviceCapturedIdx: index("scoreboard_snapshots_device_captured_idx").on(
      table.deviceId,
      table.capturedAt,
    ),
  }),
);

export type LiveScoreboard = typeof liveScoreboards.$inferSelect;
export type NewLiveScoreboard = typeof liveScoreboards.$inferInsert;
export type ScoreboardSnapshot = typeof scoreboardSnapshots.$inferSelect;
export type NewScoreboardSnapshot = typeof scoreboardSnapshots.$inferInsert;
```

- [ ] **Step 2: Re-export from schema index**

Append to `packages/db/src/schema/index.ts`:

```ts
export * from "./scoreboard";
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: a new file appears at `packages/db/drizzle/<NNNN>_<auto-name>.sql` containing `CREATE TABLE "live_scoreboards"` and `CREATE TABLE "scoreboard_snapshots"`.

- [ ] **Step 4: Add the new tables to the test DB reset**

Modify `apps/api/src/test/setup-test-db.ts`. Inside the `TRUNCATE` list (line ~32), add `scoreboard_snapshots, live_scoreboards,` immediately before `"user", session, account, verification`.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @dragons/db typecheck && pnpm --filter @dragons/api typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/scoreboard.ts packages/db/src/schema/index.ts packages/db/drizzle apps/api/src/test/setup-test-db.ts
git commit -m "db: add live_scoreboards and scoreboard_snapshots tables"
```

---

### Task 2: Stramatel decoder — frame splitting

**Files:**
- Create: `apps/api/src/services/scoreboard/stramatel-decoder.ts`
- Test: `apps/api/src/services/scoreboard/stramatel-decoder.test.ts`

- [ ] **Step 1: Copy the fixture**

Run:

```bash
mkdir -p apps/api/src/services/scoreboard/__fixtures__
cp /Users/jn/git/Panel2Net/Stramatel_GEN_HEL_20171125.txt \
   apps/api/src/services/scoreboard/__fixtures__/stramatel-sample.bin
```

- [ ] **Step 2: Write a failing test for `findScoreFrames`**

Create `apps/api/src/services/scoreboard/stramatel-decoder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findScoreFrames } from "./stramatel-decoder";

const fixturePath = resolve(
  import.meta.dirname,
  "__fixtures__/stramatel-sample.bin",
);

describe("findScoreFrames", () => {
  it("returns no frames for empty input", () => {
    expect(findScoreFrames(Buffer.alloc(0))).toEqual([]);
  });

  it("returns one frame from a single F8 33 ... 0D sequence", () => {
    const f = Buffer.concat([
      Buffer.from([0xf8, 0x33]),
      Buffer.from(" 0  6 1 0   0   0  0 0 0  1  0", "ascii"),
      Buffer.from([0x0d]),
    ]);
    const frames = findScoreFrames(f);
    expect(frames).toHaveLength(1);
    expect(frames[0][0]).toBe(0xf8);
    expect(frames[0][frames[0].length - 1]).toBe(0x0d);
  });

  it("ignores incomplete trailing data", () => {
    const f = Buffer.concat([
      Buffer.from([0xf8, 0x33]),
      Buffer.from("payload", "ascii"),
      Buffer.from([0x0d]),
      Buffer.from([0xf8, 0x33]),
      Buffer.from("partial", "ascii"),
    ]);
    expect(findScoreFrames(f)).toHaveLength(1);
  });

  it("extracts many frames from the captured fixture", () => {
    const buf = readFileSync(fixturePath);
    const frames = findScoreFrames(buf);
    expect(frames.length).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `pnpm --filter @dragons/api test -- stramatel-decoder.test.ts`
Expected: FAIL with "Cannot find module './stramatel-decoder'".

- [ ] **Step 4: Implement `findScoreFrames`**

Create `apps/api/src/services/scoreboard/stramatel-decoder.ts`:

```ts
const START_TOKEN = Buffer.from([0xf8, 0x33]);
const END_TOKEN = 0x0d;

export function findScoreFrames(input: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const start = input.indexOf(START_TOKEN, cursor);
    if (start === -1) break;
    const end = input.indexOf(END_TOKEN, start + START_TOKEN.length);
    if (end === -1) break;
    frames.push(input.subarray(start, end + 1));
    cursor = end + 1;
  }
  return frames;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `pnpm --filter @dragons/api test -- stramatel-decoder.test.ts`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/scoreboard
git commit -m "scoreboard: add Stramatel frame splitter"
```

---

### Task 3: Stramatel decoder — frame decode

**Files:**
- Modify: `apps/api/src/services/scoreboard/stramatel-decoder.ts`
- Modify: `apps/api/src/services/scoreboard/stramatel-decoder.test.ts`

- [ ] **Step 1: Add failing tests for `decodeScoreFrame`**

Append to `stramatel-decoder.test.ts`:

```ts
import { decodeScoreFrame } from "./stramatel-decoder";

function frame(payload: string): Buffer {
  return Buffer.concat([
    Buffer.from([0xf8, 0x33]),
    Buffer.from(payload, "ascii"),
    Buffer.from([0x0d]),
  ]);
}

describe("decodeScoreFrame", () => {
  it("decodes a MM:SS clock frame", () => {
    // Bytes 0..5 of payload form the timer field. With "10:00" the
    // PHP reference splits as:
    //   testCond = trim(payload[4..6]) = "00"  -> length 2 -> MM:SS branch
    //   clockText = payload[2..4] + ":" + payload[4..6]  = "10:00"
    // Pad payload to cover all offsets up to index 47 (shot clock).
    const payload =
      "  10  00" + // 0..7  timer area + score start
      " 45 32" + // 8..13 finish home/guest score
      "2" + // 12 period
      "3" + // 13 home fouls
      "2" + // 14 guest fouls
      "1" + // 15 home timeouts
      "0" + // 16 guest timeouts
      " " + // 17 spacer
      " " + // 18 status (space => START)
      " " + // 19 timeout running (space => No)
      "                        " + // 20..43 filler
      "  " + // 44..45 timeout duration
      "14"; // 46..47 shot clock

    // Stramatel offsets are referenced in the spec table; the PHP code
    // counts from the start of the frame after "F8 33". We feed our
    // decoder the raw frame including the start token.
    const snapshot = decodeScoreFrame(frame(payload));
    expect(snapshot).not.toBeNull();
    expect(snapshot).toMatchObject({
      scoreHome: 45,
      scoreGuest: 32,
      period: 2,
      foulsHome: 3,
      foulsGuest: 2,
      timeoutsHome: 1,
      timeoutsGuest: 0,
      shotClock: 14,
      clockRunning: true,
      timeoutActive: false,
      clockText: "10:00",
      clockSeconds: 600,
    });
  });

  it("decodes a sub-second clock frame as SS.t", () => {
    // testCond = trim(payload[4..6]) is one char => SS.t mode.
    // clockText = payload[2..4] + "." + payload[3..4] = "59.9"
    const payload =
      "  599 5" + // bytes 2..3 = "59", byte 3 = "9", bytes 4..5 = " 5"
      "   0   0" + // scores
      "1" + // period
      "0000" + // fouls + timeouts
      "  " + // spacers
      "1" + // status (1 => STOP)
      " " + // timeout running
      "                        " + // filler
      "00" + // timeout duration
      "08";

    const snapshot = decodeScoreFrame(frame(payload));
    expect(snapshot?.clockText).toBe("59.9");
    expect(snapshot?.clockSeconds).toBe(59);
    expect(snapshot?.clockRunning).toBe(false);
    expect(snapshot?.shotClock).toBe(8);
  });

  it("returns null for too-short frames", () => {
    expect(decodeScoreFrame(frame("  10  00 0"))).toBeNull();
  });

  it("treats non-numeric numeric fields as zero", () => {
    const payload =
      "  10  00" +
      " ?? ??" +
      "X" +
      "????" +
      "  " +
      " " +
      " " +
      "                        " +
      "  " +
      "??";
    const snapshot = decodeScoreFrame(frame(payload));
    expect(snapshot).not.toBeNull();
    expect(snapshot?.scoreHome).toBe(0);
    expect(snapshot?.scoreGuest).toBe(0);
    expect(snapshot?.period).toBe(0);
    expect(snapshot?.shotClock).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm --filter @dragons/api test -- stramatel-decoder.test.ts`
Expected: FAIL — `decodeScoreFrame` not exported.

- [ ] **Step 3: Implement `decodeScoreFrame`**

Append to `stramatel-decoder.ts`:

```ts
export interface StramatelSnapshot {
  scoreHome: number;
  scoreGuest: number;
  foulsHome: number;
  foulsGuest: number;
  timeoutsHome: number;
  timeoutsGuest: number;
  period: number;
  clockText: string;
  clockSeconds: number | null;
  clockRunning: boolean;
  shotClock: number;
  timeoutActive: boolean;
  timeoutDuration: string;
}

const PAYLOAD_MIN_LENGTH = 48;

function readSlice(buf: Buffer, start: number, length: number): string {
  return buf.subarray(start, start + length).toString("ascii");
}

function parseInt0(input: string): number {
  const trimmed = input.trim();
  if (trimmed.length === 0) return 0;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : 0;
}

export function decodeScoreFrame(frame: Buffer): StramatelSnapshot | null {
  // Frame starts with F8 33 (2 bytes) and ends with 0D (1 byte).
  // The PHP reference operates on the substring between those markers.
  const payload = frame.subarray(2, frame.length - 1);
  if (payload.length < PAYLOAD_MIN_LENGTH) return null;

  const testCond = readSlice(payload, 4, 2).trim();
  let clockText: string;
  let clockSeconds: number | null;
  if (testCond.length === 1) {
    // Sub-second: payload[2..4] + "." + payload[3..4]
    clockText = `${readSlice(payload, 2, 2)}.${readSlice(payload, 3, 1)}`;
    const f = Number.parseFloat(clockText);
    clockSeconds = Number.isFinite(f) ? Math.floor(f) : null;
  } else {
    // MM:SS: payload[2..4] + ":" + payload[4..6]
    const mm = readSlice(payload, 2, 2);
    const ss = readSlice(payload, 4, 2);
    clockText = `${mm}:${ss}`;
    const m = Number.parseInt(mm.trim(), 10);
    const s = Number.parseInt(ss.trim(), 10);
    clockSeconds =
      Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null;
  }

  const scoreHome = parseInt0(readSlice(payload, 6, 3));
  const scoreGuest = parseInt0(readSlice(payload, 9, 3));
  const period = parseInt0(readSlice(payload, 12, 1));
  const foulsHome = parseInt0(readSlice(payload, 13, 1));
  const foulsGuest = parseInt0(readSlice(payload, 14, 1));
  const timeoutsHome = parseInt0(readSlice(payload, 15, 1));
  const timeoutsGuest = parseInt0(readSlice(payload, 16, 1));

  const statusByte = readSlice(payload, 18, 1);
  const clockRunning = statusByte !== "1";

  const timeoutByte = readSlice(payload, 19, 1);
  const timeoutActive = timeoutByte !== " ";

  const timeoutDuration = readSlice(payload, 44, 2);
  const shotClock = parseInt0(readSlice(payload, 46, 2));

  return {
    scoreHome,
    scoreGuest,
    foulsHome,
    foulsGuest,
    timeoutsHome,
    timeoutsGuest,
    period,
    clockText,
    clockSeconds,
    clockRunning,
    shotClock,
    timeoutActive,
    timeoutDuration,
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @dragons/api test -- stramatel-decoder.test.ts`
Expected: all decoder tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/scoreboard
git commit -m "scoreboard: decode Stramatel score frame to typed snapshot"
```

---

### Task 4: Decoder — fixture range and dedupe-ratio assertions

**Files:**
- Modify: `apps/api/src/services/scoreboard/stramatel-decoder.test.ts`

- [ ] **Step 1: Add the fixture-driven tests**

Append:

```ts
describe("fixture", () => {
  const buf = readFileSync(fixturePath);
  const frames = findScoreFrames(buf);

  it("has at least 1000 frames", () => {
    expect(frames.length).toBeGreaterThan(1000);
  });

  it("decodes every frame within sane ranges", () => {
    for (const f of frames) {
      const s = decodeScoreFrame(f);
      if (!s) continue;
      expect(s.scoreHome).toBeGreaterThanOrEqual(0);
      expect(s.scoreHome).toBeLessThanOrEqual(200);
      expect(s.scoreGuest).toBeGreaterThanOrEqual(0);
      expect(s.scoreGuest).toBeLessThanOrEqual(200);
      expect(s.period).toBeGreaterThanOrEqual(0);
      expect(s.period).toBeLessThanOrEqual(10);
      expect(s.foulsHome).toBeGreaterThanOrEqual(0);
      expect(s.foulsHome).toBeLessThanOrEqual(9);
      expect(s.foulsGuest).toBeGreaterThanOrEqual(0);
      expect(s.foulsGuest).toBeLessThanOrEqual(9);
      expect(s.timeoutsHome).toBeGreaterThanOrEqual(0);
      expect(s.timeoutsHome).toBeLessThanOrEqual(9);
      expect(s.timeoutsGuest).toBeGreaterThanOrEqual(0);
      expect(s.timeoutsGuest).toBeLessThanOrEqual(9);
      expect(s.shotClock).toBeGreaterThanOrEqual(0);
      expect(s.shotClock).toBeLessThanOrEqual(99);
      if (s.clockSeconds !== null) {
        expect(s.clockSeconds).toBeGreaterThanOrEqual(0);
        expect(s.clockSeconds).toBeLessThanOrEqual(600);
      }
    }
  });

  it("dedupe rule reduces total to a smaller change set", () => {
    const dedupeKeys: ReadonlyArray<keyof StramatelSnapshot> = [
      "scoreHome",
      "scoreGuest",
      "foulsHome",
      "foulsGuest",
      "timeoutsHome",
      "timeoutsGuest",
      "period",
      "clockSeconds",
      "clockRunning",
      "shotClock",
      "timeoutActive",
    ];
    let prev: StramatelSnapshot | null = null;
    let changes = 0;
    let total = 0;
    for (const f of frames) {
      const s = decodeScoreFrame(f);
      if (!s) continue;
      total += 1;
      if (
        prev === null ||
        dedupeKeys.some((k) => prev?.[k] !== s[k])
      ) {
        changes += 1;
      }
      prev = s;
    }
    expect(total).toBeGreaterThan(0);
    expect(changes).toBeLessThan(total);
  });
});
```

Add the `import type { StramatelSnapshot } from "./stramatel-decoder";` near the existing imports if not already present.

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter @dragons/api test -- stramatel-decoder.test.ts`
Expected: all tests pass, including the three fixture tests.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/scoreboard/stramatel-decoder.test.ts
git commit -m "scoreboard: assert decoder ranges and dedupe ratio against fixture"
```

---

### Task 5: Pubsub helper

**Files:**
- Create: `apps/api/src/services/scoreboard/pubsub.ts`
- Test: `apps/api/src/services/scoreboard/pubsub.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/scoreboard/pubsub.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  on: vi.fn(),
  quit: vi.fn(),
}));

vi.mock("../../config/redis", () => ({
  createRedisClient: () => ({
    publish: (...a: unknown[]) => mocks.publish(...a),
    subscribe: (...a: unknown[]) => mocks.subscribe(...a),
    unsubscribe: (...a: unknown[]) => mocks.unsubscribe(...a),
    on: (...a: unknown[]) => mocks.on(...a),
    quit: (...a: unknown[]) => mocks.quit(...a),
  }),
}));

import { publishSnapshot, subscribeSnapshots, channelFor } from "./pubsub";

describe("pubsub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("namespaces channels by device id", () => {
    expect(channelFor("dragons-1")).toBe("scoreboard:dragons-1");
  });

  it("publishes JSON-encoded payloads", async () => {
    mocks.publish.mockResolvedValue(1);
    await publishSnapshot("dragons-1", { scoreHome: 1 });
    expect(mocks.publish).toHaveBeenCalledWith(
      "scoreboard:dragons-1",
      JSON.stringify({ scoreHome: 1 }),
    );
  });

  it("subscribes and forwards messages on the right channel", async () => {
    let messageHandler: ((channel: string, message: string) => void) | null =
      null;
    mocks.on.mockImplementation((event: string, fn: typeof messageHandler) => {
      if (event === "message") messageHandler = fn;
    });
    mocks.subscribe.mockResolvedValue(undefined);
    const received: unknown[] = [];
    const close = await subscribeSnapshots("dragons-1", (snap) => {
      received.push(snap);
    });
    expect(mocks.subscribe).toHaveBeenCalledWith("scoreboard:dragons-1");
    messageHandler?.("scoreboard:other", JSON.stringify({ skip: true }));
    messageHandler?.("scoreboard:dragons-1", JSON.stringify({ keep: true }));
    expect(received).toEqual([{ keep: true }]);
    await close();
    expect(mocks.unsubscribe).toHaveBeenCalledWith("scoreboard:dragons-1");
    expect(mocks.quit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Confirm a Redis client factory exists or stub one**

Check `apps/api/src/config/redis.ts`. If a `createRedisClient` factory does not exist, run:

```bash
ls apps/api/src/config/redis.ts || echo MISSING
```

If MISSING, add it (this is a tiny shared helper):

Create `apps/api/src/config/redis.ts`:

```ts
import { Redis } from "ioredis";
import { env } from "./env";

export function createRedisClient(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `pnpm --filter @dragons/api test -- pubsub.test.ts`
Expected: FAIL — `./pubsub` not found.

- [ ] **Step 4: Implement `pubsub.ts`**

Create `apps/api/src/services/scoreboard/pubsub.ts`:

```ts
import { createRedisClient } from "../../config/redis";

export function channelFor(deviceId: string): string {
  return `scoreboard:${deviceId}`;
}

const publisher = createRedisClient();

export async function publishSnapshot(
  deviceId: string,
  payload: unknown,
): Promise<void> {
  await publisher.publish(channelFor(deviceId), JSON.stringify(payload));
}

export async function subscribeSnapshots(
  deviceId: string,
  onMessage: (snapshot: unknown) => void,
): Promise<() => Promise<void>> {
  const subscriber = createRedisClient();
  const channel = channelFor(deviceId);
  await subscriber.subscribe(channel);
  subscriber.on("message", (received: string, message: string) => {
    if (received !== channel) return;
    try {
      onMessage(JSON.parse(message));
    } catch {
      // discard non-JSON
    }
  });
  return async () => {
    await subscriber.unsubscribe(channel);
    await subscriber.quit();
  };
}
```

- [ ] **Step 5: Run the test, confirm it passes**

Run: `pnpm --filter @dragons/api test -- pubsub.test.ts`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/config/redis.ts apps/api/src/services/scoreboard/pubsub.ts apps/api/src/services/scoreboard/pubsub.test.ts
git commit -m "scoreboard: add Redis pub/sub helper"
```

---

### Task 6: Ingest service

**Files:**
- Create: `apps/api/src/services/scoreboard/ingest.ts`
- Test: `apps/api/src/services/scoreboard/ingest.test.ts`

- [ ] **Step 1: Write the failing test (pglite + mocked publisher)**

Create `apps/api/src/services/scoreboard/ingest.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb, resetTestDb, closeTestDb } from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";

const mocks = vi.hoisted(() => ({
  publishSnapshot: vi.fn(),
}));

vi.mock("./pubsub", () => ({
  publishSnapshot: (...a: unknown[]) => mocks.publishSnapshot(...a),
}));

vi.mock("../../config/database", async () => {
  const ctx: { db?: unknown } = {};
  return {
    setDbForTest(db: unknown) {
      ctx.db = db;
    },
    get db() {
      return ctx.db;
    },
  };
});

import { processIngest } from "./ingest";
import * as dbModule from "../../config/database";
import { liveScoreboards, scoreboardSnapshots } from "@dragons/db/schema";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  (dbModule as unknown as { setDbForTest(db: unknown): void }).setDbForTest(
    ctx.db,
  );
});

beforeEach(async () => {
  await resetTestDb(ctx);
  mocks.publishSnapshot.mockReset();
  mocks.publishSnapshot.mockResolvedValue(undefined);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// A working frame: home 5, guest 3, period 1, no fouls, START, MM:SS 10:00.
const frameOk =
  "f833" +
  Buffer.from(
    "  10  00" +
      "   5   3" +
      "1" +
      "0000" +
      "  " +
      " " +
      " " +
      "                        " +
      "00" +
      "20",
    "ascii",
  ).toString("hex") +
  "0d";

describe("processIngest", () => {
  it("ignores hex with no complete frame", async () => {
    const r = await processIngest({ deviceId: "d1", hex: "deadbeef" });
    expect(r).toEqual({ ok: true, changed: false, snapshotId: null });
    expect(mocks.publishSnapshot).not.toHaveBeenCalled();
  });

  it("inserts a snapshot and upserts the live row on first frame", async () => {
    const r = await processIngest({ deviceId: "d1", hex: frameOk });
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(true);
    expect(r.snapshotId).toEqual(expect.any(Number));
    const snaps = await ctx.db.select().from(scoreboardSnapshots);
    expect(snaps).toHaveLength(1);
    const live = await ctx.db.select().from(liveScoreboards);
    expect(live).toHaveLength(1);
    expect(live[0].scoreHome).toBe(5);
    expect(mocks.publishSnapshot).toHaveBeenCalledTimes(1);
  });

  it("does not insert a second snapshot when nothing changed", async () => {
    await processIngest({ deviceId: "d1", hex: frameOk });
    const r = await processIngest({ deviceId: "d1", hex: frameOk });
    expect(r.changed).toBe(false);
    const snaps = await ctx.db.select().from(scoreboardSnapshots);
    expect(snaps).toHaveLength(1);
    // live row is still upserted so lastFrameAt advances
    const live = await ctx.db.select().from(liveScoreboards);
    expect(live).toHaveLength(1);
    expect(mocks.publishSnapshot).toHaveBeenCalledTimes(2);
  });

  it("inserts a new snapshot when the score changes", async () => {
    await processIngest({ deviceId: "d1", hex: frameOk });
    const frameDifferent = frameOk.replace(
      Buffer.from("   5   3", "ascii").toString("hex"),
      Buffer.from("   7   3", "ascii").toString("hex"),
    );
    const r = await processIngest({ deviceId: "d1", hex: frameDifferent });
    expect(r.changed).toBe(true);
    const snaps = await ctx.db.select().from(scoreboardSnapshots);
    expect(snaps).toHaveLength(2);
  });
});
```

> Note: this test introduces `setDbForTest` on the database module for test injection. If the existing `apps/api/src/config/database.ts` does not already expose such a hook, add a tiny test-only setter as part of this task. The setter is used **only** in test setup and must be guarded to no-op outside tests.

- [ ] **Step 2: Add the test-injection hook to the database module if absent**

Read `apps/api/src/config/database.ts`. If it exports a constant `db`, replace it with a mutable export and add `setDbForTest`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "./env";

let _db: ReturnType<typeof drizzle> | unknown = drizzle(
  new Pool({ connectionString: env.DATABASE_URL }),
);

export function setDbForTest(replacement: unknown): void {
  if (process.env.NODE_ENV === "production") return;
  _db = replacement;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get: (_t, p) => (_db as Record<string | symbol, unknown>)[p as string],
});

export async function closeDb(): Promise<void> {
  // existing behaviour preserved
}
```

If the module already follows a different pattern, follow that pattern instead — the goal is "tests can swap in a pglite-backed db".

- [ ] **Step 3: Run the test, confirm it fails**

Run: `pnpm --filter @dragons/api test -- ingest.test.ts`
Expected: FAIL — `./ingest` not found.

- [ ] **Step 4: Implement `ingest.ts`**

Create `apps/api/src/services/scoreboard/ingest.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import {
  liveScoreboards,
  scoreboardSnapshots,
  type StramatelSnapshot,
} from "@dragons/db/schema";
import { decodeScoreFrame, findScoreFrames } from "./stramatel-decoder";
import { publishSnapshot } from "./pubsub";
import { logger } from "../../config/logger";

export interface IngestResult {
  ok: true;
  changed: boolean;
  snapshotId: number | null;
}

export interface IngestInput {
  deviceId: string;
  hex: string;
}

const DEDUPE_KEYS = [
  "scoreHome",
  "scoreGuest",
  "foulsHome",
  "foulsGuest",
  "timeoutsHome",
  "timeoutsGuest",
  "period",
  "clockSeconds",
  "clockRunning",
  "shotClock",
  "timeoutActive",
] as const;

function snapshotsDiffer(
  prev: Record<string, unknown> | null,
  next: Record<string, unknown>,
): boolean {
  if (!prev) return true;
  return DEDUPE_KEYS.some((k) => prev[k] !== next[k]);
}

export async function processIngest({
  deviceId,
  hex,
}: IngestInput): Promise<IngestResult> {
  let buf: Buffer;
  try {
    buf = Buffer.from(hex, "hex");
  } catch {
    return { ok: true, changed: false, snapshotId: null };
  }
  const frames = findScoreFrames(buf);
  if (frames.length === 0) {
    return { ok: true, changed: false, snapshotId: null };
  }
  const frame = frames[frames.length - 1];
  const decoded = decodeScoreFrame(frame);
  if (!decoded) {
    return { ok: true, changed: false, snapshotId: null };
  }

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(liveScoreboards)
      .where(eq(liveScoreboards.deviceId, deviceId))
      .limit(1);

    const changed = snapshotsDiffer(
      existing as unknown as Record<string, unknown> | null,
      decoded as unknown as Record<string, unknown>,
    );

    let snapshotId: number | null = null;
    if (changed) {
      const [row] = await tx
        .insert(scoreboardSnapshots)
        .values({
          deviceId,
          ...decoded,
          rawHex: frame.toString("hex"),
        })
        .returning({ id: scoreboardSnapshots.id });
      snapshotId = row.id;
    }

    await tx
      .insert(liveScoreboards)
      .values({
        deviceId,
        ...decoded,
        lastFrameAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: liveScoreboards.deviceId,
        set: {
          ...decoded,
          lastFrameAt: new Date(),
          updatedAt: new Date(),
        },
      });

    return { changed, snapshotId };
  });

  try {
    await publishSnapshot(deviceId, {
      ...decoded,
      snapshotId: result.snapshotId,
      changed: result.changed,
    });
  } catch (err) {
    logger.warn(
      { err, deviceId, snapshotId: result.snapshotId },
      "scoreboard.publish failed",
    );
  }

  return { ok: true, changed: result.changed, snapshotId: result.snapshotId };
}
```

The `StramatelSnapshot` type-only import via `@dragons/db/schema` is a re-export below. Add it.

- [ ] **Step 5: Re-export `StramatelSnapshot` from the db schema barrel for convenience**

Append to `packages/db/src/schema/scoreboard.ts`:

```ts
export type { StramatelSnapshot } from "../../../../apps/api/src/services/scoreboard/stramatel-decoder";
```

If cross-package type imports are not allowed in the workspace, drop this re-export and import directly from the decoder in `ingest.ts`.

- [ ] **Step 6: Run the test, confirm it passes**

Run: `pnpm --filter @dragons/api test -- ingest.test.ts`
Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/scoreboard apps/api/src/config/database.ts packages/db/src/schema/scoreboard.ts
git commit -m "scoreboard: add ingest service with dedupe + history"
```

---

### Task 7: Ingest middleware (bearer key + device id + rate limit)

**Files:**
- Create: `apps/api/src/middleware/ingest-key.ts`
- Test: `apps/api/src/middleware/ingest-key.test.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add env vars**

Modify `apps/api/src/config/env.ts`. Inside the Zod schema add:

```ts
SCOREBOARD_INGEST_KEY: z.string().min(32),
SCOREBOARD_DEVICE_ID:  z.string().min(1),
```

Append to `.env.example`:

```
# Scoreboard ingest (Raspberry Pi -> API)
SCOREBOARD_INGEST_KEY=<openssl rand -base64 48>
SCOREBOARD_DEVICE_ID=<panel name from Panel2Net.id>
```

- [ ] **Step 2: Write the failing middleware test**

Create `apps/api/src/middleware/ingest-key.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../config/env", () => ({
  env: {
    SCOREBOARD_INGEST_KEY: "k".repeat(48),
    SCOREBOARD_DEVICE_ID: "dragons-1",
  },
}));

import { requireIngestKey, __resetRateLimitForTest } from "./ingest-key";

function makeApp() {
  const app = new Hono();
  app.use("*", requireIngestKey);
  app.get("/x", (c) => c.json({ ok: true }));
  return app;
}

beforeEach(() => __resetRateLimitForTest());

describe("requireIngestKey", () => {
  it("rejects missing Authorization", async () => {
    const res = await makeApp().request("/x", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("rejects wrong bearer", async () => {
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: { Authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects missing Device_ID", async () => {
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: { Authorization: `Bearer ${"k".repeat(48)}` },
    });
    expect(res.status).toBe(400);
  });

  it("rejects unknown Device_ID", async () => {
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${"k".repeat(48)}`,
        Device_ID: "other",
      },
    });
    expect(res.status).toBe(400);
  });

  it("allows valid headers", async () => {
    const res = await makeApp().request("/x", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${"k".repeat(48)}`,
        Device_ID: "dragons-1",
      },
    });
    expect(res.status).toBe(200);
  });

  it("rate-limits over 30 requests per second per device", async () => {
    const app = makeApp();
    let last = 200;
    for (let i = 0; i < 31; i++) {
      const r = await app.request("/x", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${"k".repeat(48)}`,
          Device_ID: "dragons-1",
        },
      });
      last = r.status;
    }
    expect(last).toBe(429);
  });
});
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `pnpm --filter @dragons/api test -- ingest-key.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the middleware**

Create `apps/api/src/middleware/ingest-key.ts`:

```ts
import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { env } from "../config/env";

const RATE_LIMIT_PER_SECOND = 30;
const counters = new Map<string, { window: number; count: number }>();

export function __resetRateLimitForTest(): void {
  counters.clear();
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const requireIngestKey: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header("authorization") ?? "";
  const expected = `Bearer ${env.SCOREBOARD_INGEST_KEY}`;
  if (!constantTimeEquals(auth, expected)) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  const deviceId = c.req.header("device_id") ?? c.req.header("Device_ID");
  if (!deviceId) {
    return c.json(
      { error: "Missing Device_ID header", code: "MISSING_DEVICE_ID" },
      400,
    );
  }
  if (deviceId !== env.SCOREBOARD_DEVICE_ID) {
    return c.json(
      { error: "Unknown device", code: "UNKNOWN_DEVICE_ID" },
      400,
    );
  }

  const window = Math.floor(Date.now() / 1000);
  const key = `${deviceId}:${window}`;
  const slot = counters.get(key) ?? { window, count: 0 };
  slot.count += 1;
  counters.set(key, slot);
  if (counters.size > 1024) {
    for (const [k, v] of counters) {
      if (v.window < window - 1) counters.delete(k);
    }
  }
  if (slot.count > RATE_LIMIT_PER_SECOND) {
    c.header("Retry-After", "1");
    return c.json({ error: "Rate limited", code: "RATE_LIMITED" }, 429);
  }

  c.set("scoreboardDeviceId" as never, deviceId as never);
  await next();
};
```

- [ ] **Step 5: Run the test, confirm it passes**

Run: `pnpm --filter @dragons/api test -- ingest-key.test.ts`
Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/ingest-key.ts apps/api/src/middleware/ingest-key.test.ts apps/api/src/config/env.ts .env.example
git commit -m "scoreboard: add bearer-key + device + rate-limit ingest middleware"
```

---

### Task 8: Ingest route

**Files:**
- Create: `apps/api/src/routes/api/scoreboard.routes.ts`
- Create: `apps/api/src/routes/api/scoreboard.schemas.ts`
- Test: `apps/api/src/routes/api/scoreboard.routes.test.ts`

- [ ] **Step 1: Define request body shape**

Create `apps/api/src/routes/api/scoreboard.schemas.ts`:

```ts
import { z } from "zod";

export const ingestResponseSchema = z.object({
  ok: z.literal(true),
  changed: z.boolean(),
  snapshotId: z.number().nullable(),
});

export type IngestResponse = z.infer<typeof ingestResponseSchema>;
```

- [ ] **Step 2: Write the failing route test**

Create `apps/api/src/routes/api/scoreboard.routes.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({
  processIngest: vi.fn(),
}));

vi.mock("../../services/scoreboard/ingest", () => ({
  processIngest: (...a: unknown[]) => mocks.processIngest(...a),
}));

vi.mock("../../config/env", () => ({
  env: {
    SCOREBOARD_INGEST_KEY: "k".repeat(48),
    SCOREBOARD_DEVICE_ID: "dragons-1",
  },
}));

import { apiScoreboardRoutes } from "./scoreboard.routes";

const app = new Hono();
app.route("/api/scoreboard", apiScoreboardRoutes);

const headers = {
  Authorization: `Bearer ${"k".repeat(48)}`,
  Device_ID: "dragons-1",
  "Content-Type": "text/plain",
};

beforeEach(() => mocks.processIngest.mockReset());

describe("POST /api/scoreboard/ingest", () => {
  it("returns 200 and the result from processIngest", async () => {
    mocks.processIngest.mockResolvedValue({
      ok: true,
      changed: true,
      snapshotId: 5,
    });
    const r = await app.request("/api/scoreboard/ingest", {
      method: "POST",
      headers,
      body: "deadbeef",
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, changed: true, snapshotId: 5 });
    expect(mocks.processIngest).toHaveBeenCalledWith({
      deviceId: "dragons-1",
      hex: "deadbeef",
    });
  });

  it("rejects bodies bigger than 8 KB", async () => {
    const r = await app.request("/api/scoreboard/ingest", {
      method: "POST",
      headers,
      body: "a".repeat(8 * 1024 + 1),
    });
    expect(r.status).toBe(413);
  });

  it("returns 401 without bearer", async () => {
    const r = await app.request("/api/scoreboard/ingest", {
      method: "POST",
      headers: { ...headers, Authorization: "" },
      body: "ab",
    });
    expect(r.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `pnpm --filter @dragons/api test -- routes/api/scoreboard.routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the route**

Create `apps/api/src/routes/api/scoreboard.routes.ts`:

```ts
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { describeRoute } from "hono-openapi";
import { requireIngestKey } from "../../middleware/ingest-key";
import { processIngest } from "../../services/scoreboard/ingest";

const apiScoreboardRoutes = new Hono();

apiScoreboardRoutes.post(
  "/ingest",
  requireIngestKey,
  bodyLimit({
    maxSize: 8 * 1024,
    onError: (c) =>
      c.json({ error: "Body too large", code: "BODY_TOO_LARGE" }, 413),
  }),
  describeRoute({
    description: "Stramatel raw-hex ingest from Raspberry Pi",
    tags: ["Scoreboard"],
    responses: {
      200: { description: "Frame accepted" },
      400: { description: "Bad device id" },
      401: { description: "Unauthorized" },
      413: { description: "Body too large" },
      429: { description: "Rate limited" },
    },
  }),
  async (c) => {
    const hex = (await c.req.text()).trim();
    const deviceId = c.req.header("device_id") ?? c.req.header("Device_ID")!;
    const result = await processIngest({ deviceId, hex });
    return c.json(result);
  },
);

export { apiScoreboardRoutes };
```

- [ ] **Step 5: Run the test, confirm it passes**

Run: `pnpm --filter @dragons/api test -- routes/api/scoreboard.routes.test.ts`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/api
git commit -m "scoreboard: add POST /api/scoreboard/ingest route"
```

---

### Task 9: SSE service

**Files:**
- Create: `apps/api/src/services/scoreboard/sse.ts`
- Test: `apps/api/src/services/scoreboard/sse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/scoreboard/sse.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  closeSub: vi.fn(),
  selectLive: vi.fn(),
  selectReplay: vi.fn(),
}));

vi.mock("./pubsub", () => ({
  subscribeSnapshots: (...a: unknown[]) => mocks.subscribe(...a),
}));

vi.mock("../../config/database", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mocks.selectLive(),
          orderBy: () => ({
            limit: async () => mocks.selectReplay(),
          }),
        }),
      }),
    }),
  },
}));

import { createScoreboardStream } from "./sse";

beforeEach(() => {
  mocks.subscribe.mockReset();
  mocks.closeSub.mockReset();
  mocks.subscribe.mockResolvedValue(async () => mocks.closeSub());
  mocks.selectLive.mockResolvedValue([
    { deviceId: "d1", scoreHome: 1, scoreGuest: 0 },
  ]);
  mocks.selectReplay.mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

async function readChunks(
  stream: ReadableStream<Uint8Array>,
  count: number,
): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  while (chunks.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(decoder.decode(value));
  }
  await reader.cancel();
  return chunks;
}

describe("createScoreboardStream", () => {
  it("emits a snapshot-on-connect for fresh client", async () => {
    const res = createScoreboardStream({
      deviceId: "d1",
      lastEventId: undefined,
    });
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const [first] = await readChunks(res.body!, 1);
    expect(first).toContain("event: snapshot");
    expect(first).toContain('"scoreHome":1');
    expect(mocks.subscribe).toHaveBeenCalledWith("d1", expect.any(Function));
  });

  it("uses replay query when Last-Event-ID is present", async () => {
    mocks.selectReplay.mockResolvedValue([
      { id: 11, deviceId: "d1", scoreHome: 2, scoreGuest: 0 },
    ]);
    const res = createScoreboardStream({ deviceId: "d1", lastEventId: 10 });
    const [first] = await readChunks(res.body!, 1);
    expect(first).toContain("id: 11");
    expect(first).toContain('"scoreHome":2');
    expect(mocks.selectLive).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `pnpm --filter @dragons/api test -- sse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `sse.ts`**

Create `apps/api/src/services/scoreboard/sse.ts`:

```ts
import { and, eq, gt, asc } from "drizzle-orm";
import { db } from "../../config/database";
import {
  liveScoreboards,
  scoreboardSnapshots,
} from "@dragons/db/schema";
import { subscribeSnapshots } from "./pubsub";

const HEARTBEAT_MS = 15_000;
const REPLAY_LIMIT = 100;

export interface CreateStreamArgs {
  deviceId: string;
  lastEventId: number | undefined;
}

function sseEvent(id: number | string, name: string, data: unknown): string {
  return `id: ${id}\nevent: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createScoreboardStream({
  deviceId,
  lastEventId,
}: CreateStreamArgs): Response {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => Promise<void>) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function safeEnqueue(text: string) {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // controller already closed
        }
      }

      safeEnqueue("retry: 2000\n\n");

      if (lastEventId !== undefined) {
        const rows = await db
          .select()
          .from(scoreboardSnapshots)
          .where(
            and(
              eq(scoreboardSnapshots.deviceId, deviceId),
              gt(scoreboardSnapshots.id, lastEventId),
            ),
          )
          .orderBy(asc(scoreboardSnapshots.id))
          .limit(REPLAY_LIMIT);
        for (const row of rows) {
          safeEnqueue(sseEvent(row.id, "snapshot", row));
        }
      } else {
        const live = await db
          .select()
          .from(liveScoreboards)
          .where(eq(liveScoreboards.deviceId, deviceId))
          .limit(1);
        if (live.length > 0) {
          safeEnqueue(sseEvent(0, "snapshot", live[0]));
        }
      }

      unsubscribe = await subscribeSnapshots(deviceId, (snap) => {
        const payload = snap as { snapshotId?: number };
        safeEnqueue(
          sseEvent(payload.snapshotId ?? 0, "snapshot", snap),
        );
      });

      heartbeat = setInterval(() => safeEnqueue(": ping\n\n"), HEARTBEAT_MS);
    },
    async cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) await unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `pnpm --filter @dragons/api test -- sse.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/scoreboard/sse.ts apps/api/src/services/scoreboard/sse.test.ts
git commit -m "scoreboard: add SSE response builder with snapshot-on-connect and replay"
```

---

### Task 10: Public scoreboard routes

**Files:**
- Create: `apps/api/src/routes/public/scoreboard.routes.ts`
- Test: `apps/api/src/routes/public/scoreboard.routes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/public/scoreboard.routes.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({
  selectLive: vi.fn(),
  createStream: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mocks.selectLive(),
        }),
      }),
    }),
  },
}));

vi.mock("../../services/scoreboard/sse", () => ({
  createScoreboardStream: (...a: unknown[]) => mocks.createStream(...a),
}));

import { publicScoreboardRoutes } from "./scoreboard.routes";

const app = new Hono();
app.route("/public/scoreboard", publicScoreboardRoutes);

beforeEach(() => {
  mocks.selectLive.mockReset();
  mocks.createStream.mockReset();
});

describe("GET /public/scoreboard/latest", () => {
  it("returns 404 when no row exists", async () => {
    mocks.selectLive.mockResolvedValue([]);
    const r = await app.request("/public/scoreboard/latest?deviceId=d1");
    expect(r.status).toBe(404);
  });

  it("returns the row plus secondsSinceLastFrame", async () => {
    mocks.selectLive.mockResolvedValue([
      {
        deviceId: "d1",
        scoreHome: 5,
        scoreGuest: 4,
        lastFrameAt: new Date(Date.now() - 3000),
      },
    ]);
    const r = await app.request("/public/scoreboard/latest?deviceId=d1");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { secondsSinceLastFrame: number };
    expect(body.secondsSinceLastFrame).toBeGreaterThanOrEqual(2);
  });

  it("requires deviceId", async () => {
    const r = await app.request("/public/scoreboard/latest");
    expect(r.status).toBe(400);
  });
});

describe("GET /public/scoreboard/stream", () => {
  it("delegates to createScoreboardStream", async () => {
    mocks.createStream.mockReturnValue(
      new Response("ok", { headers: { "Content-Type": "text/event-stream" } }),
    );
    const r = await app.request(
      "/public/scoreboard/stream?deviceId=d1",
      {
        headers: { "Last-Event-ID": "42" },
      },
    );
    expect(r.headers.get("Content-Type")).toBe("text/event-stream");
    expect(mocks.createStream).toHaveBeenCalledWith({
      deviceId: "d1",
      lastEventId: 42,
    });
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `pnpm --filter @dragons/api test -- routes/public/scoreboard.routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the routes**

Create `apps/api/src/routes/public/scoreboard.routes.ts`:

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { describeRoute } from "hono-openapi";
import { db } from "../../config/database";
import { liveScoreboards } from "@dragons/db/schema";
import { createScoreboardStream } from "../../services/scoreboard/sse";

const publicScoreboardRoutes = new Hono();

publicScoreboardRoutes.get(
  "/latest",
  describeRoute({
    description: "Latest decoded snapshot for a device",
    tags: ["Scoreboard"],
    responses: { 200: { description: "Snapshot" }, 404: { description: "No data" } },
  }),
  async (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
    }
    const rows = await db
      .select()
      .from(liveScoreboards)
      .where(eq(liveScoreboards.deviceId, deviceId))
      .limit(1);
    if (rows.length === 0) {
      return c.json({ error: "No data", code: "NO_DATA" }, 404);
    }
    const row = rows[0];
    const secondsSinceLastFrame = Math.max(
      0,
      Math.floor((Date.now() - new Date(row.lastFrameAt).getTime()) / 1000),
    );
    c.header("Cache-Control", "no-store");
    return c.json({ ...row, secondsSinceLastFrame });
  },
);

publicScoreboardRoutes.get(
  "/stream",
  describeRoute({
    description: "Server-Sent Events stream of decoded snapshots",
    tags: ["Scoreboard"],
    responses: { 200: { description: "text/event-stream" } },
  }),
  (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
    }
    const lastHeader = c.req.header("Last-Event-ID");
    const lastEventId = lastHeader ? Number.parseInt(lastHeader, 10) : undefined;
    return createScoreboardStream({
      deviceId,
      lastEventId: Number.isFinite(lastEventId)
        ? (lastEventId as number)
        : undefined,
    });
  },
);

export { publicScoreboardRoutes };
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `pnpm --filter @dragons/api test -- routes/public/scoreboard.routes.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/public/scoreboard.routes.ts apps/api/src/routes/public/scoreboard.routes.test.ts
git commit -m "scoreboard: add public latest + SSE stream routes"
```

---

### Task 11: Admin scoreboard routes

**Files:**
- Create: `apps/api/src/routes/admin/scoreboard.routes.ts`
- Test: `apps/api/src/routes/admin/scoreboard.routes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/admin/scoreboard.routes.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  selectSnapshots: vi.fn(),
  selectLive: vi.fn(),
}));

vi.mock("../../config/auth", () => ({
  auth: {
    api: {
      getSession: (...a: unknown[]) => mocks.getSession(...a),
    },
  },
}));

vi.mock("../../config/database", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => mocks.selectSnapshots(),
          }),
          limit: async () => mocks.selectLive(),
        }),
      }),
    }),
  },
}));

import { adminScoreboardRoutes } from "./scoreboard.routes";

const app = new Hono<AppEnv>();
app.route("/admin/scoreboard", adminScoreboardRoutes);

const adminSession = {
  user: { id: "u1", role: "admin" },
  session: { id: "s1" },
};

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.selectSnapshots.mockReset();
  mocks.selectLive.mockReset();
});

describe("admin scoreboard routes", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const r = await app.request("/admin/scoreboard/snapshots?deviceId=d1");
    expect(r.status).toBe(401);
  });

  it("rejects non-admin", async () => {
    mocks.getSession.mockResolvedValue({
      ...adminSession,
      user: { id: "u1", role: "user" },
    });
    const r = await app.request("/admin/scoreboard/snapshots?deviceId=d1");
    expect(r.status).toBe(403);
  });

  it("returns paginated snapshots for admin", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.selectSnapshots.mockResolvedValue([
      { id: 2, scoreHome: 5, scoreGuest: 4 },
      { id: 1, scoreHome: 4, scoreGuest: 4 },
    ]);
    const r = await app.request(
      "/admin/scoreboard/snapshots?deviceId=d1&limit=2",
    );
    expect(r.status).toBe(200);
    expect(((await r.json()) as Array<unknown>).length).toBe(2);
  });

  it("returns health for admin", async () => {
    mocks.getSession.mockResolvedValue(adminSession);
    mocks.selectLive.mockResolvedValue([
      { deviceId: "d1", lastFrameAt: new Date() },
    ]);
    const r = await app.request("/admin/scoreboard/health?deviceId=d1");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { online: boolean };
    expect(body.online).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `pnpm --filter @dragons/api test -- routes/admin/scoreboard.routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the routes**

Create `apps/api/src/routes/admin/scoreboard.routes.ts`:

```ts
import { Hono } from "hono";
import { and, desc, eq, gt } from "drizzle-orm";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { requireAnyRole } from "../../middleware/rbac";
import { db } from "../../config/database";
import {
  liveScoreboards,
  scoreboardSnapshots,
} from "@dragons/db/schema";
import type { AppEnv } from "../../types";

const adminScoreboardRoutes = new Hono<AppEnv>();

const listQuerySchema = z.object({
  deviceId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  afterId: z.coerce.number().int().min(0).optional(),
});

adminScoreboardRoutes.get(
  "/snapshots",
  requireAnyRole("admin"),
  describeRoute({
    description: "Recent decoded snapshots for a device",
    tags: ["Scoreboard"],
    responses: { 200: { description: "Snapshots" } },
  }),
  async (c) => {
    const query = listQuerySchema.parse(c.req.query());
    const where =
      query.afterId !== undefined
        ? and(
            eq(scoreboardSnapshots.deviceId, query.deviceId),
            gt(scoreboardSnapshots.id, query.afterId),
          )
        : eq(scoreboardSnapshots.deviceId, query.deviceId);
    const rows = await db
      .select()
      .from(scoreboardSnapshots)
      .where(where)
      .orderBy(desc(scoreboardSnapshots.id))
      .limit(query.limit);
    return c.json(rows);
  },
);

adminScoreboardRoutes.get(
  "/health",
  requireAnyRole("admin"),
  describeRoute({
    description: "Connection health for the scoreboard ingest",
    tags: ["Scoreboard"],
    responses: { 200: { description: "Health" } },
  }),
  async (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
    }
    const rows = await db
      .select()
      .from(liveScoreboards)
      .where(eq(liveScoreboards.deviceId, deviceId))
      .limit(1);
    if (rows.length === 0) {
      return c.json({
        deviceId,
        lastFrameAt: null,
        secondsSinceLastFrame: null,
        online: false,
      });
    }
    const row = rows[0];
    const secondsSinceLastFrame = Math.floor(
      (Date.now() - new Date(row.lastFrameAt).getTime()) / 1000,
    );
    return c.json({
      deviceId,
      lastFrameAt: row.lastFrameAt,
      secondsSinceLastFrame,
      online: secondsSinceLastFrame < 10,
    });
  },
);

export { adminScoreboardRoutes };
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `pnpm --filter @dragons/api test -- routes/admin/scoreboard.routes.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/scoreboard.routes.ts apps/api/src/routes/admin/scoreboard.routes.test.ts
git commit -m "scoreboard: add admin snapshots + health routes"
```

---

### Task 12: Mount the new routers

**Files:**
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Wire the routers**

Add to the imports in `apps/api/src/routes/index.ts`:

```ts
import { apiScoreboardRoutes } from "./api/scoreboard.routes";
import { publicScoreboardRoutes } from "./public/scoreboard.routes";
import { adminScoreboardRoutes } from "./admin/scoreboard.routes";
```

Add to the `routes.route(...)` block (preserve existing order; the `/admin/*` mount sits next to other admin mounts and inherits the global `requireAuth` from `app.ts:40`):

```ts
routes.route("/api/scoreboard", apiScoreboardRoutes);
routes.route("/public/scoreboard", publicScoreboardRoutes);
routes.route("/admin/scoreboard", adminScoreboardRoutes);
```

- [ ] **Step 2: Run the test suite**

Run: `pnpm --filter @dragons/api test`
Expected: full suite passes.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @dragons/api typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/index.ts
git commit -m "scoreboard: mount ingest, public, and admin routes"
```

---

### Task 13: Add CORS allowance for SSE

**Files:**
- Modify: `apps/api/src/middleware/cors.ts` (only if needed)

- [ ] **Step 1: Read the existing CORS config**

Run: `cat apps/api/src/middleware/cors.ts`. If it already permits the prod web origin and the `Last-Event-ID` request header passes through, no change. If `Last-Event-ID` is rejected by the existing `allowedHeaders`, add it.

- [ ] **Step 2: If a change was needed**

Add `"Last-Event-ID"` to the `allowedHeaders` list. Run `pnpm --filter @dragons/api test -- cors.test.ts` and confirm green.

- [ ] **Step 3: Commit if changed**

```bash
git add apps/api/src/middleware/cors.ts apps/api/src/middleware/cors.test.ts
git commit -m "scoreboard: allow Last-Event-ID through CORS"
```

If no change was required, skip the commit.

---

### Task 14: Add web env var for the device id

**Files:**
- Modify: `apps/web/.env.example` (or whatever file the repo uses for web env documentation)

- [ ] **Step 1: Check existing env documentation**

Run: `ls apps/web/.env* 2>/dev/null; cat apps/web/.env.example 2>/dev/null | head -20`. If `.env.example` does not exist for web, document the var in the root `.env.example` instead.

- [ ] **Step 2: Add the var**

Append:

```
# Scoreboard live page (public)
NEXT_PUBLIC_SCOREBOARD_DEVICE_ID=<panel name from Panel2Net.id>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/.env.example .env.example
git commit -m "scoreboard: document NEXT_PUBLIC_SCOREBOARD_DEVICE_ID"
```

---

### Task 15: Public live page — server shell

**Files:**
- Create: `apps/web/src/app/[locale]/(public)/live/page.tsx`

- [ ] **Step 1: Inspect existing public layout for patterns**

Run: `cat apps/web/src/app/\[locale\]/\(public\)/layout.tsx`. Note imports, metadata exports.

- [ ] **Step 2: Create the page**

Create `apps/web/src/app/[locale]/(public)/live/page.tsx`:

```tsx
import { fetchAPI } from "@/lib/api";
import { ScoreboardLive } from "./scoreboard-live";

interface LiveSnapshot {
  deviceId: string;
  scoreHome: number;
  scoreGuest: number;
  foulsHome: number;
  foulsGuest: number;
  timeoutsHome: number;
  timeoutsGuest: number;
  period: number;
  clockText: string;
  clockSeconds: number | null;
  clockRunning: boolean;
  shotClock: number;
  timeoutActive: boolean;
  timeoutDuration: string;
  panelName: string | null;
  lastFrameAt: string;
  secondsSinceLastFrame: number;
}

const deviceId =
  process.env.NEXT_PUBLIC_SCOREBOARD_DEVICE_ID ?? "";

export default async function LivePage() {
  let initial: LiveSnapshot | null = null;
  if (deviceId) {
    try {
      initial = await fetchAPI<LiveSnapshot>(
        `/public/scoreboard/latest?deviceId=${encodeURIComponent(deviceId)}`,
      );
    } catch {
      initial = null;
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <ScoreboardLive deviceId={deviceId} initialSnapshot={initial} />
    </main>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: FAIL — `./scoreboard-live` not found yet. Continue to Task 16 to add it.

---

### Task 16: Public live page — client component

**Files:**
- Create: `apps/web/src/app/[locale]/(public)/live/scoreboard-live.tsx`
- Test: `apps/web/src/app/[locale]/(public)/live/scoreboard-live.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `apps/web/src/app/[locale]/(public)/live/scoreboard-live.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ScoreboardLive } from "./scoreboard-live";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  readyState = 0;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onopen: ((ev: Event) => void) | null = null;
  listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(name: string, fn: (ev: MessageEvent) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name)!.push(fn);
  }
  removeEventListener() {}
  close() {
    this.readyState = 2;
  }
  dispatch(name: string, data: unknown) {
    const ev = new MessageEvent(name, { data: JSON.stringify(data) });
    this.listeners.get(name)?.forEach((l) => l(ev));
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  // @ts-expect-error - assign to globalThis for the component to use
  globalThis.EventSource = MockEventSource;
});

afterEach(() => {
  MockEventSource.instances.forEach((i) => i.close());
});

const initial = {
  deviceId: "d1",
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
  shotClock: 24,
  timeoutActive: false,
  timeoutDuration: "",
  panelName: null,
  lastFrameAt: new Date().toISOString(),
  secondsSinceLastFrame: 0,
};

describe("ScoreboardLive", () => {
  it("renders the initial snapshot prop", () => {
    render(<ScoreboardLive deviceId="d1" initialSnapshot={initial} />);
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("10:00")).toBeInTheDocument();
  });

  it("updates state on snapshot SSE event", async () => {
    render(<ScoreboardLive deviceId="d1" initialSnapshot={initial} />);
    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();
    await act(async () => {
      es.dispatch("snapshot", { ...initial, scoreHome: 7 });
    });
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("falls back to a placeholder when initialSnapshot is null", () => {
    render(<ScoreboardLive deviceId="d1" initialSnapshot={null} />);
    expect(screen.getByText(/offline|warten|kein/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `pnpm --filter @dragons/web test -- scoreboard-live.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/app/[locale]/(public)/live/scoreboard-live.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

interface Snapshot {
  scoreHome: number;
  scoreGuest: number;
  foulsHome: number;
  foulsGuest: number;
  timeoutsHome: number;
  timeoutsGuest: number;
  period: number;
  clockText: string;
  clockSeconds: number | null;
  clockRunning: boolean;
  shotClock: number;
  timeoutActive: boolean;
  timeoutDuration: string;
}

interface Props {
  deviceId: string;
  initialSnapshot: Snapshot | null;
}

const apiBase =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function ScoreboardLive({ deviceId, initialSnapshot }: Props) {
  const t = useTranslations("scoreboard.live");
  const [snap, setSnap] = useState<Snapshot | null>(initialSnapshot);
  const [status, setStatus] = useState<"connecting" | "online" | "offline">(
    initialSnapshot ? "online" : "connecting",
  );
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    const url = `${apiBase}/public/scoreboard/stream?deviceId=${encodeURIComponent(deviceId)}`;
    const es = new EventSource(url);
    esRef.current = es;
    es.addEventListener("snapshot", (ev: MessageEvent) => {
      try {
        const next = JSON.parse(ev.data) as Snapshot;
        setSnap(next);
        setStatus("online");
      } catch {
        // ignore malformed
      }
    });
    es.addEventListener("error", () => setStatus("offline"));
    es.addEventListener("open", () => setStatus("online"));
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [deviceId]);

  if (!snap) {
    return (
      <div className="text-2xl text-zinc-400" role="status">
        {t("offline")}
      </div>
    );
  }

  const dot =
    status === "online"
      ? "bg-emerald-500"
      : status === "connecting"
      ? "bg-amber-500"
      : "bg-rose-500";

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between text-zinc-400">
        <span className="uppercase tracking-widest">{t("title")}</span>
        <span className="flex items-center gap-2">
          <span className={`inline-block size-2 rounded-full ${dot}`} />
          <span className="text-sm">{t(status)}</span>
        </span>
      </div>
      <div className="grid grid-cols-3 items-center gap-4 text-center">
        <span className="text-9xl font-black tabular-nums">{snap.scoreHome}</span>
        <div className="flex flex-col items-center gap-2">
          <span className="text-xl uppercase text-zinc-400">
            {t("period")} {snap.period}
          </span>
          <span className="text-7xl font-bold tabular-nums">{snap.clockText}</span>
          <span className="text-xl tabular-nums text-zinc-400">
            {t("shotClock")} {snap.shotClock}
          </span>
        </div>
        <span className="text-9xl font-black tabular-nums">{snap.scoreGuest}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 text-zinc-400">
        <span>
          {t("fouls")} {snap.foulsHome} · {t("timeouts")} {snap.timeoutsHome}
        </span>
        <span className="text-right">
          {t("fouls")} {snap.foulsGuest} · {t("timeouts")} {snap.timeoutsGuest}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the i18n strings**

Append to `apps/web/src/messages/en.json` (or whichever locale files exist):

```json
"scoreboard": {
  "live": {
    "title": "Live",
    "period": "Q",
    "shotClock": "SC",
    "fouls": "F",
    "timeouts": "TO",
    "online": "Live",
    "connecting": "Connecting…",
    "offline": "Waiting for data…"
  }
}
```

Translate to other locales as needed (`de.json` etc.). The test uses a regex to match the offline placeholder, so wording is flexible.

- [ ] **Step 5: Run the test, confirm it passes**

Run: `pnpm --filter @dragons/web test -- scoreboard-live.test`
Expected: 3 tests pass.

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\[locale\]/\(public\)/live apps/web/src/messages
git commit -m "scoreboard: add public live page (server shell + client SSE)"
```

---

### Task 17: Admin debug page

**Files:**
- Create: `apps/web/src/app/[locale]/admin/scoreboard/page.tsx`
- Create: `apps/web/src/app/[locale]/admin/scoreboard/scoreboard-debug.tsx`
- Test: `apps/web/src/app/[locale]/admin/scoreboard/scoreboard-debug.test.tsx`

- [ ] **Step 1: Inspect an existing admin page for patterns**

Run: `cat apps/web/src/app/\[locale\]/admin/sync/page.tsx | head -60` (or a similar admin page) to see how data fetching, layout components and SWR are wired.

- [ ] **Step 2: Write the failing component test**

Create `apps/web/src/app/[locale]/admin/scoreboard/scoreboard-debug.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("swr", () => ({
  default: vi.fn(() => ({
    data: { deviceId: "d1", lastFrameAt: null, secondsSinceLastFrame: null, online: false },
    isLoading: false,
  })),
}));

vi.mock("@/lib/api", () => ({
  fetchAPI: vi.fn(async () => [
    { id: 2, scoreHome: 5, scoreGuest: 4, capturedAt: new Date().toISOString(), rawHex: "f8" },
    { id: 1, scoreHome: 4, scoreGuest: 4, capturedAt: new Date().toISOString(), rawHex: "f8" },
  ]),
}));

class MockEventSource {
  url: string;
  listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(name: string, fn: (ev: MessageEvent) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name)!.push(fn);
  }
  removeEventListener() {}
  close() {}
  dispatch(name: string, data: unknown) {
    const ev = new MessageEvent(name, { data: JSON.stringify(data) });
    this.listeners.get(name)?.forEach((l) => l(ev));
  }
}

beforeEach(() => {
  // @ts-expect-error - assign for component
  globalThis.EventSource = MockEventSource;
});

import { ScoreboardDebug } from "./scoreboard-debug";

describe("ScoreboardDebug", () => {
  it("renders the snapshots table from the initial fetch", async () => {
    await act(async () => {
      render(<ScoreboardDebug deviceId="d1" />);
    });
    expect(await screen.findByText(/^5$/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `pnpm --filter @dragons/web test -- scoreboard-debug.test`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the page**

Create `apps/web/src/app/[locale]/admin/scoreboard/page.tsx`:

```tsx
import { ScoreboardDebug } from "./scoreboard-debug";

const deviceId = process.env.NEXT_PUBLIC_SCOREBOARD_DEVICE_ID ?? "";

export default function AdminScoreboardPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Scoreboard ingest</h1>
      <ScoreboardDebug deviceId={deviceId} />
    </div>
  );
}
```

Create `apps/web/src/app/[locale]/admin/scoreboard/scoreboard-debug.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetchAPI } from "@/lib/api";

interface Snapshot {
  id: number;
  capturedAt: string;
  scoreHome: number;
  scoreGuest: number;
  period: number;
  clockText: string;
  shotClock: number;
  rawHex?: string | null;
}

interface Health {
  deviceId: string;
  lastFrameAt: string | null;
  secondsSinceLastFrame: number | null;
  online: boolean;
}

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function ScoreboardDebug({ deviceId }: { deviceId: string }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [paused, setPaused] = useState(false);

  const { data: health } = useSWR<Health>(
    deviceId ? `/admin/scoreboard/health?deviceId=${encodeURIComponent(deviceId)}` : null,
    (url: string) => fetchAPI<Health>(url),
    { refreshInterval: 2000 },
  );

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    fetchAPI<Snapshot[]>(
      `/admin/scoreboard/snapshots?deviceId=${encodeURIComponent(deviceId)}&limit=200`,
    ).then((rows) => {
      if (!cancelled) setSnapshots(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) return;
    const es = new EventSource(
      `${apiBase}/public/scoreboard/stream?deviceId=${encodeURIComponent(deviceId)}`,
    );
    es.addEventListener("snapshot", (ev: MessageEvent) => {
      if (paused) return;
      try {
        const snap = JSON.parse(ev.data) as Snapshot;
        setSnapshots((curr) => [snap, ...curr].slice(0, 500));
      } catch {
        // ignore
      }
    });
    return () => es.close();
  }, [deviceId, paused]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded border border-zinc-800 px-3 py-2 text-sm">
        <span
          className={`inline-block size-2 rounded-full ${health?.online ? "bg-emerald-500" : "bg-rose-500"}`}
        />
        <span>{deviceId || "(no device id configured)"}</span>
        <span className="text-zinc-400">
          Last frame: {health?.lastFrameAt ?? "—"} (
          {health?.secondsSinceLastFrame ?? "—"}s ago)
        </span>
        <button
          type="button"
          className="ml-auto rounded border border-zinc-700 px-2 py-1"
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400">
          <tr>
            <th className="px-2">id</th>
            <th className="px-2">at</th>
            <th className="px-2">H</th>
            <th className="px-2">G</th>
            <th className="px-2">Q</th>
            <th className="px-2">clock</th>
            <th className="px-2">SC</th>
            <th className="px-2">hex</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <tr key={s.id} className="border-t border-zinc-900">
              <td className="px-2 tabular-nums">{s.id}</td>
              <td className="px-2 tabular-nums">{s.capturedAt}</td>
              <td className="px-2 tabular-nums">{s.scoreHome}</td>
              <td className="px-2 tabular-nums">{s.scoreGuest}</td>
              <td className="px-2 tabular-nums">{s.period}</td>
              <td className="px-2 tabular-nums">{s.clockText}</td>
              <td className="px-2 tabular-nums">{s.shotClock}</td>
              <td className="px-2 font-mono text-xs text-zinc-500">
                {s.rawHex ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Run the test, confirm it passes**

Run: `pnpm --filter @dragons/web test -- scoreboard-debug.test`
Expected: 1 test passes.

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\[locale\]/admin/scoreboard
git commit -m "scoreboard: add admin debug page (snapshots + health + SSE feed)"
```

---

### Task 18: Documentation updates

**Files:**
- Modify: `AGENTS.md`
- Modify: `apps/api/README.md`

- [ ] **Step 1: Update `AGENTS.md`**

In the endpoint list section, add four lines under the appropriate namespace:

```
POST   /api/scoreboard/ingest        Stramatel raw-hex ingest (Bearer key)
GET    /public/scoreboard/latest     Current snapshot for a device (no auth)
GET    /public/scoreboard/stream     SSE stream of decoded snapshots (no auth)
GET    /admin/scoreboard/snapshots   Paginated snapshot history (admin)
GET    /admin/scoreboard/health      Ingest health (admin)
```

In the data model section add the two new tables: `live_scoreboards` and `scoreboard_snapshots` with one-line summaries.

- [ ] **Step 2: Update `apps/api/README.md`**

Append a "Scoreboard ingest" section explaining: the env vars `SCOREBOARD_INGEST_KEY` and `SCOREBOARD_DEVICE_ID`, how to generate the key (`openssl rand -base64 48`), where to install it on the Pi (`/home/pi/Panel2Net/scoreboard.key`, mode `0600`), and the rotation procedure.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md apps/api/README.md
git commit -m "scoreboard: document new endpoints, tables, and env vars"
```

---

### Task 19: Raspberry Pi script changes (separate repo)

This task lands in `/Users/jn/git/Panel2Net`, not in `dragons-all`. Open that repo before running the steps.

- [ ] **Step 1: Create the integration branch**

Run:

```bash
cd /Users/jn/git/Panel2Net
git checkout -b hbdragons-ingest
```

- [ ] **Step 2: Update server, port, URL, baud rate, and HTTPS**

Edit `Panel2Net.py`. Replace these four lines:

- Line 41 stays as `SerialPort = '/dev/ttyUSB0'` (no change).
- Line 43: `BaudRate = 19200`
- Line 54: `RequestServer = 'api.app.hbdragons.de'`
- Line 56: `RequestPort = 443`

Replace the per-protocol URL assignments at lines 164, 176, 188 with a single fixed URL:

```python
RequestURL = '/api/scoreboard/ingest'
```

Replace the `http.client.HTTPConnection(...)` call at line 241 with:

```python
import ssl
context = ssl.create_default_context()
conn = http.client.HTTPSConnection(
    RequestServer, RequestPort, timeout=RequestTimeOut, context=context,
)
```

Add the import at the top of the file alongside the existing imports.

- [ ] **Step 3: Add bearer-key loading**

Near the top of `Panel2Net.py`, after the `Device_ID` block, add:

```python
SCOREBOARD_KEY = ''
try:
    with open('/home/pi/Panel2Net/scoreboard.key', 'r') as kf:
        SCOREBOARD_KEY = kf.read().strip()
except OSError:
    print('scoreboard.key missing — refusing to start')
    raise SystemExit(1)
```

In the request headers block (around line 234), add:

```python
headers['Authorization'] = 'Bearer ' + SCOREBOARD_KEY
```

- [ ] **Step 4: Add light back-off after 5 consecutive non-2xx responses**

Around the existing reply-status check (~line 244), maintain a counter:

```python
fail_streak = 0
# ...
if httpreply.status == 200:
    fail_streak = 0
    logging.debug(str(httpreply.status) + ' ' + str(httpreply.reason))
else:
    fail_streak += 1
    logging.error(str(httpreply.status) + ' ' + str(httpreply.reason))
    if fail_streak >= 5:
        time.sleep(5)
```

- [ ] **Step 5: Smoke test against staging**

If a staging API is available, run `Panel2Net.py` with the staging URL, supply a fake serial port (`socat -d -d pty,raw,echo=0 pty,raw,echo=0`) and pipe `Stramatel_GEN_HEL_20171125.txt` into one side. Confirm 200 OK responses in the script's stdout.

- [ ] **Step 6: Commit on the integration branch**

```bash
git add Panel2Net.py
git commit -m "feat: target dragons-all API with bearer auth (hbdragons-ingest fork)"
```

Do not push to upstream `Panel2Net` master.

---

### Task 20: End-to-end smoke test (manual)

**Files:** none (verification only)

- [ ] **Step 1: Start Postgres + Redis locally**

Run: `docker compose -f docker/docker-compose.dev.yml up -d`

- [ ] **Step 2: Run migrations**

Run: `pnpm --filter @dragons/db db:migrate`

- [ ] **Step 3: Start the API in dev mode**

Run: `SCOREBOARD_INGEST_KEY=$(openssl rand -base64 48) SCOREBOARD_DEVICE_ID=dragons-1 pnpm --filter @dragons/api dev`

Note the printed key — you will need it for the `curl` step below.

- [ ] **Step 4: Start the web app**

In a new terminal: `NEXT_PUBLIC_SCOREBOARD_DEVICE_ID=dragons-1 pnpm --filter @dragons/web dev`

Open `http://localhost:3000/en/live`. The page renders the offline placeholder.

- [ ] **Step 5: POST a fixture frame**

Pick one frame's hex from `Stramatel_GEN_HEL_20171125.txt` (use `xxd` to slice ~80 bytes containing one `F8 33 ... 0D` window). Run:

```bash
curl -i -X POST http://localhost:3001/api/scoreboard/ingest \
  -H "Authorization: Bearer <KEY>" \
  -H "Device_ID: dragons-1" \
  -H "Content-Type: text/plain" \
  --data-binary @<(xxd -p path/to/frame.bin | tr -d '\n')
```

Expected response: `200 OK`, body `{"ok":true,"changed":true,"snapshotId":1}`.

- [ ] **Step 6: Confirm the live page updates**

Reload `http://localhost:3000/en/live`. The score, period, and clock from that frame should be visible. Open `http://localhost:3000/en/admin/scoreboard` (signed in as admin) and confirm the snapshot appears in the table with its raw hex.

- [ ] **Step 7: Confirm SSE stream pushes a second update**

Modify the home score in the hex (replace one byte to change the digit) and POST again. The live page updates without reload.

---

## Self-review summary

Spec coverage walkthrough:

- Schema (`live_scoreboards`, `scoreboard_snapshots`, dedupe field set, raw hex column, index): Task 1.
- Decoder (`findScoreFrames`, `decodeScoreFrame`, `null` sentinel, MM:SS / SS.t branches, fixture validation, dedupe ratio): Tasks 2, 3, 4.
- Pubsub helper: Task 5.
- Ingest service (decode + dedupe + transactional persistence + publish + decoder-failure short-circuit): Task 6.
- Bearer-key middleware (constant-time compare, device id check, 30/s rate limit): Task 7.
- Ingest route (auth, body limit, response shape): Task 8.
- SSE service (`retry: 2000`, snapshot-on-connect, `Last-Event-ID` replay, heartbeat, cleanup): Task 9.
- Public endpoints (`/latest`, `/stream`, no auth): Task 10.
- Admin endpoints (`/snapshots`, `/health`, RBAC): Task 11.
- Router mount + global `requireAuth` reuse for admin: Task 12.
- CORS for `Last-Event-ID`: Task 13 (conditional).
- Web env: Task 14.
- Public live page (server fetch + client EventSource): Tasks 15, 16.
- Admin debug page (health bar, snapshots table, pause toggle, SSE feed): Task 17.
- Documentation: Task 18.
- Pi script changes (URL, port, HTTPS, key, baud, back-off): Task 19.
- Manual smoke test: Task 20.

Type consistency: `StramatelSnapshot` defined once in `stramatel-decoder.ts` and reused by `ingest.ts`, `sse.ts`, `scoreboard-live.tsx`. `IngestResult` defined once in `ingest.ts` and reused by the route. Field names (`scoreHome`, `clockSeconds`, etc.) are consistent across schema, decoder, services, routes, and components.

No placeholders remain. Every code step contains the code that must land. Every command step contains the command and the expected outcome.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-29-stramatel-live-scoreboard.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
