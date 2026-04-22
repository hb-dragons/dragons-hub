import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy({}, {
    get: (_target, prop) =>
      (dbHolder.ref as Record<string | symbol, unknown>)[prop],
  }),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  },
}));

import {
  resolveHistoryDateRange,
  getRefereeHistorySummary,
  getRefereeHistoryGames,
} from "./referee-history.service";
import { appSettings, referees, refereeGames } from "@dragons/db/schema";
import {
  setupTestDb, resetTestDb, closeTestDb, type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await closeTestDb(ctx); });
beforeEach(async () => { await resetTestDb(ctx); });

describe("resolveHistoryDateRange", () => {
  it("returns user values when both provided", async () => {
    const res = await resolveHistoryDateRange("2024-09-01", "2025-03-31");
    expect(res).toEqual({
      from: "2024-09-01", to: "2025-03-31", source: "user",
    });
  });

  it("reads app_settings when user values absent", async () => {
    await ctx.db.insert(appSettings).values([
      { key: "currentSeasonStart", value: "2025-08-01" },
      { key: "currentSeasonEnd", value: "2026-07-31" },
    ]);
    const res = await resolveHistoryDateRange();
    expect(res).toEqual({
      from: "2025-08-01", to: "2026-07-31", source: "settings",
    });
  });

  it("falls back to Aug-Jul season when settings missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00Z"));
    const res = await resolveHistoryDateRange();
    expect(res).toEqual({
      from: "2025-08-01", to: "2026-07-31", source: "default",
    });
    vi.useRealTimers();
  });

  it("default fallback rolls to current calendar year when month >= Aug", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));
    const res = await resolveHistoryDateRange();
    expect(res).toEqual({
      from: "2026-08-01", to: "2027-07-31", source: "default",
    });
    vi.useRealTimers();
  });
});

async function seedReferees() {
  await ctx.db.insert(referees).values([
    { apiId: 100, firstName: "Anna", lastName: "Own", isOwnClub: true },
    { apiId: 101, firstName: "Ben",  lastName: "Own",  isOwnClub: true },
    { apiId: 200, firstName: "Carl", lastName: "Guest", isOwnClub: false },
  ]);
}

function baseGame(overrides: Partial<typeof refereeGames.$inferInsert> = {}) {
  return {
    apiMatchId: Math.floor(Math.random() * 1_000_000),
    matchNo: 1,
    kickoffDate: "2025-09-15",
    kickoffTime: "18:00:00",
    homeTeamName: "Dragons",
    guestTeamName: "Bears",
    sr1OurClub: true,
    sr2OurClub: true,
    sr1Status: "filled",
    sr2Status: "filled",
    sr1RefereeApiId: 100,
    sr2RefereeApiId: 101,
    sr1Name: "Own, Anna",
    sr2Name: "Own, Ben",
    isHomeGame: true,
    ...overrides,
  };
}

describe("getRefereeHistorySummary KPIs (obligation mode)", () => {
  beforeEach(async () => { await seedReferees(); });

  it("counts games and slot fill states within range", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, kickoffDate: "2025-09-15" }),
      baseGame({ apiMatchId: 2, kickoffDate: "2025-10-01",
        sr1Status: "open", sr1RefereeApiId: null, sr1Name: null }),
      baseGame({ apiMatchId: 3, kickoffDate: "2025-10-02",
        isCancelled: true }),
      baseGame({ apiMatchId: 4, kickoffDate: "2025-10-03",
        isForfeited: true }),
      // out of range → excluded
      baseGame({ apiMatchId: 5, kickoffDate: "2024-05-01" }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "obligation",
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: "all",
    });

    expect(res.kpis.games).toBe(4);
    expect(res.kpis.obligatedSlots).toBe(8);
    expect(res.kpis.filledSlots).toBe(7);
    expect(res.kpis.unfilledSlots).toBe(1);
    expect(res.kpis.cancelled).toBe(1);
    expect(res.kpis.forfeited).toBe(1);
  });

  it("default status=active excludes cancelled/forfeited from game count", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1 }),
      baseGame({ apiMatchId: 2, isCancelled: true }),
      baseGame({ apiMatchId: 3, isForfeited: true }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "obligation",
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: "active",
    });

    expect(res.kpis.games).toBe(1);
    expect(res.kpis.cancelled).toBe(0);
    expect(res.kpis.forfeited).toBe(0);
  });

  it("activity mode omits obligation KPIs and counts games our refs worked", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, sr1OurClub: false, sr2OurClub: false,
        sr1RefereeApiId: 100, sr2RefereeApiId: 200,
        sr1Name: "Own, Anna", sr2Name: "Guest, Carl" }),
      baseGame({ apiMatchId: 2, sr1OurClub: false, sr2OurClub: false,
        sr1RefereeApiId: 200, sr2RefereeApiId: 200,
        sr1Name: "Guest, Carl", sr2Name: "Guest, Carl" }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "activity",
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: "all",
    });

    expect(res.kpis.games).toBe(1);
    expect(res.kpis.obligatedSlots).toBeUndefined();
    expect(res.kpis.filledSlots).toBeUndefined();
    expect(res.kpis.unfilledSlots).toBeUndefined();
  });

  it("league filter narrows to matching leagueShort", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, leagueShort: "RLW" }),
      baseGame({ apiMatchId: 2, leagueShort: "OL" }),
    ]);
    const res = await getRefereeHistorySummary({
      mode: "obligation",
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      league: "RLW",
      status: "all",
    });
    expect(res.kpis.games).toBe(1);
  });

  it("includes resolved range in response", async () => {
    const res = await getRefereeHistorySummary({
      mode: "obligation",
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: "all",
    });
    expect(res.range).toEqual({
      from: "2025-08-01", to: "2026-07-31", source: "user",
    });
  });

  it("status=cancelled returns only cancelled games", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1 }),
      baseGame({ apiMatchId: 2, isCancelled: true }),
      baseGame({ apiMatchId: 3, isCancelled: true }),
      baseGame({ apiMatchId: 4, isForfeited: true }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "obligation",
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: "cancelled",
    });

    expect(res.kpis.games).toBe(2);
    expect(res.kpis.cancelled).toBe(2);
    expect(res.kpis.forfeited).toBe(0);
  });

  it("status=forfeited returns only forfeited games", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1 }),
      baseGame({ apiMatchId: 2, isCancelled: true }),
      baseGame({ apiMatchId: 3, isForfeited: true }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "obligation",
      dateFrom: "2025-08-01",
      dateTo: "2026-07-31",
      status: "forfeited",
    });

    expect(res.kpis.games).toBe(1);
    expect(res.kpis.forfeited).toBe(1);
    expect(res.kpis.cancelled).toBe(0);
  });
});

