import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import type { HallOccupancyDay } from "@dragons/shared";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({
  userHasPermission: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

vi.mock("../../config/auth", () => ({
  auth: { api: { userHasPermission: mocks.userHasPermission, getSession: mocks.getSession } },
}));

import { hallOccupancyRoutes } from "./hall-occupancy.routes";
import { errorHandler } from "../../middleware/error";
import { matches, teams, venueHallTimes, venues } from "@dragons/db/schema";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

const app = new Hono<AppEnv>();
app.use("/*", async (c, next) => {
  c.set("user", { id: "user-1" } as AppEnv["Variables"]["user"]);
  await next();
});
app.onError(errorHandler);
app.route("/", hallOccupancyRoutes);

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mocks.userHasPermission.mockResolvedValue({ success: true });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function seedGame(date: string, withHallTime: boolean) {
  const [venue] = await ctx.db
    .insert(venues)
    .values({ apiId: 777, name: "Sporthalle Am Park" })
    .returning({ id: venues.id });
  await ctx.db.insert(teams).values([
    { apiTeamPermanentId: 1000, seasonTeamId: 1, teamCompetitionId: 1, name: "Dragons 1", clubId: 4121, isOwnClub: true },
    { apiTeamPermanentId: 2000, seasonTeamId: 2, teamCompetitionId: 1, name: "Gast", clubId: 99, isOwnClub: false },
  ]);
  if (withHallTime) {
    await ctx.db.insert(venueHallTimes).values({
      venueId: venue!.id,
      date,
      kind: "open",
      startTime: "08:00:00",
      endTime: "17:00:00",
      source: "manual",
    });
  }
  await ctx.db.insert(matches).values({
    apiMatchId: 1,
    matchNo: 1,
    matchDay: 1,
    kickoffDate: date,
    kickoffTime: "10:00:00",
    homeTeamApiId: 1000,
    guestTeamApiId: 2000,
    venueId: venue!.id,
  });
}

describe("GET /hall-occupancy", () => {
  it("returns occupancy days for the range", async () => {
    await seedGame("2026-03-14", true);

    const res = await app.request("/hall-occupancy?dateFrom=2026-03-01&dateTo=2026-03-31");

    expect(res.status).toBe(200);
    const body = (await res.json()) as HallOccupancyDay[];
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      date: "2026-03-14",
      venueName: "Sporthalle Am Park",
      coverage: "covered",
      windowStart: "09:00:00",
      windowEnd: "12:30:00",
    });
    expect(mocks.userHasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ permissions: { booking: ["view"] } }) }),
    );
  });

  it("applies the coverage filter", async () => {
    await seedGame("2026-03-14", true);

    const res = await app.request(
      "/hall-occupancy?dateFrom=2026-03-01&dateTo=2026-03-31&coverage=none",
    );

    expect(await res.json()).toEqual([]);
  });

  it("rejects an unknown coverage with 400", async () => {
    const res = await app.request("/hall-occupancy?coverage=pending");
    expect(res.status).toBe(400);
  });

  it("is forbidden without booking:view", async () => {
    mocks.userHasPermission.mockResolvedValue({ success: false });
    expect((await app.request("/hall-occupancy")).status).toBe(403);
  });
});
