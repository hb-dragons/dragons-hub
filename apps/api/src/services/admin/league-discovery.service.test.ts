import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, resetTestDb, type TestDbContext } from "../../test/setup-test-db";

const { dbHolder, getAllLigen, getClubMatches, getTabelle, getSpielplan, fetchLeagueRoster } = vi.hoisted(() => ({
  dbHolder: { ref: null as unknown },
  getAllLigen: vi.fn(),
  getClubMatches: vi.fn(),
  getTabelle: vi.fn(),
  getSpielplan: vi.fn(),
  fetchLeagueRoster: vi.fn(),
}));
vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));
vi.mock("../sync/sdk-client", () => ({
  sdkClient: { getAllLigen, getClubMatches, getTabelle, getSpielplan },
}));
vi.mock("./league-roster", () => ({ fetchLeagueRoster }));

const mockGetActiveSeasonId = vi.fn();
vi.mock("./season.service", () => ({
  getActiveSeasonId: (...args: unknown[]) => mockGetActiveSeasonId(...args),
  invalidateActiveSeasonCache: vi.fn(),
}));

const mockGetClubConfig = vi.fn();
vi.mock("./settings.service", () => ({
  getClubConfig: (...args: unknown[]) => mockGetClubConfig(...args),
}));

import {
  browseLeagues,
  setSeasonLeagues,
  getTrackedLeagues,
  setLeagueOwnClubRefs,
  getLeagueTeams,
} from "./league-discovery.service";
import { leagues } from "@dragons/db/schema";

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
  mockGetClubConfig.mockResolvedValue({ clubId: 4121, clubName: "Dragons" });
  getClubMatches.mockResolvedValue({ club: { vereinId: 4121, vereinsname: "Dragons" }, matches: [] });
  fetchLeagueRoster.mockResolvedValue([]);
});

