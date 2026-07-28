import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";

// --- Mocks (hoisted before imports) ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

// --- Imports (after mocks) ---

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { liveScoreboards, scoreboardSnapshots } from "@dragons/db/schema";
import { getDb } from "../../config/database";
import { getLatestSnapshot, listSnapshots, getDeviceHealth } from "./live-snapshot";
import { SCOREBOARD_ONLINE_THRESHOLD_MS } from "./constants";

// The columns `scoreboard_snapshots` requires NOT NULL with no default.
const baseSnapshot = {
  deviceId: "d1",
  scoreHome: 0,
  scoreGuest: 0,
  foulsHome: 0,
  foulsGuest: 0,
  timeoutsHome: 0,
  timeoutsGuest: 0,
  period: 1,
  clockText: "10:00",
  clockRunning: false,
  timeoutActive: false,
  timeoutDuration: "",
};

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

describe("getLatestSnapshot", () => {
  it("returns null when the device has no live row", async () => {
    await expect(getLatestSnapshot("nope")).resolves.toBeNull();
  });

  it("returns the live row for a known device", async () => {
    await getDb()
      .insert(liveScoreboards)
      .values({ deviceId: "d1", scoreHome: 5 });
    const row = await getLatestSnapshot("d1");
    expect(row?.scoreHome).toBe(5);
  });
});

describe("listSnapshots", () => {
  it("filters snapshots after a given id and honours the limit", async () => {
    await getDb()
      .insert(scoreboardSnapshots)
      .values([baseSnapshot, baseSnapshot, baseSnapshot]);

    const all = await listSnapshots({ deviceId: "d1", limit: 10 });
    expect(all).toHaveLength(3);

    const after = await listSnapshots({
      deviceId: "d1",
      afterId: all[1]!.id,
      limit: 10,
    });
    // Non-vacuous: rows are ordered by id desc, so exactly the one row with a
    // higher id than all[1] should come back — this fails if afterId is
    // ignored (all 3 rows) or if the ordering/threshold is wrong (0 rows).
    expect(after).toHaveLength(1);
    expect(after.every((r) => r.id > all[1]!.id)).toBe(true);

    const limited = await listSnapshots({ deviceId: "d1", limit: 2 });
    expect(limited).toHaveLength(2);
  });
});

describe("getDeviceHealth", () => {
  it("reports a device with no live row as offline", async () => {
    await expect(getDeviceHealth("silent")).resolves.toMatchObject({
      deviceId: "silent",
      lastFrameAt: null,
      online: false,
    });
  });

  it("reports a device with a recent frame as online", async () => {
    await getDb()
      .insert(liveScoreboards)
      .values({ deviceId: "d1", lastFrameAt: new Date() });
    await expect(getDeviceHealth("d1")).resolves.toMatchObject({
      deviceId: "d1",
      online: true,
    });
  });

  it("reports a device whose row is older than the online threshold as offline", async () => {
    const staleLastFrameAt = new Date(
      Date.now() - SCOREBOARD_ONLINE_THRESHOLD_MS - 5_000,
    );
    await getDb()
      .insert(liveScoreboards)
      .values({ deviceId: "d1", lastFrameAt: staleLastFrameAt });
    await expect(getDeviceHealth("d1")).resolves.toMatchObject({
      deviceId: "d1",
      online: false,
    });
  });
});
