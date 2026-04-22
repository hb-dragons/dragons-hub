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

import { resolveHistoryDateRange, getRefereeHistorySummary } from "./referee-history.service";
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
});