function liga(
  ligaId: number,
  vorabliga: boolean,
  liganr: number | null = null,
  skName = "Oberliga",
) {
  return {
    ligaId,
    liganr,
    liganame: `Liga ${ligaId}`,
    seasonId: 2026,
    seasonName: "2026/27",
    skName,
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

  it("includes Regionalliga leagues under vorabligaOnly even though they are not flagged vorabliga", async () => {
    // The federation never marks the top tiers vorabliga (promotion/relegation is
    // settled before the season), but a Regionalliga club still needs to pick its
    // league during new-season onboarding.
    getAllLigen.mockResolvedValue([
      liga(54136, true), // vorabliga Oberliga — included
      liga(48666, false, 4001), // committed Oberliga — excluded
      liga(47756, false, 4002, "1.Regionalliga"), // committed Regionalliga — included
      liga(49733, false, 4003, "2.Regionalliga"), // committed Regionalliga — included
    ]);
    const rows = await browseLeagues({ vorabligaOnly: true });
    expect(rows.map((r) => r.ligaId).sort((a, b) => a - b)).toEqual([47756, 49733, 54136]);
  });

  it("narrows to leagues our club plays in when ownClubOnly is set", async () => {
    getAllLigen.mockResolvedValue([liga(54141, true), liga(54142, true), liga(54143, true)]);
    getClubMatches.mockResolvedValue({
      club: { vereinId: 4121, vereinsname: "Dragons" },
      matches: [
        { matchId: 1, ligaData: { ligaId: 54141 } },
        { matchId: 2, ligaData: { ligaId: 54143 } },
        { matchId: 3, ligaData: { ligaId: 54141 } }, // duplicate league — deduped
      ],
    });
    const rows = await browseLeagues({ vorabligaOnly: true, ownClubOnly: true });
    expect(rows.map((r) => r.ligaId).sort((a, b) => a - b)).toEqual([54141, 54143]);
    expect(getClubMatches).toHaveBeenCalledWith(4121);
  });

  it("does not throw and skips null ligaData entries in club matches", async () => {
    getAllLigen.mockResolvedValue([liga(54141, true), liga(54142, true), liga(54143, true)]);
    getClubMatches.mockResolvedValue({
      club: { vereinId: 4121, vereinsname: "Dragons" },
      matches: [
        { matchId: 1, ligaData: { ligaId: 54141 } },
        { matchId: 2, ligaData: null },
        { matchId: 3, ligaData: { ligaId: 54143 } },
      ],
    });
    const rows = await browseLeagues({ vorabligaOnly: true, ownClubOnly: true });
    expect(rows.map((r) => r.ligaId).sort((a, b) => a - b)).toEqual([54141, 54143]);
  });

  it("does not filter by club when ownClubOnly is set but no club is configured", async () => {
    mockGetClubConfig.mockResolvedValue(null);
    getAllLigen.mockResolvedValue([liga(54141, true), liga(54142, true)]);
    const rows = await browseLeagues({ vorabligaOnly: true, ownClubOnly: true });
    expect(rows.map((r) => r.ligaId)).toEqual([54141, 54142]);
    expect(getClubMatches).not.toHaveBeenCalled();
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
    expect(first.entriesSeeded).toBe(0);
    expect(first.rosterFailures).toEqual([]);
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

  it("keeps insert-only columns when the upsert takes the conflict path (#77)", async () => {
    // The per-league SELECT-then-INSERT-or-UPDATE is one atomic upsert now.
    // `isActive` and `discoveredAt` must stay insert-only: a league someone
    // deactivated locally must not come back to life on the next selection, and
    // the discovery timestamp is history, not current state.
    const seasonId = await makeSeason("upcoming");
    await ctx.client.query(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id,
                            is_tracked, vorabliga, is_active, discovered_at)
       VALUES (54136, 0, 'Stale name', 2026, '2026/27', $1, false, false, false, '2020-01-01T00:00:00Z')`,
      [seasonId],
    );

    getAllLigen.mockResolvedValue([liga(54136, true)]);
    await setSeasonLeagues(seasonId, [54136]);

    const rows = await ctx.db.select().from(leagues);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Liga 54136");
    expect(rows[0]!.isTracked).toBe(true);
    expect(rows[0]!.isActive).toBe(false);
    expect(rows[0]!.discoveredAt).toEqual(new Date("2020-01-01T00:00:00Z"));
  });

  it("leaves the season's tracked set untouched when the untrack pass fails (#77)", async () => {
    // Tracking is replaced as a whole. Split across statements, a failure
    // part-way left some leagues tracked and others already untracked, and the
    // sync picks its work from exactly that flag.
    const seasonId = await makeSeason("upcoming");
    for (const apiLigaId of [54136, 54137]) {
      await ctx.client.query(
        `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id,
                              is_tracked, vorabliga)
         VALUES ($1, 0, 'Seeded', 2026, '2026/27', $2, true, false)`,
        [apiLigaId, seasonId],
      );
    }
    getAllLigen.mockResolvedValue([liga(54136, true)]);

    const real = ctx.db as unknown as Record<string | symbol, unknown>;
    dbHolder.ref = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "transaction"
            ? (...args: unknown[]) => {
                const [cb, ...rest] = args as [(tx: unknown) => unknown, ...unknown[]];
                return (real.transaction as (...a: unknown[]) => unknown).call(
                  real,
                  (tx: Record<string | symbol, unknown>) =>
                    cb(
                      new Proxy(
                        {},
                        {
                          get: (_t2, p2) =>
                            p2 === "update"
                              ? () => {
                                  throw new Error("untrack failed");
                                }
                              : tx[p2],
                        },
                      ),
                    ),
                  ...rest,
                );
              }
            : real[prop],
      },
    );

    await expect(setSeasonLeagues(seasonId, [54136])).rejects.toThrow("untrack failed");

    dbHolder.ref = ctx.db;
    const rows = await ctx.db.select().from(leagues).orderBy(leagues.apiLigaId);
    // The upsert of 54136 rolled back with the failed untrack of 54137.
    expect(rows.map((r) => r.isTracked)).toEqual([true, true]);
    expect(rows.find((r) => r.apiLigaId === 54136)!.name).toBe("Seeded");
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

  it("returns nothing when no season is named and none is active", async () => {
    // Dropping the season predicate here used to return every season's tracked
    // leagues at once, mixing archived ones into the settings list.
    const s1 = await makeSeason("archived");
    const s2 = await makeSeason("upcoming");
    await ctx.client.query(
      `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, is_tracked, vorabliga)
       VALUES (11111, 0, 'League S1', 2025, '2025/26', $1, true, false),
              (22222, 0, 'League S2', 2026, '2026/27', $2, true, false)`,
      [s1, s2],
    );
    mockGetActiveSeasonId.mockResolvedValue(null);

    expect(await getTrackedLeagues()).toEqual({ leagueNumbers: [], leagues: [] });
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

describe("getLeagueTeams", () => {
  function teamRef(teamPermanentId: number, teamname: string, clubId: number | null) {
    return { seasonTeamId: 0, teamCompetitionId: 0, teamPermanentId, teamname, teamnameSmall: "", clubId, verzicht: false };
  }

  it("lists teams from the roster and marks our club", async () => {
    fetchLeagueRoster.mockResolvedValue([teamRef(1, "Opponents", 9999), teamRef(2, "Hanover Dragons I", 4121)]);
    const res = await getLeagueTeams(54141);
    expect(fetchLeagueRoster).toHaveBeenCalledWith(54141);
    expect(res.teams).toEqual([
      { teamPermanentId: 1, name: "Opponents", clubId: 9999, isOwnClub: false },
      { teamPermanentId: 2, name: "Hanover Dragons I", clubId: 4121, isOwnClub: true },
    ]);
  });

  it("keeps placeholder slots (clubId null) and never marks them own-club", async () => {
    mockGetClubConfig.mockResolvedValue(null); // no club configured
    fetchLeagueRoster.mockResolvedValue([teamRef(5, "Platzhalter 6", null)]);
    const res = await getLeagueTeams(54144);
    expect(res.teams).toEqual([
      { teamPermanentId: 5, name: "Platzhalter 6", clubId: null, isOwnClub: false },
    ]);
  });
});
