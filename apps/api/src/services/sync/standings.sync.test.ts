import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { LeagueFetchedData } from "./data-fetcher";

// Real Postgres (pglite) with real migrations, the real `sql` template and the real
// `computeEntityHash`. The previous mocked-ORM version stubbed `sql` to an identity
// function, so neither the `excluded.*` column mapping nor the
// `setWhere: excluded.data_hash != standings.data_hash` guard was ever executed —
// swapping points_for/points_against in the upsert left all 13 tests green.
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

import { syncStandingsFromData } from "./standings.sync";
import { computeEntityHash } from "./hash";
import { standings, leagues, teams } from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

const LEAGUE_A = 10;
const LEAGUE_B = 11;
const TEAM_A = 100;
const TEAM_B = 200;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  dbHolder.ref = ctx.db;
  vi.clearAllMocks();
  // Only Date is faked: pglite's WASM I/O needs real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2025-06-01T00:00:00.000Z"));

  await ctx.db.insert(leagues).values([
    { id: LEAGUE_A, apiLigaId: 1, ligaNr: 1, name: "Bezirksliga", seasonId: 1, seasonName: "2024/25" },
    { id: LEAGUE_B, apiLigaId: 2, ligaNr: 2, name: "Kreisliga", seasonId: 1, seasonName: "2024/25" },
  ]);
  await ctx.db.insert(teams).values([
    { apiTeamPermanentId: TEAM_A, seasonTeamId: 10, teamCompetitionId: 1, name: "Team A", clubId: 1 },
    { apiTeamPermanentId: TEAM_B, seasonTeamId: 20, teamCompetitionId: 2, name: "Team B", clubId: 2 },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

type TabelleEntry = LeagueFetchedData["tabelle"][number];

function makeEntry(overrides: Partial<TabelleEntry> = {}): TabelleEntry {
  return {
    rang: 1,
    team: {
      teamPermanentId: TEAM_A,
      seasonTeamId: 10,
      teamCompetitionId: 1,
      teamname: "Team A",
      teamnameSmall: "TA",
      clubId: 1,
      verzicht: false,
    },
    anzspiele: 20,
    anzGewinnpunkte: 30,
    anzVerlustpunkte: 10,
    s: 15,
    n: 5,
    koerbe: 1500,
    gegenKoerbe: 1300,
    korbdiff: 200,
    ...overrides,
  };
}

function makeLeagueData(overrides: Partial<LeagueFetchedData> = {}): LeagueFetchedData {
  return {
    leagueApiId: 1,
    leagueDbId: LEAGUE_A,
    leagueName: "Bezirksliga",
    spielplan: [],
    tabelle: [makeEntry()],
    gameDetails: new Map(),
    ...overrides,
  };
}

async function standingRows() {
  return ctx.db.select().from(standings).orderBy(standings.leagueId, standings.teamApiId);
}

async function standingRow(leagueId: number, teamApiId: number) {
  const [row] = await ctx.db
    .select()
    .from(standings)
    .where(and(eq(standings.leagueId, leagueId), eq(standings.teamApiId, teamApiId)));
  if (!row) throw new Error(`standing ${leagueId}/${teamApiId} not found`);
  return row;
}

/** Point getDb() at a db whose insert rejects, to drive the catch branch. */
async function withFailingDb<T>(reason: unknown, fn: () => Promise<T>): Promise<T> {
  dbHolder.ref = {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: () => Promise.reject(reason) }),
      }),
    }),
  };
  try {
    return await fn();
  } finally {
    dbHolder.ref = ctx.db;
  }
}

