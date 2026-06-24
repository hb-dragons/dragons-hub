import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, resetTestDb, type TestDbContext } from "../../test/setup-test-db";

const { dbHolder, getAllLigen } = vi.hoisted(() => ({
  dbHolder: { ref: null as unknown },
  getAllLigen: vi.fn(),
}));
vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));
vi.mock("../sync/sdk-client", () => ({ sdkClient: { getAllLigen } }));

const mockGetActiveSeasonId = vi.fn();
vi.mock("./season.service", () => ({
  getActiveSeasonId: (...args: unknown[]) => mockGetActiveSeasonId(...args),
  invalidateActiveSeasonCache: vi.fn(),
}));

import {
  browseLeagues,
  setSeasonLeagues,
  getTrackedLeagues,
  setLeagueOwnClubRefs,
} from "./league-discovery.service";

let ctx: TestDbContext;
beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});
afterAll(async () => {
  await ctx.client.close();
});
beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mockGetActiveSeasonId.mockResolvedValue(null);
});

function liga(ligaId: number, vorabliga: boolean, liganr: number | null = null) {
  return {
    ligaId,
    liganr,
    liganame: `Liga ${ligaId}`,
    seasonId: 2026,
    seasonName: "2026/27",
    skName: "Oberliga",
    akName: "Senioren",
    geschlecht: "männlich",
    verbandId: 7,
    verbandName: "NDS",
    vorabliga,
    tableExists: false,
    crossTableExists: false,
  };
}

async function makeSeason(status: string): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ('2026/27',$1) RETURNING id`,
    [status],
  );
  return r.rows[0]!.id;
}

describe("browseLeagues", () => {
  it("returns only vorabligas when vorabligaOnly is set", async () => {
    getAllLigen.mockResolvedValue([liga(54136, true), liga(48666, false, 4001)]);
    const rows = await browseLeagues({ vorabligaOnly: true });
    expect(rows.map((r) => r.ligaId)).toEqual([54136]);
  });

  it("marks alreadyTracked leagues for the season", async () => {
    const seasonId = await makeSeason("upcoming");
    await ctx.client.query(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked, vorabliga)
       VALUES (54136, 0, 'Liga 54136', 2026, '2026/27', $1, true, true)`,
      [seasonId],
    );
    getAllLigen.mockResolvedValue([liga(54136, true), liga(54137, true)]);
    const rows = await browseLeagues({ seasonId });
    expect(rows.find((r) => r.ligaId === 54136)?.alreadyTracked).toBe(true);
    expect(rows.find((r) => r.ligaId === 54137)?.alreadyTracked).toBe(false);
  });

  it("marks all leagues as alreadyTracked:false when no seasonId provided", async () => {
    // No seasonId → trackedIds set stays empty → all alreadyTracked false
    getAllLigen.mockResolvedValue([liga(54136, true), liga(54137, false, 4001)]);
    const rows = await browseLeagues({});
    expect(rows.every((r) => r.alreadyTracked === false)).toBe(true);
  });
});

describe("setSeasonLeagues", () => {
  it("tracks selected ligas under the season and scoped-untracks the rest", async () => {
    const seasonId = await makeSeason("upcoming");
    getAllLigen.mockResolvedValue([liga(54136, true), liga(54137, true)]);
    const first = await setSeasonLeagues(seasonId, [54136, 54137]);
    expect(first.tracked).toBe(2);
    const second = await setSeasonLeagues(seasonId, [54136]); // drop 54137
    expect(second.untracked).toBe(1);
    const tracked = await getTrackedLeagues(seasonId);
    expect(tracked.leagues.map((l) => l.apiLigaId)).toEqual([54136]);
  });

  it("does not touch leagues from other seasons", async () => {
    const otherSeason = await makeSeason("active");
    await ctx.client.query(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked, vorabliga)
       VALUES (99999, 0, 'Other', 2025, '2025/26', $1, true, false)`,
      [otherSeason],
    );
    const upcoming = await makeSeason("upcoming");
    getAllLigen.mockResolvedValue([liga(54136, true)]);
    await setSeasonLeagues(upcoming, [54136]);
    const other = await getTrackedLeagues(otherSeason);
    expect(other.leagues.map((l) => l.apiLigaId)).toContain(99999);
  });
});

describe("getTrackedLeagues", () => {
  it("returns only leagues for the given seasonId (explicit arg)", async () => {
    const s1 = await makeSeason("active");
    const s2 = await makeSeason("upcoming");
    await ctx.client.query(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked, vorabliga)
       VALUES (11111, 0, 'League S1', 2025, '2025/26', $1, true, false),
              (22222, 0, 'League S2', 2026, '2026/27', $2, true, false)`,
      [s1, s2],
    );
    const result = await getTrackedLeagues(s1);
    expect(result.leagues.map((l) => l.apiLigaId)).toEqual([11111]);
  });

  it("returns leagues scoped to active season when no arg passed", async () => {
    const s1 = await makeSeason("active");
    const s2 = await makeSeason("upcoming");
    await ctx.client.query(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked, vorabliga)
       VALUES (11111, 0, 'League S1', 2025, '2025/26', $1, true, false),
              (22222, 0, 'League S2', 2026, '2026/27', $2, true, false)`,
      [s1, s2],
    );
    mockGetActiveSeasonId.mockResolvedValue(s1);
    const result = await getTrackedLeagues();
    expect(result.leagues.map((l) => l.apiLigaId)).toEqual([11111]);
  });

  it("returns all tracked leagues when no active season exists", async () => {
    const s1 = await makeSeason("archived");
    const s2 = await makeSeason("upcoming");
    await ctx.client.query(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked, vorabliga)
       VALUES (11111, 0, 'League S1', 2025, '2025/26', $1, true, false),
              (22222, 0, 'League S2', 2026, '2026/27', $2, true, false)`,
      [s1, s2],
    );
    mockGetActiveSeasonId.mockResolvedValue(null);
    const result = await getTrackedLeagues();
    expect(result.leagues.map((l) => l.apiLigaId)).toHaveLength(2);
  });
});

describe("setLeagueOwnClubRefs", () => {
  it("updates ownClubRefs for the given league id", async () => {
    const seasonId = await makeSeason("active");
    await ctx.client.query(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked, vorabliga, own_club_refs)
       VALUES (77777, 0, 'Test', 2025, '2025/26', $1, true, false, false)`,
      [seasonId],
    );
    const r = await ctx.client.query<{ id: number }>(
      `SELECT id FROM leagues WHERE api_liga_id = 77777`,
    );
    const leagueId = r.rows[0]!.id;
    await setLeagueOwnClubRefs(leagueId, true);
    const check = await ctx.client.query<{ own_club_refs: boolean }>(
      `SELECT own_club_refs FROM leagues WHERE id = $1`,
      [leagueId],
    );
    expect(check.rows[0]!.own_club_refs).toBe(true);
  });
});
