import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Hono } from "hono";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  publishBroadcastForDevice: vi.fn(),
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

vi.mock("../../middleware/rbac", () => ({
  requireAnyRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock("../../services/broadcast/publisher", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/broadcast/publisher")
  >("../../services/broadcast/publisher");
  return {
    ...actual,
    publishBroadcastForDevice: (...a: unknown[]) =>
      mocks.publishBroadcastForDevice(...a),
  };
});

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
} from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";
import {
  broadcastConfigs,
  leagues,
  matches,
  teams,
} from "@dragons/db/schema";
import { adminBroadcastRoutes } from "./broadcast.routes";

let ctx: TestDbContext;
beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});
beforeEach(async () => {
  await resetTestDb(ctx);
  mocks.publishBroadcastForDevice.mockReset();
  mocks.publishBroadcastForDevice.mockResolvedValue(undefined);
});
afterAll(async () => {
  await closeTestDb(ctx);
});

function app() {
  return new Hono().route("/admin/broadcast", adminBroadcastRoutes);
}

async function seedMatch(): Promise<{ matchId: number }> {
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
      kickoffDate: new Date().toISOString().slice(0, 10),
      kickoffTime: "19:30:00",
      leagueId: 100,
      homeTeamApiId: 1,
      guestTeamApiId: 2,
    })
    .returning({ id: matches.id });
  return { matchId: m!.id };
}

describe("GET /admin/broadcast/config", () => {
  it("returns 400 without deviceId", async () => {
    const res = await app().request("/admin/broadcast/config");
    expect(res.status).toBe(400);
  });

  it("returns null config for unknown device", async () => {
    const res = await app().request("/admin/broadcast/config?deviceId=x");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { config: unknown };
    expect(body.config).toBeNull();
  });

  it("returns the config row when present", async () => {
    const { matchId } = await seedMatch();
    await ctx.db.insert(broadcastConfigs).values({ deviceId: "d1", matchId });
    const res = await app().request("/admin/broadcast/config?deviceId=d1");
    const body = (await res.json()) as {
      config: { deviceId: string };
      match: unknown;
    };
    expect(body.config.deviceId).toBe("d1");
    expect(body.match).not.toBeNull();
  });
});

describe("PUT /admin/broadcast/config", () => {
  it("upserts and triggers a publish", async () => {
    const { matchId } = await seedMatch();
    const res = await app().request("/admin/broadcast/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "d1",
        matchId,
        homeAbbr: "DRA",
        guestAbbr: "VIS",
      }),
    });
    expect(res.status).toBe(200);
    expect(mocks.publishBroadcastForDevice).toHaveBeenCalledWith("d1");
  });

  it("rejects invalid body", async () => {
    const res = await app().request("/admin/broadcast/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /admin/broadcast/start", () => {
  it("400 if no matchId bound", async () => {
    await ctx.db.insert(broadcastConfigs).values({ deviceId: "d1" });
    const res = await app().request("/admin/broadcast/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "d1" }),
    });
    expect(res.status).toBe(400);
  });

  it("flips isLive=true and publishes", async () => {
    const { matchId } = await seedMatch();
    await ctx.db.insert(broadcastConfigs).values({ deviceId: "d1", matchId });
    const res = await app().request("/admin/broadcast/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "d1" }),
    });
    expect(res.status).toBe(200);
    const [row] = await ctx.db.select().from(broadcastConfigs);
    expect(row!.isLive).toBe(true);
    expect(mocks.publishBroadcastForDevice).toHaveBeenCalledWith("d1");
  });
});

describe("POST /admin/broadcast/stop", () => {
  it("flips isLive=false and publishes", async () => {
    const { matchId } = await seedMatch();
    await ctx.db.insert(broadcastConfigs).values({
      deviceId: "d1",
      matchId,
      isLive: true,
    });
    const res = await app().request("/admin/broadcast/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "d1" }),
    });
    expect(res.status).toBe(200);
    const [row] = await ctx.db.select().from(broadcastConfigs);
    expect(row!.isLive).toBe(false);
    expect(mocks.publishBroadcastForDevice).toHaveBeenCalledWith("d1");
  });
});
