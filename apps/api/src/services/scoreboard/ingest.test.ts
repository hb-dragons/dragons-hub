import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  publishSnapshot: vi.fn(),
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

import { processIngest } from "./ingest";
import { setupTestDb, resetTestDb, closeTestDb } from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";
import { liveScoreboards, scoreboardSnapshots } from "@dragons/db/schema";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
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
      Buffer.from("  5", "ascii").toString("hex"),
      Buffer.from("  7", "ascii").toString("hex"),
    );
    const r = await processIngest({ deviceId: "d1", hex: frameDifferent });
    expect(r.changed).toBe(true);
    const snaps = await ctx.db.select().from(scoreboardSnapshots);
    expect(snaps).toHaveLength(2);
  });
});
