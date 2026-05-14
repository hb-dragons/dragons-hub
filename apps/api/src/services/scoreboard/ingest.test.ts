import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  publishSnapshot: vi.fn(),
  publishBroadcastForDevice: vi.fn(),  // NEW
}));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) =>
        (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("./pubsub", () => ({
  publishSnapshot: (...a: unknown[]) => mocks.publishSnapshot(...a),
}));

vi.mock("../broadcast/publisher", () => ({
  publishBroadcastForDevice: (...a: unknown[]) =>
    mocks.publishBroadcastForDevice(...a),
}));

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { processIngest } from "./ingest";
import { setupTestDb, resetTestDb, closeTestDb } from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";
import { broadcastConfigs, liveScoreboards, scoreboardSnapshots } from "@dragons/db/schema";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  mocks.publishSnapshot.mockReset();
  mocks.publishSnapshot.mockResolvedValue(undefined);
  mocks.publishBroadcastForDevice.mockReset();
  mocks.publishBroadcastForDevice.mockResolvedValue(undefined);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// A working frame: home 5, guest 3, period 1, no fouls, START, MM:SS 10:00.
// Layout matches Task 3 test payload conventions: 48-byte payload after F8 33 ... 0D framing.
const frameOk =
  "f833" +
  Buffer.from(
    "  " + // 0..2 filler
      "10" + // 2..4 mm
      "00" + // 4..6 ss -> MM:SS branch
      "  5" + // 6..9 scoreHome
      "  3" + // 9..12 scoreGuest
      "1" + // 12 period
      "0" + // 13 foulsHome
      "0" + // 14 foulsGuest
      "0" + // 15 timeoutsHome
      "0" + // 16 timeoutsGuest
      " " + // 17 filler
      " " + // 18 status -> running
      " " + // 19 timeout -> inactive
      "                        " + // 20..44 filler (24)
      "00" + // 44..46 timeoutDuration
      "20", // 46..48 shotClock
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
    expect(live[0]!.scoreHome).toBe(5);
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
      Buffer.from("  5", "ascii").toString("hex"),
      Buffer.from("  7", "ascii").toString("hex"),
    );
    const r = await processIngest({ deviceId: "d1", hex: frameDifferent });
    expect(r.changed).toBe(true);
    const snaps = await ctx.db.select().from(scoreboardSnapshots);
    expect(snaps).toHaveLength(2);
  });

  // Regression: a real serial capture contains long runs of E8 E8 E4 preamble
  // bursts that look like frames but fail the old decoder's ASCII guard.
  // The walk-back-to-the-latest-decodable-frame logic now lives in
  // decodeLatestFrame (scoreboard-decoder.ts); this test confirms the full
  // ingest path still rejects that preamble noise and lands on a real frame.
  it("decodes the latest real frame in a multi-frame capture window", async () => {
    const fixture = readFileSync(
      resolve(import.meta.dirname, "__fixtures__/stramatel-sample.bin"),
    );
    const window = fixture.subarray(0, 1000).toString("hex");
    const r = await processIngest({ deviceId: "d1", hex: window });
    expect(r.ok).toBe(true);
    expect(r.snapshotId).toEqual(expect.any(Number));
    const live = await ctx.db.select().from(liveScoreboards);
    expect(live).toHaveLength(1);
    expect(mocks.publishSnapshot).toHaveBeenCalledTimes(1);
  });

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
});

describe("processIngest broadcast publish", () => {
  it("publishes broadcast state when isLive=true", async () => {
    await ctx.db.insert(broadcastConfigs).values({
      deviceId: "d1",
      isLive: true,
      matchId: null, // intentionally null — broadcast still publishes idle
    });
    await processIngest({ deviceId: "d1", hex: frameOk });
    // The publish helper is mocked at module scope below in Step 2.
    expect(mocks.publishBroadcastForDevice).toHaveBeenCalledWith("d1");
  });

  it("does not publish broadcast when isLive=false", async () => {
    await ctx.db.insert(broadcastConfigs).values({
      deviceId: "d1",
      isLive: false,
      matchId: null,
    });
    await processIngest({ deviceId: "d1", hex: frameOk });
    expect(mocks.publishBroadcastForDevice).not.toHaveBeenCalled();
  });

  it("does not publish broadcast when no config row exists", async () => {
    await processIngest({ deviceId: "d1", hex: frameOk });
    expect(mocks.publishBroadcastForDevice).not.toHaveBeenCalled();
  });
});