describe("getRefereeHistorySummary leaderboard", () => {
  beforeEach(async () => { await seedReferees(); });

  it("counts sr1/sr2 per referee, joining own-club names", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, kickoffDate: "2025-09-15",
        sr1RefereeApiId: 100, sr2RefereeApiId: 101 }),
      baseGame({ apiMatchId: 2, kickoffDate: "2025-10-01",
        sr1RefereeApiId: 100, sr2RefereeApiId: 100 }),
      baseGame({ apiMatchId: 3, kickoffDate: "2025-10-02",
        sr1RefereeApiId: 200, sr2RefereeApiId: 101,
        sr1Name: "Guest, Carl", sr2Name: "Own, Ben" }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
    });

    const anna  = res.leaderboard.find((e) => e.refereeApiId === 100);
    const ben   = res.leaderboard.find((e) => e.refereeApiId === 101);
    const carl  = res.leaderboard.find((e) => e.refereeApiId === 200);

    expect(anna).toEqual(expect.objectContaining({
      sr1Count: 2, sr2Count: 1, total: 3, isOwnClub: true,
      displayName: "Own, Anna", refereeId: expect.any(Number),
      lastRefereedDate: "2025-10-01",
    }));
    expect(ben).toEqual(expect.objectContaining({
      sr1Count: 0, sr2Count: 2, total: 2, isOwnClub: true,
    }));
    expect(carl).toEqual(expect.objectContaining({
      sr1Count: 1, sr2Count: 0, total: 1, isOwnClub: false,
      displayName: "Guest, Carl",
    }));
    expect(res.kpis.distinctReferees).toBe(3);
    // total desc sort
    expect(res.leaderboard.map((e) => e.refereeApiId)).toEqual([100, 101, 200]);
  });

  it("falls back to stored name when apiId is null", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, kickoffDate: "2025-09-15",
        sr1RefereeApiId: null, sr2RefereeApiId: null,
        sr1Name: "Unknown, X", sr2Name: "Unknown, Y" }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
    });

    const x = res.leaderboard.find((e) => e.displayName === "Unknown, X");
    expect(x).toEqual(expect.objectContaining({
      refereeApiId: null, refereeId: null,
      isOwnClub: false, sr1Count: 1, sr2Count: 0, total: 1,
    }));
  });

  it("caps leaderboard at 100 entries", async () => {
    const rows = Array.from({ length: 110 }, (_, i) => baseGame({
      apiMatchId: 10_000 + i,
      kickoffDate: "2025-09-15",
      sr1RefereeApiId: null, sr2RefereeApiId: null,
      sr1Name: `Ref ${i}, A`, sr2Name: `Ref ${i}, B`,
    }));
    await ctx.db.insert(refereeGames).values(rows);

    const res = await getRefereeHistorySummary({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
    });

    expect(res.leaderboard.length).toBe(100);
  });

  it("activity-mode leaderboard only includes refs from our-club games", async () => {
    await ctx.db.insert(refereeGames).values([
      // own-club game: Anna (100) + Ben (101), both own refs
      baseGame({ apiMatchId: 1, kickoffDate: "2025-09-15",
        sr1OurClub: true, sr2OurClub: true,
        sr1RefereeApiId: 100, sr2RefereeApiId: 101,
        sr1Name: "Own, Anna", sr2Name: "Own, Ben" }),
      // guest-only game: Carl (200) both slots, no own-club obligation,
      // no own-club ref present → excluded from activity-mode base query
      baseGame({ apiMatchId: 2, kickoffDate: "2025-09-16",
        sr1OurClub: false, sr2OurClub: false,
        sr1RefereeApiId: 200, sr2RefereeApiId: 200,
        sr1Name: "Guest, Carl", sr2Name: "Guest, Carl" }),
    ]);

    const res = await getRefereeHistorySummary({
      mode: "activity", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
    });

    const ids = res.leaderboard.map((e) => e.refereeApiId);
    expect(ids).toContain(100);
    expect(ids).toContain(101);
    expect(ids).not.toContain(200);
  });

  it("empty result set: no rows in range returns empty summary", async () => {
    const res = await getRefereeHistorySummary({
      mode: "obligation", status: "all",
      dateFrom: "2030-01-01", dateTo: "2030-12-31",
    });

    expect(res.kpis.games).toBe(0);
    expect(res.leaderboard).toEqual([]);
    expect(res.kpis.distinctReferees).toBe(0);
  });
});

