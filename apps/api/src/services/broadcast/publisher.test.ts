import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  publishBroadcast: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

vi.mock("../scoreboard/pubsub", () => ({
  publishBroadcast: (...a: unknown[]) => mocks.publishBroadcast(...a),
}));

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
} from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";
import {
  broadcastConfigs,
  leagues,
  liveScoreboards,
  matches,
  teams,
} from "@dragons/db/schema";
import {
  buildBroadcastState,
  publishBroadcastForDevice,
  invalidateMatchCache,
} from "./publisher";

let ctx: TestDbContext;
beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});
beforeEach(async () => {
  await resetTestDb(ctx);
  mocks.publishBroadcast.mockReset();
  mocks.publishBroadcast.mockResolvedValue(undefined);
  invalidateMatchCache();
});
afterAll(async () => {
  await closeTestDb(ctx);
});

async function seedConfig(opts: {
  isLive: boolean;
  withMatch: boolean;
  scoreboard?: Partial<typeof liveScoreboards.$inferInsert>;
}): Promise<void> {
  let matchId: number | null = null;
  if (opts.withMatch) {
    await ctx.db.insert(leagues).values({
      id: 100,
      apiLigaId: 100,
      ligaNr: 1,
      name: "Liga",
      seasonId: 2026,
      seasonName: "2025/26",
    });
    await ctx.db.insert(teams).values([
      {
        apiTeamPermanentId: 1,
        seasonTeamId: 1,
        teamCompetitionId: 1,
        name: "Dragons",
        nameShort: "Dragons",
        clubId: 42,
        isOwnClub: true,
      },
      {
        apiTeamPermanentId: 2,
        seasonTeamId: 2,
        teamCompetitionId: 2,
        name: "Visitors",
        nameShort: "Visitors",
        clubId: 99,
        isOwnClub: false,
      },
    ]);
    const [m] = await ctx.db
      .insert(matches)
      .values({
        apiMatchId: 1,
        matchNo: 1,
        matchDay: 1,
        kickoffDate: "2026-05-02",
        kickoffTime: "19:30:00",
        leagueId: 100,
        homeTeamApiId: 1,
        guestTeamApiId: 2,
      })
      .returning({ id: matches.id });
    matchId = m!.id;
  }
  await ctx.db.insert(broadcastConfigs).values({
    deviceId: "d1",
    matchId,
    isLive: opts.isLive,
  });
  if (opts.scoreboard) {
    await ctx.db.insert(liveScoreboards).values({
      deviceId: "d1",
      ...opts.scoreboard,
    });
  }
}

describe("buildBroadcastState", () => {
  it("returns idle state when not live", async () => {
    await seedConfig({ isLive: false, withMatch: true });
    const state = await buildBroadcastState("d1");
    expect(state.phase).toBe("idle");
    expect(state.match).not.toBeNull();
  });

  it("returns pregame phase when live + period 0 + clock stopped", async () => {
    await seedConfig({
      isLive: true,
      withMatch: true,
      scoreboard: { period: 0, clockRunning: false },
    });
    const state = await buildBroadcastState("d1");
    expect(state.phase).toBe("pregame");
  });

  it("returns live phase when clockRunning", async () => {
    await seedConfig({
      isLive: true,
      withMatch: true,
      scoreboard: { period: 1, clockRunning: true, scoreHome: 7 },
    });
    const state = await buildBroadcastState("d1");
    expect(state.phase).toBe("live");
    expect(state.scoreboard?.scoreHome).toBe(7);
  });

  it("flags stale=true when last frame older than 30s", async () => {
    const old = new Date(Date.now() - 60_000);
    await seedConfig({
      isLive: true,
      withMatch: true,
      scoreboard: {
        period: 1,
        clockRunning: false,
        lastFrameAt: old,
        updatedAt: old,
      },
    });
    const state = await buildBroadcastState("d1");
    expect(state.stale).toBe(true);
  });

  it("returns empty state when no config row", async () => {
    const state = await buildBroadcastState("d1");
    expect(state.phase).toBe("idle");
    expect(state.match).toBeNull();
    expect(state.isLive).toBe(false);
  });
});

describe("publishBroadcastForDevice", () => {
  it("calls publishBroadcast with the merged state", async () => {
    await seedConfig({
      isLive: true,
      withMatch: true,
      scoreboard: { period: 1, clockRunning: true },
    });
    await publishBroadcastForDevice("d1");
    expect(mocks.publishBroadcast).toHaveBeenCalledTimes(1);
    const [device, payload] = mocks.publishBroadcast.mock.calls[0]!;
    expect(device).toBe("d1");
    expect((payload as { phase: string }).phase).toBe("live");
  });
});