describe("syncStandingsFromData", () => {
  it("returns an empty result for empty input without touching the database", async () => {
    const result = await syncStandingsFromData([]);

    expect(result.total).toBe(0);
    expect(await standingRows()).toEqual([]);
  });

  it("skips a league without leagueDbId", async () => {
    const result = await syncStandingsFromData([makeLeagueData({ leagueDbId: null })]);

    expect(result.total).toBe(0);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("No DB ID")]),
    );
    expect(await standingRows()).toEqual([]);
  });

  it("skips entries without a teamPermanentId", async () => {
    const result = await syncStandingsFromData([
      makeLeagueData({ tabelle: [makeEntry({ team: null as never })] }),
    ]);

    expect(result.total).toBe(0);
    expect(await standingRows()).toEqual([]);
  });

  it("creates standings with every column mapped from the tabelle entry", async () => {
    const result = await syncStandingsFromData([makeLeagueData()]);

    expect(result.total).toBe(1);
    expect(result.created).toBe(1);

    const row = await standingRow(LEAGUE_A, TEAM_A);
    expect(row.position).toBe(1);
    expect(row.played).toBe(20);
    expect(row.won).toBe(15);
    expect(row.lost).toBe(5);
    expect(row.pointsFor).toBe(1500);
    expect(row.pointsAgainst).toBe(1300);
    expect(row.pointsDiff).toBe(200);
    expect(row.leaguePoints).toBe(30);
    expect(row.lastSyncedAt).not.toBeNull();
    expect(row.dataHash).toBe(
      computeEntityHash({
        leagueId: LEAGUE_A,
        teamApiId: TEAM_A,
        position: 1,
        played: 20,
        won: 15,
        lost: 5,
        pointsFor: 1500,
        pointsAgainst: 1300,
        pointsDiff: 200,
        leaguePoints: 30,
      }),
    );
  });

  it("updates every column on the conflict path when the standing changed", async () => {
    await syncStandingsFromData([makeLeagueData()]);
    const afterCreate = await standingRow(LEAGUE_A, TEAM_A);

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    const result = await syncStandingsFromData([
      makeLeagueData({
        tabelle: [
          makeEntry({
            rang: 3,
            anzspiele: 21,
            s: 16,
            n: 5,
            koerbe: 1590,
            gegenKoerbe: 1360,
            korbdiff: 230,
            anzGewinnpunkte: 32,
          }),
        ],
      }),
    ]);

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);

    const row = await standingRow(LEAGUE_A, TEAM_A);
    expect(row.position).toBe(3);
    expect(row.played).toBe(21);
    expect(row.won).toBe(16);
    expect(row.lost).toBe(5);
    expect(row.pointsFor).toBe(1590);
    expect(row.pointsAgainst).toBe(1360);
    expect(row.pointsDiff).toBe(230);
    expect(row.leaguePoints).toBe(32);
    expect(row.id).toBe(afterCreate.id); // upsert, not a second row
    expect(row.createdAt.getTime()).toBe(afterCreate.createdAt.getTime());
    expect(row.updatedAt.getTime()).toBeGreaterThan(afterCreate.updatedAt.getTime());
  });

  it("skips an unchanged standing on re-sync (dataHash change detection)", async () => {
    await syncStandingsFromData([makeLeagueData()]);
    const afterCreate = await standingRow(LEAGUE_A, TEAM_A);

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    const result = await syncStandingsFromData([makeLeagueData()]);

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);

    const row = await standingRow(LEAGUE_A, TEAM_A);
    expect(row.updatedAt.getTime()).toBe(afterCreate.updatedAt.getTime());
    expect(row.lastSyncedAt!.getTime()).toBe(afterCreate.lastSyncedAt!.getTime());
  });

  it("keeps one row per (league, team) and separate rows across leagues", async () => {
    const result = await syncStandingsFromData([
      makeLeagueData(),
      makeLeagueData({
        leagueApiId: 2,
        leagueDbId: LEAGUE_B,
        tabelle: [makeEntry({ rang: 2 })],
      }),
    ]);

    expect(result.total).toBe(2);
    expect(result.created).toBe(2);
    const rows = await standingRows();
    expect(rows.map((r) => [r.leagueId, r.teamApiId, r.position])).toEqual([
      [LEAGUE_A, TEAM_A, 1],
      [LEAGUE_B, TEAM_A, 2],
    ]);
  });

  it("handles batch error and leaves the table untouched", async () => {
    const result = await withFailingDb(new Error("DB error"), () =>
      syncStandingsFromData([makeLeagueData()]),
    );

    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("DB error");
    expect(await standingRows()).toEqual([]);
  });

  it("handles non-Error exception", async () => {
    const result = await withFailingDb(42, () => syncStandingsFromData([makeLeagueData()]));

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("logs the 'skipped' action when all entries are skipped", async () => {
    await syncStandingsFromData([makeLeagueData()]);
    const mockLogger = { log: vi.fn() };

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    await syncStandingsFromData([makeLeagueData()], mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "standing",
        action: "skipped",
        metadata: { created: 0, updated: 0, skipped: 1 },
      }),
    );
  });

  it("logs the 'updated' action when changes exist", async () => {
    const mockLogger = { log: vi.fn() };

    await syncStandingsFromData([makeLeagueData()], mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "standing",
        action: "updated",
        metadata: { created: 1, updated: 0, skipped: 0 },
      }),
    );
  });

  it("logs failure to the sync logger", async () => {
    const mockLogger = { log: vi.fn() };

    await withFailingDb(new Error("fail"), () =>
      syncStandingsFromData([makeLeagueData()], mockLogger as never),
    );

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "standing", action: "failed" }),
    );
  });

  it("includes durationMs", async () => {
    const result = await syncStandingsFromData([]);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("processes multiple leagues in one batch", async () => {
    const result = await syncStandingsFromData([
      makeLeagueData({ leagueDbId: LEAGUE_A }),
      makeLeagueData({
        leagueApiId: 2,
        leagueDbId: LEAGUE_B,
        tabelle: [makeEntry({ team: { ...makeEntry().team!, teamPermanentId: TEAM_B } })],
      }),
    ]);

    expect(result.total).toBe(2);
    expect((await standingRows()).map((r) => [r.leagueId, r.teamApiId])).toEqual([
      [LEAGUE_A, TEAM_A],
      [LEAGUE_B, TEAM_B],
    ]);
  });
});