describe("getRefereeHistoryGames", () => {
  beforeEach(async () => { await seedReferees(); });

  it("returns paginated list sorted by kickoffDate desc", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, kickoffDate: "2025-09-01", kickoffTime: "18:00:00" }),
      baseGame({ apiMatchId: 2, kickoffDate: "2025-10-05", kickoffTime: "20:00:00" }),
      baseGame({ apiMatchId: 3, kickoffDate: "2025-10-05", kickoffTime: "17:00:00" }),
    ]);
    const res = await getRefereeHistoryGames({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
      limit: 50, offset: 0,
    });
    expect(res.total).toBe(3);
    expect(res.hasMore).toBe(false);
    expect(res.items.map((i) => i.kickoffDate + " " + i.kickoffTime)).toEqual([
      "2025-10-05 20:00:00",
      "2025-10-05 17:00:00",
      "2025-09-01 18:00:00",
    ]);
  });

  it("respects limit/offset with hasMore", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, kickoffDate: "2025-09-01" }),
      baseGame({ apiMatchId: 2, kickoffDate: "2025-10-01" }),
      baseGame({ apiMatchId: 3, kickoffDate: "2025-11-01" }),
    ]);
    const res = await getRefereeHistoryGames({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
      limit: 2, offset: 0,
    });
    expect(res.items.length).toBe(2);
    expect(res.hasMore).toBe(true);
    expect(res.total).toBe(3);
  });

  it("applies search on team + league names", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, homeTeamName: "Dragons", guestTeamName: "Bears" }),
      baseGame({ apiMatchId: 2, homeTeamName: "Wolves",  guestTeamName: "Eagles" }),
      baseGame({ apiMatchId: 3, homeTeamName: "Owls",    guestTeamName: "Hawks",
        leagueName: "Oberliga" }),
    ]);
    const res = await getRefereeHistoryGames({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
      limit: 50, offset: 0, search: "drag",
    });
    expect(res.items.length).toBe(1);
    expect(res.items[0]!.homeTeamName).toBe("Dragons");
  });

  it("league filter narrows items to matching leagueShort", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1, leagueShort: "RLW" }),
      baseGame({ apiMatchId: 2, leagueShort: "OL" }),
    ]);
    const res = await getRefereeHistoryGames({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
      league: "RLW", limit: 50, offset: 0,
    });
    expect(res.items.length).toBe(1);
    expect(res.total).toBe(1);
    expect(res.items[0]!.leagueShort).toBe("RLW");
  });

  it("empty result set: no rows in range returns empty list", async () => {
    const res = await getRefereeHistoryGames({
      mode: "obligation", status: "all",
      dateFrom: "2030-01-01", dateTo: "2030-12-31",
      limit: 50, offset: 0,
    });
    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.hasMore).toBe(false);
  });

  it("multi-word search ANDs across teams/league", async () => {
    await ctx.db.insert(refereeGames).values([
      baseGame({ apiMatchId: 1,
        homeTeamName: "Dragons Red", guestTeamName: "Bears" }),
      // distractor: matches "drag" but not "bears"
      baseGame({ apiMatchId: 2,
        homeTeamName: "Dragons Blue", guestTeamName: "Wolves" }),
    ]);
    const res = await getRefereeHistoryGames({
      mode: "obligation", status: "all",
      dateFrom: "2025-08-01", dateTo: "2026-07-31",
      limit: 50, offset: 0, search: "drag bears",
    });
    expect(res.items.length).toBe(1);
    expect(res.items[0]!.homeTeamName).toBe("Dragons Red");
  });
});
